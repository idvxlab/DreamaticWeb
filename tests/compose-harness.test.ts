import test from "node:test";
import assert from "node:assert/strict";
import { sectionInventory, withCompose } from "../apps/server/src/generation/style-kit.js";

test("a page using compositions gets their stylesheet after the kit's and their script", () => {
  const page = '<html><head><link rel="stylesheet" href="skill://designer-taste/assets/taste.css"></head><body><div class="cx-split"></div></body></html>';
  const out = withCompose(page);
  assert.match(out, /taste\.css"><link rel="stylesheet" href="skill:\/\/designer-compose\/assets\/compose\.css">/);
  assert.match(out, /<script src="skill:\/\/designer-compose\/assets\/compose\.js"><\/script><\/body>/);
  assert.equal(withCompose(out), out);
  const plain = "<html><head></head><body><div class=\"split\"></div></body></html>";
  assert.equal(withCompose(plain), plain);
});

test("the section inventory counts named pictures and suggests a fitting composition", () => {
  const a = (id: string, width: number, height: number) => ({ id, type: "image", width, height });
  const assets = [
    a("7574aaaa-0000-4000-8000-000000000001", 800, 600),
    a("b057bbbb-0000-4000-8000-000000000002", 2000, 600),
    a("c111cccc-0000-4000-8000-000000000003", 400, 900),
    a("d222dddd-0000-4000-8000-000000000004", 400, 300),
  ];
  const rows = sectionInventory(
    [
      { id: "intro", content: "Lead paragraph, photo 7574" },
      { id: "fig", content: "Chart b057bbbb-0000-4000-8000-000000000002 with its caption" },
      { id: "set", content: "Images 7574, c111, d222" },
      { id: "words", content: "Only words" },
    ],
    assets,
  );
  assert.deepEqual(rows.map((r) => [r.id, r.pictures.length, r.fits]), [
    ["intro", 1, "cx-split"],
    ["fig", 1, "cx-figure or cx-band"],
    ["set", 3, "cx-gallery"],
    ["words", 0, "cx-cards or cx-facts"],
  ]);
  assert.equal(rows[2].pictures.find((p) => p.id === "c111")?.orient, "tall");
});
