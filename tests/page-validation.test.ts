import test from "node:test";
import assert from "node:assert/strict";
import { create, removeProject } from "../apps/server/src/store.js";
import { validatePage } from "../apps/server/src/page-validation.js";
import { pageChecks } from "../apps/server/src/page-checks.js";
import * as cheerio from "cheerio";
import { sanitizeHtml } from "../apps/server/src/html.js";

test("Canvas survives validation without relaxing script, SVG or network policy", async () => {
  const project = await create();
  try {
    const result = await validatePage(
      project,
      `<!doctype html><html><body>
      <h1>Canvas scene</h1><canvas id="scene" width="640" height="320" aria-label="Scene" onclick="alert(1)">Static fallback</canvas>
      <script>document.querySelector('#scene').getContext('2d').fillRect(0,0,20,20)</script>
      <script src="https://example.com/external.js"></script><svg><circle r="10"/></svg>
      <form action="https://example.com/post"><button>Send</button></form>
      </body></html>`,
    );
    assert.equal(result.valid, true);
    const $ = cheerio.load(result.html);
    assert.equal($("canvas#scene").length, 1);
    assert.equal($("canvas").attr("width"), "640");
    assert.equal($("canvas").attr("height"), "320");
    assert.equal($("canvas").attr("aria-label"), "Scene");
    assert.equal($("canvas").attr("onclick"), undefined);
    assert.equal($("canvas").text(), "Static fallback");
    assert.equal($("script").length, 1);
    assert.match($("script").text(), /getContext/);
    assert.equal($("svg,script[src]").length, 0);
    assert.equal($("form").attr("action"), undefined);
    assert.equal($("button").attr("type"), "button");
    assert.match(
      $("meta[http-equiv]").attr("content") || "",
      /connect-src 'none'/,
    );
    assert.equal(sanitizeHtml(result.html), result.html);
  } finally {
    await removeProject(project.id);
  }
});

test("manual pages retain inline design and reject invalid structure and foreign assets", async () => {
  const project = await create();
  try {
    const valid = await validatePage(
      project,
      '<html><head><style>h1{color:#fe6b35}</style></head><body><h1 id="top">Manual page</h1><a href="#top">Top</a></body></html>',
    );
    assert.equal(valid.valid, true);
    assert.match(valid.html, /h1\{color:#fe6b35\}/);
    assert.match(valid.html, /script-src 'unsafe-inline'/);
    const invalid = await validatePage(
      project,
      '<html><body><h1 id="same">One</h1><p id="same">Two</p><a href="#missing">Broken</a><img alt="foreign" src="/assets/00000000-0000-0000-0000-000000000000/image.png"></body></html>',
    );
    assert.equal(invalid.valid, false);
    for (const code of ["duplicate_id", "anchor", "asset_scope"])
      assert.ok(
        invalid.issues.some((issue) => issue.code === code),
        code,
      );
    const checks = pageChecks(project, valid.html, valid.issues);
    assert.equal(checks.status, "not-previewed");
    assert.deepEqual(checks.viewports, []);
  } finally {
    await removeProject(project.id);
  }
});

test("visible CSS source is rejected while intentional code samples and prose remain valid", async () => {
  const project = await create();
  try {
    for (const body of [
      "body{background:#fff;color:#111}.hero>div{display:flex}<h1>Broken</h1>",
      "```css\nbody{color:red}\n```<h1>Broken</h1>",
      "&lt;html&gt;&lt;body&gt;Source&lt;/body&gt;&lt;/html&gt;<h1>Broken</h1>",
    ]) {
      const result = await validatePage(
        project,
        `<html><body>${body}</body></html>`,
      );
      assert.equal(result.valid, false);
      assert.ok(
        result.issues.some(
          (i) => i.code === "visible_source" && i.severity === "error",
        ),
      );
    }
    const result = await validatePage(
      project,
      "<html><body><h1>CSS guide</h1><pre><code>body{color:red}</code></pre>Welcome to our company.</body></html>",
    );
    assert.equal(result.valid, true);
  } finally {
    await removeProject(project.id);
  }
});
