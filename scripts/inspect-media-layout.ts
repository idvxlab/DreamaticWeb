import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseOffice } from "officeparser";
const root = process.env.DREAMATIC_WORKSPACE!;
await mkdir(root, { recursive: true });
const parsed = await parseOffice(await readFile(process.env.EXPERIMENT_PDF!), {
  extractAttachments: true,
  pdfParserConfig: { maxTimeMs: 30000 },
});
// Omit binary attachment contents; keep parser geometry and text for experiments.
await writeFile(root + "/layout.json", JSON.stringify(parsed.content, null, 2));
for (const p of parsed.content.filter(
  (n: any) => n.type === "page" && [4, 5, 6].includes(n.metadata?.pageNumber),
)) {
  const nodes: any[] = [];
  function walk(ns: any[]) {
    for (const n of ns) {
      if (n.type === "image" || n.text?.trim())
        nodes.push({
          type: n.type,
          text: n.text?.slice(0, 180),
          metadata: n.metadata,
          bounds: n.bounds,
        });
      if (n.children) walk(n.children);
    }
  }
  walk(p.children || []);
  console.log(JSON.stringify({ page: p.metadata, nodes }, null, 2));
}
