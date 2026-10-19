import { DATA } from "./store.js";
import { Worker } from "node:worker_threads";
import type { Source } from "../../../packages/agents/src/contracts.js";
// Untrusted document parsers run outside the HTTP event loop, with a hard deadline.
export function ingest(
  buffer: Buffer,
  name: string,
  projectId: string,
): Promise<Source> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./extract-worker.mjs", import.meta.url),
      {
        workerData: { buffer, name, projectId, workspace: DATA },
        resourceLimits: { maxOldGenerationSizeMb: 384 },
      },
    );
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error("文档解析超过 45 秒，请拆分文件后重试"));
    }, 45000);
    worker.once("message", (result) => {
      clearTimeout(timer);
      void worker.terminate();
      result.error ? reject(new Error(result.error)) : resolve(result.source);
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.once("exit", (code) => {
      clearTimeout(timer);
      if (code) reject(new Error("解析进程已退出，请检查文档大小与格式"));
    });
  });
}
