import { DATA } from "./store.js";
import { access } from "node:fs/promises";
import path from "node:path";
import { projectDir } from "./store.js";
import { extract, parserVersion, sourceFingerprint } from "./extract.js";
import { readCanonicalSource } from "./source-content.js";
import { Worker } from "node:worker_threads";
import type { Source } from "../../../packages/shared/project.js";
import { validSource } from "./source-validation.js";
// Untrusted document parsers run outside the HTTP event loop, with a hard deadline.
export async function ingest(
  buffer: Buffer,
  name: string,
  projectId: string,
  previous: Source[] = [],
  signal?: AbortSignal,
): Promise<Source> {
  signal?.throwIfAborted();
  const fingerprint = sourceFingerprint(buffer);
  const format = path.extname(name).slice(1).toLowerCase();
  const cached = previous.find(
    (s) =>
      s.fingerprint === fingerprint &&
      s.format === format &&
      s.parserVersion === parserVersion(),
  );
  if (cached) {
    try {
      await readCanonicalSource(projectId, cached);
      if (!cached.originalFile) throw new Error("Missing original");
      await Promise.all(
        [
          cached.originalFile,
          ...cached.assets.map((a) => "assets/" + path.basename(a.url)),
        ].map((file) => access(path.join(projectDir(projectId), file))),
      );
      return cached;
    } catch {
      /* Missing or invalid artifacts are regenerated, never reused silently. */
    }
  }
  // Media handling reads only type/dimension headers and stores bytes; no parser worker is needed.
  if (/^(?:png|jpe?g|webp|gif|mp4|webm|mp3|wav|ogg)$/.test(format))
    return extract(buffer, name, projectId);
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./extract-worker.mjs", import.meta.url),
      {
        workerData: { buffer, name, projectId, workspace: DATA },
        resourceLimits: { maxOldGenerationSizeMb: 384 },
      },
    );
    let finished = false;
    const finish = (error?: unknown, source?: Source) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      // A parser slot is released only after its worker has actually stopped.
      void worker.terminate().then(() => {
        if (error) reject(error);
        else resolve(source!);
      }, reject);
    };
    const timer = setTimeout(
      () => finish(new Error("文档解析超过 45 秒，请拆分文件后重试")),
      45000,
    );
    const abort = () => finish(signal?.reason || new Error("资料解析已取消"));
    signal?.addEventListener("abort", abort, { once: true });
    worker.on("message", (result) => {
      if (result?.type !== "dreamatic:extraction") return;
      if (result.error) finish(new Error(String(result.error)));
      else if (!validSource(result.source))
        finish(new Error("文档解析返回无效资料"));
      else finish(undefined, result.source);
    });
    worker.once("error", (error) => finish(error));
    worker.once("exit", (code) => {
      finish(new Error(`解析进程已退出（${code}），未收到有效解析结果`));
    });
  });
}
