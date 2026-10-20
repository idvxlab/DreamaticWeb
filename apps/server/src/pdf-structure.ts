import { execFile } from "node:child_process";
import path from "node:path";
import type { OfficeContentNode } from "officeparser";
export function enhancePdf(
  buffer: Buffer,
): Promise<{
  nodes: OfficeContentNode[];
  tables: { name: string; rows: unknown[][] }[];
}> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.env.DREAMATIC_DOCUMENT_PYTHON ||
        path.resolve(".venv-documents/bin/python"),
      [path.resolve("scripts/pdf-structure.py")],
      { timeout: 30000, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout) => {
        if (error)
          return reject(
            new Error(
              "Optional PDF enhancement unavailable or exceeded its limits",
            ),
          );
        try {
          const result = JSON.parse(stdout);
          if (!Array.isArray(result.nodes) || !Array.isArray(result.tables))
            throw new Error();
          resolve(result);
        } catch {
          reject(new Error("Invalid PDF enhancement result"));
        }
      },
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(buffer);
  });
}
