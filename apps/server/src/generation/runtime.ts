import {
  Agent,
  type AgentTool,
  type StreamFn,
} from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import type {
  Project,
  Role,
  RunEvent,
  Clarification,
} from "../../../../packages/shared/project.js";
import type { RuntimeConfig } from "../../../../packages/shared/config.js";
import { projectDir } from "../store.js";
import { runtimeConfig } from "../config.js";
import { readCanonicalSource } from "../source-content.js";
import { validatePage } from "../page-validation.js";
import { pageChecks } from "../page-checks.js";
import {
  intentSchema,
  analysisSchema,
  requestSchema,
  type Intent,
  type Analysis,
  type GenerationRequest,
} from "../../../../packages/shared/generation.js";
import {
  hash,
  loadArtifact,
  persistArtifact,
  factsMarkdown,
} from "./artifacts.js";
import { applyPagePatch } from "./page-patch.js";
import { skillLibrary, selectSkills, type SkillLibrary } from "./skills.js";
import { modelRuntime } from "./model.js";

class ModelRequestError extends Error {
  constructor(
    message: string,
    public details: NonNullable<RunEvent["details"]>,
  ) {
    super(message);
  }
}

export const activeRuns = new Map<string, AbortController>();
const roleNames = {
  orchestrator: "正在理解用户意图",
  analyst: "正在从 Markdown 提取信息事实",
  designer: "正在设计并生成页面",
};
const strings = Type.Array(Type.String());
const intentParams = Type.Object({
  goal: Type.String(),
  audience: Type.String(),
  content: strings,
  features: strings,
  design: strings,
  constraints: strings,
});
const factsParams = Type.Object({
  summary: Type.String(),
  facts: Type.Array(
    Type.Object({
      id: Type.String(),
      text: Type.String(),
      sourceId: Type.String(),
      assetIds: Type.Optional(strings),
    }),
  ),
  limitations: strings,
});
const patchParams = Type.Object({
  usedFactIds: Type.Optional(Type.Array(Type.String())),
  baseVersionId: Type.String(),
  operations: Type.Array(
    Type.Object({
      selector: Type.String(),
      action: Type.Union(
        [
          "set_text",
          "set_attribute",
          "set_style",
          "replace_html",
          "append_html",
          "remove",
        ].map((v) => Type.Literal(v)),
      ),
      name: Type.Optional(Type.String()),
      value: Type.Optional(Type.String()),
    }),
  ),
});
const questionParams = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 2000 }),
  options: Type.Optional(
    Type.Array(Type.Object({ id: Type.String(), label: Type.String() }), {
      minItems: 2,
      maxItems: 12,
    }),
  ),
});
function tool(
  name: string,
  description: string,
  parameters: AgentTool["parameters"],
  execute: (args: any) => Promise<unknown>,
  terminal = false,
): AgentTool {
  return {
    name,
    label: name,
    description,
    parameters,
    executionMode: terminal ? "sequential" : "parallel",
    execute: async (_id, args, signal) => {
      signal?.throwIfAborted();
      const value = await execute(args);
      return {
        content: [
          {
            type: "text",
            text: typeof value === "string" ? value : JSON.stringify(value),
          },
        ],
        details: {},
        terminate: terminal,
      };
    },
  };
}
export interface RunOptions {
  config?: RuntimeConfig;
  /** Test seam only; production always uses Pi's public provider collection. */
  streamFn?: StreamFn;
  promptDir?: string;
  resume?: boolean;
  /** Offline comparison seam; production always enables the project Skills. */
  skills?: SkillLibrary | false;
}
export function runProject(
  project: Project,
  request: GenerationRequest,
  save: (p: Project) => Promise<void>,
  emit: (e: RunEvent) => void,
  options: RunOptions = {},
) {
  if (activeRuns.has(project.id))
    throw new Error("该项目正在生成，请先停止或等待完成");
  request = requestSchema.parse(request);
  const controller = new AbortController();
  activeRuns.set(project.id, controller);
  return execute(project, request, save, emit, controller, options).finally(
    () => activeRuns.delete(project.id),
  );
}
async function execute(
  p: Project,
  request: GenerationRequest,
  save: (p: Project) => Promise<void>,
  emit: (e: RunEvent) => void,
  controller: AbortController,
  options: RunOptions,
) {
  const started = performance.now();
  const cfg = options.config || runtimeConfig();
  const state = (p.generation ||= {});
  const metrics = (state.metrics = {
    elapsedMs: 0,
    modelCalls: 0,
    sourceReads: 0,
    artifactWrites: 0,
    patchOperations: 0,
    fullPageWrites: 0,
    inputTokens: 0,
    outputTokens: 0,
    skillCharacters: 0,
    skillLoads: 0,
    skillReads: 0,
    stages: [] as NonNullable<
      NonNullable<Project["generation"]>["metrics"]
    >["stages"],
  });
  function event(
    role: Role | "system",
    text: string,
    kind: RunEvent["kind"] = "status",
    details?: RunEvent["details"],
  ) {
    const e: RunEvent = {
      id: crypto.randomUUID(),
      role,
      text,
      kind,
      details,
      time: new Date().toISOString(),
    };
    p.events.push(e);
    emit(e);
  }
  const requestHash = hash(JSON.stringify(request));
  p.status = "running";
  state.pending = request;
  const newInformation =
    /^(?:新增事实|补充事实|新增信息|补充信息|更新事实|new facts?:|additional information:)/i.test(
      request.text,
    );
  if (!options.resume && (request.refreshFacts || newInformation))
    delete state.factsRefreshRequest;
  delete p.error;
  try {
    await save(p);
    if (cfg.mode === "demo")
      throw new Error(
        "演示模式不调用模型。请切换实时模式并配置模型后生成页面。",
      );
    const prompts = Object.fromEntries(
      await Promise.all(
        (["orchestrator", "analyst", "designer"] as const).map(async (role) => [
          role,
          await readFile(
            path.join(
              options.promptDir || path.resolve("config/agents"),
              role + ".md",
            ),
            "utf8",
          ),
        ]),
      ),
    ) as Record<Role, string>;
    const profile = (role: Role) =>
      role === "orchestrator"
        ? cfg.models.reasoning
        : cfg.models[role] || cfg.models.reasoning;
    const library =
      options.skills === false ? undefined : options.skills || skillLibrary;
    const skillCatalog = library ? (await library.catalog()).skills : [];
    for (const match of request.text.matchAll(/\/skill:([a-z0-9-]+)/g))
      if (!skillCatalog.some((s) => s.name === match[1]))
        throw new Error("Skill 不存在：" + match[1]);
    const analystSkills = library
      ? selectSkills(
          "analyst",
          { text: request.text, editing: false },
          skillCatalog,
        )
      : [];
    const analystSignature = library
      ? await library.signature("analyst", analystSkills)
      : "";
    const existingPage = p.versions.at(-1);
    const redesign =
      request.mode === "redesign" ||
      /(?:整体重设计|整体重新设计|推倒重做|重新设计整个|full redesign|redesign (?:the whole|entire))/i.test(
        request.text,
      );
    const editing = Boolean(existingPage) && !redesign;
    if (
      request.updateFacts &&
      (!existingPage ||
        !request.selectedFactIds ||
        request.baseVersionId !== existingPage.id)
    )
      throw new Error("页面版本已变化，请重新加载后更新事实");
    const immediateDuplicate =
      state.completed?.requestHash === requestHash &&
      state.completed.versionId === existingPage?.id;
    let designerSkills =
      immediateDuplicate && state.completed?.skills
        ? state.completed.skills.designer
        : library
          ? selectSkills(
              "designer",
              { text: request.text, brief: p.brief, editing },
              skillCatalog,
            )
          : [];
    let designerSignature = library
      ? await library.signature("designer", designerSkills)
      : "";
    const policy = (role: Role) =>
      hash(
        prompts[role] +
          JSON.stringify(profile(role)) +
          (role === "analyst"
            ? analystSignature
            : role === "designer"
              ? designerSignature
              : ""),
      );
    const documents = await Promise.all(
      p.sources.map(async (source) => ({
        source,
        document: await readCanonicalSource(p.id, source),
      })),
    );
    // Hash already-verified Markdown, not display previews or original uploads.
    const sourceKey = hash(
      documents
        .map(({ source, document }) => `${source.id}:${document.hash}`)
        .join("|"),
    );
    let dependenciesKey = hash(
      sourceKey +
        (["orchestrator", "analyst", "designer"] as const)
          .map(policy)
          .join("|"),
    );
    if (
      state.completed?.requestHash === requestHash &&
      state.completed.dependenciesKey === dependenciesKey &&
      state.completed.versionId === p.versions.at(-1)?.id &&
      !request.refreshFacts &&
      !options.resume
    ) {
      p.status = "complete";
      delete state.pending;
      event("system", "相同请求已有保存版本，直接复用");
      return;
    }
    state.pending = request;
    p.status = "running";
    delete p.error;
    p.run = { id: crypto.randomUUID(), checkpoints: {} };
    await save(p);
    const catalog = documents.map(({ source }) => ({
      id: source.id,
      name: source.name,
      format: source.format,
      assets: source.assets,
    }));
    async function roleRun(
      role: Role,
      input: string,
      tools: AgentTool[],
      submitted: () => boolean,
    ) {
      controller.signal.throwIfAborted();
      p.run!.activeRole = role;
      event(role, roleNames[role]);
      await save(p);
      const names =
        role === "analyst"
          ? analystSkills
          : role === "designer"
            ? designerSkills
            : [];
      const skillStart = performance.now();
      const prepared =
        library && names.length
          ? await library.prepare(role, names)
          : { prompt: "", names: [], characters: 0 };
      const skillMs = Math.round(performance.now() - skillStart);
      metrics.skillCharacters += prepared.characters;
      metrics.skillLoads += prepared.names.length;
      if (prepared.names.length)
        event(role, "已加载 " + prepared.names.join(", "), "skill", {
          skillCharacters: prepared.characters,
        });
      // Expose Pi's native scoped reader only when this stage can benefit from Skills.
      if (library && role !== "orchestrator" && names.length)
        tools = [
          ...tools,
          library.reader(role, () => {
            metrics.skillReads++;
          }),
        ];
      const runtime = modelRuntime(profile(role));
      const stageStart = performance.now(),
        callStart = metrics.modelCalls;
      let turns = 0;
      let lastTool = "none",
        requestId = "",
        responseStatus = 0;
      const agent = new Agent({
        initialState: {
          systemPrompt:
            prompts[role] + (prepared.prompt ? "\n\n" + prepared.prompt : ""),
          model: runtime.model,
          thinkingLevel: runtime.thinkingLevel,
          tools,
        },
        streamFn: (model, context, opts) => {
          metrics.modelCalls++;
          return (options.streamFn || runtime.streamFn)(model, context, opts);
        },
        onResponse: (response) => {
          responseStatus = response.status;
          requestId =
            response.headers["x-request-id"] ||
            response.headers["request-id"] ||
            "";
        },
        sessionId: `${p.id}-${role}`,
        toolExecution: "sequential",
        finishTurn: ({ message }) => {
          turns++;
          if (
            message.stopReason === "error" ||
            message.stopReason === "aborted"
          )
            return;
          if (submitted()) return { action: "end" };
          if (turns >= 6) throw new Error(`${role} 未在 6 轮内提交有效结果`);
        },
      });
      agent.subscribe((event) => {
        if (
          event.type === "message_end" &&
          event.message.role === "assistant"
        ) {
          metrics.inputTokens += event.message.usage.input;
          metrics.outputTokens += event.message.usage.output;
        }
        if (event.type === "tool_execution_end") lastTool = event.toolName;
      });
      const abort = () => agent.abort();
      controller.signal.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(() => agent.abort(), 300000);
      try {
        await agent.prompt(input);
        controller.signal.throwIfAborted();
        if (agent.state.errorMessage) {
          const requestNumber = metrics.modelCalls - callStart;
          throw new ModelRequestError(
            `${role} 模型请求失败（${runtime.model.api}，第 ${requestNumber} 轮，最近工具：${lastTool}）：${agent.state.errorMessage}`,
            {
              api: runtime.model.api,
              model: runtime.model.id,
              requestNumber,
              lastTool,
              ...(responseStatus ? { httpStatus: responseStatus } : {}),
              ...(requestId ? { requestId } : {}),
            },
          );
        }
        if (!submitted())
          throw new Error(`${role} 未提交结果（可能超时或模型不支持工具调用）`);
      } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener("abort", abort);
        metrics.stages.push({
          role,
          skills: prepared.names,
          skillCharacters: prepared.characters,
          skillMs,
          reused: false,
          elapsedMs: Math.round(performance.now() - stageStart),
          modelCalls: metrics.modelCalls - callStart,
        });
      }
    }
    function reused(role: Role) {
      metrics.stages.push({ role, reused: true, elapsedMs: 0, modelCalls: 0 });
      event(role, "复用已保存的 Markdown 结果");
    }
    let intent = await loadArtifact(p.id, "intent", state.intent);
    const intentChanged =
      request.mode === "intent" ||
      (request.mode === "auto" &&
        /(?:目标受众|目标客户|网站目标|改为.*(?:官网|商城|活动页)|target audience|change.*(?:purpose|audience))/i.test(
          request.text,
        ));
    const intentPolicy = policy("orchestrator");
    if (
      !intent ||
      (intentChanged &&
        state.intent?.key !== hash(intentPolicy + request.text)) ||
      state.intentPolicy !== intentPolicy
    ) {
      let value: Intent | undefined, question: Clarification | undefined;
      await roleRun(
        "orchestrator",
        `# Request\n${request.text}\n\n# Existing brief\n${intent?.markdown || "None"}\n\n# Source inventory\n${JSON.stringify(catalog.map(({ assets: _, ...s }) => s))}\n\n# User answers\n${JSON.stringify(p.questions?.filter((q) => q.answeredAt).map((q) => ({ question: q.title, answer: q.answer })) || [])}`,
        [
          tool(
            "submit_intent",
            "Submit the intent brief; host persists Markdown and ends the stage",
            intentParams,
            async (args) => {
              if (value || question) throw new Error("只能提交一个阶段结果");
              value = intentSchema.parse(args);
              return "Intent accepted";
            },
            true,
          ),
          tool(
            "ask_user",
            "Ask only a materially blocking question, then suspend",
            questionParams,
            async (args) => {
              if (value || question) throw new Error("只能提交一个阶段结果");
              if (
                args.options &&
                new Set(args.options.map((o: any) => o.id)).size !==
                  args.options.length
              )
                throw new Error("选项 ID 重复");
              question = {
                id: crypto.randomUUID(),
                title: args.title,
                mode: args.options ? "single" : "text",
                options: args.options || [],
                createdAt: new Date().toISOString(),
              };
              return "Waiting for user";
            },
            true,
          ),
        ],
        () => Boolean(value || question),
      );
      if (question) {
        p.questions = [
          ...(p.questions || []).filter((q) => q.answeredAt),
          question,
        ];
        p.messages.push({
          role: "assistant",
          text: question.title,
          time: question.createdAt,
        });
        p.status = "needs_input";
        event("orchestrator", "等待关键问题的回答");
        return;
      }
      const saved = await persistArtifact(
        p.id,
        "intent",
        hash(intentPolicy + request.text),
        value!,
      );
      state.intent = saved.ref;
      state.intentPolicy = intentPolicy;
      intent = saved;
      p.brief = value;
      metrics.artifactWrites += saved.written ? 1 : 0;
    } else reused("orchestrator");
    p.run!.checkpoints.orchestrator = { completedAt: new Date().toISOString() };
    const brief = intent!.data as Intent;
    const factsKey = hash(
      policy("analyst") +
        sourceKey +
        JSON.stringify([brief.goal, brief.content]),
    );
    let facts = await loadArtifact(p.id, "facts", state.facts);
    if (
      !facts ||
      state.facts?.key !== factsKey ||
      ((request.refreshFacts || newInformation) &&
        state.factsRefreshRequest !== requestHash)
    ) {
      let value: Analysis | undefined;
      let remaining = 120000;
      const excerpts = documents
        .map(({ source, document }) => {
          const count = Math.min(remaining, document.markdown.length);
          remaining -= count;
          return `## ${source.id}: ${source.name}\nCoverage: 0..${count} / ${document.markdown.length} characters\n${document.markdown.slice(0, count)}`;
        })
        .join("\n\n");
      const userStatements = p.messages
        .filter((m) => m.role === "user")
        .slice(-20)
        .map((m) => m.text);
      if (userStatements.at(-1) !== request.text)
        userStatements.push(request.text);
      await roleRun(
        "analyst",
        `${intent!.markdown}\n\n# Explicit user statements\n${userStatements.join("\n\n").slice(-60000)}\n\n# Catalog\n${JSON.stringify(catalog)}\n\n# Canonical Markdown\n${excerpts || "No uploaded documents. Do not invent business facts."}`,
        [
          tool(
            "source_read",
            "Read an additional range from a canonical source Markdown",
            Type.Object({
              sourceId: Type.String(),
              offset: Type.Integer({ minimum: 0 }),
              limit: Type.Integer({ minimum: 1, maximum: 30000 }),
            }),
            async ({ sourceId, offset, limit }) => {
              const doc = documents.find(
                (d) => d.source.id === sourceId,
              )?.document;
              if (!doc) throw new Error("资料不存在");
              metrics.sourceReads++;
              return {
                markdown: doc.markdown.slice(offset, offset + limit),
                nextOffset: Math.min(offset + limit, doc.markdown.length),
                total: doc.markdown.length,
              };
            },
          ),
          tool(
            "submit_facts",
            "Submit facts and optional media associations; no independent tracing pass",
            factsParams,
            async (args) => {
              if (value) throw new Error("事实已经提交");
              const data = analysisSchema.parse(args);
              if (
                new Set(data.facts.map((f) => f.id)).size !== data.facts.length
              )
                throw new Error("事实 ID 必须唯一");
              for (const fact of data.facts) {
                const source = p.sources.find((s) => s.id === fact.sourceId);
                if (fact.sourceId !== "user" && !source)
                  throw new Error("事实使用了未知资料 ID");
                if (
                  fact.assetIds.some(
                    (id) => !source?.assets.some((a) => a.id === id),
                  )
                )
                  throw new Error("事实素材不属于其资料");
              }
              value = data;
              return "Facts accepted";
            },
            true,
          ),
        ],
        () => Boolean(value),
      );
      const saved = await persistArtifact(p.id, "facts", factsKey, value!);
      state.facts = saved.ref;
      if (request.refreshFacts || newInformation)
        state.factsRefreshRequest = requestHash;
      facts = saved;
      p.analysis = value;
      metrics.artifactWrites += saved.written ? 1 : 0;
    } else reused("analyst");
    p.brief = brief;
    p.analysis = facts!.data;
    p.run!.checkpoints.analyst = { completedAt: new Date().toISOString() };
    await save(p);
    const analysis = facts!.data as Analysis;
    const selected = request.selectedFactIds;
    if (selected?.some((id) => !analysis.facts.some((f) => f.id === id)))
      throw new Error("选定事实已失效，请刷新事实列表");
    const chosen = selected
      ? {
          ...analysis,
          facts: analysis.facts.filter((f) => selected.includes(f.id)),
        }
      : analysis;
    designerSkills = library
      ? selectSkills(
          "designer",
          { text: request.text, brief, editing },
          skillCatalog,
        )
      : [];
    designerSignature = library
      ? await library.signature("designer", designerSkills)
      : "";
    dependenciesKey = hash(
      sourceKey +
        (["orchestrator", "analyst", "designer"] as const)
          .map(policy)
          .join("|"),
    );
    let accepted:
      | {
          html: string;
          checks: ReturnType<typeof pageChecks>;
          operations: number;
          appliedFactIds?: string[];
        }
      | undefined;
    async function accept(
      html: string,
      operations: number,
      usedFactIds?: string[],
    ) {
      if (usedFactIds?.some((id) => !analysis.facts.some((f) => f.id === id)))
        throw new Error("页面引用了无效的事实 ID");
      if (
        request.updateFacts &&
        (!usedFactIds ||
          new Set(usedFactIds).size !== new Set(selected).size ||
          usedFactIds.some((id) => !selected!.includes(id)))
      )
        throw new Error(
          "页面采用的事实必须与本次选择完全一致，请补充所选事实并移除取消勾选的事实",
        );
      if (accepted) throw new Error("页面已经提交");
      controller.signal.throwIfAborted();
      const report = await validatePage(p, html);
      if (!report.valid)
        throw new Error(
          "页面结构需要修正：" +
            JSON.stringify(report.issues.filter((i) => i.severity === "error")),
        );
      accepted = {
        html: report.html,
        checks: pageChecks(p, report.html, report.issues),
        operations,
        appliedFactIds: usedFactIds
          ? [...new Set(usedFactIds)]
          : existingPage?.appliedFactIds,
      };
      return "Page accepted; no follow-up call needed";
    }
    const current = existingPage?.html || "";
    const large = current.length > 100000;
    const $ = cheerio.load(current);
    const pageContext = large
      ? `Large page; use page_read for needed sections.\n${$("style")
          .toArray()
          .map((e) => $(e).toString())
          .join("\n")
          .slice(0, 20000)}\n${$("[id]")
          .toArray()
          .map((e) => `${e.tagName}#${$(e).attr("id")}`)
          .join("\n")
          .slice(0, 15000)}`
      : current;
    const tools: AgentTool[] = [];
    if (
      profile("designer").vision &&
      catalog.some((s) => s.assets.some((a) => a.type === "image"))
    ) {
      tools.push({
        name: "asset_view",
        label: "asset_view",
        description:
          "Inspect a relevant project image only when visual information is needed; original bytes remain unchanged",
        parameters: Type.Object({ assetId: Type.String() }),
        execute: async (_id, args, signal) => {
          const { assetId } = args as { assetId: string };
          signal?.throwIfAborted();
          const asset = catalog
            .flatMap((s) => s.assets)
            .find((a) => a.id === assetId && a.type === "image");
          if (!asset || !/^image\/(png|jpeg|webp|gif)$/.test(asset.mime))
            throw new Error("图片不可用");
          const filename = path.join(
            projectDir(p.id),
            "assets",
            path.basename(asset.url),
          );
          if ((await stat(filename)).size > 4 * 1024 * 1024)
            throw new Error("图片超过 4 MB，请直接按素材引用使用");
          const buffer = await readFile(filename);
          signal?.throwIfAborted();
          return {
            content: [
              {
                type: "image",
                data: buffer.toString("base64"),
                mimeType: asset.mime,
              },
            ],
            details: {},
          };
        },
      });
    }
    if (existingPage)
      tools.push(
        tool(
          "page_read",
          "Read current page section/range without reconstructing the whole page",
          Type.Object({
            selector: Type.String(),
            offset: Type.Optional(Type.Integer({ minimum: 0 })),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 60000 })),
          }),
          async ({ selector, offset = 0, limit = 30000 }) => {
            const dom = $,
              node = dom(selector);
            if (node.length !== 1) throw new Error("选择器必须匹配一个元素");
            const html = node.toString();
            return {
              html: html.slice(offset, offset + limit),
              nextOffset: Math.min(offset + limit, html.length),
              total: html.length,
            };
          },
        ),
      );
    if (editing)
      tools.push(
        tool(
          "page_patch",
          "Apply minimal selector-based changes to the current version and finish",
          patchParams,
          async (args) => {
            const patch = applyPagePatch(p, args);
            return accept(patch.html, patch.operations, args.usedFactIds);
          },
          true,
        ),
      );
    else
      tools.push(
        tool(
          "submit_page",
          "Submit complete responsive inline HTML and finish",
          Type.Object({
            html: Type.String({ minLength: 20, maxLength: 2500000 }),
            usedFactIds: Type.Array(Type.String()),
          }),
          async ({ html, usedFactIds }) => accept(html, 0, usedFactIds),
          true,
        ),
      );
    await roleRun(
      "designer",
      `# Fact application\nReport usedFactIds in the terminal tool: IDs actually represented in the resulting page, including preserved content. ${request.updateFacts ? "EXACT selection update: use every selected fact and remove content relying on deselected facts. Preserve unrelated design and components. Empty selection means remove all fact-derived content, not use all facts." : "Preserve existing fact associations when editing; report changed associations accurately."}\n# Previously applied fact IDs\n${JSON.stringify(existingPage?.appliedFactIds || [])}\n# Mode\n${editing ? "edit" : existingPage ? "redesign" : "create"}\n\n# Request\n${request.text}\n\n${intent!.markdown}\n\n${selected ? factsMarkdown(chosen) : facts!.markdown}\n\n# Media catalog\n${JSON.stringify(catalog)}\n\n# Current baseVersionId\n${existingPage?.id || "none"}\n\n# Current page\n${pageContext || "None"}`,
      tools,
      () => Boolean(accepted),
    );
    controller.signal.throwIfAborted();
    if ((p.versions.at(-1)?.id || "") !== (existingPage?.id || ""))
      throw new Error("页面已更改，未覆盖现有版本");
    const result = accepted!;
    const versionId =
      result.html === existingPage?.html
        ? existingPage.id
        : crypto.randomUUID();
    if (versionId !== existingPage?.id) {
      p.versions.push({
        id: versionId,
        html: result.html,
        label: editing ? "局部调整" : "网站设计",
        createdAt: new Date().toISOString(),
        runId: p.run!.id,
        checks: result.checks,
        appliedFactIds: result.appliedFactIds,
      });
      metrics.patchOperations = result.operations;
      metrics.fullPageWrites = editing ? 0 : 1;
    }
    const appliedVersion = p.versions.find((v) => v.id === versionId);
    if (appliedVersion && result.appliedFactIds)
      appliedVersion.appliedFactIds = result.appliedFactIds;
    p.run!.checkpoints.designer = { completedAt: new Date().toISOString() };
    p.run!.completedVersionId = versionId;
    delete p.run!.activeRole;
    state.completed = {
      requestHash,
      versionId,
      dependenciesKey,
      skills: { analyst: analystSkills, designer: designerSkills },
    };
    delete state.pending;
    p.status = "complete";
    event(
      "designer",
      editing
        ? "局部调整完成，已复用现有设计与事实"
        : "网站设计完成，页面已保存",
    );
    p.messages.push({
      role: "assistant",
      text: `设计完成。${editing ? "已按请求局部更新，保留其他内容。" : "已根据意图简报和信息事实保存网页。"} 页面已通过结构与安全检查；未进行浏览器视觉预览。`,
      time: new Date().toISOString(),
    });
  } catch (error) {
    p.run ||= { id: crypto.randomUUID(), checkpoints: {} };
    p.status = controller.signal.aborted ? "cancelled" : "error";
    p.error = controller.signal.aborted
      ? "已停止生成，已有页面和阶段结果已保留。"
      : error instanceof Error
        ? error.message
        : String(error);
    event(
      p.run?.activeRole || "system",
      p.error,
      "error",
      error instanceof ModelRequestError ? error.details : undefined,
    );
  } finally {
    metrics.elapsedMs = Math.round(performance.now() - started);
    await save(p);
  }
}
