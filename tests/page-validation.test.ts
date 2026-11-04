import test from "node:test";
import assert from "node:assert/strict";
import { create, removeProject } from "../apps/server/src/store.js";
import { validatePage } from "../apps/server/src/page-validation.js";
import { pageChecks } from "../apps/server/src/page-checks.js";

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
