import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  extract,
  DOCUMENT_MEDIA_LIMIT,
  DOCUMENT_MEDIA_BYTES,
} from "../apps/server/src/extract.js";
import {
  initStore,
  create,
  projectDir,
  save,
} from "../apps/server/src/store.js";
const root = process.env.DREAMATIC_WORKSPACE!;
await mkdir(root, { recursive: true });
await initStore();
const bytes = await readFile(process.env.EXPERIMENT_PDF!);
const reports = [];
for (const legacy of [true, false]) {
  const p = await create();
  let parsedStats: any;
  const t = performance.now();
  const source = await extract(bytes, "大横智旋公司简介2026.pdf", p.id, {
    legacyFirstAttachments: legacy ? 40 : undefined,
    onParsed(parsed) {
      const types: Record<string, number> = {};
      let totalBytes = 0;
      const hashes = new Set<string>();
      for (const a of parsed.attachments) {
        types[a.type] = (types[a.type] || 0) + 1;
        totalBytes += Buffer.byteLength(a.data, "base64");
      }
      parsedStats = {
        attachments: parsed.attachments.length,
        types,
        decodedBytes: totalBytes,
        pages: parsed.content.filter((n) => n.type === "page").length,
      };
    },
  });
  const elapsedMs = performance.now() - t;
  let retainedBytes = 0;
  for (const a of source.assets)
    retainedBytes += (
      await stat(path.join(projectDir(p.id), "assets", path.basename(a.url)))
    ).size;
  p.sources = [source];
  p.title = legacy ? "媒体截断复现·旧40项" : "媒体提取·200个去重素材";
  await save(p);
  const report = {
    arm: legacy ? "legacy-first40" : "distinct-media200",
    elapsedMs,
    parsed: parsedStats,
    assets: source.assets.length,
    retainedBytes,
    canonicalMarkdownCharacters: source.content?.markdownLength,
    warnings: source.warnings,
    projectId: p.id,
  };
  reports.push(report);
  console.log(JSON.stringify(report));
}
await writeFile(
  path.join(root, "ingestion-benchmark.json"),
  JSON.stringify(
    {
      limit: DOCUMENT_MEDIA_LIMIT,
      totalByteLimit: DOCUMENT_MEDIA_BYTES,
      warning:
        "One run each, legacy first. Includes parse, media persistence and canonical Markdown; order and filesystem caching may affect time.",
      reports,
    },
    null,
    2,
  ),
);
