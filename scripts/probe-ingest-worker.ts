import { readFile, writeFile } from "node:fs/promises";
import { ingest } from "../apps/server/src/ingest.js";
import { create, initStore, save } from "../apps/server/src/store.js";
await initStore();
const p = await create();
const bytes = await readFile(process.env.EXPERIMENT_PDF!);
const started = performance.now();
try {
  const source = await ingest(bytes, "大横智旋公司简介2026.pdf", p.id);
  const elapsedMs = performance.now() - started;
  p.sources = [source];
  p.title = "真实上传解析 worker · 200媒体验证";
  await save(p);
  const report = {
    status: "complete",
    elapsedMs,
    assets: source.assets.length,
    warnings: source.warnings,
    projectId: p.id,
    parserVersion: source.parserVersion,
    scope:
      "Uses production ingest worker (384MiB V8 old-space limit and 45s deadline); excludes HTTP upload transfer. No model requests.",
  };
  await writeFile(
    process.env.DREAMATIC_WORKSPACE + "/ingest-worker-probe.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} catch (error) {
  const report = {
    status: "error",
    elapsedMs: performance.now() - started,
    error: String(error),
  };
  await writeFile(
    process.env.DREAMATIC_WORKSPACE + "/ingest-worker-probe.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  process.exitCode = 1;
}
