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
  await mkdir(path.join(data, "screenshots"), { recursive: true });
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
    path: path.join(data, "screenshots", "workspace.png"),
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
  await page.screenshot({ path: path.join(data, "screenshots", "settings.png"), fullPage: true });
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
  await page.screenshot({ path: path.join(data, "screenshots", "settings-en.png"), fullPage: true });
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
  await page.getByRole("alert").filter({ hasText: "生成功能正在重构" }).waitFor();
  // Seed a clearly labeled manual test page; no generation runtime is used.
  const fixtureProjectId = await page.evaluate(() => localStorage.getItem("dreamatic-project"));
  await fetch(base + "/api/projects/" + fixtureProjectId, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "森屿生活 · UI 测试" }),
  });
  const fixture = await fetch(base + `/api/projects/${fixtureProjectId}/versions`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseVersionId: "", label: "UI 测试页面（未调用 AI）", html: `<!doctype html><html><head><title>素材与灵感</title><style>body{margin:0;background:#f5f3ed;color:#25392d;font-family:sans-serif}nav{padding:24px}main{padding:48px}h1{font-size:48px}p{line-height:1.8}</style></head><body><nav>森屿生活</nav><main><h1>森屿生活</h1><p>UI 测试页面 · 手动创建 · 未调用 AI</p><p>自然与可持续设计</p></main></body></html>` }),
  });
  assert.equal(fixture.status, 200);
  await page.route(`**/api/projects/${fixtureProjectId}`, async route => {
    const response = await route.fetch();
    const project = await response.json();
    project.messages = [{ role: "assistant", text: "UI 测试页面 · 未调用 AI", time: new Date().toISOString() }];
    project.events = [{ id: "manual-ui-fixture", role: "system", kind: "status", text: "手动测试页面已载入", time: new Date().toISOString() }];
    await route.fulfill({ json: project });
  });
  await page.reload();
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
  assert.equal(await page.locator(".message-author").count(), 0);
  assert.equal(await page.locator(".run-log-list").isVisible(), false, "details default to collapsed");
  await page.getByRole("button", { name: "展开运行记录" }).click();
  const logLines = await page.locator(".run-log .log-line").allTextContents();
  assert.ok(logLines.some((line) => /系统 ·/.test(line)));
  assert.ok(logLines.every((line) => /^\d{2}:\d{2}:\d{2} · (?:Orchestrator|Analyst|Designer|系统) ·/.test(line.trim())));
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
  await page.getByRole("button", { name: "HTML 源码", exact: true }).click();
  const sourceEditor = page.getByLabel("HTML 源码编辑");
  const bodySource = (await sourceEditor.inputValue())
    .replace(/<body[^>]*>/i, '<body id="top" class="body-theme">')
    .replace('</body>', '<a href="#top">Back to top</a></body>');
  await sourceEditor.fill(bodySource);
  await page.getByRole("button", { name: "应用到画布", exact: true }).click();
  await page.route("**/api/projects/*/open", async (route) => {
    openedCanvas = route.request().postDataJSON().html;
    await route.fulfill({ json: { opened: true } });
  });
  await page.getByRole("button", { name: "打开", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.editor-toolbar button[title="在系统默认浏览器中打开当前页面"]')?.disabled);
  assert.match(openedCanvas, /A greener tomorrow/);
  assert.match(openedCanvas, /<body[^>]*id="top"/);
  assert.match(openedCanvas, /class="body-theme"/);
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
  await page.screenshot({ path: path.join(data, "screenshots", "components.png"), fullPage: true });

  await page.getByRole("button", { name: "样式", exact: true }).click();
  assert.equal(await page.locator("#selectors > .gjs-clm-tags").count(), 1);
  await page.screenshot({
    path: path.join(data, "screenshots", "editor.png"),
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
  const readingDownload=page.waitForEvent("download");
  await page.getByRole("button",{name:"下载 Markdown 文档",exact:true}).click();
  assert.equal((await readingDownload).suggestedFilename(),"品牌资料.md");

  await page.getByRole("button", { name: "关闭资料" }).click();
  await page.getByTitle("查看技能", { exact: true }).click();
  assert.equal(await page.locator(".skills-list > *").count(), 0);
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  assert.equal(await page.locator(".sidebar").getByRole("button",{name:"技能库",exact:false}).count(),0);
  await page.getByRole("button",{name:/^事实列表/}).click();
  await page.getByText("分析完成后，相关事实将在这里展示。",{exact:true}).waitFor();
  const factsSourceId=restored.sources[0].id;
  const factImageId=crypto.randomUUID(),factImageUrl=`/assets/${p.id}/${factImageId}.png`;
  const factImageData=await page.evaluate(()=>{
    const c=document.createElement("canvas");c.width=640;c.height=320;const ctx=c.getContext("2d");
    ctx.fillStyle="#e8ede2";ctx.fillRect(0,0,640,320);ctx.fillStyle="#355844";ctx.beginPath();ctx.arc(320,160,90,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fffefa";ctx.font="28px sans-serif";ctx.textAlign="center";ctx.fillText("DEMO",320,170);return c.toDataURL("image/png").split(",")[1];
  });
  await page.route(`**${factImageUrl}`,route=>route.fulfill({contentType:"image/png",body:Buffer.from(factImageData,"base64")}));
  await page.route(`**/api/projects/${p.id}`,async route=>{
    const response=await route.fetch();const project=await response.json();
    project.sources[0].assets.push({id:factImageId,name:"品牌参考图.png",type:"image",mime:"image/png",url:factImageUrl});
    project.analysis={summary:"Analyst 测试摘要",limitations:["测试资料存在缺失"],assets:[{sourceId:factsSourceId,url:factImageUrl,purpose:"已关联的品牌参考图片"}],facts:[
      {text:"品牌使用圆形标识",sourceId:factsSourceId,assetIds:[factImageId],locationVerified:true,evidence:{kind:"text",start:0,end:10,quote:"品牌使用圆形标识"}},
      {text:"保留单元格原始布尔值",sourceId:factsSourceId,locationVerified:true,evidence:{kind:"cell",tableIndex:0,row:1,column:1,value:false}},
      {text:"历史事实缺少来源",sourceId:"missing-source"}
    ]};
    await route.fulfill({json:project});
  });
  await page.reload();
  await page.getByRole("button",{name:/^事实列表/}).click();
  const factsView=page.locator(".facts-view");
  assert.equal(await factsView.locator(".fact-card").count(),3);
  assert.equal(await page.locator(".modal-backdrop").count(),0,"facts open in the content panel, not a dialog");
  await factsView.locator(".fact-card").filter({hasText:"品牌使用圆形标识"}).getByText("查看 Markdown 依据",{exact:true}).click();
  assert.match(await factsView.locator("blockquote").innerText(),/圆形/);
  await factsView.locator(".fact-card").filter({hasText:"保留单元格原始布尔值"}).getByText("查看 Markdown 依据",{exact:true}).click();
  assert.equal(await factsView.locator(".fact-detail pre").innerText(),"false");
  await factsView.locator(".fact-card").filter({hasText:"历史事实缺少来源"}).getByText("查看 Markdown 依据",{exact:true}).click();
  assert.match(await factsView.locator(".fact-card").last().innerText(),/来源不可用/);
  const imageCard=factsView.locator(".fact-card").first();
  assert.equal(await imageCard.getByLabel("关联图片",{exact:true}).count(),1);
  const factTypography=await imageCard.locator(".fact-text").evaluate(el=>({size:getComputedStyle(el).fontSize,font:getComputedStyle(el).fontFamily,rootFont:getComputedStyle(document.documentElement).fontFamily}));
  assert.equal(factTypography.size,"13px");assert.equal(factTypography.font,factTypography.rootFont);
  assert.equal(await factsView.locator(".fact-card").nth(1).locator(".fact-media").count(),0);
  await imageCard.getByRole("button",{name:/在卡片中查看图片/}).click();
  assert.equal(await imageCard.locator(".fact-image-preview").isVisible(),true);
  assert.equal(await page.locator(".modal-backdrop").count(),0);
  await imageCard.getByRole("button",{name:"收起图片",exact:true}).click();
  await factsView.evaluate(el=>{el.scrollTop=0;});
  await page.screenshot({path:"/tmp/dreamatic-fact-cards.png",fullPage:true});
  await factsView.getByLabel("搜索事实",{exact:true}).fill("圆形");
  assert.equal(await factsView.locator(".fact-card").count(),1);
  await factsView.getByLabel("搜索事实",{exact:true}).fill("不存在的事实");
  await factsView.getByText("没有匹配的事实，请调整搜索或来源筛选。",{exact:true}).waitFor();
  await factsView.getByLabel("搜索事实",{exact:true}).fill("");
  await factsView.getByLabel("按来源筛选事实").selectOption(factsSourceId);
  assert.equal(await factsView.locator(".fact-card").count(),2);
  await factsView.getByLabel("按来源筛选事实").selectOption("");
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=390));
  await page.setViewportSize({width:1512,height:982});
  await page.unroute(`**/api/projects/${p.id}`);
  await page.unroute(`**${factImageUrl}`);
  await page.getByRole("button",{name:"网页工作台",exact:false}).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({
    path: path.join(data, "screenshots", "compact.png"),
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
  await page.screenshot({ path: path.join(data, "screenshots", "mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.reload();
  await page.getByRole("button", { name: "保存", exact: true }).waitFor();
  await page.getByRole("button", { name: "项目操作:", exact: false }).click();
  await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
  await page.getByRole("textbox", { name: "项目名称", exact: true }).fill("我的品牌网站");
  await page.getByRole("button", { name: "保存名称", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await (await fetch(base + "/api/projects/" + p.id)).json()).title, "我的品牌网站");
  // The recovery control resumes a task, without submitting the composer again.
  let interruptedView = true;
  let resumeClicks = 0;
  await page.route(`**/api/projects/${p.id}`, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    if (interruptedView) {
      data.messages = [{ role: "assistant", text: "历史界面测试数据 · 未调用 AI", time: new Date().toISOString() }];
      data.status = "error";
      data.error = "模型输出停滞超时";
      data.run ||= { id: "recovery-test", checkpoints: {} };
    }
    await route.fulfill({ json: data });
  });
  await page.route(`**/api/projects/${p.id}/resume`, async (route) => {
    assert.equal(route.request().method(), "POST");
    assert.equal(route.request().postData(), null);
    resumeClicks++;
    interruptedView = false;
    await route.fulfill({ json: { ok: true } });
  });
  await page.reload();
  await page.getByRole("button", { name: "继续未完成任务", exact: true }).click();
  await page.getByRole("button", { name: "继续未完成任务", exact: true }).waitFor({ state: "detached" });
  assert.equal(resumeClicks, 1);
  await page.unroute(`**/api/projects/${p.id}`);
  await page.unroute(`**/api/projects/${p.id}/resume`);

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
    await writeFile(path.join(data, "projects", id, "project.json"), JSON.stringify({ id, title: "交互提问测试", status: "needs_input", messages: [{ role: "assistant", text: question.title, time: question.createdAt }], questions: [question], sources: [], versions: [], events: Array.from({ length: 24 }, (_, index) => ({ id: crypto.randomUUID(), role: ["orchestrator", "analyst", "designer"][index % 3], kind: "status", text: `演示历史操作 ${index + 1}`, time: question.createdAt, details:index===0?{businessOutput:'{"summary":"示例结果","note":"<script>window.__outputExecuted=true</script>"}',outputCharacters:150,outputTruncated:true,outputState:"rejected",elapsedMs:25000,textCharacters:20,toolArgumentCharacters:88}:index===1?{validation:"EvidenceValidationError",reason:"facts[2]: quote_not_found"}:undefined })) }));
    await page.evaluate(id => localStorage.setItem("dreamatic-project", id), id);
    await page.reload();
    const card = page.getByRole("form", { name: "回答智能体问题" });
    await card.waitFor();
    if (mode === "single") {
      await page.getByRole("button", { name: "展开运行记录" }).click();
      const activity = page.locator(".run-log-list");
      assert.equal(await activity.locator(".log-line").count(), 24, "older records remain accessible");
      await activity.getByText("查看业务输出", {exact:true}).click();
      assert.match(await activity.locator(".run-output pre").first().innerText(), /示例结果/);
      assert.equal(await page.evaluate(()=>window.__outputExecuted),undefined,"output HTML must remain escaped text");
      await activity.getByText("查看校验详情",{exact:true}).click();
      assert.match(await activity.locator(".run-output pre").last().innerText(),/quote_not_found/);
      await activity.getByText("查看业务输出", {exact:true}).click();

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
    await card.getByRole("textbox", { name: "回答" }).fill("请使用 PDF 全部信息，自行分析重点");
    if (mode === "multiple") await page.screenshot({ path: path.join(data, "screenshots", "question-card.png"), fullPage: true });
    await card.getByRole("button", { name: "提交并继续" }).click();
    await card.getByText("生成功能正在重构", { exact: false }).waitFor();
    const result = await (await fetch(base + "/api/projects/" + id)).json();
    assert.equal(result.status, "needs_input");
    assert.equal(result.questions[0].answeredAt, undefined);
    assert.equal(result.versions.length, 0);
    await fetch(base + "/api/projects/" + id, { method: "DELETE" });
  }
  assert.deepEqual(errors, [], "Browser errors");
  console.log(
    "PASS: server-side model dropdown settings → iframe sandbox/CSP → upload → generation unavailable → manual test fixture → canvas text edit → saved version → responsive preview → blocks → restore → HTML export → source table → empty Skill catalog; no browser errors.",
  );
} finally {
  await browser?.close();
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  if (server.exitCode === null && server.signalCode === null) await exited;
  await rm(data, { recursive: true, force: true });
}
