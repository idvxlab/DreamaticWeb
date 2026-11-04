import test from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { sanitizeHtml } from "../apps/server/src/html.js";
import { validatePage } from "../apps/server/src/page-validation.js";
import { create, removeProject } from "../apps/server/src/store.js";

const graphics = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100" role="img" aria-labelledby="scene-title">
<title id="scene-title">Moving scene</title><desc>Accessible description</desc>
<defs><linearGradient id="paint" gradientUnits="userSpaceOnUse" gradientTransform="rotate(20)"><stop offset="0%" stop-color="#f80"/><stop offset="100%" stop-color="#0cf"/></linearGradient>
<clipPath id="cut" clipPathUnits="userSpaceOnUse"><circle cx="50" cy="50" r="40"/></clipPath>
<mask id="fade" maskUnits="userSpaceOnUse"><rect width="100" height="100" fill="white"/></mask>
<symbol id="blade" viewBox="0 0 10 10"><path d="M0 0L10 5L0 10Z"/></symbol></defs>
<g class="rotor" clip-path="url(#cut)" mask="url('#fade')" transform="translate(3 4)" style="fill:url(#paint);opacity:.8">
<use href="#blade"/><use xlink:href="#blade" x="20"/>
<text x="5" y="20" text-anchor="middle"><tspan dx="2">A | B</tspan></text></g></svg>`;

test("SVG geometry, gradients, local references, namespaces and accessible titles survive repeated saves", () => {
  const html = sanitizeHtml(
    `<html><head><title>Document</title><style>.rotor{animation:spin 8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><h1>Demo</h1>${graphics}<script>document.body.dataset.ready='yes'</script></body></html>`,
  );
  const $ = cheerio.load(html);
  assert.equal($("svg").attr("viewBox"), "0 0 100 100");
  assert.equal($("svg").attr("aria-labelledby"), "scene-title");
  assert.equal($("svg title").text(), "Moving scene");
  assert.equal($("head title").text(), "Document");
  assert.equal($("svg [id=paint]").attr("gradientUnits"), "userSpaceOnUse");
  assert.equal($("svg [id=cut]").attr("clipPathUnits"), "userSpaceOnUse");
  assert.equal($("svg [id=fade]").attr("maskUnits"), "userSpaceOnUse");
  assert.equal($("svg use").length, 2);
  assert.ok(html.includes('xlink:href="#blade"'));
  assert.equal($("svg g").attr("mask"), "url('#fade')");
  assert.equal($("svg text").text(), "A | B");
  assert.match($("style").text(), /@keyframes spin/);
  assert.equal($("script").length, 1);
  assert.equal(sanitizeHtml(html), html);
});

test("SVG cannot carry scripts, foreign HTML, external images, SMIL mutation or external paint references", () => {
  const html = sanitizeHtml(`<html><body><h1>Demo</h1><svg onload="bad()">
    <script>bad()</script><style>@import 'https://example.test/x';</style>
    <foreignObject><div><script>bad()</script><iframe src="https://example.test/x"></iframe></div></foreignObject>
    <image href="/assets/image.png"/><animate attributeName="href" to="javascript:bad()"/>
    <animateTransform/><set attributeName="onclick" to="bad()"/><filter id="expensive"><feImage href="https://example.test/x"/></filter>
    <use href="https://example.test/icons.svg#x"/><use xlink:href="javascript:bad()"/>
    <path d="M0 0L10 10" onclick="bad()" fill="url(https://example.test/paint)" stroke="u\\72l(https://example.test/x)"/>
    <circle r="4" style="fill:url(https://example.test/paint);stroke:url(#local)"/>
  </svg><script>document.body.dataset.legitimate='yes'</script></body></html>`);
  const $ = cheerio.load(html);
  assert.equal(
    $(
      "svg script,svg style,svg foreignObject,svg image,svg animate,svg animateTransform,svg set,svg filter",
    ).length,
    0,
  );
  assert.equal($("svg").attr("onload"), undefined);
  assert.equal($("svg path").attr("onclick"), undefined);
  assert.equal($("svg path").attr("fill"), undefined);
  assert.equal($("svg path").attr("stroke"), undefined);
  assert.equal($("svg path").attr("d"), "M0 0L10 10");
  assert.equal($("svg use[href]").length, 0);
  assert.equal($("svg circle").attr("style"), "fill:none;stroke:url(#local)");
  assert.equal($("script").length, 1);
  assert.doesNotMatch(html, /bad\(\)|https:\/\/example/);
  assert.match(html, /connect-src 'none'/);
});

test("SVG namespace integration points cannot smuggle HTML controls or script", () => {
  const html = sanitizeHtml(
    '<html><body><h1>Demo</h1><svg><desc><div><script>bad()</script><img src="https://example.test/x"></div></desc><title><span onclick="bad()">bad</span></title><path d="M0 0L1 1"/></svg></body></html>',
  );
  const $ = cheerio.load(html);
  assert.equal($("script,img,svg div,svg span").length, 0);
  assert.equal($("svg path").length, 1);
});

test("validation no longer warns that supported SVG will be removed; filtered content gets a specific warning", async () => {
  const p = await create();
  try {
    const valid = await validatePage(
      p,
      `<html><body><h1>Demo</h1><button aria-label="Menu">${graphics}</button></body></html>`,
    );
    assert.equal(valid.valid, true);
    assert.equal(cheerio.load(valid.html)("button svg path").length, 1);
    assert.ok(
      !valid.issues.some((i) =>
        ["removed_content", "svg_policy"].includes(i.code),
      ),
    );
    const filtered = await validatePage(
      p,
      '<html><body><h1>Demo</h1><svg><path d="M0 0L1 1" onclick="bad()"/></svg></body></html>',
    );
    assert.ok(filtered.issues.some((i) => i.code === "svg_policy"));
    assert.equal(cheerio.load(filtered.html)("svg path").length, 1);
  } finally {
    await removeProject(p.id);
  }
});

test("removing the only unsupported SVG visual cannot silently produce an accepted empty control", async () => {
  const p = await create();
  try {
    for (const content of [
      '<foreignObject width="24" height="24"><div>Menu</div></foreignObject>',
      '<image href="https://example.test/icon.png" width="24" height="24"/>',
    ]) {
      const report = await validatePage(
        p,
        `<html><body><h1>Demo</h1><button aria-label="Menu"><svg viewBox="0 0 24 24">${content}</svg></button></body></html>`,
      );
      assert.equal(report.valid, false);
      assert.ok(
        report.issues.some(
          (i) => i.code === "svg_empty" && i.severity === "error",
        ),
      );
    }
  } finally {
    await removeProject(p.id);
  }
});
