import test from "node:test";
import assert from "node:assert/strict";
import { reviewPatchHtml } from "../apps/server/src/generation/page-patch.js";

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
  assert.match(out, /<\/div><p id="p2">/);
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
  assert.match(wrapped, /<div class="row" id="r" data-arrange="review-1"><figure id="f" data-arrange-picture="">/);
  assert.match(wrapped, /\[data-arrange="review-1"\] > \[data-arrange-picture\] \{ float: left !important; width: 45%/);
  const stacked = reviewPatchHtml(row, [
    { action: "arrange", selector: "#r", picture: "figure img", as: "stacked", width: "720px", side: "below" },
  ]).html;
  assert.match(stacked, /<\/div><figure id="f" data-arrange-picture="">/);
  assert.match(stacked, /width: 720px !important; max-width: 100% !important; margin: 1.5rem auto 0/);
  assert.throws(() =>
    reviewPatchHtml(row, [{ action: "arrange", selector: "#r", picture: "#f", as: "wrapped", width: "big" }]),
  );
  assert.throws(() =>
    reviewPatchHtml(row, [{ action: "arrange", selector: "main", picture: "#f", as: "stacked", width: "50%" }]),
  );
});
