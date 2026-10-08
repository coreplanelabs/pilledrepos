import { validatePage } from "./edge-data.js";
import { parseRepository, type Report } from "../src/core.js";
import {
  parseRegistry,
  aiPage,
  parseReport,
  type AiPage,
  type AiRegistry,
} from "../src/ai.js";
import { collectIndexedReport } from "./github-index.js";
export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  run(): Promise<{ meta: { changes: number } }>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
}
export interface RepoDatabase {
  prepare(sql: string): SqlStatement;
}
export type RepoRecord = {
  id: number;
  name: string;
  description: string;
  owner_id: number;
  seeded: number;
  created_at: string;
  read_at: string | null;
  snapshot: string | null;
  status: string;
  lease: string | null;
  lease_until: number;
  last_error: string | null;
};
export type RepoRead = {
  repository: string;
  status: "ready" | "queued" | "indexing";
  page?: AiPage;
  message?: string;
};
export class RepoStore {
  constructor(
    private db: RepoDatabase,
    private read: (path: string, body?: unknown) => Promise<unknown>,
    private agents: () => Promise<AiRegistry>,
    private now = Date.now,
    private maxPages = 40,
  ) {}
  async record(name: string): Promise<RepoRecord | null> {
    return this.db
      .prepare("SELECT * FROM repos WHERE name=? COLLATE NOCASE")
      .bind(parseRepository(name))
      .first<RepoRecord>();
  }
  async page(name: string): Promise<AiPage | null> {
    const r = await this.record(name);
    if (!r?.snapshot) return null;
    const saved = JSON.parse(r.snapshot);
    if (saved.page)
      return validatePage(saved.page, parseRegistry(saved.agents));
    return aiPage(parseReport(saved), await this.agents());
  }
  async extras(capturedAt: string): Promise<AiPage[]> {
    const rows = await this.db
      .prepare(
        "SELECT snapshot FROM repos WHERE snapshot IS NOT NULL AND (seeded=0 OR read_at>?)",
      )
      .bind(capturedAt)
      .all<{ snapshot: string }>();
    return rows.results.map((r) => {
      const data = JSON.parse(r.snapshot);
      return validatePage(data.page, parseRegistry(data.agents));
    });
  }
  async status(name: string): Promise<RepoRead> {
    const r = await this.record(name);
    if (!r) throw new Error("Repo is not saved.");
    const page = await this.page(name);
    return {
      repository: r.name,
      status:
        r.status === "ready" && page
          ? "ready"
          : r.status === "indexing" && r.lease_until > this.now()
            ? "indexing"
            : "queued",
      page: page ?? undefined,
      message: r.last_error ?? undefined,
    };
  }
  async add(name: string, force = false): Promise<RepoRead> {
    const requested = parseRepository(name),
      meta = (await this.read("/repos/" + requested)) as {
        id: number;
        private: boolean;
        full_name: string;
        description: string | null;
        owner: { id: number };
      };
    if (meta.private !== false) throw new Error("Use a public GitHub repo.");
    const canonical = parseRepository(meta.full_name);
    if (
      !Number.isSafeInteger(meta.id) ||
      meta.id < 1 ||
      !Number.isSafeInteger(meta.owner?.id) ||
      meta.owner.id < 1
    )
      throw new Error("Repo identity is missing.");
    const stamp = new Date(this.now()).toISOString();
    await this.db
      .prepare(
        "INSERT INTO repos(id,name,description,owner_id,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,owner_id=excluded.owner_id",
      )
      .bind(meta.id, canonical, meta.description ?? "", meta.owner.id, stamp)
      .run();
    const existing = await this.record(canonical);
    if (existing?.snapshot && !force) {
      const page = await this.page(canonical);
      if (page?.repository === canonical) return this.status(canonical);
    }
    const lease = crypto.randomUUID();
    const claim = await this.db
      .prepare(
        "UPDATE repos SET status='indexing',lease=?,lease_until=?,last_error=NULL WHERE id=? AND lease_until<=?",
      )
      .bind(lease, this.now() + 300000, meta.id, this.now())
      .run();
    if (!claim.meta.changes) return this.status(canonical);
    try {
      const report = await collectIndexedReport(canonical, {
        read: this.read,
        now: this.now(),
        maxPages: this.maxPages,
      });
      if (report.repositoryId !== meta.id)
        throw new Error("Repository identity changed.");
      const agents = await this.agents(),
        page = aiPage(report, agents);
      const snapshot = JSON.stringify({ page, agents });
      const saved = await this.db
        .prepare(
          "UPDATE repos SET snapshot=?,read_at=?,status='ready',lease=NULL,lease_until=0,last_error=NULL WHERE id=? AND lease=? AND (read_at IS NULL OR read_at<=?)",
        )
        .bind(snapshot, report.capturedAt, meta.id, lease, report.capturedAt)
        .run();
      if (!saved.meta.changes) return this.status(canonical);
      return {
        repository: canonical,
        status: "ready",
        page,
      };
    } catch {
      await this.db
        .prepare(
          "UPDATE repos SET status='queued',lease=NULL,lease_until=0,last_error=? WHERE id=? AND lease=?",
        )
        .bind("Saved. This read will finish in the weekly job.", meta.id, lease)
        .run();
      return this.status(canonical);
    }
  }
}
