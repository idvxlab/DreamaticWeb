import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { imageSignals } from "../apps/server/src/media-layout.js";
import {
  guardGraphics,
  kitLayoutOverrides,
} from "../apps/server/src/picture-guard.js";

const svg = (body: string) =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#fff"/>${body}</svg>`,
    ),
  )
    .png()
    .toBuffer();

test("flat emblems are flagged graphic; line drawings and photographs are not", async () => {
  const emblem = await svg(
    '<circle cx="130" cy="150" r="110" fill="#1a5fb4"/><circle cx="280" cy="150" r="110" fill="#1a5fb4"/>',
  );
  const drawing = await svg(
    '<path d="M20 150 C120 40 280 260 380 150" stroke="#222" stroke-width="2" fill="none"/><line x1="20" y1="260" x2="380" y2="260" stroke="#222"/>',
  );
  const noise = Buffer.alloc(200 * 150 * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) % 251;
  const photo = await sharp(noise, { raw: { width: 200, height: 150, channels: 3 } })
    .png()
    .toBuffer();
  assert.deepEqual(await imageSignals(emblem), ["graphic"]);
  assert.deepEqual(await imageSignals(drawing), []);
  assert.deepEqual(await imageSignals(photo), []);
});

test("graphic pictures are kept at icon size unless marked as lettering or data", () => {
  const url = "/assets/p/11111111-1111-4111-8111-111111111111.png";
  const page = `<html><head></head><body><img src="${url}" data-kind="illustration"><img src="/assets/p/other.png"></body></html>`;
  const guarded = guardGraphics(page, [url]);
  assert.match(guarded, /data-host="graphics"/);
  assert.match(guarded, /max-width:min\(160px,100%\)!important/);
  assert.equal(guardGraphics(guarded, [url]), guarded);
  const poster = page.replace('data-kind="illustration"', 'data-kind="poster"');
  assert.equal(guardGraphics(poster, [url]), poster);
  assert.equal(guardGraphics(page, []), page);
});

test("page CSS that changes a kit block's layout is listed, kit and host styles are not", () => {
  const page = `<html><head><style data-skill-asset="designer-taste:taste.css">.case{display:grid}</style><style data-host="pictures">.range img{width:1px}</style><style>:root{--p-bg:#fff}.hero--statement .hero-text{max-width:720px;margin:0 auto}.range__media{background:#fff}.process-grid{display:grid}</style></head><body></body></html>`;
  assert.deepEqual(kitLayoutOverrides(page), [".hero--statement .hero-text"]);
});
