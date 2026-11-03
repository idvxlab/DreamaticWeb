// Deterministic UI evidence. Fixtures identify themselves; no paid model calls.
import { chromium } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createServer, loadConfigFromFile } from "vite";
const output =
  process.env.EVIDENCE_DIR ||
  (await mkdtemp(path.join(os.tmpdir(), "dreamatic-evidence-")));
await mkdir(output, { recursive: true });
const data = await mkdtemp(path.join(os.tmpdir(), "dreamatic-verify-data-"));
const id = crypto.randomUUID();
await mkdir(path.join(data, "projects", id), { recursive: true });
const stamp = new Date().toISOString();
await writeFile(
  path.join(data, "projects", id, "project.json"),
  JSON.stringify({
    id,
    title: "空资料恢复 · 手动测试",
    sources: [null],
    versions: [],
    messages: [],
    events: [],
    status: "idle",
  }),
);
const server = spawn(
  process.execPath,
  ["--import", "tsx", "apps/server/src/index.ts"],
  {
    env: {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      DREAMATIC_MODE: "demo",
      DREAMATIC_WORKSPACE: data,
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
let logs = "";
server.stdout.on("data", (d) => (logs += d));
server.stderr.on("data", (d) => (logs += d));
let browser, vite;
const results = {
  baseline: "06337d95d45c12ec52fb03b33c18dffcacd183eb",
  fixture: "手动测试，未调用模型",
  timestamp: stamp,
  checks: [],
};
try {
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(logs)), 20000);
    server.stdout.on("data", () => {
      const m = logs.match(/http:\/\/127.0.0.1:(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${m[1]}`);
      }
    });
  });
  const loaded = await loadConfigFromFile({
    command: "serve",
    mode: "development",
  });
  assert.equal(loaded.config.server.proxy["/api"].changeOrigin, false);
  // Keep the actual vite.config proxy options, only replace the ephemeral target.
  vite = await createServer({
    server: {
      host: "127.0.0.1",
      port: 0,
      proxy: {
        "/api": { ...loaded.config.server.proxy["/api"], target: base },
        "/assets": { target: base, changeOrigin: false },
      },
    },
  });
  await vite.listen();
  const proxyBase = vite.resolvedUrls.local[0].replace(/\/$/, "");
  const response = await fetch(proxyBase + "/api/projects", {
    method: "POST",
    headers: { Origin: proxyBase },
  });
  assert.equal(response.status, 201);
  results.checks.push({ issue: 1, requestThroughVite: response.status });
  const request = async (url, method = "GET", body) => {
    const r = await fetch(base + "/api" + url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
    });
    assert.ok(r.ok, await r.clone().text());
    return r.json();
  };
  const recovered = await request("/projects/" + id);
  assert.equal(recovered.sources.length, 0);
  assert.match(recovered.sourceRecoveryWarning, /重新上传/);
  browser = await chromium.launch({
    executablePath: process.env.DREAMATIC_BROWSER_PATH,
    headless: true,
    args: ["--no-proxy-server"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(base);
  await page.evaluate(
    (id) => localStorage.setItem("dreamatic-project", id),
    id,
  );
  await page.reload();
  await page.getByRole("alert").filter({ hasText: "无效资料" }).waitFor();
  await page.screenshot({
    path: path.join(output, "null-source-recovered.png"),
    fullPage: true,
  });
  results.checks.push({
    issue: 7,
    recoveredSources: recovered.sources.length,
    warning: true,
  });
  const originalCss = execFileSync(
    "git",
    ["show", "origin/v0.2.2:apps/web/src/styles.css"],
    { encoding: "utf8" },
  );
  const currentCss = await readFile("apps/web/src/styles.css", "utf8");
  const fixture = `<div class="app sidebar-off"><aside class="sidebar">Sidebar</aside><main style="background:#f4f2ec;padding:32px"><h1>侧栏布局测试 · 手动复现</h1><p>收起后主内容应占满窗口。</p></main></div>`;
  for (const width of [1100, 1440, 1920, 390]) {
    const sample = await browser.newPage({ viewport: { width, height: 800 } });
    await sample.setContent(`<style>${originalCss}</style>${fixture}`);
    const before = await sample
      .locator("main")
      .evaluate((e) => e.getBoundingClientRect().width);
    await sample.screenshot({
      path: path.join(output, `sidebar-${width}-before.png`),
    });
    await sample.setContent(`<style>${currentCss}</style>${fixture}`);
    const after = await sample
      .locator("main")
      .evaluate((e) => e.getBoundingClientRect().width);
    assert.ok(after >= width - 1);
    await sample.screenshot({
      path: path.join(output, `sidebar-${width}-after.png`),
    });
    results.checks.push({ issue: 8, viewport: width, before, after });
    await sample.close();
  }
  const project = await request("/projects", "POST");
  const html = `<!doctype html><html><head><title>JavaScript 手动测试</title><style>body{font:20px sans-serif;background:#f5f3ed;padding:48px;color:#262821}button{padding:16px;background:#c75430;color:white;border:0}output{display:block;margin-top:24px}</style></head><body><h1>JavaScript 保存与交互验证</h1><p>手动测试页面，未调用模型</p><button id="action">点击运行 JavaScript</button><output id="result">等待点击</output><script>document.querySelector('#action').addEventListener('click',()=>document.querySelector('#result').textContent='JavaScript 已运行');try{parent.localStorage.getItem('dreamatic-project')}catch{document.body.dataset.isolated='yes'}</script></body></html>`;
  await request(`/projects/${project.id}/versions`, "POST", {
    baseVersionId: "",
    label: "JavaScript 手动测试",
    html,
  });
  await page.evaluate(
    (id) => localStorage.setItem("dreamatic-project", id),
    project.id,
  );
  await page.reload();
  await page.frameLocator(".gjs-frame").locator("#action").waitFor();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  const preview = page.frameLocator('iframe[title="网页交互预览"]');
  await preview.locator("#action").click();
  assert.equal(
    await preview.locator("#result").innerText(),
    "JavaScript 已运行",
  );
  assert.equal(
    await preview.locator("body").getAttribute("data-isolated"),
    "yes",
  );
  await page.screenshot({
    path: path.join(output, "javascript-preview-isolated.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "设计", exact: true }).click();
  await page.getByRole("button", { name: "HTML 源码", exact: true }).click();
  const source = page.getByLabel("HTML 源码编辑");
  assert.match(await source.inputValue(), /<script>/);
  await source.fill(
    (await source.inputValue()).replace(
      "JavaScript 保存与交互验证",
      "JavaScript 编辑后验证",
    ),
  );
  await page.getByRole("button", { name: "应用到画布", exact: true }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForFunction(
    async (id) =>
      (await (await fetch("/api/projects/" + id)).json()).versions.length === 2,
    project.id,
  );
  const saved = await request(`/projects/${project.id}`);
  assert.match(saved.versions.at(-1).html, /<script>/);
  const exported = await (
    await fetch(base + `/api/projects/${project.id}/export`)
  ).text();
  assert.match(exported, /<script>/);
  const exportedPage = await browser.newPage();
  await exportedPage.setContent(exported);
  await exportedPage.locator("#action").click();
  assert.equal(
    await exportedPage.locator("#result").innerText(),
    "JavaScript 已运行",
  );
  await exportedPage.screenshot({
    path: path.join(output, "javascript-export.png"),
  });
  // A script-only edit must enable Save, even when the editable DOM is unchanged.
  await page.getByRole("button", { name: "HTML 源码", exact: true }).click();
  const scriptEditor = page.getByLabel("HTML 源码编辑");
  await scriptEditor.fill(
    (await scriptEditor.inputValue()).replace(
      "JavaScript 已运行",
      "脚本单独修改成功",
    ),
  );
  await page.getByRole("button", { name: "应用到画布", exact: true }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForFunction(
    async (id) =>
      (await (await fetch("/api/projects/" + id)).json()).versions.length === 3,
    project.id,
  );
  assert.match(
    (await request(`/projects/${project.id}`)).versions.at(-1).html,
    /脚本单独修改成功/,
  );
  results.checks.push({
    issue: 5,
    previewExecutes: true,
    parentStorageBlocked: true,
    editorRoundTripScripts: true,
    exportExecutes: true,
    scriptOnlyEditSaves: true,
  });
  await writeFile(
    path.join(output, "results.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify({ output, results }, null, 2));
} finally {
  await browser?.close();
  await vite?.close();
  server.kill();
  await writeFile(path.join(output, "server.log"), logs);
}
