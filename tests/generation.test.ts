import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, writeFile, stat, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  createAssistantMessageEventStream,
  getCurrentSystemMessage,
  type AssistantMessage,
  type JsonObject,
} from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { RuntimeConfig } from "../packages/shared/config.js";
import {
  create,
  save,
  get,
  projects,
  projectDir,
  removeProject,
} from "../apps/server/src/store.js";
import { ingest } from "../apps/server/src/ingest.js";
import {
  runProject,
  activeRuns,
} from "../apps/server/src/generation/runtime.js";
import { requestSchema } from "../packages/shared/generation.js";
import { applyPagePatch } from "../apps/server/src/generation/page-patch.js";
import { documentMediaAssociations } from "../apps/server/src/document-media.js";
import {
  persistExtraction,
  readCanonicalSource,
} from "../apps/server/src/source-content.js";

const config: RuntimeConfig = {
  mode: "live",
  workspace: process.env.DREAMATIC_WORKSPACE!,
  language: "zh",
  models: {
    reasoning: {
      mode: "openai-compatible",
      baseUrl: "http://127.0.0.1:1/v1",
      model: "local-test",
      apiKey: "test",
      vision: false,
    },
    analyst: null,
    designer: null,
  },
};
const brief = {
  goal: "品牌介绍",
  audience: "访客",
  content: ["品牌事实"],
  features: [],
  design: ["温暖简洁"],
  constraints: [],
};
const html =
  '<html><head><title>Test</title><style id="design">body{color:#222;background:#faf8f2}</style></head><body><nav id="nav">Keep navigation</nav><main><section id="hero"><h1 id="title">Original</h1></section><section id="details"><p>Keep details</p></section></main><footer id="footer">Keep footer</footer></body></html>';
function answer(model: Parameters<StreamFn>[0], name: string, args: unknown) {
  const stream = createAssistantMessageEventStream();
  const message: AssistantMessage = {
    role: "assistant",
    api: model.api,
    provider: model.provider,
    model: model.id,
    content: [
      {
        type: "toolCall",
        id: crypto.randomUUID(),
        name,
        arguments: args as JsonObject,
      },
    ],
    stopReason: "toolUse",
    timestamp: Date.now(),
    usage: {
      input: 10,
      output: 10,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 20,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
  queueMicrotask(() => {
    stream.push({ type: "done", reason: "toolUse", message });
    stream.end(message);
  });
  return stream;
}

test("a responsive phase may exceed five minutes without automatic abort", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const p = await create();
  try {
    await runProject(
      p,
      requestSchema.parse({ text: "先回答，不要修改页面" }),
      save,
      () => {},
      {
        config,
        skills: false,
        streamFn: async (model, _context, opts) => {
          const wait = new Promise<void>((resolve) =>
            setTimeout(resolve, 300001),
          );
          queueMicrotask(() => t.mock.timers.tick(300001));
          await wait;
          assert.equal(opts?.signal?.aborted, false);
          return answer(model, "submit_answer", {
            answer: "阶段超过五分钟仍可完成。",
          });
        },
      },
    );
    assert.equal(p.status, "complete");
  } finally {
    t.mock.timers.reset();
    await removeProject(p.id);
  }
});

test("read-only answer has no page tools and creates no page versions", async () => {
  const p = await create();
  try {
    p.versions.push({
      id: crypto.randomUUID(),
      html,
      label: "fixture",
      createdAt: new Date().toISOString(),
    });
    const original = JSON.stringify(p.versions);
    let calls = 0;
    await runProject(
      p,
      requestSchema.parse({ text: "为什么采用这种布局？只解释，不要修改页面" }),
      save,
      () => {},
      {
        config,
        skills: false,
        streamFn: (model, context) => {
          calls++;
          assert.deepEqual(
            getCurrentSystemMessage(context.messages)?.toolsAdded?.map(
              (t) => t.name,
            ),
            ["submit_answer"],
          );
          return answer(model, "submit_answer", {
            answer: "首屏先介绍品牌，随后展示产品，便于访客理解。",
          });
        },
      },
    );
    assert.equal(p.status, "complete", p.error);
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(p.versions), original);
    assert.match(p.messages.at(-1)!.text, /首屏/);
  } finally {
    await removeProject(p.id);
  }
});

test("real Pi stages: first generation 3 calls, selected-fact edit 1, duplicate 0; Markdown and old HTML are reused", async (t) => {
  const p = await create();
  const prompts = await mkdtemp(path.join(os.tmpdir(), "dreamatic-prompts-"));
  await cp("config/agents", prompts, { recursive: true });
  try {
    p.sources.push(
      await ingest(Buffer.from("Name,Value\nBrand,42"), "brand.csv", p.id),
    );
    const seen: {
      role: string;
      input: string;
      prompt: string;
      tools: string[];
    }[] = [];
    const streamFn: StreamFn = (model, context) => {
      const sys = getCurrentSystemMessage(context.messages)!;
      const prompt =
        typeof sys.content === "string"
          ? sys.content
          : sys.content.map((c) => c.text).join("\n");
      const role = prompt.includes("# Orchestrator")
        ? "orchestrator"
        : prompt.includes("# Analyst")
          ? "analyst"
          : "designer";
      const input = context.messages
        .filter((m) => m.role === "user")
        .map((m) =>
          typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        )
        .join("\n");
      const tools = (sys.toolsAdded || []).map((t) => t.name);
      seen.push({ role, input, prompt, tools });
      if (role === "orchestrator") return answer(model, "submit_intent", brief);
      if (role === "analyst")
        return answer(model, "submit_facts", {
          summary: "提取完成",
          facts: [
            {
              id: "brand",
              text: "Brand 42",
              sourceId: p.sources[0].id,
              assetIds: [],
            },
            {
              id: "other",
              text: "Not selected fact",
              sourceId: p.sources[0].id,
              assetIds: [],
            },
          ],
          limitations: [],
        });
      if (tools.includes("page_patch"))
        return answer(model, "page_patch", {
          baseVersionId: p.versions.at(-1)!.id,
          operations: [
            { selector: "#title", action: "set_text", value: "Updated" },
          ],
        });
      return answer(model, "submit_page", { html, usedFactIds: ["brand"] });
    };
    const run = async (text: string, extra = {}) =>
      runProject(p, requestSchema.parse({ text, ...extra }), save, () => {}, {
        config,
        streamFn,
        promptDir: prompts,
      });
    await run("创建品牌网页");
    assert.equal(p.status, "complete", p.error);
    assert.deepEqual(
      seen.map((x) => x.role),
      ["orchestrator", "analyst", "designer"],
    );
    assert.equal(
      p.generation!.metrics!.modelCalls,
      3,
      "terminal tool causes no extra confirmation request",
    );
    assert.deepEqual(p.versions.at(-1)!.appliedFactIds, ["brand"]);
    assert.equal(p.generation!.metrics!.artifactWrites, 2);
    assert.ok(
      p
        .generation!.metrics!.stages.find((s) => s.role === "analyst")!
        .skills!.includes("analyst-information-extraction"),
    );
    assert.ok(p.generation!.metrics!.skillCharacters! > 0);
    assert.equal(p.generation!.metrics!.inputTokens, 30);
    await run("创建品牌网页");
    assert.equal(
      seen.length,
      3,
      "repeating the initial request reuses the generated version despite create→edit state transition",
    );
    assert.equal(p.generation!.metrics!.modelCalls, 0);
    assert.match(
      await readFile(path.join(projectDir(p.id), "results/intent.md"), "utf8"),
      /# User Intent Brief/,
    );
    assert.match(
      await readFile(path.join(projectDir(p.id), "results/facts.md"), "utf8"),
      /Brand 42/,
    );
    assert.equal(
      seen[0].input.includes("# Canonical Markdown"),
      false,
      "Orchestrator receives inventory only",
    );
    assert.match(seen[1].input, /Brand/);
    const first = p.versions[0];
    const pageFile = path.join(projectDir(p.id), "pages", first.id + ".html");
    const pageStat = await stat(pageFile, { bigint: true });
    const briefStat = await stat(
      path.join(projectDir(p.id), "results/intent.md"),
      { bigint: true },
    );
    const factsStat = await stat(
      path.join(projectDir(p.id), "results/facts.md"),
      { bigint: true },
    );
    const body = first.html;
    await run("把标题改为 Updated", { selectedFactIds: ["brand"] });
    assert.equal(p.status, "complete", p.error);
    assert.equal(seen.length, 4);
    assert.deepEqual(seen[3].tools, ["page_read", "page_patch"]);
    const selectedPart = seen[3].input
      .split("# Information Facts")[1]
      .split("# Media catalog")[0];
    assert.match(selectedPart, /Brand 42/);
    assert.doesNotMatch(selectedPart, /Not selected fact/);
    assert.equal(p.generation!.metrics!.modelCalls, 1);
    assert.equal(p.generation!.metrics!.artifactWrites, 0);
    assert.equal(p.generation!.metrics!.fullPageWrites, 0);
    assert.equal(p.generation!.metrics!.patchOperations, 1);
    assert.equal(first.html, body);
    const edited = p.versions.at(-1)!.html;
    for (const text of ["Keep navigation", "Keep details", "Keep footer"])
      assert.ok(edited.includes(text));
    assert.match(edited, />Updated<\/h1>/);
    assert.equal(
      (await stat(pageFile, { bigint: true })).mtimeNs,
      pageStat.mtimeNs,
    );
    assert.equal(
      (
        await stat(path.join(projectDir(p.id), "results/intent.md"), {
          bigint: true,
        })
      ).mtimeNs,
      briefStat.mtimeNs,
    );
    assert.equal(
      (
        await stat(path.join(projectDir(p.id), "results/facts.md"), {
          bigint: true,
        })
      ).mtimeNs,
      factsStat.mtimeNs,
    );
    const persisted = JSON.parse(
      await readFile(path.join(projectDir(p.id), "project.json"), "utf8"),
    );
    assert.equal(
      persisted.versions[0].html,
      undefined,
      "HTML is stored once, outside project metadata",
    );
    await run("把标题改为 Updated", { selectedFactIds: ["brand"] });
    assert.equal(p.generation!.metrics!.modelCalls, 0);
    assert.equal(p.versions.length, 2);
    // Editing prompt changes are loaded without modifying code or rerunning other roles.
    await writeFile(
      path.join(prompts, "designer.md"),
      (await readFile(path.join(prompts, "designer.md"), "utf8")) +
        "\nUPDATED DESIGN RULE\n",
    );
    await run("再次调整标题");
    assert.equal(p.generation!.metrics!.modelCalls, 1);
    assert.match(seen.at(-1)!.prompt, /UPDATED DESIGN RULE/);
    // A new input invalidates analysis, but not the user-intent stage.
    p.sources.push(
      await ingest(Buffer.from("Added,Info\nNew,1"), "new.csv", p.id),
    );
    const before = seen.length;
    await run("更新新资料相关内容");
    assert.deepEqual(
      seen.slice(before).map((x) => x.role),
      ["analyst", "designer"],
    );
    await run("整体重新设计", { mode: "redesign" });
    assert.equal(p.generation!.metrics!.modelCalls, 1);
    assert.ok(seen.at(-1)!.tools.includes("submit_page"));
    assert.equal(p.generation!.metrics!.fullPageWrites, 1);
    // Cold store load restores HTML from immutable version files.
    projects.delete(p.id);
    const cold = await get(p.id);
    assert.equal(cold.versions[0].html, body);
    const count = seen.length;
    await runProject(
      cold,
      requestSchema.parse({ text: "再次局部调整" }),
      save,
      () => {},
      { config, streamFn, promptDir: prompts },
    );
    assert.equal(seen.length, count + 1);
    assert.equal(activeRuns.has(p.id), false);
    t.diagnostic(
      "Measured model requests: initial=3, local edit=1, duplicate=0, new input=2, redesign with reused brief/facts=1; old page and Markdown mtimes unchanged on edit.",
    );
  } finally {
    await removeProject(p.id);
    await rm(prompts, { recursive: true, force: true });
  }
});

test("prepared PDF hands verified availability to Orchestrator and canonical facts to Analyst in three calls", async () => {
  const p = await create();
  try {
    // Prepared-source fixture; real PDF parsing and model behavior are checked separately.
    const source = await persistExtraction(
      {
        id: crypto.randomUUID(),
        name: "institution.pdf",
        format: "pdf",
        text: "课程亮点：交互设计实践。团队资料：林老师负责课程。",
        assets: [],
        tables: [],
        warnings: [],
        provenance: "test fixture",
      },
      p.id,
    );
    p.sources.push(source);
    const canonical = await readCanonicalSource(p.id, source);
    source.markdown = "STALE DISPLAY PREVIEW";
    const order: string[] = [];
    const streamFn: StreamFn = (model, context) => {
      const system = getCurrentSystemMessage(context.messages)!;
      const tools = (system.toolsAdded || []).map((t) => t.name);
      const input = context.messages
        .filter((m) => m.role === "user")
        .map((m) =>
          typeof m.content === "string"
            ? m.content
            : m.content.map((c) => (c.type === "text" ? c.text : "")).join(""),
        )
        .join("\n");
      assert.doesNotMatch(input, /STALE DISPLAY PREVIEW/);
      if (tools.includes("submit_intent")) {
        order.push("orchestrator");
        const inventory = JSON.parse(
          input.split("# Source inventory\n")[1].split("\n\n# User answers")[0],
        );
        assert.deepEqual(inventory, [
          {
            id: source.id,
            name: source.name,
            format: "pdf",
            canonicalMarkdown: {
              status: "ready",
              characters: canonical.markdown.length,
            },
          },
        ]);
        assert.equal(input.includes(canonical.markdown), false);
        assert.ok(
          tools.includes("ask_user"),
          "genuine clarification stays available",
        );
        return answer(model, "submit_intent", {
          ...brief,
          content: ["从上传资料中分析课程亮点、团队资料"],
        });
      }
      if (tools.includes("submit_facts")) {
        order.push("analyst");
        assert.ok(input.includes(canonical.markdown));
        assert.match(input, /分析课程亮点、团队资料/);
        return answer(model, "submit_facts", {
          summary: "课程与团队",
          facts: [
            {
              id: "course",
              text: "交互设计实践",
              sourceId: source.id,
              assetIds: [],
            },
          ],
          limitations: [],
        });
      }
      order.push("designer");
      assert.match(input, /交互设计实践/);
      return answer(model, "submit_page", { html, usedFactIds: ["course"] });
    };
    await runProject(
      p,
      requestSchema.parse({
        text: "分析改机构课程亮点、团队资料，生成一个酷炫的介绍界面。",
      }),
      save,
      () => {},
      { config, skills: false, streamFn },
    );
    assert.equal(p.status, "complete", p.error);
    assert.deepEqual(order, ["orchestrator", "analyst", "designer"]);
    assert.equal(p.generation!.metrics!.modelCalls, 3);
    assert.equal(p.questions?.length || 0, 0);

    source.content!.readingComplete = false;
    await runProject(
      p,
      requestSchema.parse({ text: "重新分析课程亮点" }),
      save,
      () => {},
      { config, skills: false, streamFn },
    );
    assert.equal(p.status, "error");
    assert.match(p.error!, /integrity check failed/);
    assert.equal(order.length, 3, "incomplete sources fail before model calls");
  } finally {
    await removeProject(p.id);
  }
});

test("critical questions suspend Pi and resume in order; cancellation preserves pages and releases the project lock", async () => {
  const p = await create();
  try {
    const order: string[] = [];
    let question = true;
    const streamFn: StreamFn = (model, context) => {
      const sys = getCurrentSystemMessage(context.messages)!;
      const prompt =
        typeof sys.content === "string"
          ? sys.content
          : sys.content.map((c) => c.text).join("\n");
      if (prompt.includes("# Orchestrator")) {
        order.push("orchestrator");
        if (question) {
          question = false;
          return answer(model, "ask_user", { title: "目标受众是谁？" });
        }
        assert.match(JSON.stringify(context.messages), /客户/);
        return answer(model, "submit_intent", brief);
      }
      if (prompt.includes("# Analyst")) {
        order.push("analyst");
        return answer(model, "submit_facts", {
          summary: "用户资料",
          facts: [],
          limitations: [],
        });
      }
      order.push("designer");
      return answer(model, "submit_page", { html, usedFactIds: [] });
    };
    const request = requestSchema.parse({ text: "创建网页" });
    await runProject(p, request, save, () => {}, { config, streamFn });
    assert.equal(p.status, "needs_input");
    assert.equal(p.versions.length, 0);
    p.questions![0].answer = { text: "客户", selected: [] };
    p.questions![0].answeredAt = new Date().toISOString();
    await runProject(p, request, save, () => {}, {
      config,
      streamFn,
      resume: true,
    });
    assert.equal(p.status, "complete", p.error);
    assert.deepEqual(order, [
      "orchestrator",
      "orchestrator",
      "analyst",
      "designer",
    ]);
    const versions = p.versions.length;
    const hanging: StreamFn = (model, _context, options) => {
      const stream = createAssistantMessageEventStream();
      const finish = () => {
        const message: AssistantMessage = {
          role: "assistant",
          content: [],
          api: model.api,
          provider: model.provider,
          model: model.id,
          timestamp: Date.now(),
          stopReason: "aborted",
          errorMessage: "aborted",
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          },
        };
        stream.push({ type: "error", reason: "aborted", error: message });
        stream.end(message);
      };
      if (options?.signal?.aborted) finish();
      else options?.signal?.addEventListener("abort", finish, { once: true });
      return stream;
    };
    const job = runProject(
      p,
      requestSchema.parse({ text: "调整标题" }),
      save,
      (e) => {
        if (e.role === "designer")
          setTimeout(() => activeRuns.get(p.id)?.abort(), 10);
      },
      { config, streamFn: hanging },
    );
    assert.throws(
      () => runProject(p, request, save, () => {}, { config }),
      /正在生成/,
    );
    await job;
    assert.equal(p.status, "cancelled");
    assert.equal(p.versions.length, versions);
    assert.equal(activeRuns.has(p.id), false);
  } finally {
    await removeProject(p.id);
  }
});

test("unsafe root patches fail without mutating the saved page", async () => {
  const p = await create();
  try {
    p.versions.push({
      id: crypto.randomUUID(),
      html,
      label: "test",
      createdAt: new Date().toISOString(),
    });
    const baseVersionId = p.versions[0].id;
    assert.throws(
      () =>
        applyPagePatch(p, {
          baseVersionId,
          operations: [
            { selector: "body", action: "replace_html", value: "<p>bad</p>" },
          ],
        }),
      /根结构/,
    );
    assert.throws(
      () =>
        applyPagePatch(p, {
          baseVersionId: crypto.randomUUID(),
          operations: [
            { selector: "#title", action: "set_text", value: "bad" },
          ],
        }),
      /已更新/,
    );
    assert.equal(p.versions[0].html, html);
  } finally {
    await removeProject(p.id);
  }
});

test("raw-text patches preserve style/script tags and failed batches never publish a version", async () => {
  const p = await create();
  try {
    p.versions.push({
      id: crypto.randomUUID(),
      html,
      label: "fixture",
      createdAt: new Date().toISOString(),
    });
    const baseVersionId = p.versions[0].id;
    for (const [action, value] of [
      ["replace_html", "body{color:white;background:#111}"],
      ["replace_html", "<style>body{color:red}</style><p>extra</p>"],
      ["append_html", "body{color:red}"],
    ])
      assert.throws(
        () =>
          applyPagePatch(p, {
            baseVersionId,
            operations: [
              {
                selector: "#title",
                action: "set_text",
                value: "Must not persist",
              },
              { selector: "#design", action, value },
            ],
          }),
        /style/,
      );
    for (const [action, value] of [
      ["set_text", "body{color:green}"],
      ["replace_html", ' <style id="design">body{color:green}</style> '],
    ]) {
      const patched = applyPagePatch(p, {
        baseVersionId,
        operations: [{ selector: "#design", action, value }],
      });
      assert.match(patched.html, /<style[^>]*>body\{color:green\}<\/style>/);
    }
    assert.equal(p.versions.length, 1);
    assert.equal(p.versions[0].html, html);
    const streamFn: StreamFn = (model, context) => {
      const names = (
        getCurrentSystemMessage(context.messages)?.toolsAdded || []
      ).map((t) => t.name);
      if (names.includes("submit_intent"))
        return answer(model, "submit_intent", brief);
      if (names.includes("submit_facts"))
        return answer(model, "submit_facts", {
          summary: "Fixture",
          facts: [],
          limitations: [],
        });
      return answer(model, "page_patch", {
        baseVersionId,
        operations: [
          {
            selector: "#design",
            action: "replace_html",
            value: "body{color:red}",
          },
        ],
      });
    };
    await runProject(
      p,
      requestSchema.parse({ text: "Change the page color", mode: "edit" }),
      save,
      () => {},
      { config, streamFn },
    );
    assert.equal(p.status, "error");
    assert.equal(p.versions.length, 1);
    assert.equal(p.versions[0].html, html);
  } finally {
    await removeProject(p.id);
  }
});

test("resume after a provider failure reuses saved intent/facts even for mode:intent, and tampered Markdown is rejected", async () => {
  const p = await create();
  let fail = true;
  let calls = 0;
  const streamFn: StreamFn = (model, context) => {
    calls++;
    const sys = getCurrentSystemMessage(context.messages)!;
    const prompt =
      typeof sys.content === "string"
        ? sys.content
        : sys.content.map((c) => c.text).join("\n");
    if (prompt.includes("# Orchestrator"))
      return answer(model, "submit_intent", brief);
    if (prompt.includes("# Analyst"))
      return answer(model, "submit_facts", {
        summary: "Facts",
        facts: [],
        limitations: [],
      });
    if (!fail) return answer(model, "submit_page", { html, usedFactIds: [] });
    fail = false;
    const stream = createAssistantMessageEventStream();
    const message: AssistantMessage = {
      role: "assistant",
      api: model.api,
      provider: model.provider,
      model: model.id,
      content: [],
      stopReason: "error",
      errorMessage: "test provider unavailable",
      timestamp: Date.now(),
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    };
    queueMicrotask(() => {
      stream.push({ type: "error", reason: "error", error: message });
      stream.end(message);
    });
    return stream;
  };
  try {
    const request = requestSchema.parse({ text: "创建新网站", mode: "intent" });
    await runProject(p, request, save, () => {}, { config, streamFn });
    assert.equal(p.status, "error");
    assert.equal(p.versions.length, 0);
    assert.equal(calls, 3);
    assert.ok(p.generation?.intent);
    assert.ok(p.generation?.facts);
    await runProject(p, request, save, () => {}, {
      config,
      streamFn,
      resume: true,
    });
    assert.equal(p.status, "complete", p.error);
    assert.equal(calls, 4);
    assert.equal(p.generation!.metrics!.modelCalls, 1);
    const count = p.versions.length;
    await writeFile(
      path.join(projectDir(p.id), "results/facts.md"),
      "tampered",
    );
    await runProject(
      p,
      requestSchema.parse({ text: "修改标题" }),
      save,
      () => {},
      { config, streamFn },
    );
    assert.equal(p.status, "error");
    assert.match(p.error!, /校验失败/);
    assert.equal(p.versions.length, count);
    assert.equal(calls, 4);
  } finally {
    await removeProject(p.id);
  }
});

test("additional source ranges and optional image inspection use Pi tools and canonical assets, without re-extraction", async () => {
  const p = await create();
  try {
    const document = await ingest(
      Buffer.from("Relevant paragraph.\n".repeat(2000)),
      "long.txt",
      p.id,
    );
    const media = await ingest(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9JkAAAAASUVORK5CYII=",
        "base64",
      ),
      "logo.png",
      p.id,
    );
    p.sources.push(document, media);
    let sourceRead = false,
      imageRead = false;
    const streamFn: StreamFn = (model, context) => {
      const sys = getCurrentSystemMessage(context.messages)!;
      const prompt =
        typeof sys.content === "string"
          ? sys.content
          : sys.content.map((c) => c.text).join("\n");
      if (prompt.includes("# Orchestrator"))
        return answer(model, "submit_intent", brief);
      if (prompt.includes("# Analyst")) {
        if (!sourceRead) {
          sourceRead = true;
          return answer(model, "source_read", {
            sourceId: document.id,
            offset: 20000,
            limit: 1000,
          });
        }
        assert.ok(
          context.messages.some(
            (m) =>
              m.role === "toolResult" &&
              JSON.stringify(m.content).includes("Relevant paragraph"),
          ),
        );
        return answer(model, "submit_facts", {
          summary: "Media reference",
          facts: [
            {
              id: "logo",
              text: "User supplied logo",
              sourceId: media.id,
              assetIds: [media.assets[0].id],
            },
          ],
          limitations: [],
        });
      }
      if (!imageRead) {
        imageRead = true;
        return answer(model, "asset_view", { assetId: media.assets[0].id });
      }
      assert.ok(
        context.messages.some(
          (m) =>
            m.role === "toolResult" &&
            m.content.some((c) => c.type === "image"),
        ),
      );
      return answer(model, "submit_page", {
        usedFactIds: [],
        html: `<html><body><h1>Brand</h1><img alt="Logo" src="${media.assets[0].url}"></body></html>`,
      });
    };
    await runProject(
      p,
      requestSchema.parse({ text: "Create using the document and logo" }),
      save,
      () => {},
      {
        config: {
          ...config,
          models: {
            ...config.models,
            reasoning: { ...config.models.reasoning, vision: true },
          },
        },
        streamFn,
      },
    );
    assert.equal(p.status, "complete", p.error);
    assert.equal(p.generation!.metrics!.sourceReads, 1);
    assert.equal(
      p.generation!.metrics!.modelCalls,
      5,
      "only explicitly needed tools add follow-up requests",
    );
    assert.ok(p.versions[0].html.includes(media.assets[0].url));
  } finally {
    await removeProject(p.id);
  }
});

test("legacy media appendices stay in source storage without Designer reinjection; optional vision and three-stage reuse remain", async () => {
  const p = await create();
  const observed: string[][] = [];
  try {
    const media = await ingest(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9JkAAAAASUVORK5CYII=",
        "base64",
      ),
      "product.png",
      p.id,
    );
    const context = documentMediaAssociations(
      [
        {
          type: "page",
          metadata: { pageNumber: 8 },
          children: [
            {
              type: "image",
              metadata: {
                attachmentName: "product.png",
                altText: "Product illustration from source",
              },
            },
          ],
        },
      ],
      media.assets,
    );
    await persistExtraction(
      { ...media, text: "User supplied product material" },
      p.id,
      undefined,
      context.markdown,
    ).then((source) => p.sources.push(source));
    const source = p.sources[0];
    const before = await readCanonicalSource(p.id, source);
    const filename = path.join(
      projectDir(p.id),
      "sources",
      source.id,
      "reading.md",
    );
    const originalTime = (await stat(filename)).mtimeMs;
    const streamFn: StreamFn = (model, input) => {
      const names = (
        getCurrentSystemMessage(input.messages)?.toolsAdded || []
      ).map((t) => t.name);
      observed.push(names);
      if (names.includes("submit_intent"))
        return answer(model, "submit_intent", brief);
      const all = JSON.stringify(input.messages);
      if (names.includes("submit_facts"))
        assert.match(all, /Product illustration from source/);
      else {
        assert.doesNotMatch(
          all,
          /# Canonical media associations|Media layout associations|Product illustration from source/,
        );
      }
      assert.ok(all.includes(source.assets[0].url));
      if (names.includes("submit_facts"))
        return answer(model, "submit_facts", {
          summary: "Material",
          facts: [
            {
              id: "product",
              text: "User supplied product material",
              sourceId: source.id,
              assetIds: [source.assets[0].id],
            },
          ],
          limitations: [],
        });
      assert.ok(
        names.includes("asset_view"),
        "vision remains optional, never forced",
      );
      assert.equal(
        input.messages.some(
          (message) =>
            message.role === "toolResult" &&
            message.content.some((part) => part.type === "image"),
        ),
        false,
      );
      if (names.includes("page_patch"))
        return answer(model, "page_patch", {
          baseVersionId: p.versions.at(-1)!.id,
          operations: [
            { selector: "#title", action: "set_text", value: "Edited" },
          ],
        });
      return answer(model, "submit_page", {
        html: `<html><body><h1 id="title">Product</h1><img alt="Product illustration" src="${source.assets[0].url}"></body></html>`,
        usedFactIds: ["product"],
      });
    };
    const options = {
      config: {
        ...config,
        models: {
          ...config.models,
          reasoning: { ...config.models.reasoning, vision: true },
        },
      },
      streamFn,
    };
    await runProject(
      p,
      requestSchema.parse({ text: "Make a company product page" }),
      save,
      () => {},
      options,
    );
    assert.equal(p.status, "complete", p.error);
    assert.equal(p.generation!.metrics!.modelCalls, 3);
    assert.equal(p.generation!.metrics!.sourceReads, 0);
    await runProject(
      p,
      requestSchema.parse({ text: "Change the title to Edited" }),
      save,
      () => {},
      options,
    );
    assert.equal(p.status, "complete", p.error);
    assert.equal(p.generation!.metrics!.modelCalls, 1);
    assert.equal(observed.length, 4);
    assert.equal((await stat(filename)).mtimeMs, originalTime);
    assert.equal((await readCanonicalSource(p.id, source)).hash, before.hash);
  } finally {
    await removeProject(p.id);
  }
});

test("Skill upgrades invalidate only affected stages, preserve patch mode and keep warm loads free of extra reads", async () => {
  const { SkillLibrary, SKILLS_ROOT } =
    await import("../apps/server/src/generation/skills.js");
  const root = await mkdtemp(
    path.join(os.tmpdir(), "dreamatic-skill-runtime-"),
  );
  await cp(SKILLS_ROOT, path.join(root, "skills"), { recursive: true });
  const library = new SkillLibrary(path.join(root, "skills"));
  const p = await create();
  const seen: string[] = [];
  const streamFn: StreamFn = (model, context) => {
    const sys = getCurrentSystemMessage(context.messages)!;
    const prompt =
      typeof sys.content === "string"
        ? sys.content
        : sys.content.map((c) => c.text).join("\n");
    if (prompt.includes("# Orchestrator")) {
      seen.push("orchestrator");
      assert.ok(!prompt.includes("<available_skills>"));
      return answer(model, "submit_intent", brief);
    }
    if (prompt.includes("# Analyst")) {
      seen.push("analyst");
      assert.ok(prompt.includes("# Extract useful facts in one pass"));
      return answer(model, "submit_facts", {
        summary: "Synthetic test",
        facts: [],
        limitations: [],
      });
    }
    seen.push("designer");
    if (p.versions.length)
      return answer(model, "page_patch", {
        baseVersionId: p.versions.at(-1)!.id,
        operations: [
          {
            selector: "#title",
            action: "set_style",
            name: "color",
            value: "#223322",
          },
        ],
      });
    return answer(model, "submit_page", { html, usedFactIds: [] });
  };
  const run = (text: string) =>
    runProject(p, requestSchema.parse({ text }), save, () => {}, {
      config,
      streamFn,
      skills: library,
    });
  try {
    await run("创建品牌网站");
    assert.equal(p.status, "complete", p.error);
    assert.equal(seen.length, 3);
    const initialReads = library.io.reads;
    await run("修改标题颜色");
    assert.equal(p.generation!.metrics!.modelCalls, 1);
    assert.equal(library.io.reads, initialReads);
    assert.deepEqual(
      p.generation!.metrics!.stages.find((s) => s.role === "designer")!.skills,
      ["designer-visual-design"],
    );
    const factsFile = path.join(
      root,
      "skills/analyst-information-extraction/SKILL.md",
    );
    await writeFile(
      factsFile,
      (await readFile(factsFile, "utf8")) +
        "\nPreserve supplied legal scope.\n",
    );
    library.invalidate();
    const count = seen.length;
    await run("修改标题颜色");
    assert.deepEqual(seen.slice(count), ["analyst", "designer"]);
    assert.equal(p.generation!.metrics!.modelCalls, 2);
    assert.equal(p.generation!.metrics!.fullPageWrites, 0);
    // Unrelated website-type guidance must not cause the same local edit to regenerate.
    const editorial = path.join(root, "skills/designer-editorial/SKILL.md");
    await writeFile(
      editorial,
      (await readFile(editorial, "utf8")) + "\nKeep article timestamps.\n",
    );
    library.invalidate();
    await run("修改标题颜色");
    assert.equal(p.generation!.metrics!.modelCalls, 0);
    const designFile = path.join(
      root,
      "skills/designer-visual-design/SKILL.md",
    );
    await writeFile(
      designFile,
      (await readFile(designFile, "utf8")) + "\nRetain baseline alignment.\n",
    );
    library.invalidate();
    const before = seen.length;
    await run("修改标题颜色");
    assert.deepEqual(seen.slice(before), ["designer"]);
    assert.equal(p.generation!.metrics!.modelCalls, 1);
    assert.equal(p.generation!.metrics!.fullPageWrites, 0);
    assert.equal(p.generation!.metrics!.sourceReads, 0);
  } finally {
    library.close();
    await removeProject(p.id);
    await rm(root, { recursive: true, force: true });
  }
});

test("explicit adapted Skills reach only Designer and preserve three-stage generation and one-call patch editing", async () => {
  const p = await create();
  const names = ["designer-impeccable", "designer-3d-transforms"];
  const prefix = names.map((name) => `/skill:${name}`).join(" ");
  const designerSelections: string[][] = [];
  const streamFn: StreamFn = (model, context) => {
    const sys = getCurrentSystemMessage(context.messages)!;
    const prompt =
      typeof sys.content === "string"
        ? sys.content
        : sys.content.map((part) => part.text).join("\n");
    if (prompt.includes("# Orchestrator")) {
      assert.ok(!prompt.includes("<skill name="));
      return answer(model, "submit_intent", brief);
    }
    if (prompt.includes("# Analyst")) {
      assert.ok(!prompt.includes('name="designer-impeccable"'));
      return answer(model, "submit_facts", {
        summary: "Fixture",
        facts: [],
        limitations: [],
      });
    }
    const selected = [...prompt.matchAll(/<skill name="([^"]+)"/g)].map(
      (match) => match[1],
    );
    assert.deepEqual(selected, names);
    designerSelections.push(selected);
    assert.ok(
      !prompt.includes("designer-visual-design"),
      "no implicit visual baseline in an explicit experiment",
    );
    assert.ok(
      !prompt.includes("# Upstream depth tokens in readable form"),
      "references are still deferred",
    );
    const tools = (sys.toolsAdded || []).map((tool) => tool.name);
    if (tools.includes("page_patch"))
      return answer(model, "page_patch", {
        baseVersionId: p.versions.at(-1)!.id,
        operations: [
          { selector: "#title", action: "set_text", value: "Edited" },
        ],
      });
    return answer(model, "submit_page", { html, usedFactIds: [] });
  };
  try {
    await runProject(
      p,
      requestSchema.parse({ text: prefix + " 生成公司官网，具有明显空间动效" }),
      save,
      () => {},
      { config, streamFn },
    );
    assert.equal(p.status, "complete", p.error);
    assert.equal(p.generation!.metrics!.modelCalls, 3);
    assert.deepEqual(
      p.generation!.metrics!.stages.find((stage) => stage.role === "designer")!
        .skills,
      names,
    );
    await runProject(
      p,
      requestSchema.parse({ text: prefix + " 把标题改成 Edited" }),
      save,
      () => {},
      { config, streamFn },
    );
    assert.equal(p.status, "complete", p.error);
    assert.equal(p.generation!.metrics!.modelCalls, 1);
    assert.equal(p.generation!.metrics!.fullPageWrites, 0);
    assert.equal(p.generation!.metrics!.sourceReads, 0);
    assert.equal(designerSelections.length, 2);
  } finally {
    await removeProject(p.id);
  }
});

test("explicit fact selection updates publish associations atomically, support none, and reject stale versions", async () => {
  const p = await create();
  let selection: string[] = ["a", "b"];
  let reject = false;
  const streamFn: StreamFn = (model, context) => {
    const sys = getCurrentSystemMessage(context.messages)!;
    const names = (sys.toolsAdded || []).map((t) => t.name);
    if (names.includes("submit_intent"))
      return answer(model, "submit_intent", brief);
    if (names.includes("submit_facts"))
      return answer(model, "submit_facts", {
        summary: "Synthetic facts",
        limitations: [],
        facts: ["a", "b"].map((id) => ({
          id,
          text: `Fact ${id}`,
          sourceId: "user",
          assetIds: [],
        })),
      });
    if (reject)
      return answer(model, "page_patch", {
        baseVersionId: p.versions.at(-1)!.id,
        usedFactIds: ["missing"],
        operations: [
          { selector: "#details", action: "set_text", value: "Rejected" },
        ],
      });
    if (names.includes("page_patch"))
      return answer(model, "page_patch", {
        baseVersionId: p.versions.at(-1)!.id,
        usedFactIds: selection,
        operations: [
          {
            selector: "#details",
            action: "set_text",
            value:
              selection.map((id) => `Fact ${id}`).join(" ") ||
              "No selected facts",
          },
        ],
      });
    return answer(model, "submit_page", { html, usedFactIds: selection });
  };
  const run = (extra = {}) =>
    runProject(
      p,
      requestSchema.parse({ text: "Apply exact selected facts", ...extra }),
      save,
      () => {},
      { config, streamFn },
    );
  try {
    await run();
    assert.equal(p.status, "complete", p.error);
    const original = p.versions.at(-1)!;
    assert.deepEqual(original.appliedFactIds, ["a", "b"]);
    selection = ["b"];
    await run({
      updateFacts: true,
      selectedFactIds: selection,
      baseVersionId: original.id,
    });
    assert.equal(p.status, "complete", p.error);
    assert.equal(p.generation!.metrics!.modelCalls, 1);
    assert.equal(p.generation!.metrics!.fullPageWrites, 0);
    assert.deepEqual(p.versions.at(-1)!.appliedFactIds, ["b"]);
    assert.deepEqual(original.appliedFactIds, ["a", "b"]);
    projects.delete(p.id);
    assert.deepEqual((await get(p.id)).versions.at(-1)!.appliedFactIds, ["b"]);
    const before = p.versions.length;
    await run({
      updateFacts: true,
      selectedFactIds: [],
      baseVersionId: original.id,
    });
    assert.equal(p.status, "error");
    assert.equal(p.generation!.metrics!.modelCalls, 0);
    assert.equal(p.versions.length, before);
    reject = true;
    await run({
      updateFacts: true,
      selectedFactIds: [],
      baseVersionId: p.versions.at(-1)!.id,
    });
    assert.equal(p.status, "error");
    assert.deepEqual(p.versions.at(-1)!.appliedFactIds, ["b"]);
    assert.equal(p.versions.length, before);
    reject = false;
    selection = [];
    await run({
      updateFacts: true,
      selectedFactIds: [],
      baseVersionId: p.versions.at(-1)!.id,
    });
    assert.equal(p.status, "complete", p.error);
    assert.deepEqual(p.versions.at(-1)!.appliedFactIds, []);
    assert.match(p.versions.at(-1)!.html, /No selected facts/);
    assert.equal(p.generation!.metrics!.modelCalls, 1);
  } finally {
    await removeProject(p.id);
  }
});

test("experiment observer preserves a rejected terminal call followed by successful recovery", async () => {
  const p = await create();
  const events: { role: string; event: any }[] = [];
  let designerCalls = 0;
  try {
    await runProject(
      p,
      requestSchema.parse({ text: "生成品牌官网" }),
      save,
      () => {},
      {
        config,
        skills: false,
        onAgentEvent: (role, event) => {
          events.push({ role, event });
        },
        streamFn: (model, context) => {
          const names = getCurrentSystemMessage(
            context.messages,
          )!.toolsAdded!.map((t) => t.name);
          if (names.includes("submit_intent"))
            return answer(model, "submit_intent", brief);
          if (names.includes("submit_facts"))
            return answer(model, "submit_facts", {
              summary: "No source facts",
              facts: [],
              limitations: [],
            });
          designerCalls++;
          if (designerCalls === 1) return answer(model, "submit_page", {});
          return answer(model, "submit_page", {
            html,
            usedFactIds: designerCalls === 2 ? ["not-a-valid-fact"] : [],
          });
        },
      },
    );
    assert.equal(p.status, "complete");
    assert.equal(p.generation?.metrics?.modelCalls, 5);
    const results = events.filter(
      (e) => e.role === "designer" && e.event.type === "tool_execution_end",
    );
    assert.deepEqual(
      results.map((e) => e.event.isError),
      [true, true, false],
    );
    assert.match(JSON.stringify(results[1]), /无效的事实 ID/);
    const starts = events.filter(
      (e) =>
        e.event.type === "tool_execution_start" &&
        e.event.toolName === "submit_page",
    );
    assert.equal(starts[0].event.args.html, undefined);
    assert.equal(
      events.filter(
        (e) =>
          e.event.type === "tool_execution_start" &&
          e.event.toolName === "submit_page",
      ).length,
      3,
    );
  } finally {
    await removeProject(p.id);
  }
});

test("Designer receives declared core references in the initial call without an extra read round", async () => {
  const p = await create();
  let calls = 0;
  try {
    await runProject(
      p,
      requestSchema.parse({
        text: "/skill:designer-3d-transforms Create a spatial showcase",
      }),
      save,
      () => {},
      {
        config,
        streamFn: (model, context) => {
          calls++;
          const sys = getCurrentSystemMessage(context.messages)!;
          const prompt =
            typeof sys.content === "string"
              ? sys.content
              : sys.content.map((c) => c.text).join("\n");
          if (prompt.includes("# Orchestrator"))
            return answer(model, "submit_intent", brief);
          if (prompt.includes("# Analyst"))
            return answer(model, "submit_facts", {
              summary: "No source facts",
              facts: [],
              limitations: [],
            });
          assert.match(prompt, /# Build a coherent 3D stage/);
          assert.match(prompt, /width:min\(100%, 560px\)/);
          assert.doesNotMatch(
            prompt,
            /# Upstream depth tokens in readable form/,
          );
          return answer(model, "submit_page", { html, usedFactIds: [] });
        },
      },
    );
    assert.equal(p.status, "complete", p.error);
    assert.equal(calls, 3);
    assert.equal(p.generation!.metrics!.skillReads, 0);
    assert.deepEqual(p.generation!.metrics!.stages.at(-1)!.skillReferences, [
      "designer-3d-transforms/references/spatial-patterns.md",
    ]);
  } finally {
    await removeProject(p.id);
  }
});
