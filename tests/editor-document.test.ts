import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { chromium } from "playwright-core";
import { PREVIEW_CSP } from "../packages/shared/html-policy.js";

test("document load/save cycles keep metadata out of canvas and preserve CSS, body attributes and Canvas scripts", async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.DREAMATIC_BROWSER_PATH ||
      process.env.CHROME_PATH ||
      chromium.executablePath(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="editor"></div>');
    await page.addScriptTag({
      path: "node_modules/grapesjs/dist/grapes.min.js",
    });
    for (const name of ["editor-css", "editor-document"]) {
      const source = (
        await readFile(`apps/web/src/${name}.ts`, "utf8")
      ).replace(/^import .*;\n/gm, "");
      await page.addScriptTag({
        content:
          (name === "editor-document"
            ? `const PREVIEW_CSP=${JSON.stringify(PREVIEW_CSP)};\n`
            : "") +
          ts
            .transpileModule(source, {
              compilerOptions: {
                module: ts.ModuleKind.None,
                target: ts.ScriptTarget.ES2022,
              },
            })
            .outputText.replace(/export /g, ""),
      });
    }
    const output = await page.evaluate(() => {
      const w = window as any;
      const e = w.grapesjs.init({
        container: "#editor",
        storageManager: false,
        parser: {
          parserCss: w.parseEditorCss,
          optionsHtml: { allowScripts: false },
        },
      });
      let html = `<!doctype html><html lang="zh-CN"><head><title>Scene &amp; motion</title><meta name="description" content="A precise description"><style>:root{--ink:#123456}.hero{color:var(--ink);animation:pulse 2s linear infinite}@keyframes pulse{from{opacity:.8}to{opacity:1}}@media(max-width:600px){.hero{font-size:18px}}</style></head><body id="top" class="theme" data-case="original"><main><h1 class="hero">Canvas scene</h1><canvas id="scene" width="80" height="40" aria-label="Scene"></canvas></main><script>window.sceneRuns=(window.sceneRuns||0)+1;document.getElementById('scene').getContext('2d').fillRect(0,0,20,20)</script></body></html>`;
      // Include a legacy body title/meta to exercise migration of already saved pages.
      html = html.replace(
        "</main>",
        '</main><title>Legacy duplicate</title><meta name="description" content="Old body metadata">',
      );
      const cycles = [];
      for (let i = 0; i < 4; i++) {
        const parsed = w.parseEditorDocument(html);
        e.setStyle("");
        e.setComponents(parsed.markup);
        e.getWrapper().setAttributes(parsed.bodyAttributes);
        html = w.serializeEditorDocument({
          html: e.getHtml(),
          css: e.getCss(),
          metadata: parsed.metadata,
          scripts: parsed.scripts,
          bodyAttributes: e.getWrapper().getAttributes(),
        });
        const doc = new DOMParser().parseFromString(html, "text/html");
        cycles.push({
          titles: doc.querySelectorAll("title").length,
          bodyMetadata: doc.body.querySelectorAll("title,meta").length,
          descriptions: doc.querySelectorAll('meta[name="description"]').length,
          policies: doc.querySelectorAll(
            'meta[http-equiv="Content-Security-Policy"]',
          ).length,
          scripts: doc.querySelectorAll("script").length,
          canvas: doc.querySelectorAll("canvas#scene").length,
          title: doc.title,
          bodyId: doc.body.id,
          theme: doc.body.className,
          marker: doc.body.dataset.case,
          description: doc.head
            .querySelector('meta[name="description"]')
            ?.getAttribute("content"),
        });
      }
      e.destroy();
      return {
        html,
        preview: w.serializePreviewDocument(html),
        cycles,
      };
    });
    for (const cycle of output.cycles)
      assert.deepEqual(cycle, {
        titles: 1,
        bodyMetadata: 0,
        descriptions: 1,
        policies: 1,
        scripts: 1,
        canvas: 1,
        title: "Scene & motion",
        bodyId: "top",
        theme: "theme",
        marker: "original",
        description: "A precise description",
      });
    assert.doesNotMatch(output.html, /data-dreamatic-preview-navigation/);
    assert.match(output.preview, /data-dreamatic-preview-navigation/);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(output.html);
    assert.deepEqual(
      await page.evaluate(() => {
        const canvas = document.querySelector("canvas")!;
        const style = getComputedStyle(document.querySelector("h1")!);
        return {
          runs: (window as any).sceneRuns,
          alpha: canvas.getContext("2d")!.getImageData(10, 10, 1, 1).data[3],
          color: style.color,
          animation: style.animationName,
        };
      }),
      { runs: 1, alpha: 255, color: "rgb(18, 52, 86)", animation: "pulse" },
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.locator("h1").evaluate((e) => getComputedStyle(e).fontSize),
      "18px",
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
