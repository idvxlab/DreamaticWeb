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
import { contactSheet, CONTACT_SHEET_LIMIT, ASSET_VIEW_LIMIT } from "../apps/server/src/image-preview.js";
import { guardPictures } from "../apps/server/src/picture-guard.js";

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

test("contact sheets hold six large tiles; an undecodable picture blanks only its own tile", async () => {
  const p = await create();
  try {
    const files: string[] = [];
    for (let n = 0; n < 7; n++) {
      const s = await ingest(await picture(n), `p${n}.png`, p.id);
      files.push(path.join(projectDir(p.id), "assets", path.basename(s.assets[0].url)));
    }
    assert.equal(CONTACT_SHEET_LIMIT, 6);
    assert.equal(ASSET_VIEW_LIMIT, 24);
    const sheet = await sharp(await contactSheet(files.slice(0, 6))).metadata();
    assert.equal(sheet.width, 3 * 384);
    assert.equal(sheet.height, 2 * 384);
    await assert.rejects(contactSheet(files));
    const bad = path.join(projectDir(p.id), "assets", "broken.png");
    await writeFile(bad, Buffer.from("not an image"));
    const mixed = await contactSheet([files[0], bad, files[1]], { firstNumber: 19 });
    assert.deepEqual(mixed.unreadable, [20]);
  } finally {
    await removeProject(p.id).catch(() => {});
  }
});

test("asset_view: candidates chosen from the catalog, up to 24 in one call as sheets of six numbered across sheets, at most two calls", async () => {
  const p = await create();
  const doc = await ingest(Buffer.from("# 公司\n\n产品介绍。"), "a.md", p.id);
  p.sources.push(doc);
  const images: Source[] = [];
  for (let n = 0; n < 30; n++) {
    const s = await ingest(await picture(n), `p${n}.png`, p.id);
    p.sources.push(s);
    images.push(s);
  }
  // Import flags: two layout leftovers are never offered; a backdrop and a logo are, with their flag.
  images[3].assets[0].flags = ["flat"];
  images[4].assets[0].flags = ["fragment"];
  images[5].assets[0].flags = ["page-background"];
  images[6].assets[0].flags = ["graphic"];
  await save(p);
  const asset = (n: number) => images[n].assets[0];
  const offered = [0, 1, 2, ...Array.from({ length: 27 }, (_, n) => n + 5).filter((n) => n < 30)].map(asset);
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
    if (step === 1) return tool(model, "asset_view", { assetIds: offered.slice(0, 25).map((a) => a.id) });
    if (step === 2) return tool(model, "asset_view", { assetIds: [asset(0).id, asset(3).id] });
    if (step === 3) return tool(model, "asset_view", { assetIds: offered.slice(0, 24).map((a) => a.id) });
    if (step === 4) return tool(model, "asset_view", { assetIds: [asset(5).id, asset(6).id] });
    if (step === 5) return tool(model, "asset_view", { assetIds: [asset(0).id] });
    return tool(model, "submit_page", {
      usedFactIds: ["f"],
      html: `<html><head></head><body><h1>产品</h1><img alt="logo" src="${asset(6).url}"><img alt="hero" src="${asset(0).url}"><img alt="线稿" data-kind="drawing" src="${asset(1).url}"></body></html>`,
    });
  };
  try {
    await runProject(p, requestSchema.parse({ text: "生成展示页" }), save, () => {}, { config, streamFn, skills: false });
    assert.equal(p.status, "complete", p.error);
    const [tooMany, flagged, view, more, third] = results;
    assert.equal(tooMany.error, true, "one call names at most 24 images");
    assert.equal(tooMany.images, 0);
    assert.equal(flagged.error, true, "a flat tile is not offered for viewing");
    assert.match(flagged.text, new RegExp("图片不可用：" + asset(3).id));
    // 24 candidates: four sheets of six, numbered 1..24 across sheets.
    assert.equal(view.images, 4);
    assert.match(view.text, /24 images as large tiles, 6 per sheet/);
    assert.match(view.text, /Sheet 4 of 4 .*: 19 · [0-9a-f]{4} = /);
    assert.match(view.text, /24 · [0-9a-f]{4} = /);
    assert.doesNotMatch(view.text, /25 · /);
    assert.equal(more.images, 1, "one further look is allowed");
    assert.match(more.text, new RegExp(asset(5).id + ".*\\[page-background\\]"));
    assert.equal(third.images, 0);
    assert.match(third.text, /Both image views are used/);
    assert.ok(designerInput.includes(asset(5).id), "the Designer sees the offered catalog");
    assert.ok(!designerInput.includes(asset(3).id), "a flat tile is stripped from facts and the catalog");
    const html = p.versions.at(-1)!.html;
    assert.ok(html.match(/data-host="graphics"[^<]*/)![0].includes(asset(6).url), "the logo is kept at icon size");
    assert.ok(!html.match(/data-host="graphics"[^<]*/)![0].includes(asset(0).url), "a photograph is not");
    assert.match(html, /data-host="pictures"/, "a marked drawing is shown whole");
  } finally {
    await removeProject(p.id).catch(() => {});
  }
});

test("drawings, charts, diagrams and screenshots are shown whole; photographs may be cropped", () => {
  const page = (kind: string) => `<html><head></head><body><img src="/a.png" data-kind="${kind}"></body></html>`;
  for (const kind of ["drawing", "chart", "diagram", "screenshot"]) {
    const guarded = guardPictures(page(kind));
    assert.match(guarded, /data-host="pictures"/, kind);
    assert.match(guarded, /object-fit:contain!important/);
    assert.equal(guardPictures(guarded), guarded, "idempotent");
  }
  assert.equal(guardPictures(page("photo")), page("photo"));
  assert.equal(guardPictures("<html><body><img src=/a.png></body></html>"), "<html><body><img src=/a.png></body></html>");
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
