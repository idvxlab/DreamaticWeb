import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import type { OfficeContentNode } from "officeparser";
import { imageSignals, mediaLayout, offeredAsset, CAPTION } from "../apps/server/src/media-layout.js";
import { guardGraphics } from "../apps/server/src/picture-guard.js";
import { persistExtraction } from "../apps/server/src/source-content.js";
import type { Asset } from "../packages/shared/project.js";

const png = (svg: string) => sharp(Buffer.from(svg)).png().toBuffer();
const W = `width="400" height="300"`;

test("pixel signals flag only flat tiles and empty frames; line drawings and photos stay usable", async () => {
  const gradient = await png(
    `<svg xmlns="http://www.w3.org/2000/svg" ${W}><defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="#74d4f0"/><stop offset="1" stop-color="#8fdcf4"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>`,
  );
  const frame = await png(
    `<svg xmlns="http://www.w3.org/2000/svg" ${W}><rect width="400" height="300" fill="#fff"/><rect x="6" y="6" width="388" height="288" rx="18" fill="none" stroke="#111" stroke-width="8"/></svg>`,
  );
  const drawing = await png(
    `<svg xmlns="http://www.w3.org/2000/svg" ${W}><rect width="400" height="300" fill="#fff"/><path d="M20 150 Q200 120 380 150 Q200 180 20 150" fill="none" stroke="#222" stroke-width="2"/><circle cx="200" cy="150" r="12" fill="none" stroke="#222" stroke-width="2"/><line x1="20" y1="60" x2="380" y2="60" stroke="#222"/></svg>`,
  );
  const photo = await sharp({
    create: {
      width: 300,
      height: 200,
      channels: 3,
      background: "#808080",
      noise: { type: "gaussian", mean: 128, sigma: 60 },
    },
  })
    .png()
    .toBuffer();
  assert.deepEqual(await imageSignals(gradient), ["flat"]);
  assert.deepEqual(await imageSignals(frame), ["frame-only"]);
  assert.deepEqual(await imageSignals(drawing), []);
  assert.deepEqual(await imageSignals(photo), []);
});

test("layout gives page, nearby printed text, composite slices and page-sized backgrounds", () => {
  const nodes = [
    {
      type: "page",
      metadata: { pageNumber: 4, pageWidth: 1000, pageHeight: 700 },
      children: [
        {
          type: "text",
          text: "性能曲线",
          bounds: { x: 520, y: 80, width: 80, height: 20 },
        },
        {
          type: "text",
          text: "DH-RF54 碳纤维螺旋桨",
          bounds: { x: 60, y: 80, width: 200, height: 20 },
        },
        {
          type: "image",
          metadata: { attachmentName: "curve.png" },
          bounds: { x: 520, y: 110, width: 300, height: 220 },
        },
        {
          type: "image",
          metadata: { attachmentName: "photo.png" },
          bounds: { x: 60, y: 110, width: 300, height: 200 },
        },
        {
          type: "image",
          metadata: { attachmentName: "left.png" },
          bounds: { x: 0, y: 500, width: 200, height: 100 },
        },
        {
          type: "image",
          metadata: { attachmentName: "right.png" },
          bounds: { x: 200, y: 500, width: 200, height: 100 },
        },
      ],
    },
    {
      type: "page",
      metadata: { pageNumber: 5, pageWidth: 1000, pageHeight: 700 },
      children: [
        {
          type: "image",
          metadata: { attachmentName: "cover.png" },
          bounds: { x: 0, y: 0, width: 1000, height: 700 },
        },
        {
          type: "text",
          text: "⚁岤电끮轠偒咙䪮助",
          bounds: { x: 100, y: 100, width: 200, height: 20 },
        },
      ],
    },
  ] as unknown as OfficeContentNode[];
  const layout = mediaLayout(nodes);
  assert.equal(layout.get("curve.png")!.page, 4);
  assert.equal(layout.get("curve.png")!.context, "性能曲线");
  assert.equal(layout.get("photo.png")!.context, "DH-RF54 碳纤维螺旋桨");
  assert.equal(layout.get("photo.png")!.fragment, false);
  assert.equal(layout.get("left.png")!.fragment, true);
  assert.equal(layout.get("right.png")!.fragment, true);
  assert.equal(layout.get("cover.png")!.pageBackground, true);
  assert.equal(
    layout.get("cover.png")!.context,
    undefined,
    "garbled font text is not quoted",
  );
});

test("layers of one icon (a glyph on a disc) are fragments; a photograph carrying a small logo is not", () => {
  const layout = mediaLayout([
    {
      type: "page",
      metadata: { pageNumber: 25, pageWidth: 1000, pageHeight: 700 },
      children: [
        { type: "image", metadata: { attachmentName: "disc.png" }, bounds: { x: 100, y: 100, width: 80, height: 80 } },
        { type: "image", metadata: { attachmentName: "glyph.png" }, bounds: { x: 115, y: 115, width: 50, height: 50 } },
        { type: "image", metadata: { attachmentName: "photo.png" }, bounds: { x: 400, y: 100, width: 500, height: 400 } },
        { type: "image", metadata: { attachmentName: "logo.png" }, bounds: { x: 820, y: 420, width: 60, height: 60 } },
      ],
    },
  ] as unknown as OfficeContentNode[]);
  assert.equal(layout.get("disc.png")!.fragment, true);
  assert.equal(layout.get("glyph.png")!.fragment, true);
  assert.equal(layout.get("photo.png")!.fragment, false, "too large to be an icon layer");
  assert.equal(layout.get("logo.png")!.fragment, false, "sits on a photograph, not on an icon");
});

test("every caption on a page goes to every picture on it, and a caption is not nearby text", () => {
  const layout = mediaLayout([
    {
      type: "page",
      metadata: { pageNumber: 10, pageWidth: 600, pageHeight: 800 },
      children: [
        { type: "image", metadata: { attachmentName: "a.png" }, bounds: { x: 50, y: 100, width: 240, height: 140 } },
        { type: "image", metadata: { attachmentName: "b.png" }, bounds: { x: 310, y: 100, width: 240, height: 140 } },
        { type: "image", metadata: { attachmentName: "c.png" }, bounds: { x: 180, y: 260, width: 240, height: 140 } },
        { type: "text", text: "Fig. 8. Five example videos with embedded visualizations.", bounds: { x: 180, y: 410, width: 240, height: 12 } },
        { type: "text", text: "Body text of the paper.", bounds: { x: 50, y: 600, width: 500, height: 12 } },
      ],
    },
    {
      type: "page",
      metadata: { pageNumber: 11, pageWidth: 600, pageHeight: 800 },
      children: [{ type: "image", metadata: { attachmentName: "d.png" }, bounds: { x: 50, y: 100, width: 240, height: 140 } }],
    },
  ] as unknown as OfficeContentNode[]);
  for (const name of ["a.png", "b.png", "c.png"])
    assert.deepEqual(
      layout.get(name)!.pageCaptions,
      ["Fig. 8. Five example videos with embedded visualizations. (at left 30%, top 51%, width 40%, height 2%)"],
      name,
    );
  assert.equal(layout.get("c.png")!.position, "left 30%, top 33%, width 40%, height 18%");
  assert.equal(layout.get("c.png")!.context, undefined, "the caption beside one part is not that part's nearby text");
  assert.equal(layout.get("d.png")!.pageCaptions, undefined);
  assert.ok(CAPTION.test("图 3 系统架构") && CAPTION.test("Table 1: results") && CAPTION.test("Figure 12"));
  assert.ok(!CAPTION.test("Figures show that") && !CAPTION.test("Fig. shows"));
});

test("a line of type stored as a picture is a text strip and is not offered; a wordmark logo is not", () => {
  const layout = mediaLayout([
    {
      type: "page",
      metadata: { pageNumber: 5, pageWidth: 612, pageHeight: 792 },
      children: [
        { type: "image", metadata: { attachmentName: "caption.png" }, bounds: { x: 116, y: 578, width: 153, height: 8 } },
        { type: "image", metadata: { attachmentName: "wordmark.png" }, bounds: { x: 40, y: 20, width: 120, height: 20 } },
        { type: "image", metadata: { attachmentName: "chart.png" }, bounds: { x: 40, y: 100, width: 500, height: 200 } },
      ],
    },
  ] as unknown as OfficeContentNode[]);
  assert.equal(layout.get("caption.png")!.textStrip, true);
  assert.equal(layout.get("wordmark.png")!.textStrip, false);
  assert.equal(layout.get("chart.png")!.textStrip, false);
  const strip = { id: "a", name: "a", type: "image", url: "/a", mime: "image/png", flags: ["text-strip"] } as Asset;
  assert.equal(offeredAsset(strip), false);
});

test("canonical Markdown lists page, nearby text and flags without claiming visual content", async () => {
  const source = {
    id: "s",
    name: "doc.pdf",
    format: "pdf",
    text: "Body",
    tables: [],
    warnings: [],
    provenance: "test",
    assets: [
      {
        id: "a1",
        name: "p4.png",
        type: "image",
        url: "/assets/x/a1.png",
        mime: "image/png",
        width: 10,
        height: 8,
        page: 4,
        context: "性能曲线",
        pageCaptions: ["图 4 性能曲线"],
      },
      {
        id: "a2",
        name: "p1.png",
        type: "image",
        url: "/assets/x/a2.png",
        mime: "image/png",
        page: 1,
        flags: ["flat"],
      },
    ],
  } as never;
  await persistExtraction(source);
  const markdown = (source as { markdown: string }).markdown;
  assert.match(markdown, /id:a1 · 10×8 · page:4 · nearby:"性能曲线" · pageCaptions:\["图 4 性能曲线"\]/);
  assert.match(markdown, /does not say which image a caption covers/);
  assert.match(markdown, /id:a2 · page:1 · flags:flat/);
  assert.match(markdown, /not its visual content/);
});


test("flat tiles, empty frames and composite slices are not offered; page backdrops are, with their flag", () => {
  const asset = (flags?: Asset["flags"]) => ({ id: "a", name: "a", type: "image", url: "/a", mime: "image/png", flags }) as Asset;
  assert.equal(offeredAsset(asset()), true);
  assert.equal(offeredAsset(asset(["page-background"])), true);
  assert.equal(offeredAsset(asset(["graphic"])), true);
  for (const flag of ["flat", "frame-only", "fragment"] as const)
    assert.equal(offeredAsset(asset([flag])), false, flag);
});

const svg = (body: string) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#fff"/>${body}</svg>`))
    .png()
    .toBuffer();

test("flat emblems are flagged graphic; line drawings and photographs are not", async () => {
  const emblem = await svg('<circle cx="130" cy="150" r="110" fill="#1a5fb4"/><circle cx="280" cy="150" r="110" fill="#1a5fb4"/>');
  const drawing = await svg('<path d="M20 150 C120 40 280 260 380 150" stroke="#222" stroke-width="2" fill="none"/><line x1="20" y1="260" x2="380" y2="260" stroke="#222"/>');
  const noise = Buffer.alloc(200 * 150 * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) % 251;
  const photo = await sharp(noise, { raw: { width: 200, height: 150, channels: 3 } }).png().toBuffer();
  assert.deepEqual(await imageSignals(emblem), ["graphic"]);
  assert.deepEqual(await imageSignals(drawing), []);
  assert.deepEqual(await imageSignals(photo), []);
});

test("graphic pictures are kept at icon size unless marked screenshot, chart, poster or drawing", () => {
  const url = "/assets/p/11111111-1111-4111-8111-111111111111.png";
  const page = `<html><head></head><body><img src="${url}" data-kind="illustration"><img src="/assets/p/other.png"></body></html>`;
  const guarded = guardGraphics(page, [url]);
  assert.match(guarded, /data-host="graphics"/);
  assert.match(guarded, /max-width:min\(160px,100%\)!important/);
  assert.equal(guardGraphics(guarded, [url]), guarded, "idempotent");
  for (const kind of ["screenshot", "chart", "poster", "drawing"]) {
    const sized = page.replace('data-kind="illustration"', `data-kind="${kind}"`);
    assert.equal(guardGraphics(sized, [url]), sized, kind);
  }
  assert.equal(guardGraphics(page, []), page);
});
