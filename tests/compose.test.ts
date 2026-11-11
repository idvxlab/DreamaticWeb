import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const tall = (w: number, h: number) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#89a"/></svg>`)}`;

test("compositions balance themselves by what they hold", async () => {
  const css = await readFile(".agents/skills/designer-compose/assets/compose.css", "utf8");
  const js = await readFile(".agents/skills/designer-compose/assets/compose.js", "utf8");
  const items = (n: number, inner: (i: number) => string) =>
    Array.from({ length: n }, (_, i) => `<li>${inner(i)}</li>`).join("");
  const browser = await chromium.launch({
    executablePath: process.env.DREAMATIC_BROWSER_PATH || process.env.CHROME_PATH || chromium.executablePath(),
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.setContent(`<!doctype html><html><head><style>${css}</style><style>body{margin:0}main{width:1200px;margin:0 auto}section{margin:40px 0}</style></head><body><main>
      <section><div id="alone" class="cx-split"><div class="cx-text"><h2>Words only</h2><p>One paragraph.</p></div><figure class="cx-media"><span>picture to come</span></figure></div></section>
      <section><div id="tall" class="cx-split"><div class="cx-text"><h2>Short</h2><p>Two lines of words beside a tall picture.</p></div><figure class="cx-media"><img src="${tall(600, 1400)}" alt="" data-kind="drawing"></figure></div></section>
      <section><ul id="g5" class="cx-gallery">${items(5, () => `<img src="${tall(400, 300)}" alt="" data-kind="photo">`)}</ul></section>
      <section><ul id="g2" class="cx-gallery">${items(2, () => `<img src="${tall(400, 300)}" alt="" data-kind="photo">`)}</ul></section>
      <section><ul id="c4" class="cx-cards">${items(4, (i) => `<h3>Item ${i}</h3><p>Words</p>`)}</ul></section>
      <section><ol id="t3" class="cx-timeline">${items(3, (i) => `<time>${2014 + i}</time><h3>Step</h3>`)}</ol></section>
      <section><ol id="t7" class="cx-timeline">${items(7, (i) => `<time>${2014 + i}</time><h3>Step</h3>`)}</ol></section>
    </main><script>${js}</script></body></html>`, { waitUntil: "load" });
    await page.waitForTimeout(200);
    const box = (sel: string) => page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right }; });
    // A split whose frame holds no picture is one column of words, not half a row.
    assert.equal((await box("#alone > .cx-text")).w, 1200);
    // A tall picture is held to about the height its words need.
    const words = await box("#tall > .cx-text"), picture = await box("#tall img");
    assert.ok(picture.h <= Math.max(240, words.h * 1.15) + 1, `picture ${picture.h} vs words ${words.h}`);
    // Five pictures: three, then two centred under them.
    const g5 = await page.locator("#g5 > li").evaluateAll((li) => li.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width })));
    assert.equal(new Set(g5.map((r) => Math.round(r.y))).size, 2);
    const row2 = g5.slice(3), main = await box("main");
    assert.ok(Math.abs(row2[0].x - main.x - (main.right - (row2[1].x + row2[1].w))) < 2, "last row centred");
    // Two pictures share the row in two wide frames.
    const g2 = await page.locator("#g2 > li").evaluateAll((li) => li.map((e) => e.getBoundingClientRect().width));
    assert.ok(g2.every((w) => w > 560));
    // Four cards stand two by two.
    const c4 = await page.locator("#c4 > li").evaluateAll((li) => li.map((e) => Math.round(e.getBoundingClientRect().y)));
    assert.equal(new Set(c4).size, 2);
    // Three milestones run across; seven stand as two columns.
    const t3 = await page.locator("#t3 > li").evaluateAll((li) => li.map((e) => Math.round(e.getBoundingClientRect().y)));
    assert.equal(new Set(t3).size, 1);
    const t7 = await page.locator("#t7 > li").evaluateAll((li) => li.map((e) => Math.round(e.getBoundingClientRect().x)));
    assert.equal(new Set(t7).size, 2);
  } finally {
    await browser.close();
  }
});
