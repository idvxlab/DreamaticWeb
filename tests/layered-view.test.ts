import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  createAssistantMessageEventStream,
  getCurrentSystemMessage,
  type AssistantMessage,
  type JsonObject,
} from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { RuntimeConfig } from "../packages/shared/config.js";
import type { Source } from "../packages/shared/project.js";
import { create, save, removeProject, projectDir } from "../apps/server/src/store.js";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ingest } from "../apps/server/src/ingest.js";
import { runProject } from "../apps/server/src/generation/runtime.js";
import { requestSchema } from "../packages/shared/generation.js";
import { contactSheet, CONTACT_LAYOUTS, DETAIL_VIEW_LIMIT } from "../apps/server/src/image-preview.js";

const config: RuntimeConfig = {
  mode: "live",
  workspace: process.env.DREAMATIC_WORKSPACE!,
  language: "zh",
  models: {
    reasoning: { mode: "openai-compatible", baseUrl: "http://127.0.0.1:1/v1", model: "local-test", apiKey: "test", vision: true },
    analyst: null,
    designer: null,
  },
};

function reply(model: Parameters<StreamFn>[0], content: AssistantMessage["content"], stopReason: "toolUse" | "stop") {
  const stream = createAssistantMessageEventStream();
  const message: AssistantMessage = {
    role: "assistant", api: model.api, provider: model.provider, model: model.id, content, stopReason, timestamp: Date.now(),
    usage: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  };
  queueMicrotask(() => { stream.push({ type: "done", reason: stopReason, message }); stream.end(message); });
  return stream;
}
const tool = (model: Parameters<StreamFn>[0], name: string, args: unknown) =>
  reply(model, [{ type: "toolCall", id: crypto.randomUUID(), name, arguments: args as JsonObject }], "toolUse");
const picture = (n: number) =>
  sharp({ create: { width: 120 + n, height: 90, channels: 3, background: { r: (n * 37) % 255, g: (n * 91) % 255, b: (n * 53) % 255 } } })
    .png()
    .toBuffer();

test("contact sheets: overview tiles are small and twenty to a sheet, detail tiles large and six to a sheet", async () => {
  const p = await create();
  try {
    const files: string[] = [];
    for (let n = 0; n < 20; n++) {
      const s = await ingest(await picture(n), `p${n}.png`, p.id);
      files.push(path.join(projectDir(p.id), "assets", path.basename(s.assets[0].url)));
    }
    const overview = await sharp(await contactSheet(files, { layout: "overview" })).metadata();
    const { cell } = CONTACT_LAYOUTS.overview;
    assert.ok(cell >= 240 && cell <= 300);
    assert.equal(overview.width, 5 * cell);
    assert.equal(overview.height, 4 * cell);
    await assert.rejects(contactSheet([...files, files[0]], { layout: "overview" }));
    const detail = await sharp(await contactSheet(files.slice(0, 6), { layout: "detail" })).metadata();
    assert.equal(detail.width, 3 * CONTACT_LAYOUTS.detail.cell);
    await assert.rejects(contactSheet(files.slice(0, 7), { layout: "detail" }));
    const bad = path.join(projectDir(p.id), "assets", "broken.png");
    await writeFile(bad, Buffer.from("not an image"));
    const sheet = await contactSheet([files[0], bad, files[1]], { layout: "overview", firstNumber: 21 });
    assert.deepEqual(sheet.unreadable, [22], "an undecodable picture blanks only its own tile");
  } finally {
    await removeProject(p.id).catch(() => {});
  }
});

test("asset_view: one overview of every offered picture numbered across sheets, one capped detail view, at most two calls", async () => {
  const p = await create();
  const doc = await ingest(Buffer.from("# 公司\n\n产品介绍。"), "a.md", p.id);
  p.sources.push(doc);
  const images: Source[] = [];
  for (let n = 0; n < 25; n++) {
    const s = await ingest(await picture(n), `p${n}.png`, p.id);
    p.sources.push(s);
    images.push(s);
  }
  // Import flags: two layout leftovers are never offered; a logo is offered and kept small.
  images[3].assets[0].flags = ["flat"];
  images[4].assets[0].flags = ["fragment"];
  images[5].assets[0].flags = ["page-background"];
  images[6].assets[0].flags = ["graphic"];
  await save(p);
  const asset = (n: number) => images[n].assets[0];
  const results: { text: string; images: number; error: boolean }[] = [];
  let designerInput = "";
  let step = 0;
  const streamFn: StreamFn = (model, context) => {
    const sys = getCurrentSystemMessage(context.messages)!;
    const prompt = typeof sys.content === "string" ? sys.content : sys.content.map((c) => c.text).join("\n");
    if (prompt.includes("# Orchestrator"))
      return tool(model, "submit_intent", { goal: "展示", audience: "访客", content: ["产品"], features: [], design: [], constraints: [] });
    if (prompt.includes("# Analyst"))
      return tool(model, "submit_facts", {
        summary: "s",
        facts: [{ id: "f", text: "产品", sourceId: images[3].id, assetIds: [asset(3).id] }],
        limitations: [],
      });
    const last = context.messages.at(-1)!;
    if (last.role === "toolResult")
      results.push({
        text: last.content.filter((c) => c.type === "text").map((c) => c.text).join("\n"),
        images: last.content.filter((c) => c.type === "image").length,
        error: Boolean(last.isError),
      });
    else designerInput = JSON.stringify(context.messages);
    step++;
    if (step === 1) return tool(model, "asset_view", { overview: true });
    if (step === 2)
      return tool(model, "asset_view", { assetIds: Array.from({ length: DETAIL_VIEW_LIMIT + 1 }, (_, n) => asset(n + 7).id) });
    if (step === 3) return tool(model, "asset_view", { assetIds: [asset(0).id, asset(5).id, asset(6).id] });
    if (step === 4) return tool(model, "asset_view", { overview: true });
    return tool(model, "submit_page", {
      usedFactIds: ["f"],
      html: `<html><head></head><body><h1>产品</h1><img alt="logo" src="${asset(6).url}"><img alt="hero" src="${asset(0).url}"></body></html>`,
    });
  };
  try {
    await runProject(p, requestSchema.parse({ text: "生成展示页" }), save, () => {}, { config, streamFn, skills: false });
    assert.equal(p.status, "complete", p.error);
    const [overview, tooMany, detail, third] = results;
    // 25 pictures minus the flat tile and the fragment: 23 offered, two sheets, numbered 1..23.
    assert.equal(overview.images, 2);
    assert.match(overview.text, /Overview of all 23 catalog images/);
    assert.match(overview.text, /Sheet 1 of 2/);
    assert.match(overview.text, /Sheet 2 of 2 .*: 21 · /);
    assert.match(overview.text, /23 · [0-9a-f]{4} = /);
    assert.doesNotMatch(overview.text, /24 · /);
    assert.ok(!overview.text.includes(asset(3).id) && !overview.text.includes(asset(4).id), "flagged leftovers are not offered");
    assert.match(overview.text, new RegExp(asset(5).id + ".*\\[page-background\\]"));
    assert.equal(tooMany.error, true, "a detail view is capped");
    assert.equal(tooMany.images, 0);
    assert.equal(detail.images, 1);
    assert.match(detail.text, /Detail view of 3 images/);
    assert.equal(third.images, 0);
    assert.match(third.text, /Both image views are used/);
    assert.ok(designerInput.includes(asset(5).id), "the Designer sees the offered catalog");
    assert.ok(!designerInput.includes(asset(3).id), "a flat tile is stripped from facts and the catalog");
    const html = p.versions.at(-1)!.html;
    assert.match(html, /data-host="graphics"/);
    assert.ok(html.includes(`img[src="${asset(6).url}"]`), "the logo is kept at icon size");
    assert.ok(!html.match(/data-host="graphics"[^<]*/)![0].includes(asset(0).url), "a photograph is not");
  } finally {
    await removeProject(p.id).catch(() => {});
  }
});

test("a generated page that uses a flat tile is rejected", async () => {
  const p = await create();
  const s = await ingest(await picture(1), "p.png", p.id);
  s.assets[0].flags = ["flat"];
  p.sources.push(s);
  await save(p);
  let rejected = "";
  const streamFn: StreamFn = (model, context) => {
    const sys = getCurrentSystemMessage(context.messages)!;
    const prompt = typeof sys.content === "string" ? sys.content : sys.content.map((c) => c.text).join("\n");
    if (prompt.includes("# Orchestrator"))
      return tool(model, "submit_intent", { goal: "展示", audience: "访客", content: ["产品"], features: [], design: [], constraints: [] });
    if (prompt.includes("# Analyst"))
      return tool(model, "submit_facts", { summary: "s", facts: [{ id: "f", text: "产品", sourceId: "user", assetIds: [] }], limitations: [] });
    const last = context.messages.at(-1)!;
    if (last.role === "toolResult" && last.isError) {
      rejected = JSON.stringify(last.content);
      return tool(model, "submit_page", { usedFactIds: ["f"], html: "<html><body><h1>产品</h1></body></html>" });
    }
    return tool(model, "submit_page", { usedFactIds: ["f"], html: `<html><body><h1>产品</h1><img alt="x" src="${s.assets[0].url}"></body></html>` });
  };
  try {
    await runProject(p, requestSchema.parse({ text: "生成展示页" }), save, () => {}, { config: { ...config, models: { ...config.models, reasoning: { ...config.models.reasoning, vision: false } } }, streamFn, skills: false });
    assert.equal(p.status, "complete", p.error);
    assert.match(rejected, /asset_unusable/);
  } finally {
    await removeProject(p.id).catch(() => {});
  }
});
