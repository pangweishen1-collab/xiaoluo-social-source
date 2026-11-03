import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let validator;
async function snapshotValidator() {
  validator ??= build({ entryPoints: [join(root, "worker/hot-list.ts")], bundle: true, format: "esm", platform: "browser", write: false })
    .then((result) => import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`));
  return (await validator).parseHotSnapshotRow;
}

/** Publish the exact reviewed candidate, not a second nondeterministic AI run. */
export async function validateReviewedHotSnapshot(value, now = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a reviewed hot-list snapshot");
  const { diagnostics: ignored, ...candidate } = value;
  if (!Array.isArray(candidate.rankings) || candidate.rankings.length !== 10
    || candidate.rankings.some((story) => story.detail?.status !== "ready")) throw new Error("Release requires ten independently reviewed event details");
  const at = Date.parse(candidate.updatedAt);
  if (!Number.isFinite(at) || now - at > 30 * 60_000 || at > now) throw new Error("Reviewed snapshot must be from the last thirty minutes");
  const json = JSON.stringify(candidate);
  if (Buffer.byteLength(json) > 512 * 1024 || /"(?:contentText|originalArticleText|previousProposal)"\s*:/u.test(json)) throw new Error("Snapshot contains oversized or transient original content");
  const parse = await snapshotValidator();
  if (!parse({ updated_at: candidate.updatedAt, payload_json: json }, now)) throw new Error("Snapshot source identity, dates or reviewed details failed validation");
  return { candidate, json, sha256: createHash("sha256").update(json).digest("hex") };
}

function executeD1(args) {
  return execFileSync(join(root, "node_modules/.bin/wrangler"), ["d1", "execute", "xiaoluo-visitor-stats", "--config", "wrangler.hot.json", "--remote", ...args, "--json"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function successfulD1Results(output) {
  let parsed;
  try { parsed = JSON.parse(String(output)); } catch { throw new Error("D1 did not return a valid JSON acknowledgement"); }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  if (!entries.length || entries.some((entry) => !entry || typeof entry !== "object" || entry.success !== true)) {
    throw new Error("D1 did not acknowledge a successful operation");
  }
  return entries;
}

/** Return success only after the exact candidate was written and read back. */
export async function publishReviewedHotSnapshot(value, { now = Date.now(), execute = executeD1 } = {}) {
  const { candidate, json, sha256 } = await validateReviewedHotSnapshot(value, now);
  const quote = (text) => `'${text.replaceAll("'", "''")}'`;
  const temporary = await mkdtemp(join(tmpdir(), "xiaoluo-reviewed-hot-"));
  const sqlFile = join(temporary, "publish.sql");
  await writeFile(sqlFile, `INSERT INTO hot_list_snapshot (id,updated_at,payload_json) VALUES (1,${quote(candidate.updatedAt)},${quote(json)}) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,payload_json=excluded.payload_json WHERE excluded.updated_at>hot_list_snapshot.updated_at;`);
  const written = successfulD1Results(await execute(["--file", sqlFile]));
  if (written.some((entry) => !Number.isSafeInteger(entry.meta?.changes) || entry.meta.changes < 0)
    || written.reduce((sum, entry) => sum + entry.meta.changes, 0) !== 1) {
    throw new Error("Reviewed snapshot was not written; an equal or newer production snapshot may already exist");
  }
  const readback = successfulD1Results(await execute(["--command", "SELECT updated_at, payload_json FROM hot_list_snapshot WHERE id = 1"]));
  if (readback.some((entry) => !Array.isArray(entry.results))) throw new Error("D1 readback rows were malformed");
  const rows = readback.flatMap((entry) => entry.results);
  if (rows.length !== 1 || rows[0]?.updated_at !== candidate.updatedAt || typeof rows[0]?.payload_json !== "string") {
    throw new Error("Production snapshot timestamp did not match the reviewed candidate after writing");
  }
  const persistedHash = createHash("sha256").update(rows[0].payload_json).digest("hex");
  if (persistedHash !== sha256) throw new Error("Production snapshot hash did not match the exact reviewed candidate");
  return { reviewedAt: candidate.updatedAt, rankings: candidate.rankings.length, sha256, written: true };
}

async function main() {
  const [input, confirmation] = process.argv.slice(2);
  if (!input || confirmation !== "--confirm-production") throw new Error("Usage: node scripts/publish-reviewed-hot.mjs <reviewed.json> --confirm-production");
  const result = await publishReviewedHotSnapshot(JSON.parse(await readFile(resolve(input), "utf8")));
  console.log(JSON.stringify(result));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
