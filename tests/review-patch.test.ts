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
