import { parentPort, workerData } from "node:worker_threads";
import { tsImport } from "tsx/esm/api";
process.env.DREAMATIC_WORKSPACE = workerData.workspace;
try {
  const { extract } = await tsImport("./extract.ts", import.meta.url);
  parentPort.postMessage({
    type: "dreamatic:extraction",
    source: await extract(
      Buffer.from(workerData.buffer),
      workerData.name,
      workerData.projectId,
    ),
  });
} catch (error) {
  parentPort.postMessage({
    type: "dreamatic:extraction",
    error: error.message,
  });
}
