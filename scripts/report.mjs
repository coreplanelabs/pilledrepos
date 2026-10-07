import { readFile, stat } from "node:fs/promises";
import { collectReport, plainReport, replayReport } from "../dist/core.js";
const args = process.argv.slice(2);
const json = args.includes("--json");
const inputIndex = args.indexOf("--input");
const source = inputIndex >= 0 ? args[inputIndex + 1] : null;
const repository = inputIndex < 0 ? args.find(arg => !arg.startsWith("--")) : null;
if ((!repository && !source) || args.some(arg => arg.startsWith("--") && !["--json", "--input"].includes(arg))) {
  console.error("Usage: node scripts/report.mjs owner/repo [--json], or --input saved-evidence.json [--json]"); process.exitCode = 2;
} else {
  try {
    let report;
    if (source) {
      if ((await stat(source)).size > 2_000_000) throw new Error("This saved evidence file is too large.");
      report = replayReport(JSON.parse(await readFile(source, "utf8")));
    } else {
      report = await collectReport(repository ?? "", { fetch, now: Date.now(), signal: AbortSignal.timeout(24_000) });
    }
    console.log(json ? JSON.stringify(report, null, 2) : plainReport(report));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "The public repository could not be read.";
    console.error(json ? JSON.stringify({ error: message }) : message); process.exitCode = 1;
  }
}
