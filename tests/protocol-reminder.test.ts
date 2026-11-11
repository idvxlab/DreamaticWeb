import test from "node:test";
import assert from "node:assert/strict";
import {
  createAssistantMessageEventStream,
  getCurrentSystemMessage,
  type AssistantMessage,
  type JsonObject,
} from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { RuntimeConfig } from "../packages/shared/config.js";
import { create, save, removeProject } from "../apps/server/src/store.js";
import { ingest } from "../apps/server/src/ingest.js";
import { runProject } from "../apps/server/src/generation/runtime.js";
import { requestSchema } from "../packages/shared/generation.js";

const config: RuntimeConfig = {
  mode: "live",
  workspace: process.env.DREAMATIC_WORKSPACE!,
  language: "zh",
  models: {
    reasoning: { mode: "openai-compatible", baseUrl: "http://127.0.0.1:1/v1", model: "local-test", apiKey: "test", vision: false },
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
const prose = (model: Parameters<StreamFn>[0]) =>
  reply(model, [{ type: "text", text: "Here is the page:\n```html\n<html><body><h1>P</h1></body></html>\n```" }], "stop");

async function run(designerProseTurns: number) {
  const p = await create();
  const source = await ingest(Buffer.from("# 公司\n\n产品介绍。"), "a.md", p.id);
  p.sources.push(source);
  await save(p);
  let prosed = 0;
  const reminders: string[] = [];
  const streamFn: StreamFn = (model, context) => {
    const sys = getCurrentSystemMessage(context.messages)!;
    const prompt = typeof sys.content === "string" ? sys.content : sys.content.map((c) => c.text).join("\n");
    if (prompt.includes("# Orchestrator"))
      return tool(model, "submit_intent", { goal: "展示", audience: "访客", content: ["产品"], features: [], design: [], constraints: [] });
    if (prompt.includes("# Analyst"))
      return tool(model, "submit_facts", { summary: "s", facts: [{ id: "f", text: "产品介绍", sourceId: source.id, assetIds: [] }], limitations: [] });
    const last = context.messages.at(-1)!;
    if (last.role === "user" && JSON.stringify(last.content).includes("without a tool call")) reminders.push("seen");
    if (prosed < designerProseTurns) { prosed++; return prose(model); }
    return tool(model, "submit_page", { usedFactIds: ["f"], html: "<html><body><h1>产品</h1><p>产品介绍。</p></body></html>" });
  };
  const events: string[] = [];
  try {
    await runProject(p, requestSchema.parse({ text: "生成展示页" }), save, (e) => events.push(e.text), { config, streamFn, skills: false });
  } catch {}
  await removeProject(p.id).catch(() => {});
  return { p, reminders, events };
}

test("a Designer turn that ends in prose gets one light reminder and may then submit", async () => {
  const { p, reminders, events } = await run(1);
  assert.equal(p.status, "complete", p.error);
  assert.equal(reminders.length, 1);
  assert.ok(events.some((t) => t.includes("已提醒一次")), "the slip is recorded");
});

test("the reminder is never repeated: a second prose turn still fails the stage", async () => {
  const { p, reminders } = await run(2);
  assert.notEqual(p.status, "complete");
  assert.equal(reminders.length, 1);
});

test("block sets named in the plan are supplied for the writing turn and their stylesheet admitted", async () => {
  const p = await create();
  const source = await ingest(Buffer.from("# 机构\n\n课程介绍。"), "a.md", p.id);
  p.sources.push(source);
  await save(p);
  let supplied = "";
  const streamFn: StreamFn = (model, context) => {
    const sys = getCurrentSystemMessage(context.messages)!;
    const prompt = typeof sys.content === "string" ? sys.content : sys.content.map((c) => c.text).join("\n");
    if (prompt.includes("# Orchestrator"))
      return tool(model, "submit_intent", { goal: "介绍", audience: "访客", content: ["课程"], features: [], design: [], constraints: [] });
    if (prompt.includes("# Analyst"))
      return tool(model, "submit_facts", { summary: "s", facts: [{ id: "f", text: "课程介绍", sourceId: source.id, assetIds: [] }], limitations: [] });
    const last = context.messages.at(-1)!;
    if (last.role !== "toolResult")
      return tool(model, "plan_page", { designPlan: { ground: "light", hero: "statement", type: "grotesk", moments: [], reason: "r", blocks: "org — an institution" } });
    supplied = JSON.stringify(last.content);
    return tool(model, "submit_page", {
      usedFactIds: ["f"],
      html: '<html><head><link rel="stylesheet" href="skill://designer-taste/assets/taste.css"><link rel="stylesheet" href="skill://designer-org/assets/org.css"></head><body><main><h1>机构</h1><p>课程介绍。</p></main></body></html>',
    });
  };
  await runProject(p, requestSchema.parse({ text: "/skill:designer-taste 生成机构介绍页" }), save, () => {}, { config, streamFn });
  assert.equal(p.status, "complete", p.error);
  assert.match(supplied, /org blocks apply to this page/);
  assert.match(p.versions.at(-1)!.html, /data-skill-asset="designer-org:org.css"/);
  await removeProject(p.id).catch(() => {});
});

test("a read-only question answered in reply text is taken as the answer, with no extra call", async () => {
  const p = await create();
  const source = await ingest(Buffer.from("# 公司\n\n产品介绍。"), "a.md", p.id);
  p.sources.push(source);
  await save(p);
  let calls = 0;
  const streamFn: StreamFn = (model) => {
    calls++;
    return reply(model, [{ type: "text", text: "产品区按系列排列，后面是参数对比表。" }], "stop");
  };
  await runProject(p, requestSchema.parse({ text: "解释一下产品区怎样组织", mode: "answer" }), save, () => {}, { config, streamFn, skills: false });
  assert.equal(p.status, "complete", p.error);
  assert.equal(calls, 1);
  assert.equal(p.messages.at(-1)!.text, "产品区按系列排列，后面是参数对比表。");
  await removeProject(p.id).catch(() => {});
});
