import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
export class GitHubReadError extends Error {
  constructor(status, transient = status === 429 || status >= 500) {
    super(
      `GitHub read failed${status ? ` (${status})` : ""}. Resume after checking access and rate limits.`,
    );
    this.status = status;
    this.transient = transient;
  }
}
export async function retryRead(
  read,
  pause = (ms) => new Promise((done) => setTimeout(done, ms)),
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      if (
        !(error instanceof GitHubReadError) ||
        !error.transient ||
        attempt >= 2
      )
        throw error;
      await pause(1000 * (attempt + 1));
    }
  }
}
export function githubReader(useGh = false) {
  const token = process.env.AI_PILLED_GITHUB_TOKEN;
  if (!useGh && !token)
    throw new Error(
      "Set AI_PILLED_GITHUB_TOKEN or pass --use-gh for read-only captures.",
    );
  const once = async (path, body) => {
    if (
      !/^\/(repos\/|user\/\d+$|users\/|search\/repositories\?|graphql$)/.test(
        path,
      )
    )
      throw new Error("Unexpected GitHub read.");
    if (useGh)
      return new Promise((resolve, reject) => {
        const args = ["api", "--hostname", "github.com", path.slice(1)];
        if (body) args.push("--input", "-");
        let timedOut = false,
          oversized = false;
        const p = spawn("gh", args, { stdio: ["pipe", "pipe", "pipe"] }),
          timer = setTimeout(() => {
            timedOut = true;
            p.kill();
          }, 60000);
        let out = "",
          err = "";
        p.stdout.on("data", (b) => {
          out += b;
          if (out.length > 8000000) {
            oversized = true;
            p.kill();
          }
        });
        p.stderr.on("data", (b) => {
          err += b;
        });
        p.on("error", reject);
        p.on("close", (code) => {
          clearTimeout(timer);
          if (oversized) return reject(new Error("Oversized GitHub response."));
          if (code !== 0) {
            const status = Number(/HTTP (\d{3})/.exec(err)?.[1] ?? 0);
            return reject(
              new GitHubReadError(
                status,
                timedOut || status === 429 || status >= 500,
              ),
            );
          }
          try {
            resolve(JSON.parse(out));
          } catch {
            reject(new Error("Unreadable GitHub response."));
          }
        });
        p.stdin.end(body ? JSON.stringify(body) : undefined);
      });
    const r = await fetch("https://api.github.com" + path, {
      method: body ? "POST" : "GET",
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(60000),
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "AI-Pilled",
      },
    });
    if (!r.ok) throw new GitHubReadError(r.status);
    const s = await r.text();
    if (s.length > 8000000) throw new Error("Oversized GitHub response.");
    return JSON.parse(s);
  };
  return (path, body) => retryRead(() => once(path, body));
}
export function digest(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}
export async function verifySource(url) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: { "User-Agent": "AI-Pilled-Evidence-Check" },
  });
  if (
    !r.ok ||
    new URL(r.url).protocol !== "https:" ||
    new URL(r.url).hostname !== new URL(url).hostname
  )
    throw new Error("Evidence source unavailable: " + url);
  const content = await r.text();
  if (content.length < 100 || content.length > 8000000)
    throw new Error("Unreadable evidence source.");
  return { url, sha: digest(content) };
}
