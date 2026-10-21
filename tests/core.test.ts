import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import AdmZip from "adm-zip";
import { extract } from "../apps/server/src/extract.js";
import { initStore } from "../apps/server/src/store.js";
import { publicAddress, fetchPublic } from "../apps/server/src/network.js";
import { sanitizeHtml } from "../apps/server/src/html.js";
await initStore();
test("CSV preserves quoted commas, Unicode, headers and values", async () => {
  const s = await extract(
    Buffer.from('\ufeff名称,价格\n"春天,系列",32\n夏季,48'),
    "报价.csv",
  );
  assert.deepEqual(s.tables[0].rows, [
    ["名称", "价格"],
    ["春天,系列", "32"],
    ["夏季", "48"],
  ]);
  assert.match(s.markdown!, /春天,系列/);
});
test("Excel extracts multiple sheets and cached formula values", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("收入");
  ws.addRow(["月", "元"]);
  ws.addRow(["一月", 50]);
  ws.addRow(["合计", { formula: "SUM(B2:B2)", result: 50 }]);
  wb.addWorksheet("说明").addRow(["仅供参考"]);
  const s = await extract(
    Buffer.from(await wb.xlsx.writeBuffer()),
    "data.xlsx",
  );
  assert.equal(s.tables.length, 2);
  assert.match(s.markdown!, /SUM/);
  assert.match(s.markdown!, /50/);
});
test("Office document extracts text and embedded image with provenance", async () => {
  const z = new AdmZip();
  z.addFile(
    "[Content_Types].xml",
    Buffer.from(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
  );
  z.addFile(
    "word/document.xml",
    Buffer.from(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Dreamatic 品牌故事</w:t></w:r></w:p></w:body></w:document>',
    ),
  );
  z.addFile(
    "word/media/logo.png",
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9JkAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const s = await extract(z.toBuffer(), "brand.docx");
  assert.match(s.markdown!, /品牌故事/);
  assert.equal(s.assets[0].type, "image");
  assert.equal(s.assets[0].width, 1);
  assert.equal(s.assets[0].height, 1);
  assert.match(s.provenance, /brand.docx/);
});
test("HTML removes executable content while preserving inline design", () => {
  const html = sanitizeHtml(
    '<html><head><style>body{color:red}</style><script>parent.alert(1)</script></head><body onload="alert(1)"><iframe src="http://localhost"></iframe><img src="/assets/a.png" onerror="alert(1)"><a href="jav&#97;script:alert(1)">x</a><p>Safe</p></body></html>',
  );
  assert.doesNotMatch(html, /<script|onload|onerror|<iframe|javascript:/i);
  assert.match(html, /body\{color:red\}/);
  assert.match(html, /Safe/);
});
test("Crawler blocks loopback, private, metadata and IPv4-mapped IPv6 addresses", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.3",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fd00::1",
    "0.0.0.0",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
  await assert.rejects(() => fetchPublic("file:///etc/passwd"));
  await assert.rejects(() => fetchPublic("http://127.0.0.1"));
});
test("PPTX extracts slide text", async () => {
  const z = new AdmZip();
  z.addFile(
    "[Content_Types].xml",
    Buffer.from(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>',
    ),
  );
  z.addFile(
    "ppt/presentation.xml",
    Buffer.from(
      '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst/></p:presentation>',
    ),
  );
  z.addFile(
    "ppt/slides/slide1.xml",
    Buffer.from(
      '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Launch plan 2026</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
    ),
  );
  const s = await extract(z.toBuffer(), "launch.pptx");
  assert.match(s.markdown!, /Launch plan 2026/);
});

test("PDF extracts text layer with explicit OCR limitation", async () => {
  const stream = "BT /F1 24 Tf 70 700 Td (Dreamatic PDF evidence) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let content = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(content));
    content += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(content);
  content +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const s = await extract(Buffer.from(content), "evidence.pdf");
  assert.match(s.markdown!, /Dreamatic PDF evidence/);
  assert.ok(s.warnings.some((w) => w.includes("OCR")));
});

test("PDF embedded raster images are extracted alongside text for page reuse", async () => {
  const drawing =
    "BT /F1 24 Tf 70 700 Td (Product brochure) Tj ET q 200 0 0 100 70 500 cm /Im1 Do Q";
  const pixels = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]);
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 5 0 R >>",
    ),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    Buffer.from(
      `<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`,
    ),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${pixels.length} >>\nstream\n`,
      ),
      pixels,
      Buffer.from("\nendstream"),
    ]),
  ];
  const parts = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [];
  let size = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(size);
    const part = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      object,
      Buffer.from("\nendobj\n"),
    ]);
    parts.push(part);
    size += part.length;
  });
  parts.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
        offsets
          .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
          .join("") +
        `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF`,
    ),
  );
  const source = await extract(Buffer.concat(parts), "products.pdf");
  assert.match(source.markdown!, /Product brochure/);
  const images = source.assets.filter((a) => a.type === "image");
  assert.ok(images.length > 0, JSON.stringify(source.warnings));
  assert.equal(images[0].width, 2);
  assert.equal(images[0].height, 2);
});

test("HTML policy restricts network, custom elements, navigation, event handlers and active content", () => {
  const html = sanitizeHtml(
    `<html><head><meta http-equiv="refresh" content="0;url=https://evil.example"><style>@import 'https://evil.example/a.css';p{color:red}</style></head><body><custom-widget>bad</custom-widget><form action="https://evil.example"><button formaction="https://evil.example" onclick="alert(1)">OK</button></form><img src="http://127.0.0.1/api/config"><a href="https://example.com" target="_top">link</a><svg><script>alert(1)</script></svg></body></html>`,
  );
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(
    html,
    /custom-widget|onclick|formaction|<svg|@import|http:\/\/127/,
  );
  assert.match(html, /type="button"/);
});

test("project directories contain pages and assets and are deleted recursively", async () => {
  const { create, save, removeProject, projectDir, get } =
    await import("../apps/server/src/store.js");
  const first = await create(),
    second = await create();
  const file = crypto.randomUUID() + ".png";
  for (const p of [first, second]) {
    await mkdir(path.join(projectDir(p.id), "assets"), { recursive: true });
    await mkdir(path.join(projectDir(p.id), "uploads"), { recursive: true });
    await writeFile(path.join(projectDir(p.id), "assets", file), "asset");
    await writeFile(
      path.join(projectDir(p.id), "uploads", "source.txt"),
      "original",
    );
    p.versions.push({
      id: crypto.randomUUID(),
      html: `<img src="/assets/${p.id}/${file}">`,
      label: "test",
      createdAt: new Date().toISOString(),
    });
    await save(p);
  }
  const { readFile, stat } = await import("node:fs/promises");
  assert.match(
    await readFile(
      path.join(projectDir(first.id), "pages", first.versions[0].id + ".html"),
      "utf8",
    ),
    new RegExp(first.id),
  );
  await removeProject(first.id);
  await assert.rejects(() => get(first.id));
  await assert.rejects(() => stat(projectDir(first.id)), { code: "ENOENT" });
  assert.equal(
    await readFile(path.join(projectDir(second.id), "assets", file), "utf8"),
    "asset",
  );
  await removeProject(second.id);
});

test("legacy flat project migration copies assets and pages into the project directory", async () => {
  const store = await import("../apps/server/src/store.js");
  const { readFile, stat } = await import("node:fs/promises");
  const id = crypto.randomUUID(),
    image = crypto.randomUUID() + ".png",
    version = crypto.randomUUID();
  await mkdir(path.join(store.DATA, "assets"), { recursive: true });
  await writeFile(path.join(store.DATA, "assets", image), "legacy-image");
  await writeFile(
    path.join(store.DATA, "projects", id + ".json"),
    JSON.stringify({
      id,
      title: "Legacy",
      sources: [],
      messages: [],
      events: [],
      status: "idle",
      versions: [
        {
          id: version,
          html: `<img src="/assets/${image}">`,
          label: "old",
          createdAt: "",
        },
      ],
    }),
  );
  await store.initStore();
  const migrated = await store.get(id);
  assert.match(migrated.versions[0].html, new RegExp(`/assets/${id}/`));
  assert.equal(
    await readFile(path.join(store.projectDir(id), "assets", image), "utf8"),
    "legacy-image",
  );
  assert.ok(
    await stat(path.join(store.projectDir(id), "pages", version + ".html")),
  );
  await assert.rejects(
    () => stat(path.join(store.DATA, "projects", id + ".json")),
    { code: "ENOENT" },
  );
  await store.removeProject(id);
});
