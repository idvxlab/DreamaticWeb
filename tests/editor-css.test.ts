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

test("editor round trips variable animation/transition/background shorthands with longhand overrides", async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.DREAMATIC_BROWSER_PATH ||
      process.env.CHROME_PATH ||
      chromium.executablePath(),
    headless: true,
  });
  try {
    const page = await browser.newPage({ reducedMotion: "no-preference" });
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
    const css = `:root{--ease:cubic-bezier(.2,.7,.3,1);--surface:#123456;--duration:.5s;--data:{key:value};--dreamatic-editor-raw:author}
      @font-face{font-family:Fixture;src:local(Arial);font-display:swap}
      @media (prefers-reduced-motion:no-preference){
        @keyframes plateIn{from{opacity:.5}to{opacity:1}}
        .hero{animation:plateIn .82s var(--ease) both;animation-delay:.16s;
          transition:opacity var(--duration) var(--ease);transition-delay:.2s;
          background:var(--surface);background-position:center;
          color: /* comment ; } */ white!important;color:red;}
        .reverse{animation-delay:5s;animation:plateIn .9s var(--ease) both}
        .repeat{animation:plateIn 5s var(--ease);animation-delay:.2s;animation:plateIn .7s var(--ease)}
        .invalid{color:rgb(1,2,3);color:broken}
        .hero::after{content:"semi; brace } and /* literal */"}
      }
      @media(prefers-reduced-motion:reduce){.hero{animation:none!important;transition:none!important}}`;
    const original = `<html><head><style>${css}</style></head><body><div class="hero">Animated</div><div class="reverse">Reverse</div><div class="repeat">Repeat</div><div class="invalid">Invalid fallback</div></body></html>`;
    const output = await page.evaluate((html) => {
      const w = window as any;
      const e = w.grapesjs.init({
        container: "#editor",
        storageManager: false,
        parser: { parserCss: w.parseEditorCss },
      });
      let result = html;
      for (let i = 0; i < 2; i++) {
        e.setComponents(result);
        result = `<html><head><style>${e.getCss()}</style></head><body>${e.getHtml()}</body></html>`;
      }
      e.destroy();
      return result;
    }, original);
    const snapshot = async (html: string) => {
      await page.setContent(html);
      return page.evaluate(() =>
        [".hero", ".reverse", ".repeat", ".invalid"].map((selector) => {
          const style = getComputedStyle(document.querySelector(selector)!);
          return Object.fromEntries(
            [
              "animation-name",
              "animation-duration",
              "animation-delay",
              "animation-timing-function",
              "transition-property",
              "transition-duration",
              "transition-delay",
              "background-color",
              "background-position",
              "color",
              "--data",
              "--dreamatic-editor-raw",
            ].map((key) => [key, style.getPropertyValue(key)]),
          );
        }),
      );
    };
    const before = await snapshot(original),
      after = await snapshot(output);
    assert.equal(before[0]["animation-name"], "plateIn");
    assert.deepEqual(after, before);
    assert.match(output, /font-display:swap/);
    assert.match(output, /src:local\("?Arial"?\)/);
    assert.match(output, /literal/);
    assert.doesNotMatch(output, /--dreamatic-editor-raw-:/);
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page
        .locator(".hero")
        .evaluate((e) => getComputedStyle(e).animationName),
      "none",
    );
    await page.setViewportSize({ width: 390, height: 800 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    assert.equal(
      await page
        .locator(".hero")
        .evaluate((e) => getComputedStyle(e).animationName),
      "plateIn",
    );
  } finally {
    await browser.close();
  }
});

test("editor keeps script-built rules, comma lists inside :is() and nested media", async () => {
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
    const css = await page.evaluate(() => {
      const w = window as any;
      const e = w.grapesjs.init({
        container: "#editor",
        storageManager: false,
        keepUnusedStyles: true,
        parser: { parserCss: w.parseEditorCss },
      });
      e.setComponents(
        '<html><head><style>.mo-cr__col{height:1em;overflow:hidden}:is(.btn, .link):hover{color:red}@media (min-width:640px){.wrap :is(h1, h2){margin:0}@media (min-width:720px){.card{gap:3px}}}</style></head><body><p class="link">a</p><div class="wrap"><h1>t</h1></div></body></html>',
      );
      return e.getCss();
    });
    // Built by a page script at run time: no canvas component matches it.
    assert.match(css, /\.mo-cr__col\{height:1em;overflow:hidden;?\}/);
    assert.match(css, /:is\(\.btn, \.link\):hover\{color:red;?\}/);
    assert.match(css, /@media \(min-width: ?640px\)\{\.wrap :is\(h1, h2\)\{margin:0;?\}/);
    assert.match(
      css,
      /@media \(min-width: ?640px\) and \(min-width: ?720px\)\{\.card\{gap:3px;?\}/,
    );
  } finally {
    await browser.close();
  }
});
