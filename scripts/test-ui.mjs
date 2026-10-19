import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const data = await mkdtemp(path.join(os.tmpdir(), "dreamatic-ui-"));
const base = "http://127.0.0.1:4311";
const server = spawn(
  process.execPath,
  ["--import", "tsx", "apps/server/src/index.ts"],
  {
    env: {
      ...process.env,
      PORT: "4311",
      HOST: "127.0.0.1",
      DREAMATIC_MODE: "demo",
      DREAMATIC_WORKSPACE: data,
      DREAMATIC_ACCESS_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let output = "";
server.stdout.on("data", (d) => (output += d));
server.stderr.on("data", (d) => (output += d));
let browser;
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    if (i === 79) throw new Error("Server failed: " + output);
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1512, height: 982 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page
    .getByRole("heading", { name: "你的资料， 下一个精彩网页。" })
    .waitFor();
  await page.screenshot({
    path: "docs/screenshots/workspace.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "系统菜单" }).click();
  await page.getByText("Dreamatic· Web v0.1.0", { exact: true }).waitFor();
  await page.getByRole("menuitem", { name: "模型与设置" }).click();
  const saveButton = page.getByRole("button", { name: "保存", exact: true });
  const saveCloseButton = page.getByRole("button", { name: "保存并关闭", exact: true });
  await page.getByLabel("模型名称", { exact: true }).waitFor();
  assert.equal(await saveButton.isDisabled(), true);
  assert.equal(await saveCloseButton.isDisabled(), true);
  const initialModel = await page.getByLabel("模型名称", { exact: true }).inputValue();
  await page.getByLabel("模型名称", { exact: true }).fill("changed-model");
  assert.equal(await saveButton.isEnabled(), true);
  assert.equal(await saveCloseButton.isEnabled(), true);
  await page.getByLabel("模型名称", { exact: true }).fill(initialModel);
  assert.equal(await saveButton.isDisabled(), true);
  assert.equal(await saveCloseButton.isDisabled(), true);
  // Backdrop clicks must preserve both the dialog and unsaved edits.
  await page.getByLabel("模型名称", { exact: true }).fill("discard-this-model");
  await page.locator(".config-backdrop").click({ position: { x: 5, y: 5 } });
  assert.equal(await page.getByLabel("模型名称", { exact: true }).inputValue(), "discard-this-model");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "系统菜单" }).click();
  await page.getByRole("menuitem", { name: "模型与设置" }).click();
  assert.notEqual(await page.getByLabel("模型名称", { exact: true }).inputValue(), "discard-this-model");
  await page.getByLabel("模型名称", { exact: true }).fill("user-model");
  await page.getByLabel("模型调用 URL", { exact: true }).fill("https://example.com/v1");
  await page.getByLabel("API 密钥", { exact: true }).fill("ui-test-secret");
  await page.screenshot({ path: "docs/screenshots/settings.png", fullPage: true });
  await page.getByRole("tab", { name: "文档分析模型", exact: true }).click();
  assert.equal(await page.getByLabel("独立配置").inputValue(), "inherit");
  await page.getByRole("tab", { name: "系统", exact: true }).click();
  await page.getByLabel("运行模式").selectOption("demo");
  await page.getByLabel("界面语言").selectOption("en");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).waitFor();
  assert.equal(await page.locator(".config-backdrop").count(), 1);
  assert.equal(await page.getByRole("button", { name: "Save", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Save and close", exact: true }).isDisabled(), true);

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "System menu" }).waitFor();
  assert.doesNotMatch(await page.locator("body").innerText(), /pi harness|crafted with pi/i);
  await page.getByRole("button", { name: "System menu" }).click();
  await page.getByRole("menuitem", { name: "Models & settings" }).click();
  await page.getByRole("tab", { name: "System", exact: true }).click();
  await page.screenshot({ path: "docs/screenshots/settings-en.png", fullPage: true });
  await page.getByLabel("Interface language").selectOption("zh");
  await page.getByRole("button", { name: "Save and close", exact: true }).click();
  await page.locator(".config-backdrop").waitFor({ state: "hidden" });
  const config = await (await fetch(base + "/api/config")).json();
  assert.equal(config.models.reasoning.hasApiKey, true);
  assert.ok(!JSON.stringify(config).includes("ui-test-secret"));
  await page.locator("input[type=file]").setInputFiles({
    name: "品牌资料.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "项目,内容\n品牌,森屿生活\n定位,自然与可持续设计\n创立年份,2022",
    ),
  });
  await page.getByText("品牌资料.csv").waitFor();
  await page
    .getByRole("textbox", { name: "网页需求" })
    .fill("为森屿生活创建品牌介绍网页，突出自然、可持续设计和品牌故事。");
  const composer = page.getByRole("textbox", { name: "网页需求" });
  await composer.press("End");
  await composer.press("Shift+Enter");
  assert.ok((await composer.inputValue()).endsWith("\n"));
  // IME confirmation must not submit a Chinese message.
  await composer.evaluate((element) => element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true })));
  assert.notEqual(await composer.inputValue(), "");
  await composer.press("Enter");
  await page.getByText("演示设计完成", { exact: false }).waitFor();
  await page.getByRole("button", { name: "保存", exact: true }).waitFor();
  const frame = page.frameLocator(".gjs-frame");
  await frame.locator("h1").waitFor();
  assert.match(await frame.locator("h1").innerText(), /森屿生活/);
  assert.equal(await page.locator(".gjs-frame").getAttribute("sandbox"), "allow-same-origin");
  assert.ok(await frame.locator('meta[http-equiv="Content-Security-Policy"]').count());
  await frame.locator("body").evaluate(body => {
    const script = body.ownerDocument.createElement("script");
    script.textContent = "parent.__dreamaticEscaped = true";
    body.appendChild(script);
  });
  assert.equal(await page.evaluate(() => window.__dreamaticEscaped), undefined);
  // Text edit through the WYSIWYG canvas, then save and verify persistence.
  await frame.locator("h1").dblclick();
  await page.keyboard.press("Meta+a");
  await page.keyboard.type("A greener tomorrow.");
  await frame.locator("nav").click();
  const originalProjectId = await page.evaluate(() => localStorage.getItem("dreamatic-project"));
  await page.getByRole("button", { name: "新建网页", exact: false }).click();
  await page.getByRole("heading", { name: "你的资料， 下一个精彩网页。" }).waitFor();
  await page.locator(".project-item").filter({ hasText: "森屿生活" }).click();
  await frame.locator("h1").waitFor();
  assert.match(await frame.locator("h1").innerText(), /A greener tomorrow/);
  assert.equal(await page.getByRole("button", { name: "放弃", exact: true }).isEnabled(), true);
  await page.getByRole("button", { name: "放弃", exact: true }).click();
  assert.match(await frame.locator("h1").innerText(), /森屿生活/);
  assert.equal(await page.getByRole("button", { name: "放弃", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "保存", exact: true }).isDisabled(), true);
  const afterDiscard = await (await fetch(base + "/api/projects/" + originalProjectId)).json();
  assert.equal(afterDiscard.versions.length, 1, "discard must not create a version");
  // Edit again, proving save remains available after discarding the prior draft.
  await frame.locator("h1").dblclick();
  await page.keyboard.press("Meta+a");
  await page.keyboard.type("A greener tomorrow.");
  await frame.locator("nav").click();
  const logLines = await page.locator(".run-log .log-line").allTextContents();
  assert.ok(logLines.some((line) => /Orchestrator ·/.test(line)));
  assert.ok(logLines.every((line) => /^\d{2}:\d{2}:\d{2} · (?:Orchestrator|Document Analyst|Designer|系统) ·/.test(line.trim())));
  await page.getByRole("button", { name: "收起运行记录" }).click();
  assert.equal(await page.getByRole("button", { name: "展开运行记录" }).getAttribute("aria-expanded"), "false");
  assert.equal(await page.locator(".run-log-list").isVisible(), false);
  await page.getByRole("button", { name: "展开运行记录" }).press("Enter");
  assert.equal(await page.locator(".run-log-list").isVisible(), true);

  const controlStyles = await page.locator(".inspector-hint").evaluate((element) => ({ size: getComputedStyle(element).fontSize, color: getComputedStyle(element).color }));
  assert.equal(controlStyles.size, "11.5px");
  assert.equal(controlStyles.color, "rgb(88, 97, 79)");
  const propertyLabel = await page.locator(".inspector .gjs-sm-label").first().evaluate((element) => ({ size: getComputedStyle(element).fontSize, weight: getComputedStyle(element).fontWeight }));
  assert.equal(propertyLabel.size, "12px");
  assert.equal(propertyLabel.weight, "400");


  let openedCanvas = "";
  await page.route("**/api/projects/*/open", async (route) => {
    openedCanvas = route.request().postDataJSON().html;
    await route.fulfill({ json: { opened: true } });
  });
  await page.getByRole("button", { name: "打开", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.editor-toolbar button[title="在系统默认浏览器中打开当前页面"]')?.disabled);
  assert.match(openedCanvas, /A greener tomorrow/);
  await page.unroute("**/api/projects/*/open");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForTimeout(400);
  const projects = await (await fetch(base + "/api/projects")).json();
  for (const other of projects.filter((item) => item.id !== originalProjectId)) await fetch(base + "/api/projects/" + other.id, { method: "DELETE" });

  const p = await (
    await fetch(base + "/api/projects/" + originalProjectId)
  ).json();
  assert.ok(p.versions.length >= 2);
  assert.match(p.versions.at(-1).html, /A greener tomorrow/);
  assert.match(p.versions.at(-1).html, /<title>素材与灵感<\/title>/);
  await page.getByRole("button", { name: "Mobile", exact: true }).click();
  await page.waitForTimeout(1000);
  assert.equal(
    await page
      .locator(".gjs-frame-wrapper")
      .evaluate((e) => Math.round(e.getBoundingClientRect().width)),
    390,
  );
  await page.getByRole("button", { name: "Desktop", exact: true }).click();
  await page.getByRole("button", { name: "组件", exact: true }).click();
  await page.getByText("双列布局", { exact: true }).waitFor();
  const componentCards = page.locator(".component-library .gjs-block");
  assert.equal(await componentCards.count(), 8);
  assert.equal(await componentCards.locator("svg.block-card-art").count(), 8);
  assert.equal(await componentCards.locator(".block-card-description").count(), 8);
  await page.getByText("图片与媒体", { exact: true }).waitFor();
  const columnCard = page.locator('[data-block-kind="columns"]');
  assert.match(await columnCard.getAttribute("aria-label"), /并排展示两组内容/);
  await columnCard.focus();
  await page.screenshot({ path: "docs/screenshots/components.png", fullPage: true });

  await page.getByRole("button", { name: "样式", exact: true }).click();
  assert.equal(await page.locator("#selectors > .gjs-clm-tags").count(), 1);
  await page.screenshot({
    path: "docs/screenshots/editor.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "版本", exact: true }).click();
  await page.locator(".history-menu>button").last().click();
  await page.waitForTimeout(500);
  const restored = await (await fetch(base + "/api/projects/" + p.id)).json();
  assert.ok(restored.versions.length >= 3);
  assert.match(restored.versions.at(-1).label, /恢复/);
  assert.doesNotMatch(restored.versions.at(-1).html, /A greener tomorrow/);
  await page.getByRole("button", { name: "导出网页", exact: true }).click();
  const exported = await (
    await fetch(base + "/api/projects/" + p.id + "/export")
  ).text();
  assert.match(exported, /<!doctype html>/i);
  assert.match(exported, /森屿生活/);
  await page.getByRole("button", { name: "资料与素材", exact: false }).click();
  await page.locator(".source-card").click();
  await page.getByRole("heading", { name: "品牌资料.csv" }).waitFor();
  assert.match(await page.locator(".source-table").innerText(), /2022/);
  await page.getByRole("button", { name: "关闭资料" }).click();
  await page.getByRole("button", { name: "技能库", exact: false }).click();
  await page.getByText("web-design", { exact: true }).waitFor();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({
    path: "docs/screenshots/compact.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: "保存", exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  const chatBox = await page.locator(".conversation").boundingBox();
  const canvasBox = await page.locator(".canvas-panel").boundingBox();
  assert.ok(canvasBox.y > chatBox.y + chatBox.height - 1);
  assert.equal(await page.locator(".inspector").isVisible(), false);
  await page.getByRole("button", { name: "切换样式面板" }).click();
  assert.equal(await page.locator(".inspector").isVisible(), true);
  await page.getByRole("button", { name: "切换样式面板" }).click();
  await page.screenshot({ path: "docs/screenshots/mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.reload();
  await page.getByRole("button", { name: "保存", exact: true }).waitFor();
  await page.getByRole("button", { name: "项目操作:", exact: false }).click();
  await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
  await page.getByRole("textbox", { name: "项目名称", exact: true }).fill("我的品牌网站");
  await page.getByRole("button", { name: "保存名称", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await (await fetch(base + "/api/projects/" + p.id)).json()).title, "我的品牌网站");
  await page.getByRole("button", { name: "项目操作: 我的品牌网站", exact: true }).click();
  await page.getByRole("menuitem", { name: "删除项目", exact: true }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  assert.ok((await (await fetch(base + "/api/projects")).json()).length);
  await page.getByRole("button", { name: "项目操作: 我的品牌网站", exact: true }).click();
  await page.getByRole("menuitem", { name: "删除项目", exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await (await fetch(base + "/api/projects")).json()).length, 0);
  await page.getByRole("heading", { name: "你的资料， 下一个精彩网页。" }).waitFor();
  for (const mode of ["single", "multiple", "text"]) {
    const id = crypto.randomUUID(), questionId = crypto.randomUUID();
    const question = { id: questionId, title: "你希望突出哪些内容？", mode, options: mode === "text" ? [] : [{ id: "products", label: "产品介绍" }, { id: "company", label: "公司故事" }], createdAt: new Date().toISOString() };
    await mkdir(path.join(data, "projects", id), { recursive: true });
    await writeFile(path.join(data, "projects", id, "project.json"), JSON.stringify({ id, title: "交互提问测试", status: "needs_input", messages: [{ role: "assistant", text: question.title, time: question.createdAt }], questions: [question], sources: [], versions: [], events: Array.from({ length: 24 }, (_, index) => ({ id: crypto.randomUUID(), role: ["orchestrator", "analyst", "designer"][index % 3], kind: "status", text: `演示历史操作 ${index + 1}`, time: question.createdAt })) }));
    await page.evaluate(id => localStorage.setItem("dreamatic-project", id), id);
    await page.reload();
    const card = page.getByRole("form", { name: "回答智能体问题" });
    await card.waitFor();
    if (mode === "single") {
      const activity = page.locator(".run-log-list");
      assert.equal(await activity.locator(".log-line").count(), 24, "older records remain accessible");
      const scrollable = await activity.evaluate((element) => element.scrollHeight > element.clientHeight && element.clientHeight <= 240);
      assert.equal(scrollable, true);
      await activity.evaluate((element) => { element.scrollTop = 0; element.dispatchEvent(new Event("scroll")); });
      await page.getByRole("button", { name: "收起运行记录" }).click();
      await page.getByRole("button", { name: "展开运行记录" }).click();
      assert.equal(await activity.evaluate((element) => element.scrollTop), 0, "reading position is retained");
    }

    assert.equal(await card.getByRole("button", { name: "提交并继续" }).isEnabled(), false);
    // Question survives reload and does not select any option automatically.
    await page.reload();
    await card.waitFor();
    if (mode === "single") {
      await card.getByRole("radio", { name: "产品介绍" }).check();
      await card.getByRole("radio", { name: "公司故事" }).check();
      assert.equal(await card.getByRole("radio", { name: "产品介绍" }).isChecked(), false);
    }
    if (mode === "multiple") {
      await card.getByRole("checkbox", { name: "产品介绍" }).check();
      await card.getByRole("checkbox", { name: "公司故事" }).check();
    }
    await card.getByRole("textbox", { name: "你的回答" }).fill("请使用 PDF 全部信息，自行分析重点");
    if (mode === "multiple") await page.screenshot({ path: "docs/screenshots/question-card.png", fullPage: true });
    await card.getByRole("button", { name: "提交并继续" }).click();
    await page.getByText("演示设计完成", { exact: false }).waitFor();
    const result = await (await fetch(base + "/api/projects/" + id)).json();
    assert.equal(result.status, "complete");
    assert.ok(result.questions[0].answeredAt);
    assert.equal(result.questions[0].answer.selected.length, mode === "multiple" ? 2 : mode === "single" ? 1 : 0);
    assert.match(result.messages.find(m => m.role === "user").text, /PDF 全部信息/);
    assert.equal((await fetch(base + `/api/projects/${id}/questions/${questionId}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "duplicate" }) })).status, 409);
    await fetch(base + "/api/projects/" + id, { method: "DELETE" });
  }
  assert.deepEqual(errors, [], "Browser errors");
  console.log(
    "PASS: server-side model dropdown settings → iframe sandbox/CSP → upload → demo generation → canvas text edit → saved version → responsive preview → blocks → restore → HTML export → source table → Skill catalog; no browser errors.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise((r) => server.once("exit", r));
  await rm(data, { recursive: true, force: true });
}
