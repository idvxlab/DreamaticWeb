// Deterministic regression evidence, no model calls. Optional CSS_EVIDENCE_HTML
// replays a local exported page; its contents stay in the ignored evidence dir.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { chromium } from "playwright-core";
import { createServer, loadConfigFromFile } from "vite";
import { applyPagePatch } from "../apps/server/src/generation/page-patch.ts";
import { validatePage } from "../apps/server/src/page-validation.ts";
import { sanitizeHtml } from "../apps/server/src/html.ts";

const output = path.resolve(
  process.env.EVIDENCE_DIR || "workspace/experiments/page-integrity-fixes",
);
await mkdir(output, { recursive: true });
const baseline = "e4768220cdfc84951f39c785d937634c12d6a987";
const require = createRequire(import.meta.url);
const oldSource = (file) =>
  execFileSync("git", ["show", `${baseline}:${file}`], { encoding: "utf8" });
function oldModule(file, overrides = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(oldSource(file), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("require", "module", "exports", js)(
    (id) => {
      if (overrides[id]) return overrides[id];
      return require(
        id.startsWith(".")
          ? path.resolve(path.dirname(file), id).replace(/\.js$/, ".ts")
          : id,
      );
    },
    module,
    module.exports,
  );
  return module.exports;
}
const oldHtml = oldModule("apps/server/src/html.ts");
const oldValidation = oldModule("apps/server/src/page-validation.ts", {
  "./html.js": oldHtml,
});
const oldPatch = oldModule("apps/server/src/generation/page-patch.ts");
const results = {
  baseline,
  recordedAt: new Date().toISOString(),
  fixture: "手动回归样例 / 受控连接故障；模型调用 0 次",
  issues: {},
};
const browser = await chromium.launch({
  executablePath:
    process.env.DREAMATIC_BROWSER_PATH ||
    process.env.CHROME_PATH ||
    chromium.executablePath(),
  headless: true,
});
let server, vite;
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "no-preference",
  });
  const fixture =
    '<html><head><style id="design">body{font:20px sans-serif;background:#f6f3ed;color:#222;padding:64px}main{max-width:800px;padding:40px;background:white}h1{color:#d45c28}</style></head><body><main><h1>手动回归样例 · 页面样式修改</h1><p>修改颜色后，CSS 不应该出现在正文中。</p></main></body></html>';
  const project = {
    id: crypto.randomUUID(),
    sources: [],
    versions: [{ id: crypto.randomUUID(), html: fixture }],
  };
  const input = {
    baseVersionId: project.versions[0].id,
    operations: [
      {
        selector: "#design",
        action: "replace_html",
        value: "body{background:#f6f3ed;color:#222}h1{color:#d45c28}",
      },
    ],
  };
  const broken = oldPatch.applyPagePatch(project, input).html;
  const oldReport = await oldValidation.validatePage(project, broken);
  assert.equal(oldReport.valid, true);
  assert.throws(() => applyPagePatch(project, input), /style/);
  const newReport = await validatePage(project, broken);
  assert.equal(newReport.valid, false);
  const corrected = applyPagePatch(project, {
    ...input,
    operations: [
      {
        selector: "#design",
        action: "set_text",
        value:
          "body{font:20px sans-serif;background:#f6f3ed;color:#222;padding:64px}main{max-width:800px;padding:40px;background:white}h1{color:#15755d}",
      },
    ],
  }).html;
  for (const [label, html] of [
    ["before", broken],
    ["after", corrected],
  ]) {
    await page.setContent(html);
    await page.screenshot({ path: path.join(output, `issue14-${label}.png`) });
  }
  results.issues[14] = {
    beforeValidation: oldReport.valid,
    afterValidation: newReport.valid,
    afterIssues: newReport.issues,
    rejectedPatch: true,
    savedVersions: project.versions.length,
  };

  const scroll =
    "<html><head><style>html{scroll-behavior:smooth;overscroll-behavior:contain;behavior:url(unsafe.htc)}</style></head><body><h1>Scroll policy fixture</h1></body></html>";
  const scrollEvidence = {};
  for (const [label, html] of [
    ["before", oldHtml.sanitizeHtml(scroll)],
    ["after", sanitizeHtml(scroll)],
  ]) {
    await page.setContent(html);
    scrollEvidence[label] = await page.evaluate(() => ({
      css: document.querySelector("style").textContent,
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      overscrollBehavior: getComputedStyle(document.documentElement)
        .overscrollBehavior,
    }));
  }
  assert.equal(scrollEvidence.before.scrollBehavior, "auto");
  assert.equal(scrollEvidence.after.scrollBehavior, "smooth");
  assert.doesNotMatch(scrollEvidence.after.css, /unsafe\.htc/);
  results.issues[16] = scrollEvidence;
  await page.setContent(
    '<body style="font:22px sans-serif;background:#f6f3ed;padding:48px"><h1>手动回归样例 · 合法 CSS 保留</h1><pre id="data" style="white-space:pre-wrap;background:white;padding:32px"></pre></body>',
  );
  await page
    .locator("#data")
    .evaluate(
      (el, data) => (el.textContent = JSON.stringify(data, null, 2)),
      scrollEvidence,
    );
  await page.screenshot({
    path: path.join(output, "issue16-before-after.png"),
  });

  const original = process.env.CSS_EVIDENCE_HTML
    ? await readFile(process.env.CSS_EVIDENCE_HTML, "utf8")
    : '<html><head><style>:root{--ease:cubic-bezier(.2,.7,.3,1)}body{background:#f6f3ed;padding:64px;font:22px sans-serif}@media(prefers-reduced-motion:no-preference){@keyframes plateIn{from{clip-path:inset(0 0 0 100%);opacity:.5}to{clip-path:inset(0);opacity:1}}.hero-plate{background:#dd6b38;color:white;padding:70px;animation:plateIn .82s var(--ease) both;animation-delay:.16s}}</style></head><body><h1>手动回归样例 · 动画样式往返</h1><div class="hero-plate">页面主视觉 / plateIn</div></body></html>';
  const motion = {};
  for (const label of ["before", "after"]) {
    const sample = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      reducedMotion: "no-preference",
    });
    await sample.setContent('<div id="editor"></div>');
    await sample.addScriptTag({
      path: "node_modules/grapesjs/dist/grapes.min.js",
    });
    const source =
      label === "before"
        ? oldSource("apps/web/src/editor-css.ts")
        : await readFile("apps/web/src/editor-css.ts", "utf8");
    await sample.addScriptTag({
      content: ts
        .transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.None,
            target: ts.ScriptTarget.ES2022,
          },
        })
        .outputText.replace(/export /g, ""),
    });
    const roundtrip = await sample.evaluate((html) => {
      const e = grapesjs.init({
        container: "#editor",
        storageManager: false,
        parser: { parserCss: parseEditorCss },
      });
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const css = Array.from(parsed.querySelectorAll("style"))
        .map((s) => s.textContent)
        .join("\n");
      const timings = [];
      for (let i = 0; i < 30; i++) {
        const start = performance.now();
        parseEditorCss(css);
        timings.push(performance.now() - start);
      }
      e.setComponents(html);
      const result = `<html><head><style>${e.getCss()}</style></head><body>${e.getHtml()}</body></html>`;
      e.destroy();
      return {
        html: result,
        cssCharacters: css.length,
        parserMedianMs: timings.sort((a, b) => a - b)[15],
      };
    }, original);
    await sample.setContent(roundtrip.html);
    motion[label] = {
      cssCharacters: roundtrip.cssCharacters,
      parserMedianMs: roundtrip.parserMedianMs,
      styles: await sample.locator(".hero-plate").evaluate((el) => {
        const s = getComputedStyle(el);
        for (const a of document.getAnimations()) {
          a.pause();
          a.currentTime = 300;
        }
        return {
          name: s.animationName,
          duration: s.animationDuration,
          delay: s.animationDelay,
        };
      }),
    };
    await sample.screenshot({
      path: path.join(output, `issue13-${label}.png`),
    });
    await writeFile(path.join(output, `issue13-${label}.html`), roundtrip.html);
    await sample.close();
  }
  assert.equal(motion.before.styles.name, "none");
  assert.equal(motion.after.styles.name, "plateIn");
  results.issues[13] = motion;

  const data = await mkdtemp(path.join(os.tmpdir(), "dreamatic-upload-retry-"));
  server = spawn(
    process.execPath,
    ["--import", "tsx", "apps/server/src/index.ts"],
    {
      env: {
        ...process.env,
        PORT: "0",
        HOST: "127.0.0.1",
        DREAMATIC_WORKSPACE: data,
        DREAMATIC_MODE: "demo",
        DREAMATIC_ACCESS_TOKEN: "",
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
        ALL_PROXY: "",
        http_proxy: "",
        https_proxy: "",
        all_proxy: "",
        NO_PROXY: "*",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const base = await new Promise((resolve, reject) => {
    let logs = "";
    const timer = setTimeout(
      () => reject(Error("Test server did not start")),
      15000,
    );
    server.stdout.on("data", (chunk) => {
      logs += chunk;
      const match = logs.match(/http:\/\/127.0.0.1:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    server.on("exit", (code) => {
      if (code) {
        clearTimeout(timer);
        reject(Error("Test server exited " + code));
      }
    });
  });
  const loaded = await loadConfigFromFile({
    command: "serve",
    mode: "development",
  });
  let interruptNext = true,
    uploadRequests = 0;
  const options = loaded.config.server.proxy["/api"];
  vite = await createServer({
    configFile: false,
    ...loaded.config,
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      port: 0,
      hmr: false,
      proxy: {
        "/api": {
          ...options,
          target: base,
          configure(proxy, opts) {
            options.configure?.(proxy, opts);
            proxy.on("proxyReq", (req, incoming) => {
              if (
                incoming.method === "POST" &&
                /\/sources$/.test(incoming.url)
              ) {
                uploadRequests++;
                if (interruptNext) {
                  interruptNext = false;
                  req.destroy(new Error("controlled upload disconnect"));
                }
              }
            });
          },
        },
        "/assets": { ...options, target: base },
      },
    },
  });
  await vite.listen();
  const proxyBase = vite.resolvedUrls.local[0].replace(/\/$/, "");
  const created = await (
    await fetch(base + "/api/projects", { method: "POST" })
  ).json();
  await page.goto(proxyBase);
  await page.waitForFunction(
    (id) => localStorage.getItem("dreamatic-project") === id,
    created.id,
  );
  const file = {
    name: "回归样例.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("产品,数值\n回归样例,42"),
  };
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByRole("button", { name: "重试上传", exact: true }).waitFor();
  assert.match(await page.getByRole("alert").innerText(), /所选文件已暂存/);
  assert.equal(uploadRequests, 1);
  await page.screenshot({
    path: path.join(output, "issue15-retry-prompt.png"),
  });
  await page.getByRole("button", { name: "重试上传", exact: true }).click();
  await page.waitForFunction(
    async (id) =>
      (await (await fetch("/api/projects/" + id)).json()).sources.length === 1,
    created.id,
  );
  await page
    .getByRole("button", { name: "重试上传", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(uploadRequests, 2);
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="上传文档"]').disabled,
  );
  const repeatedUpload = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/sources$/.test(response.url()),
  );
  await page.locator('input[type="file"]').setInputFiles(file);
  await repeatedUpload;
  await page.waitForFunction(
    () => document.querySelector('input[type="file"]').value === "",
  );
  const afterRetry = await (
    await fetch(base + "/api/projects/" + created.id)
  ).json();
  assert.equal(afterRetry.sources.length, 1);
  assert.equal(uploadRequests, 3);
  await page.getByRole("button", { name: /资料与素材/ }).click();
  await page.screenshot({
    path: path.join(output, "issue15-retry-success.png"),
  });
  results.issues[15] = {
    controlledConnectionFailure: true,
    automaticRetries: 0,
    manualRetrySucceeded: true,
    uploadRequests,
    distinctSources: afterRetry.sources.length,
    filesTemporarilyHeldInMemory: true,
  };
  await writeFile(
    path.join(output, "verification.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  await writeFile(
    path.join(output, "verification-partial.json"),
    JSON.stringify(results, null, 2),
  );
  for (const page of browser.contexts().flatMap((context) => context.pages())) {
    await page
      .screenshot({ path: path.join(output, "failure.png") })
      .catch(() => {});
    console.error((await page.locator("body").innerText()).slice(-1800));
  }
  throw error;
} finally {
  await vite?.close();
  server?.kill("SIGTERM");
  await browser.close();
}
