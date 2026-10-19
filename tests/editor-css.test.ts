import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { chromium } from "playwright-core";
import { inspectTextContrast } from "../apps/server/src/contrast.js";

test("editor preserves variable shorthands, media rules, important colors and contrast", async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.DREAMATIC_BROWSER_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="editor"></div>');
    await page.addScriptTag({
      path: "node_modules/grapesjs/dist/grapes.min.js",
    });
    const source = await readFile("apps/web/src/editor-css.ts", "utf8");
    await page.addScriptTag({
      content: ts
        .transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.None,
            target: ts.ScriptTarget.ES2022,
          },
        })
        .outputText.replace(/export /g, ""),
    });
    const output = await page.evaluate(() => {
      const w = window as any;
      const e = w.grapesjs.init({
        container: "#editor",
        storageManager: false,
        parser: { parserCss: w.parseEditorCss },
      });
      e.setComponents(
        '<html><head><style>:root{--dark:#102030;--light:#fff}.hero{background:var(--dark);color:var(--light)}.hero p{color: white!important}@media(max-width:600px){.hero{background:var(--light);color:var(--dark)}.hero p{color:var(--dark)!important}}</style></head><body><section class="hero"><h1>Readable heading</h1><p>Readable paragraph</p></section></body></html>',
      );
      return `<html><head><style>${e.getCss()}</style></head><body>${e.getHtml()}</body></html>`;
    });
    await page.setContent(output);
    assert.equal(
      await page
        .locator(".hero")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(16, 32, 48)",
    );
    assert.deepEqual(
      (
        await page.evaluate<ReturnType<typeof inspectTextContrast>>(
          `(() => { const __name = (value) => value; return (${inspectTextContrast.toString()})(); })()`,
        )
      ).issues,
      [],
    );
    await page.setViewportSize({ width: 390, height: 800 });
    assert.equal(
      await page
        .locator(".hero")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(255, 255, 255)",
    );
    assert.deepEqual(
      (
        await page.evaluate<ReturnType<typeof inspectTextContrast>>(
          `(() => { const __name = (value) => value; return (${inspectTextContrast.toString()})(); })()`,
        )
      ).issues,
      [],
    );
    await page.setContent(
      '<body style="background:white"><p id="bad" style="color:white">Invisible text</p><p style="color:#777">Low contrast</p><div style="background:#102030"><p style="color:white">Readable</p></div><div style="background:linear-gradient(black,white);color:white">Unknown image background</div></body>',
    );
    const report = await page.evaluate<ReturnType<typeof inspectTextContrast>>(
      `(() => { const __name = (value) => value; return (${inspectTextContrast.toString()})(); })()`,
    );
    assert.equal(report.issues.length, 2);
    assert.equal(report.issues[0].selector, "#bad");
    assert.equal(report.issues[0].ratio, 1);
    assert.ok(report.unchecked > 0);
  } finally {
    await browser.close();
  }
});
