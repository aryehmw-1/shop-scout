import { join } from "node:path";

/**
 * Writable base directory for runtime intelligence data.
 *
 * On Vercel / AWS Lambda the deployment filesystem is READ-ONLY except for
 * `/tmp`. Any `mkdirSync` / `writeFileSync` under `process.cwd()` throws
 * ENOENT/EROFS at runtime (this is what caused the chat route to 500 with
 * `mkdir '/var/task/data/intelligence-graph'`). We therefore target `/tmp`
 * on serverless platforms and the project `data/` dir in local dev.
 *
 * Note: `/tmp` is per-instance and ephemeral — fine here because Postgres is
 * the durable datastore; these files are an in-process cache/telemetry sink.
 */
const IS_SERVERLESS =
  !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const ROOT = IS_SERVERLESS ? "/tmp" : process.cwd();

/** Writable `data/` root (under /tmp on serverless, project root in dev). */
export function writableDataDir(): string {
  return join(ROOT, "data");
}

/** Absolute path to the writable `intelligence-graph` directory. */
export function intelligenceGraphDir(): string {
  return join(ROOT, "data", "intelligence-graph");
}

/** Writable `artifacts/` root (under /tmp on serverless, project root in dev). */
export function writableArtifactsDir(): string {
  return join(ROOT, "artifacts");
}
