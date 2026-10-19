import { readFile } from "node:fs/promises";
import path from "node:path";
import matter from "./frontmatter.js";
import { designCompletion, usedImages } from "./design-result.js";
import { timeoutSetting, watchAgent } from "./watchdog.js";
import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { parseJSON, OutputFormatError } from "./structured-output.js";
export { parseJSON } from "./structured-output.js";
import { resolveModel } from "./models.js";
import { Type } from "@earendil-works/pi-ai";
import {
  ClarificationRequested,
  questionSchema,
  type QuestionInput,
} from "./questions.js";
import type { ImageContent } from "@earendil-works/pi-ai";
import { z } from "zod";
import { discoverSkillCatalog, skillTools, type Skill } from "./skills.js";
import type { Role, Project, RunEvent } from "./contracts.js";
import { projectTools } from "./tools.js";
import { readCandidate, validatePage } from "./pages.js";
import {
  readSourceText,
  readSourceTable,
} from "../../../apps/server/src/source-content.js";
import { sanitizeHtml } from "../../../apps/server/src/html.js";
const briefSchema = z.object({
  needsInput: z.boolean(),
  question: z
    .string()
    .max(2000)
    .nullish()
    .transform((value) => value || ""),
  title: z.string().max(200),
  brief: z.record(z.string(), z.unknown()),
});
const analysisSchema = z.object({
  summary: z.string(),
  facts: z.array(
    z.object({
      text: z.string(),
      sourceId: z.string(),
      evidence: z
        .discriminatedUnion("kind", [
          z.object({
            kind: z.literal("text"),
            start: z.number().int().nonnegative(),
            end: z.number().int().nonnegative(),
            quote: z.string().min(1).max(4000),
          }),
          z.object({
            kind: z.literal("cell"),
            tableIndex: z.number().int().nonnegative(),
            row: z.number().int().nonnegative(),
            column: z.number().int().nonnegative(),
            value: z.unknown(),
          }),
        ])
        .optional(),
    }),
  ),
  sections: z.array(z.object({ title: z.string(), content: z.string() })),
  assets: z.array(
    z.object({ url: z.string(), purpose: z.string(), sourceId: z.string() }),
  ),
  imageDecisions: z
    .array(
      z.object({
        assetId: z.string(),
        decision: z.enum(["use", "skip", "unverified"]),
        reason: z.string().min(1).max(1000),
      }),
    )
    .default([]),
  dataInsights: z.array(z.string()),
  limitations: z.array(z.string()),
});
function validationReason(error: unknown) {
  return (
    error instanceof z.ZodError
      ? error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")
      : error instanceof Error
        ? error.message
        : "未知校验错误"
  ).slice(0, 1200);
}
export const activeRuns = new Map<string, AbortController>();
export function mode() {
  return process.env.DREAMATIC_MODE === "demo" ? "demo" : "live";
}
export async function runProject(
  p: Project,
  save: (p: Project) => Promise<void>,
  emit: (event: RunEvent) => void,
) {
  if (activeRuns.has(p.id)) throw new Error("项目正在运行");
  const controller = new AbortController();
  activeRuns.set(p.id, controller);
  p.status = "running";
  delete p.error;
  const add = (
    role: Role | "system",
    text: string,
    kind: RunEvent["kind"] = "status",
    details?: RunEvent["details"],
  ) => {
    const e = {
      id: crypto.randomUUID(),
      role,
      text,
      kind,
      time: new Date().toISOString(),
      ...(details ? { details } : {}),
    };
    p.events.push(e);
    emit(e);
  };
  let skills: Skill[] = [];
  async function call(
    role: Role,
    input: unknown,
    images: ImageContent[] = [],
    options: {
      validate?: (text: string) => unknown | Promise<unknown>;
      repairOnly?: boolean;
    } = {},
  ) {
    if (controller.signal.aborted) throw new Error("已停止生成");
    add(
      role,
      {
        orchestrator: "正在理解需求并对齐设计目标",
        analyst: "正在分析来源、提取关键信息和媒体",
        designer: "正在设计界面并生成响应式页面",
      }[role],
    );
    const [shared, rolePrompt] = await Promise.all([
      readFile(path.resolve(".pi/APPEND_SYSTEM.md"), "utf8"),
      readFile(path.resolve(".pi/agents", role + ".md"), "utf8"),
    ]);
    const prompt = shared + "\n" + matter(rolePrompt).content;
    const { models, model } = resolveModel(role);
    if (images.length && !model.input.includes("image"))
      add(role, "当前模型不支持图片输入，本阶段仅使用文本、表格和媒体元数据");
    let pendingQuestion: QuestionInput | undefined;
    let submitted: string | undefined;
    let submitting = false;
    const tools = skillTools(skills, role, (name) =>
      add(role, "已加载 " + name, "skill"),
    );
    tools.push(
      ...projectTools(p, role, {
        vision: model.input.includes("image"),
        signal: controller.signal,
        onUse: (name) => add(role, "工具：" + name),
      }),
    );
    if (options.repairOnly) tools.length = 0;
    if (role === "orchestrator" && !options.repairOnly)
      tools.push({
        name: "ask_user",
        label: "向用户提问",
        description:
          "Ask one blocking preference question, then pause the workflow until the user answers. Use only for unresolved intent; never ask users to summarize uploaded documents. Supports single/multiple choices and custom text.",
        parameters: Type.Object({
          title: Type.String(),
          mode: Type.Union([
            Type.Literal("single"),
            Type.Literal("multiple"),
            Type.Literal("text"),
          ]),
          options: Type.Array(
            Type.Object({ id: Type.String(), label: Type.String() }),
          ),
        }),
        execute: async (_id, args) => {
          if (submitted !== undefined || submitting)
            throw new Error("结果已提交或正在校验，不能继续提问");
          const question = questionSchema.parse(args);
          if (!pendingQuestion) pendingQuestion = question;
          return {
            content: [
              {
                type: "text",
                text: "Question accepted. The host is pausing this workflow. Do not continue or call another tool.",
              },
            ],
            details: { waitingForUser: true },
          };
        },
      });
    if (role !== "designer" && options.validate) {
      const schema = role === "orchestrator" ? briefSchema : analysisSchema;
      tools.push({
        name: "submit_result",
        label: "提交结构化结果",
        description:
          "Submit the final role result as typed arguments. The host validates fields and source evidence. A successful submission ends this stage; do not call other tools alongside or after it. If validation fails, correct the reported fields and resubmit.",
        parameters: z.toJSONSchema(schema, {
          target: "draft-7",
          io: "input",
        }) as AgentTool["parameters"],
        execute: async (_id, input, signal) => {
          controller.signal.throwIfAborted();
          signal?.throwIfAborted();
          if (pendingQuestion || submitted !== undefined || submitting)
            throw new Error("当前阶段已经提交、正在校验或正在等待用户回答");
          submitting = true;
          try {
            const payload = JSON.stringify(schema.parse(input));
            if (payload.length > 2500000) throw new Error("提交结果过长");
            await options.validate!(payload);
            controller.signal.throwIfAborted();
            signal?.throwIfAborted();
            if (submitted !== undefined) throw new Error("当前阶段已经提交");
            submitted = payload;
            return {
              content: [
                {
                  type: "text",
                  text: "Result accepted and verified. The host is ending this stage. Stop now.",
                },
              ],
              details: { accepted: true },
            };
          } catch (error) {
            add(role, "结构化提交未通过校验", "status", {
              validation: error instanceof Error ? error.name : "unknown",
              reason: validationReason(error),
            });
            throw error;
          } finally {
            submitting = false;
          }
        },
      });
    }
    const agent = new Agent({
      initialState: {
        systemPrompt:
          prompt +
          (options.repairOnly
            ? "\nFORMAT REPAIR ONLY: Do not investigate sources, load Skills, ask questions, or repeat analysis. Use the supplied original input and invalid output to correct structure. No research tools are available."
            : "") +
          "\nInstalled skills: " +
          JSON.stringify(
            (options.repairOnly ? [] : skills)
              .filter((s) => s.roles.includes(role))
              .map((s) => ({ name: s.name, description: s.description })),
          ),
        model,
        tools,
      },
      streamFn: models.streamSimple.bind(models),
    });
    const abort = () => agent.abort();
    let turns = 0;
    const maxTurns = options.repairOnly ? 3 : 16;
    const started = Date.now();
    const watchdog = watchAgent(
      {
        total: timeoutSetting(
          `DREAMATIC_${role.toUpperCase()}_TIMEOUT_MS`,
          timeoutSetting("DREAMATIC_AGENT_TIMEOUT_MS", 600000),
        ),
        first: timeoutSetting(
          "DREAMATIC_AGENT_FIRST_RESPONSE_TIMEOUT_MS",
          180000,
        ),
        idle: timeoutSetting("DREAMATIC_AGENT_IDLE_TIMEOUT_MS", 90000),
        tool: timeoutSetting("DREAMATIC_AGENT_TOOL_TIMEOUT_MS", 120000),
      },
      () => agent.abort(),
      (text) => {
        add(role, text);
        // Save only bounded progress events, never token content or tool arguments.
        void save(p).catch(() => {});
      },
    );
    controller.signal.addEventListener("abort", abort, { once: true });
    const unsubscribe = agent.subscribe((event) => {
      watchdog.event(event);
      if (
        event.type === "tool_execution_end" &&
        (pendingQuestion || submitted !== undefined)
      )
        agent.abort();
      if (event.type === "turn_start" && ++turns > maxTurns) agent.abort();
    });
    try {
      await agent.prompt(
        JSON.stringify(input),
        model.input.includes("image") ? images : [],
      );
      if (controller.signal.aborted) throw new Error("已停止生成");
      if (pendingQuestion) throw new ClarificationRequested(pendingQuestion);
      if (watchdog.error) throw watchdog.error;
      if (turns > maxTurns)
        throw new Error("智能体达到工具调用上限，请缩小任务后重试");
      if (submitted !== undefined) {
        add(role, "结构化结果已接收", "status", {
          stopReason: "submitted",
          outputCharacters: submitted.length,
          elapsedMs: Date.now() - started,
          turns,
          repairOnly: !!options.repairOnly,
        });
        return submitted;
      }
      const m = [...agent.state.messages]
        .reverse()
        .find((m) => m.role === "assistant");
      if (!m || m.role !== "assistant") throw new Error("模型没有返回结果");
      const text = m.content
        .filter((content) => content.type === "text")
        .map((content) => content.text)
        .join("\n");
      add(
        role,
        `模型输出结束（${Date.now() - started} ms，${turns} 轮），正在校验结果`,
        "status",
        {
          stopReason: m.stopReason,
          outputCharacters: text.length,
          elapsedMs: Date.now() - started,
          turns,
          repairOnly: !!options.repairOnly,
        },
      );
      if (m.stopReason === "error" || m.stopReason === "aborted")
        throw new Error(m.errorMessage || "模型调用失败");
      if (m.stopReason === "length")
        throw new Error(
          "模型输出达到长度上限，结果可能被截断，请缩小任务后重试",
        );
      return text;
    } catch (error) {
      if (controller.signal.aborted) throw new Error("已停止生成");
      if (pendingQuestion) throw new ClarificationRequested(pendingQuestion);
      if (submitted !== undefined && !watchdog.error) return submitted;
      throw watchdog.error ?? error;
    } finally {
      watchdog.close();
      unsubscribe();
      controller.signal.removeEventListener("abort", abort);
    }
  }
  async function validated<T>(
    role: Role,
    input: unknown,
    validate: (text: string) => T | Promise<T>,
    images: ImageContent[] = [],
  ): Promise<T> {
    const result = await call(role, input, images, {
      validate,
    });
    const pass = (value: T) => {
      add(role, "结果校验通过，阶段完成");
      return value;
    };
    try {
      return pass(await validate(result));
    } catch (error) {
      if (controller.signal.aborted) throw new Error("已停止生成");
      const repairOnly =
        error instanceof OutputFormatError || error instanceof z.ZodError;
      add(
        role,
        repairOnly
          ? "输出格式未通过，正在进行一次格式修复"
          : "输出验证未通过，正在进行一次定向修复",
        "status",
        {
          validation: error instanceof Error ? error.name : "unknown",
          reason: validationReason(error),
          repairOnly,
        },
      );
      const repaired = await call(
        role,
        {
          originalInput: input,
          invalidOutput: result.slice(0, 200000),
          outputWasClipped: result.length > 200000,
          repair: String(error).slice(0, 2000),
          instruction: repairOnly
            ? "Repair only the result format using the existing evidence and draft. Do not redo analysis or invent missing evidence. Prefer submit_result for structured roles. Return one complete corrected result."
            : "Correct the invalid fields or evidence. Follow the output contract and return a complete corrected result.",
        },
        repairOnly ? [] : images,
        { validate, repairOnly },
      );
      try {
        return pass(await validate(repaired));
      } catch (failure) {
        add(role, "结果校验仍未通过，任务已停止", "error", {
          validation: failure instanceof Error ? failure.name : "unknown",
          reason: validationReason(failure),
          repairOnly,
        });
        const reason = validationReason(failure);
        throw new Error(
          `${{ orchestrator: "Orchestrator", analyst: "Document Analyst", designer: "Designer" }[role]} 结果校验失败，自动修复后仍未通过：${reason.slice(0, 1200)}`,
        );
      }
    }
  }

  try {
    const catalog = await discoverSkillCatalog();
    skills = catalog.skills;
    for (const warning of catalog.diagnostics) add("system", warning);
    await save(p);
    if (mode() === "demo") {
      add("orchestrator", "演示模式：使用本地示例流程，不调用语言模型");
      p.brief = { goal: p.messages.at(-1)?.text };
      add(
        "analyst",
        `已读取 ${p.sources.length} 份资料；演示不会进行模型语义分析`,
      );
      add("designer", "生成可编辑的演示页面");
      const { demoPage } = await import("./sample.js");
      p.versions.push({
        id: crypto.randomUUID(),
        html: sanitizeHtml(demoPage(p)),
        label: "演示版本 " + (p.versions.length + 1),
        createdAt: new Date().toISOString(),
      });
    } else {
      const sourceBudget = 100000;
      let remaining = sourceBudget;
      const sources = p.sources.map((s) => {
        const text = s.text.slice(0, Math.min(remaining, 25000));
        remaining -= text.length;
        return {
          ...s,
          text,
          textCoverage: {
            start: 0,
            end: text.length,
            storedLength: s.content?.textLength ?? s.text.length,
            complete: text.length === (s.content?.textLength ?? s.text.length),
          },
          tables: s.tables.slice(0, 20).map((t) => ({
            ...t,
            rows: t.rows.slice(0, 100).map((row) =>
              row.slice(0, 60).map((value) => {
                const cell =
                  typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value ?? "");
                const bounded = cell.slice(0, Math.min(remaining, 2000));
                remaining -= bounded.length;
                return bounded;
              }),
            ),
          })),
          warnings: [
            ...s.warnings,
            ...(s.tables.some((t) => t.rows.length > 100) ||
            s.tables.length > 20
              ? [
                  "模型表格上下文仅包含前 20 表、每表前 100 行，单元格也有预算限制",
                ]
              : []),
            ...(text.length < s.text.length
              ? ["模型上下文预算限制：此来源文本仅部分发送"]
              : []),
          ],
        };
      });
      const existing = p.versions.at(-1)?.html;
      const conversation = p.messages.slice(-16);
      const brief = await validated(
        "orchestrator",
        {
          conversation,
          previousBrief: p.brief,
          clarificationAnswers: (p.questions || []).filter((q) => q.answeredAt),
          sources: sources.map((s) => ({
            id: s.id,
            name: s.name,
            excerpt: s.text.slice(0, 6000),
            characters: s.text.length,
            warnings: s.warnings,
            instruction:
              "The Analyst receives the extracted document. Do not ask the user to summarize its contents.",
          })),
          existingHtml: existing?.slice(0, 60000),
        },
        (text) => {
          const result = briefSchema.parse(parseJSON(text));
          if (result.needsInput && !result.question.trim())
            throw new Error("needsInput=true requires a question");
          return result;
        },
      );
      p.brief = brief.brief;
      if (!p.titleEdited) p.title = brief.title.slice(0, 80) || p.title;
      if (brief.needsInput)
        throw new ClarificationRequested(
          questionSchema.parse({
            title: brief.question,
            mode: "text",
            options: [],
          }),
        );
      const images: ImageContent[] = [];
      const imageInputOrder: {
        position: number;
        sourceId: string;
        assetId: string;
        url: string;
        name: string;
      }[] = [];
      let imageBytes = 0;
      const imageCandidates = p.sources
        .flatMap((source) =>
          source.assets
            .filter((asset) => asset.type === "image")
            .map((asset) => ({ source, asset })),
        )
        .sort(
          (a, b) =>
            (b.asset.width || 0) * (b.asset.height || 0) -
            (a.asset.width || 0) * (a.asset.height || 0),
        );
      for (const { source, asset } of imageCandidates) {
        if (images.length >= 8) break;
        if (
          !asset.url.startsWith(`/assets/${p.id}/`) ||
          !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
            asset.mime,
          )
        )
          continue;
        try {
          const bytes = await readFile(
            path.resolve(
              process.env.DREAMATIC_WORKSPACE || "workspace",
              "projects",
              p.id,
              "assets",
              path.basename(asset.url),
            ),
          );
          if (
            bytes.length > 4 * 1024 * 1024 ||
            imageBytes + bytes.length > 12 * 1024 * 1024
          )
            continue;
          imageBytes += bytes.length;
          images.push({
            type: "image",
            data: bytes.toString("base64"),
            mimeType: asset.mime,
          });
          imageInputOrder.push({
            position: images.length,
            sourceId: source.id,
            assetId: asset.id,
            url: asset.url,
            name: asset.name,
          });
        } catch {}
      }
      if (imageCandidates.length)
        add(
          "analyst",
          `已提取 ${imageCandidates.length} 张资料图片，正在筛选页面素材`,
        );
      p.analysis = await validated(
        "analyst",
        {
          brief: brief.brief,
          sources,
          imageInputOrder,
          instruction:
            "Review document images as well as text. imageInputOrder maps visual inputs (only when vision is supported) to source/asset IDs. Select useful images in assets with specific placement/purpose. Use asset_inspect for additional images, and record imageDecisions with assetId, decision use/skip/unverified and reason. Do not infer unseen visual content; if no useful images can be confirmed, state why. Use supplied text and tables directly; textCoverage identifies exact supplied offsets and whether the full stored text is present. Do not reread supplied ranges. Use source_read/source_search/table_query/asset_inspect only for missing evidence or targeted verification. Cite exact locations for significant claims.",
        },
        async (text) => {
          const result = analysisSchema.parse(parseJSON(text));
          const ids = new Set(p.sources.map((s) => s.id));
          for (const fact of result.facts)
            if (!ids.has(fact.sourceId))
              throw new Error(`未知事实来源 sourceId: ${fact.sourceId}`);
          for (const fact of result.facts) {
            const source = p.sources.find((s) => s.id === fact.sourceId)!;
            const evidence = fact.evidence;
            if (!evidence) continue; // Legacy outputs remain supported, but are not location-verified.
            if (evidence.kind === "text") {
              if (
                evidence.end <= evidence.start ||
                evidence.end - evidence.start > 4000
              )
                throw new Error("Invalid evidence range");
              const actual = await readSourceText(
                p.id,
                source,
                evidence.start,
                evidence.end - evidence.start,
              );
              if (actual.text !== evidence.quote)
                throw new Error(
                  "Evidence quote does not match stored source text",
                );
            } else {
              const table = await readSourceTable(
                p.id,
                source,
                evidence.tableIndex,
              );
              if (
                JSON.stringify(table.rows[evidence.row]?.[evidence.column]) !==
                JSON.stringify(evidence.value)
              )
                throw new Error(
                  "Evidence cell does not match stored table value",
                );
            }
          }
          for (const asset of result.assets) {
            if (
              !p.sources.some(
                (s) =>
                  s.id === asset.sourceId &&
                  s.assets.some((a) => a.url === asset.url),
              )
            )
              throw new Error(`素材缺少有效来源: ${asset.url}`);
          }
          const sourceImages = p.sources
            .flatMap((s) => s.assets)
            .filter((a) => a.type === "image");
          const selectedImages = result.assets.filter((selected) =>
            sourceImages.some((a) => a.url === selected.url),
          );
          for (const decision of result.imageDecisions) {
            const asset = sourceImages.find((a) => a.id === decision.assetId);
            if (!asset)
              throw new Error("Image decision references unknown source image");
            if (
              decision.decision === "use" &&
              !selectedImages.some((a) => a.url === asset.url)
            )
              throw new Error(
                "Selected image must include a placement/purpose in assets",
              );
          }
          if (
            sourceImages.length &&
            !selectedImages.length &&
            !result.imageDecisions.length
          )
            throw new Error(
              "Review source images: recommend relevant images in assets, or record imageDecisions with reasons for skip/unverified. Do not silently omit all document images.",
            );
          return {
            ...result,
            facts: result.facts.map((fact) => ({
              ...fact,
              locationVerified: Boolean(fact.evidence),
            })),
          };
        },
        images,
      );
      await save(p);
      const html = await validated(
        "designer",
        {
          brief: brief.brief,
          analysis: p.analysis,
          imageInputOrder,
          instruction:
            "Use the analyst-recommended source images in the actual page (img with descriptive alt, or CSS background). Preserve user intent on revisions. Do not replace relevant supplied photos with generic placeholders. If analysis could not verify images, inspect them using asset_inspect before choosing.",
          conversation,
          existingHtml: existing,
          assets: p.sources.flatMap((s) => s.assets),
        },
        async (result) => {
          let raw = result
            .trim()
            .replace(/^```(?:html|json)?\s*/, "")
            .replace(/\s*```$/, "");
          if (raw.startsWith("{")) {
            const reference = z
              .object({ candidateId: z.string().uuid() })
              .parse(parseJSON(raw));
            raw = (await readCandidate(p, reference.candidateId)).html;
          }
          const report = await validatePage(p, raw);
          if (!report.valid)
            throw new Error(
              JSON.stringify(
                report.issues.filter((i) => i.severity === "error"),
              ),
            );
          const recommended = analysisSchema
            .parse(p.analysis)
            .assets.filter((selected) =>
              p.sources.some((s) =>
                s.assets.some(
                  (a) => a.type === "image" && a.url === selected.url,
                ),
              ),
            );
          if (
            recommended.length &&
            !usedImages(p, report.html).some((a) =>
              recommended.some((selected) => selected.url === a.url),
            )
          )
            throw new Error(
              "The page omitted all recommended document images. Include a relevant recommended image in img src or CSS background; preserve the user's requested design.",
            );
          return report.html;
        },
        images,
      );
      p.versions.push({
        id: crypto.randomUUID(),
        html,
        label: "生成版本 " + (p.versions.length + 1),
        createdAt: new Date().toISOString(),
      });
    }
    p.status = "complete";
    p.messages.push({
      role: "assistant",
      text: designCompletion(
        p,
        mode() === "demo",
        process.env.DREAMATIC_LANGUAGE || "zh",
      ),
      time: new Date().toISOString(),
    });
    add("orchestrator", "页面已保存，可预览与编辑");
    await save(p);
  } catch (error) {
    if (error instanceof ClarificationRequested && !controller.signal.aborted) {
      const createdAt = new Date().toISOString();
      (p.questions ||= []).push({
        ...error.question,
        id: crypto.randomUUID(),
        createdAt,
      });
      p.messages.push({
        role: "assistant",
        text: error.question.title,
        time: createdAt,
      });
      p.status = "needs_input";
      add("orchestrator", "等待你的回答，提交后将继续生成");
      await save(p);
      return;
    }
    p.status = controller.signal.aborted ? "cancelled" : "error";
    p.error = error instanceof Error ? error.message : String(error);
    for (const key of [
      process.env.DREAMATIC_API_KEY,
      process.env.DREAMATIC_ANALYST_API_KEY,
      process.env.DREAMATIC_DESIGNER_API_KEY,
      process.env.OPENAI_API_KEY,
      process.env.ANTHROPIC_API_KEY,
    ]) {
      if (key) p.error = p.error.split(key).join("[REDACTED]");
    }
    add("system", p.error, "error");
    await save(p);
  } finally {
    activeRuns.delete(p.id);
  }
}
