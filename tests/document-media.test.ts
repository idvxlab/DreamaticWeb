import test from "node:test";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import sharp from "sharp";
import { extract } from "../apps/server/src/extract.js";

async function document() {
  const zip = new AdmZip();
  zip.addFile(
    "[Content_Types].xml",
    Buffer.from(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
  );
  zip.addFile(
    "word/document.xml",
    Buffer.from(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Media coverage test</w:t></w:r></w:p></w:body></w:document>',
    ),
  );
  const images = await Promise.all(
    Array.from({ length: 45 }, (_, r) =>
      sharp({
        create: {
          width: 2,
          height: 2,
          channels: 3,
          background: { r, g: 100, b: 200 },
        },
      })
        .png()
        .toBuffer(),
    ),
  );
  // Forty identical decorations must not consume the distinct-media budget.
  for (let i = 0; i < 40; i++)
    zip.addFile(`word/media/a-${String(i).padStart(2, "0")}.png`, images[0]);
  for (let i = 0; i < images.length; i++)
    zip.addFile(
      `word/media/product-${String(i).padStart(2, "0")}.png`,
      images[i],
    );
  return zip.toBuffer();
}
test("document media keeps more than forty originals and deduplicates repeated decorations", async () => {
  const source = await extract(await document(), "media.docx");
  assert.equal(source.assets.length, 45);
  assert.ok(source.assets.some((a) => a.name.endsWith("product-44.png")));
  assert.equal(new Set(source.assets.map((a) => a.id)).size, 45);
  assert.doesNotMatch(source.warnings.join("\n"), /数量或总大小上限/);
});
test("document media count limits produce a visible warning instead of silent truncation", async () => {
  const source = await extract(await document(), "media.docx", undefined, {
    mediaLimit: 2,
  });
  assert.equal(source.assets.length, 2);
  assert.match(source.warnings.join("\n"), /数量或总大小上限（2 个去重素材/);
  assert.match(source.markdown!, /Media coverage test/);
});
