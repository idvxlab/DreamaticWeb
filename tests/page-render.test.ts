import test from "node:test";
import assert from "node:assert/strict";
import { patchHtml } from "../apps/server/src/generation/page-patch.js";
import { pageScreenshots } from "../apps/server/src/page-render.js";

test("review corrections are selector operations on the submitted page", () => {
  const out = patchHtml("<html><body><main><p id=a>x</p></main></body></html>", [
    { selector: "#a", action: "set_style", name: "max-width", value: "640px" },
  ]);
  assert.match(out.html, /max-width:\s*640px/);
  assert.equal(out.operations, 1);
});

test("a rendered page comes back as a few half-size screenshots, or none without a browser", async () => {
  const html = `<!doctype html><html><body style="margin:0"><div style="height:4000px;background:linear-gradient(#fff,#000)"></div></body></html>`;
  const shots = await pageScreenshots("no-such-project", html);
  if (!shots.length) return; // no browser on this machine: the review is skipped, never fails
  assert.ok(shots.length >= 2 && shots.length <= 8);
  assert.equal(shots[0][0], 0xff, "JPEG");
});
