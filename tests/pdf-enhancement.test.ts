import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { enhancePdf } from "../apps/server/src/pdf-structure.js";
import { extract } from "../apps/server/src/extract.js";
function pdf() {
  const stream =
    "BT /F1 18 Tf 70 700 Td (Local PDF paragraph) Tj 0 -30 Td (Second line) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, obj] of objects.entries()) {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const at = Buffer.byteLength(text);
  text +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF`;
  return Buffer.from(text);
}
test("optional local PDF engine returns page text and extraction falls back when unavailable", async (t) => {
  const before = {
    enabled: process.env.DREAMATIC_PDF_ENHANCE,
    python: process.env.DREAMATIC_DOCUMENT_PYTHON,
  };
  try {
    process.env.DREAMATIC_PDF_ENHANCE = "true";
    process.env.DREAMATIC_DOCUMENT_PYTHON = "/missing-document-python";
    const fallback = await extract(pdf(), "sample.pdf");
    assert.match(fallback.markdown!, /Local PDF paragraph/);
    assert.ok(fallback.warnings.some((w) => w.includes("PDF 增强不可用")));
    delete process.env.DREAMATIC_DOCUMENT_PYTHON;
    try {
      execFileSync(".venv-documents/bin/python", ["-c", "import pdfplumber"], {
        stdio: "ignore",
      });
    } catch {
      t.diagnostic(
        "Optional Python environment absent: install requirements-documents.txt for engine integration check",
      );
      return;
    }
    const result = await enhancePdf(pdf());
    assert.equal(result.nodes[0].type, "page");
    assert.match(JSON.stringify(result.nodes), /Local PDF paragraph/);
    assert.ok(result.nodes[0].children?.some((n) => n.bounds));
    const enhanced = await extract(pdf(), "enhanced.pdf");
    assert.match(enhanced.markdown!, /Second line/);
    assert.ok(!enhanced.warnings.some((w) => w.includes("PDF 增强不可用")));
  } finally {
    if (before.enabled === undefined) delete process.env.DREAMATIC_PDF_ENHANCE;
    else process.env.DREAMATIC_PDF_ENHANCE = before.enabled;
    if (before.python === undefined)
      delete process.env.DREAMATIC_DOCUMENT_PYTHON;
    else process.env.DREAMATIC_DOCUMENT_PYTHON = before.python;
  }
});
