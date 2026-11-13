import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OfficeContentNode } from "officeparser";

type Box = { x: number; y: number; width: number; height: number };
export type LayoutPicture = { page: number; box: Box; label: string; index: number; data: Buffer };
export type PdfLayout = { nodes: OfficeContentNode[]; pictures: LayoutPicture[] };

/** The local layout runtime, unless switched off or not installed (then import uses officeparser alone). */
export async function pdfLayoutRuntime() {
  if (process.env.DREAMATIC_PDF_LAYOUT === "false") return undefined;
  const python =
    process.env.DREAMATIC_DOCUMENT_PYTHON || path.resolve(".venv-documents/bin/python");
  const model =
    process.env.DREAMATIC_LAYOUT_MODEL || path.resolve("models/pp_doc_layoutv3.onnx");
  try {
    await Promise.all([access(python), access(model)]);
  } catch {
    return undefined;
  }
  return { python, model, script: path.resolve("scripts/pdf-layout.py") };
}

/** Layout analysis in a Python subprocess (scripts/pdf-layout.py): page nodes and picture crops. */
export async function analysePdfLayout(
  pdf: Buffer,
  runtime: NonNullable<Awaited<ReturnType<typeof pdfLayoutRuntime>>>,
): Promise<PdfLayout> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dreamatic-layout-"));
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        runtime.python,
        [runtime.script, runtime.model, dir],
        { timeout: 180000, maxBuffer: 64 * 1024 * 1024 },
        (error, out) =>
          error ? reject(new Error("PDF layout analysis unavailable or exceeded its limits")) : resolve(out),
      );
      child.stdin?.on("error", () => {});
      child.stdin?.end(pdf);
    });
    const result = JSON.parse(stdout);
    if (!Array.isArray(result.nodes) || !Array.isArray(result.pictures))
      throw new Error("Invalid PDF layout result");
    const pictures: LayoutPicture[] = [];
    for (const p of result.pictures) {
      const file = path.resolve(String(p.file));
      if (path.dirname(file) !== dir) throw new Error("PDF layout crop outside its directory");
      pictures.push({ page: p.page, box: p.box, label: p.label, index: p.index, data: await readFile(file) });
    }
    return { nodes: result.nodes, pictures };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const area = (b: Box) => b.width * b.height;
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/**
 * Pictures for the catalog. A layout picture region that an embedded picture already holds (the
 * region lies inside it, as panels inside one raster figure) is that original: full resolution,
 * stored upright by the usual orientation step. Any other region becomes one crop of the whole
 * figure, and the embedded pieces lying in it are its fragments (stored, not offered). Embedded
 * pictures outside every region stay as they are. Deterministic geometry, no model call.
 */
export function mergePdfMedia(layout: PdfLayout, parsed: OfficeContentNode[]) {
  const originals = new Map<number, { name: string; box: Box }[]>();
  const pageArea = new Map<number, number>();
  const visit = (items: OfficeContentNode[], page?: number) => {
    for (const node of items) {
      const meta = node.metadata as { pageNumber?: number; pageWidth?: number; pageHeight?: number } | undefined;
      const p = node.type === "page" ? meta?.pageNumber : page;
      if (node.type === "page" && p && meta?.pageWidth && meta?.pageHeight)
        pageArea.set(p, meta.pageWidth * meta.pageHeight);
      if (node.type === "image" && node.metadata?.attachmentName && node.bounds && p)
        originals.set(p, [...(originals.get(p) || []), { name: node.metadata.attachmentName, box: node.bounds }]);
      visit(node.children || [], p);
    }
  };
  visit(parsed);
  const crops: { name: string; data: Buffer }[] = [];
  const fragments = new Set<string>();
  const kept = new Set<string>();
  const nameOf = new Map<number, { name: string; box: Box }>();
  for (const pic of layout.pictures) {
    const onPage = originals.get(pic.page) || [];
    const backdrop = (o: { box: Box }) => area(o.box) > 0.5 * (pageArea.get(pic.page) || Infinity);
    const holder = onPage
      .filter((o) => !backdrop(o) && overlap(o.box, pic.box) >= 0.8 * area(pic.box))
      .sort((a, b) => area(a.box) - area(b.box))[0];
    if (holder) {
      kept.add(holder.name);
      nameOf.set(pic.index, holder);
      continue;
    }
    const name = `pdf_figure_p${pic.page}_${pic.index + 1}.png`;
    crops.push({ name, data: pic.data });
    nameOf.set(pic.index, { name, box: pic.box });
    for (const o of onPage)
      if (!backdrop(o) && overlap(o.box, pic.box) >= 0.5 * area(o.box)) fragments.add(o.name);
  }
  for (const name of kept) fragments.delete(name);
  const placed = new Set<string>();
  const nodes = layout.nodes.map((page) => {
    const number = (page.metadata as { pageNumber?: number } | undefined)?.pageNumber;
    const children: OfficeContentNode[] = [];
    for (const child of page.children || []) {
      const index = (child.metadata as { layoutPicture?: number } | undefined)?.layoutPicture;
      if (child.type !== "image" || index === undefined) {
        children.push(child);
        continue;
      }
      const target = nameOf.get(index)!;
      if (placed.has(target.name)) continue; // several panels of one raster figure: one picture
      placed.add(target.name);
      children.push({ ...child, bounds: target.box, metadata: { attachmentName: target.name } } as OfficeContentNode);
    }
    // Embedded pictures outside every region keep their own place; fragments are annotated
    // from the parser's own layout, so they never touch or stack against the figure crops.
    for (const o of number ? originals.get(number) || [] : [])
      if (!placed.has(o.name) && !fragments.has(o.name)) {
        placed.add(o.name);
        children.push({ type: "image", bounds: o.box, metadata: { attachmentName: o.name } } as OfficeContentNode);
      }
    return { ...page, children } as OfficeContentNode;
  });
  /** Import order under the document media budget: whole figures first, fragments last. */
  const priority = (name: string) =>
    kept.has(name) ? 0 : crops.some((c) => c.name === name) ? 1 : fragments.has(name) ? 3 : 2;
  return { nodes, crops, fragments, priority };
}
