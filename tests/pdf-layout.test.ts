import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OfficeContentNode } from "officeparser";
import { mergePdfMedia, pdfLayoutRuntime, type PdfLayout } from "../apps/server/src/pdf-layout.js";
import { extract } from "../apps/server/src/extract.js";

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const page = (pageNumber: number, children: unknown[]) =>
  ({ type: "page", metadata: { pageNumber, pageWidth: 600, pageHeight: 800 }, children }) as OfficeContentNode;
const image = (name: string, b: ReturnType<typeof box>) => ({ type: "image", bounds: b, metadata: { attachmentName: name } });
const region = (index: number) => ({ type: "image", bounds: box(0, 0, 1, 1), metadata: { layoutPicture: index } });
const layoutOf = (pictures: { page: number; box: ReturnType<typeof box> }[], children: unknown[]): PdfLayout => ({
  nodes: [page(1, children)],
  pictures: pictures.map((p, index) => ({ ...p, label: "image", index, data: Buffer.from("crop" + index) })),
});
const names = (nodes: OfficeContentNode[]) =>
  (nodes[0].children || []).filter((c) => c.type === "image").map((c) => c.metadata?.attachmentName);

test("a figure region held by one embedded picture keeps that original; no crop is made", () => {
  const parsed = [page(1, [image("photo.png", box(100, 100, 200, 120))])];
  const merged = mergePdfMedia(layoutOf([{ page: 1, box: box(105, 104, 190, 110) }], [region(0)]), parsed);
  assert.deepEqual(merged.crops, []);
  assert.deepEqual(names(merged.nodes), ["photo.png"]);
  assert.equal(merged.fragments.size, 0);
});

test("a figure made of slices becomes one whole crop and its slices become fragments", () => {
  const slices = [0, 1, 2].map((i) => image(`slice${i}.png`, box(100 + i * 60, 100, 60, 100)));
  const parsed = [page(1, [...slices, image("logo.png", box(500, 700, 40, 40))])];
  const merged = mergePdfMedia(layoutOf([{ page: 1, box: box(100, 100, 180, 100) }], [region(0), { type: "paragraph", text: "Fig. 3. Pipeline" }]), parsed);
  assert.deepEqual(merged.crops.map((c) => c.name), ["pdf_figure_p1_1.png"]);
  assert.deepEqual([...merged.fragments].sort(), ["slice0.png", "slice1.png", "slice2.png"]);
  // Fragments are left out of the merged layout (annotated from the parser's own layout instead);
  // a picture outside every region keeps its place.
  assert.deepEqual(names(merged.nodes), ["pdf_figure_p1_1.png", "logo.png"]);
  assert.ok(merged.priority("pdf_figure_p1_1.png") < merged.priority("logo.png"));
  assert.ok(merged.priority("logo.png") < merged.priority("slice0.png"));
});

test("panels detected inside one raster figure map to that one picture, once", () => {
  const parsed = [page(1, [image("figure2.png", box(50, 100, 500, 150))])];
  const pictures = [0, 1, 2].map((i) => ({ page: 1, box: box(60 + i * 160, 110, 150, 130) }));
  const merged = mergePdfMedia(layoutOf(pictures, [region(0), region(1), region(2)]), parsed);
  assert.deepEqual(merged.crops, []);
  assert.deepEqual(names(merged.nodes), ["figure2.png"]);
  assert.equal(merged.priority("figure2.png"), 0);
});

test("a page backdrop never stands for a figure drawn over it", () => {
  const parsed = [page(1, [image("backdrop.png", box(0, 0, 600, 800))])];
  const merged = mergePdfMedia(layoutOf([{ page: 1, box: box(100, 100, 200, 100) }], [region(0)]), parsed);
  assert.deepEqual(merged.crops.map((c) => c.name), ["pdf_figure_p1_1.png"]);
  assert.equal(merged.fragments.size, 0, "the backdrop is not a piece of the figure");
  assert.deepEqual(names(merged.nodes), ["pdf_figure_p1_1.png", "backdrop.png"]);
});

/** A two-column, two-page PDF with a running header and page numbers (Helvetica text only). */
function twoColumnPdf() {
  const line = (x: number, y: number, size: number, text: string) => `BT /F1 ${size} Tf ${x} ${y} Td (${text}) Tj ET`;
  const column = (x: number, words: string) =>
    Array.from({ length: 18 }, (_, i) => line(x, 640 - i * 14, 10, `${words} line ${i + 1} of this column text.`)).join(" ");
  const pageStream = (n: number) =>
    [
      line(56, 760, 8, "ACME QUARTERLY REVIEW VOL. 3"),
      line(300, 40, 8, String(n)),
      line(56, 690, 16, `Section ${n} Overview`),
      column(56, n === 1 ? "Left alpha" : "Left gamma"),
      column(316, n === 1 ? "Right beta" : "Right delta"),
    ].join(" ");
  const streams = [pageStream(1), pageStream(2)];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...streams.map((s) => `<< /Length ${s.length} >>\nstream\n${s}\nendstream`),
  ];
  let text = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const at = Buffer.byteLength(text);
  text +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((n) => String(n).padStart(10, "0") + " 00000 n \n").join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF`;
  return Buffer.from(text);
}

test("PDF layout import: columns in reading order, running header dropped, fallback on failure", async (t) => {
  if (!(await pdfLayoutRuntime())) {
    t.diagnostic("Optional document runtime absent: run scripts/setup-documents.sh for the layout integration check");
    return;
  }
  const source = await extract(twoColumnPdf(), "columns.pdf");
  const md = source.markdown!;
  assert.ok(md.indexOf("Left alpha line 18") < md.indexOf("Right beta line 1 "), "left column before right column");
  assert.ok(md.indexOf("Right beta line 18") < md.indexOf("Left gamma line 1 "), "page 1 before page 2");
  assert.match(md, /Section 1 Overview/);
  assert.doesNotMatch(md, /ACME QUARTERLY REVIEW/, "a header repeated on every page is not body text");
  assert.ok(!source.warnings.some((w) => w.includes("版面分析不可用")));

  const before = process.env.DREAMATIC_LAYOUT_MODEL;
  const broken = path.join(await mkdtemp(path.join(os.tmpdir(), "layout-model-")), "broken.onnx");
  await writeFile(broken, "not a model");
  try {
    process.env.DREAMATIC_LAYOUT_MODEL = broken;
    const fallback = await extract(twoColumnPdf(), "fallback.pdf");
    assert.match(fallback.markdown!, /Left alpha line 1/);
    assert.ok(fallback.warnings.some((w) => w.includes("PDF 版面分析不可用")));
    process.env.DREAMATIC_LAYOUT_MODEL = "/missing-layout-model.onnx";
    const absent = await extract(twoColumnPdf(), "absent.pdf");
    assert.match(absent.markdown!, /Left alpha line 1/);
    assert.ok(!absent.warnings.some((w) => w.includes("版面分析")), "no runtime: plain officeparser import");
  } finally {
    if (before === undefined) delete process.env.DREAMATIC_LAYOUT_MODEL;
    else process.env.DREAMATIC_LAYOUT_MODEL = before;
  }
  assert.ok(existsSync(broken));
});
