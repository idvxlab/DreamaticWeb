import test from "node:test";
import assert from "node:assert/strict";
import { markGaps, reviewPatchHtml, stripGaps, tagElements } from "../apps/server/src/generation/page-patch.js";
import { pageOverflow, pageScreenshots, type PageGap } from "../apps/server/src/page-render.js";

const page = `<!doctype html><html><head><style>.row{display:grid}</style></head><body><main>
<section id="a"><div class="row"><figure id="f"><img src="/assets/x/1.png"></figure><div id="t"><p id="p1">First paragraph.</p><p id="p2">Second paragraph.</p></div></div></section>
<div class="cards"><span id="icon">🎨</span><b>Agent</b></div></main></body></html>`;

test("the review may rearrange: styles, classes, CSS rules, moving and markers", () => {
  const out = reviewPatchHtml(page, [
    { action: "set_style", selector: "#f", name: "float", value: "left" },
    { action: "set_class", selector: "#a .row", value: "row wrap" },
    { action: "add_css", value: ".wrap{display:flow-root}" },
    { action: "move", selector: "#p2", target: "#a .row", position: "after" },
    { action: "set_marker", selector: "#icon", value: "01" },
  ]).html;
  assert.match(out, /float: left/);
  assert.match(out, /<style data-review[^>]*>[\s\S]*flow-root/);
  assert.match(out, /<\/div><p id="p2" data-reviewed="">/);
  assert.match(out, /<span id="icon">01<\/span>/);
});

test("the review never takes words or pictures away, nor hides them", () => {
  assert.throws(() => reviewPatchHtml(page, [{ action: "remove" as never, selector: "#f" }]));
  assert.throws(() =>
    reviewPatchHtml(page, [{ action: "set_style", selector: "#f", name: "display", value: "none" }]),
  );
  assert.throws(() => reviewPatchHtml(page, [{ action: "add_css", value: "#t{visibility:hidden}" }]));
  assert.throws(() => reviewPatchHtml(page, [{ action: "set_marker", selector: "#p1", value: "x" }]));
  assert.throws(() => reviewPatchHtml(page, [{ action: "move", selector: "#a", target: "#p1" }]));
});

test("a set's emoji markers are rewritten together, one value each", () => {
  const set = `<html><head></head><body><main><div class="c"><i class="m">📊</i><b>A</b></div><div class="c"><i class="m">✍</i><b>B</b></div></main></body></html>`;
  const out = reviewPatchHtml(set, [{ action: "set_marker", selector: ".m", value: "01|02" }]).html;
  assert.match(out, /<i class="m">01<\/i>[\s\S]*<i class="m">02<\/i>/);
  assert.throws(() => reviewPatchHtml(set, [{ action: "set_marker", selector: ".m", value: "01|02|03" }]));
});

test("arrange rebuilds one row as a Skill arrangement and keeps its words and picture", () => {
  const row = `<html><head></head><body><main><div class="row" id="r"><div class="txt"><p>Words beside.</p><p>More words.</p></div><figure id="f"><img src="/assets/x/1.png"><figcaption>Cap</figcaption></figure></div></main></body></html>`;
  const wrapped = reviewPatchHtml(row, [
    { action: "arrange", selector: "#r", picture: "#f", as: "wrapped", width: "45%", side: "left" },
  ]).html;
  // The picture floats inside the words' own block, so it wraps within the words' measure.
  assert.match(wrapped, /<div class="txt"><figure id="f" data-arrange-picture="">/);
  assert.match(wrapped, /\[data-arrange="review-1"\] \[data-arrange-picture\] \{ float: left !important; width: min\(45%, 55%\)/);
  assert.match(wrapped, /\[data-arrange="review-1"\] > :not\(\[data-arrange-picture\]\) \{ display: flow-root/);
  const stacked = reviewPatchHtml(row, [
    { action: "arrange", selector: "#r", picture: "figure img", as: "stacked", width: "720px", side: "below" },
  ]).html;
  assert.match(stacked, /<\/div><figure id="f" data-arrange-picture="">/);
  assert.match(stacked, /display: block !important; float: none !important; position: static !important; width: 720px !important; max-width: 100% !important; margin: 1.5rem auto 0/);
  assert.throws(() =>
    reviewPatchHtml(row, [{ action: "arrange", selector: "#r", picture: "#f", as: "wrapped", width: "big" }]),
  );
  assert.throws(() =>
    reviewPatchHtml(row, [{ action: "arrange", selector: "main", picture: "#f", as: "stacked", width: "50%" }]),
  );
});

test("what the review changed is marked, for the one look at the changed parts", () => {
  const page2 = `<html><head></head><body><main><div id="a"><p id="p">Words here.</p></div><div id="b"></div></main></body></html>`;
  const out = reviewPatchHtml(page2, [
    { action: "set_style", selector: "#a", name: "max-width", value: "680px" },
    { action: "move", selector: "#p", target: "#b", position: "append" },
  ]).html;
  assert.match(out, /<div id="a" style="max-width: 680px;" data-reviewed="">/);
  assert.match(out, /<p id="p" data-reviewed="">Words here\.<\/p>/);
});

test("a correction applies whole or not at all, listing every refused operation", () => {
  assert.throws(
    () =>
      reviewPatchHtml(page, [
        { action: "set_style", selector: "#f", name: "float", value: "left" },
        { action: "set_style", selector: "p", name: "color", value: "red" },
      ]),
    /没有应用（1\/2 项被拒）[\s\S]*set_style p/,
  );
});

test("several pictures in a picture column beside words are set side by side as one set", () => {
  const two = page.replace('<figure id="f"><img src="/assets/x/1.png"></figure>', '<figure id="f"><img src="/assets/x/1.png"><img src="/assets/x/2.png"></figure>');
  const set = reviewPatchHtml(two, [{ action: "arrange", selector: "#a .row", picture: "#f", as: "beside", width: "40%", side: "left" }]).html;
  assert.match(set, /> \[data-arrange-picture\] \{ display: flex !important; gap: 12px;/);
  assert.ok(reviewPatchHtml(two, [{ action: "arrange", selector: "#a .row", picture: "#f", as: "stacked", width: "720px" }]).html);
});

test("arrange finds the row's pictures and a width by itself, and a refused selector names ones that match one element", () => {
  const two = page.replace('<figure id="f"><img src="/assets/x/1.png"></figure>', '<figure id="f"><img src="/assets/x/1.png"><img src="/assets/x/2.png"></figure>');
  // No picture and no width: the pictures sit in one column, so that column is the picture set.
  assert.match(reviewPatchHtml(two, [{ action: "arrange", selector: "#a .row", as: "beside" }]).html, /grid-template-columns: minmax\(0, 1fr\) 45%/);
  assert.match(reviewPatchHtml(page, [{ action: "arrange", selector: "#a .row", as: "stacked" }]).html, /width: 760px !important/);
  assert.throws(
    () => reviewPatchHtml(two, [{ action: "set_style", selector: "#f img", name: "border-radius", value: "4px" }]),
    /#f img 匹配到 2 个；可改用其中之一：#f > img:nth-of-type\(1\)、#f > img:nth-of-type\(2\)/,
  );
  assert.match(reviewPatchHtml(two, [{ action: "set_style", selector: "#f > img:nth-of-type(2)", name: "border-radius", value: "4px" }]).html, /2\.png" style="border-radius: 4px/);
});

test("measured blanks are written into the page by element index and removed at the end", () => {
  const tagged = tagElements(page);
  const dn = tagged.match(/<div class="row" data-dn="(\d+)"/)![1];
  const marked = markGaps(page, [+dn]);
  assert.match(marked, /<div class="row" data-gap="1">/);
  assert.equal(stripGaps(marked).includes("data-gap"), false);
  assert.match(reviewPatchHtml(marked, [{ action: "set_style", selector: '[data-gap="1"]', name: "gap", value: "2rem" }]).html, /data-gap="1" style="gap: 2rem/);
  // A stored rule would lose its element once the marks are removed.
  assert.throws(() => reviewPatchHtml(marked, [{ action: "add_css", value: '[data-gap="1"] { display: flex; }' }]), /临时标记/);
});

test("the rendered page is measured for blanks beside pictures, and a balanced row is not one", async () => {
  const img = (w: number, h: number) => `<img src="data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='gray'/></svg>`)}" style="width:100%;display:block">`;
  const words = (n: number) => "<p>" + "设计空间把有哪些可能外化了。".repeat(n) + "</p>";
  const html = `<!doctype html><html><body style="margin:0;font:17px/30px sans-serif"><main style="width:1120px;margin:0 auto">
<h2>Tall picture</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:start"><div>${words(4)}</div><div>${img(600, 900)}</div></div>
<h2>Balanced</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:start"><div>${words(26)}</div><div>${img(600, 400)}</div></div>
<h2>Alone</h2><figure style="width:440px;margin:0">${img(440, 300)}</figure>
<h2>Narrow in a wide figure</h2><figure style="margin:0">${img(720, 400).replace("width:100%", "width:100%;max-width:720px")}<figcaption>${"图注说明这张图的内容。".repeat(12)}</figcaption></figure>
<h2>Wrapped</h2><div style="display:flow-root"><figure style="float:right;width:500px;margin:0 0 0 32px">${img(500, 700)}</figure>${words(3)}</div>
</main></body></html>`;
  let gaps: PageGap[] = [];
  const shots = await pageScreenshots("no-such-project", tagElements(html), undefined, (g) => (gaps = g));
  if (!shots.length) return; // no browser on this machine
  assert.deepEqual(gaps.map((g) => [g.kind, g.heading]), [["row", "Tall picture"], ["alone", "Alone"], ["alone", "Narrow in a wide figure"], ["wrapped", "Wrapped"]]);
});

test("a page wider than the window is found at desktop and phone width, with the element that reaches past the edge", async () => {
  const wide = `<!doctype html><html><body><h1>Wide</h1><img id="big" alt="A wide banner" src="data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='2400' height='300'/>")}"></body></html>`;
  let found: string[];
  try {
    found = await pageOverflow("no-such-project", wide);
  } catch {
    return; // no browser on this machine
  }
  assert.equal(found.length, 2);
  assert.match(found[0], /^at 1440px wide: img#big \(alt «A wide banner»\) 2400px wide/);
  assert.match(found[1], /^at 390px wide: img#big/);
  assert.deepEqual(await pageOverflow("no-such-project", wide.replace('<img id="big"', '<img id="big" style="max-width:100%"')), []);
});
