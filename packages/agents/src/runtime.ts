import { readFile } from "node:fs/promises";
import path from "node:path";
import matter from "./frontmatter.js";
import { designCompletion, usedImages } from "./design-result.js";
import { limitSetting, timeoutSetting, watchAgent } from "./watchdog.js";
import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { parseJSON, OutputFormatError } from "./structured-output.js";
export { parseJSON } from "./structured-output.js";
import {
  imageHandoff,
  recommendedImages,
  visualEvidenceSchema,
} from "./visual.js";
import { roles, checkRoleTools } from "./roles.js";
import { readSourceMarkdown } from "../../../apps/server/src/source-content.js";
import { boundedInput } from "./input.js";
import { taskFingerprint, stageFingerprint } from "./checkpoints.js";
import { businessOutput } from "./observations.js";
import { toolFailureSummary } from "./tool-errors.js";
import { pageChecks } from "./page-checks.js";
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
  evidenceSchema,
  EvidenceValidationError,
  validateFactEvidence,
} from "./evidence.js";
import { sanitizeHtml } from "../../../apps/server/src/html.js";
import { submissionBriefSchema } from "./brief.js";
const briefSchema = z.object({
  needsInput: z.boolean(),
  question: z
    .string()
    .max(2000)
    .nullish()
    .transform((value) => value || ""),
  title: z.string().max(200),
  brief: submissionBriefSchema,
});
const analysisSchema = z.object({
  summary: z.string(),
  facts: z.array(
    z.object({
      text: z.string(),
      sourceId: z.string(),
      evidence: evidenceSchema.optional(),
      assetIds: z.array(z.string().uuid()).max(3).optional(),
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
  visualEvidence: visualEvidenceSchema.optional(),
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
  options: { resume?: boolean } = {},
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
    add(role, roles[role].status);
    const [shared, rolePrompt] = await Promise.all([
      readFile(path.resolve(".pi/APPEND_SYSTEM.md"), "utf8"),
      readFile(path.resolve(".pi/agents", role + ".md"), "utf8"),
    ]);
    const parsedRole = matter(rolePrompt);
    const prompt = shared + "\n" + parsedRole.content;
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
          let payload: string | undefined;
          try {
            payload = JSON.stringify(schema.parse(input));
            if (payload.length > 2500000) throw new Error("提交结果过长");
            await options.validate!(payload);
            controller.signal.throwIfAborted();
            signal?.throwIfAborted();
            if (submitted !== undefined) throw new Error("当前阶段已经提交");
            submitted = payload;
            add(role, "结构化业务输出（校验通过）", "status", {
              ...businessOutput(p.events, payload),
              outputState: "accepted",
            });
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
            if (payload)
              add(role, "结构化业务输出（校验未通过）", "status", {
                ...businessOutput(p.events, payload),
                outputState: "rejected",
              });
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
    if (
      parsedRole.data.name !== roles[role].name ||
      parsedRole.data.can_spawn !== false
    )
      throw new Error(`Role metadata contract mismatch: ${role}`);
    if (!options.repairOnly)
      checkRoleTools(
        role,
        parsedRole.data.allowed_tools,
        tools.map((t) => t.name),
      );
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
    const maxTurns = options.repairOnly
      ? 3
      : limitSetting("DREAMATIC_AGENT_MAX_TURNS", 0);
    const started = Date.now();
    const watchdog = watchAgent(
      {
        total: timeoutSetting(
          `DREAMATIC_${role.toUpperCase()}_TIMEOUT_MS`,
          timeoutSetting("DREAMATIC_AGENT_TIMEOUT_MS", 0, true),
          true,
        ),
        first: timeoutSetting(
          "DREAMATIC_AGENT_FIRST_RESPONSE_TIMEOUT_MS",
          180000,
        ),
        idle: timeoutSetting("DREAMATIC_AGENT_IDLE_TIMEOUT_MS", 90000),
        tool: timeoutSetting("DREAMATIC_AGENT_TOOL_TIMEOUT_MS", 120000),
      },
      () => agent.abort(),
      (text, details) => {
        add(role, text, "status", details);
        // Persist throttled metrics; no streamed text, thinking content or raw tool arguments.
        void save(p).catch(() => {});
      },
    );
    controller.signal.addEventListener("abort", abort, { once: true });
    const unsubscribe = agent.subscribe((event) => {
      watchdog.event(event);
      if (event.type === "message_end" && event.message.role === "assistant") {
        const text = event.message.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        if (text.trim())
          add(role, "业务回复（未作为最终结果校验）", "status", {
            ...businessOutput(p.events, text),
            outputState: "unvalidated",
          });
      }
      if (event.type === "tool_execution_end" && event.isError) {
        const summary = toolFailureSummary(event.result);
        add(role, `工具错误：${event.toolName} · ${summary.reason}`, "status", {
          tool: event.toolName,
          ...summary,
        });
      }
      if (
        event.type === "tool_execution_end" &&
        (pendingQuestion || submitted !== undefined)
      )
        agent.abort();
      if (event.type === "turn_start" && ++turns > maxTurns && maxTurns > 0)
        agent.abort();
    });
    try {
      await agent.prompt(
        boundedInput(input, options.repairOnly ? 500000 : 180000),
        model.input.includes("image") ? images : [],
      );
      if (controller.signal.aborted) throw new Error("已停止生成");
      if (pendingQuestion) throw new ClarificationRequested(pendingQuestion);
      if (watchdog.error) throw watchdog.error;
      if (maxTurns > 0 && turns > maxTurns)
        throw new Error(
          "智能体达到模型轮次上限，请调整 DREAMATIC_AGENT_MAX_TURNS 后重试",
        );
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
    const key = await stageFingerprint(p, role, skills);
    const checkpoint = p.run?.checkpoints[role];
    if (options.resume && checkpoint?.key === key) {
      try {
        const value = await validate(
          role === "designer"
            ? String(checkpoint.result)
            : JSON.stringify(checkpoint.result),
        );
        add(role, "复用已完成阶段，无需模型调用");
        return role === "analyst"
          ? {
              ...value,
              evidenceRepairs: (checkpoint.result as any).evidenceRepairs || [],
              mediaPolicyAudit: (checkpoint.result as any).mediaPolicyAudit,
            }
          : value;
      } catch {
        add(role, "已保存阶段结果不再有效，重新执行");
      }
    }
    if (p.run) {
      p.run.activeRole = role;
      const order: Role[] = ["orchestrator", "analyst", "designer"];
      for (const downstream of order.slice(order.indexOf(role)))
        delete p.run.checkpoints[downstream];
      await save(p);
    }
    let accepted: { value: T } | undefined;
    const check = async (text: string) => {
      const value = await validate(text);
      accepted = { value };
      return value;
    };
    const result = await call(role, input, images, {
      validate: check,
    });
    const pass = async (value: T) => {
      if (p.run)
        p.run.checkpoints[role] = {
          key,
          result: value,
          completedAt: new Date().toISOString(),
        };
      await save(p);
      add(role, "结果校验通过，阶段完成");
      return value;
    };
    try {
      return pass(accepted ? accepted.value : await check(result));
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
      let candidateDraft:
        | {
            candidateId: string;
            baseVersionId: string;
            html: string;
            total: number;
            nextOffset: number;
          }
        | undefined;
      if (role === "designer") {
        try {
          const reference = z
            .object({ candidateId: z.string().uuid() })
            .parse(parseJSON(result));
          const draft = await readCandidate(p, reference.candidateId);
          candidateDraft = {
            ...reference,
            baseVersionId: draft.baseVersionId,
            html: draft.html.slice(0, 40000),
            total: draft.html.length,
            nextOffset: Math.min(draft.html.length, 40000),
          };
        } catch {
          /* An invalid or stale reference must not be silently reused. */
        }
      }
      let pageIssues: unknown;
      if (role === "designer" && error instanceof Error) {
        try {
          const parsed = JSON.parse(error.message);
          if (Array.isArray(parsed)) pageIssues = parsed;
        } catch {
          /* Not a page issue list. */
        }
      }
      const repaired = await call(
        role,
        {
          originalInput: input,
          candidateDraft,
          pageIssues,
          invalidOutput: result.slice(0, 200000),
          outputWasClipped: result.length > 200000,
          repair: String(error).slice(0, 2000),
          evidenceIssues:
            error instanceof EvidenceValidationError ? error.issues : undefined,
          instruction: repairOnly
            ? "Repair only the result format using the existing evidence and draft. Do not redo analysis or invent missing evidence. Prefer submit_result for structured roles. Return one complete corrected result."
            : role === "designer"
              ? "Use candidateDraft and pageIssues when supplied; otherwise correct invalidOutput using the reported validation error. Use page_patch with candidateId alone for an unsaved draft; never invent baseVersionId. Read remaining HTML using project_context_read(section:page,candidateId,offset) if nextOffset < total. Preview the changed candidate and return its latest candidateId."
              : "Correct the invalid fields or evidence. Follow the output contract and return a complete corrected result.",
        },
        repairOnly ? [] : images,
        { validate: check, repairOnly },
      );
      try {
        return pass(accepted ? accepted.value : await check(repaired));
      } catch (failure) {
        add(role, "结果校验仍未通过，任务已停止", "error", {
          validation: failure instanceof Error ? failure.name : "unknown",
          reason: validationReason(failure),
          repairOnly,
        });
        const reason = validationReason(failure);
        throw new Error(
          `${{ orchestrator: "Orchestrator", analyst: "Analyst", designer: "Designer" }[role]} 结果校验失败，自动修复后仍未通过：${reason.slice(0, 1200)}`,
        );
      }
    }
  }

  try {
    const inputHash = await taskFingerprint(p);
    if (
      options.resume &&
      p.run?.completedVersionId &&
      p.run.completedInputHash === inputHash &&
      p.versions.at(-1)?.id === p.run.completedVersionId
    ) {
      p.status = "complete";
      await save(p);
      return;
    }
    if (!options.resume || p.run?.inputHash !== inputHash) {
      if (options.resume)
        add("system", "任务输入已变化或没有可验证断点，将重新执行受影响流程");
      p.run = { id: crypto.randomUUID(), inputHash, checkpoints: {} };
    }
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
      const sources = [];
      for (const s of p.sources) {
        const reading = await readSourceMarkdown(
          p.id,
          s,
          0,
          Math.min(remaining, 25000),
        );
        remaining -= reading.markdown.length;
        sources.push({
          id: s.id,
          name: s.name,
          format: s.format,
          provenance: s.provenance,
          assets: s.assets,
          warnings: s.warnings,
          markdown: reading.markdown,
          markdownCoverage: {
            start: 0,
            end: reading.nextOffset,
            total: reading.total,
            complete: reading.nextOffset === reading.total,
          },
          readingInstruction: reading.instruction,
          tables: s.content!.tables,
        });
      }
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
            markdown: s.markdown.slice(0, 6000),
            markdownCoverage: {
              ...s.markdownCoverage,
              end: Math.min(s.markdown.length, 6000),
              complete: s.markdownCoverage.total <= 6000,
            },
            warnings: s.warnings,
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
      const loadImages = imageHandoff(p);
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
      const { images, imageInputOrder } = await loadImages(
        imageCandidates,
        resolveModel("analyst").model.input.includes("image"),
      );
      if (imageCandidates.length)
        add(
          "analyst",
          `已提取 ${imageCandidates.length} 张资料图片，正在筛选页面素材`,
        );
      p.analysis = await validated(
        "analyst",
        {
          brief: brief.brief,
          conversation,
          clarificationAnswers: (p.questions || []).filter((q) => q.answeredAt),
          existingHtml: existing,
          sources,
          imageInputOrder,
        },
        async (text) => {
          const result = analysisSchema.parse(parseJSON(text));
          const originalImageDecisions = structuredClone(result.imageDecisions);
          const originalAssets = structuredClone(result.assets);
          if (brief.brief.mediaPolicy === "text-only") {
            const imageAssets = p.sources
              .flatMap((source) => source.assets)
              .filter((asset) => asset.type === "image");
            const imageUrls = new Set(imageAssets.map((asset) => asset.url));
            result.assets = result.assets.filter(
              (asset) => !imageUrls.has(asset.url),
            );
            result.imageDecisions = imageAssets.map((asset) => ({
              assetId: asset.id,
              decision: "skip" as const,
              reason: "User requested a text-only page",
            }));
          }
          const checked = await validateFactEvidence(
            p,
            result.facts,
            controller.signal,
          );
          for (const fact of result.facts) {
            const source = p.sources.find((s) => s.id === fact.sourceId);
            if (
              fact.assetIds?.some(
                (id) =>
                  !source?.assets.some(
                    (a) => a.id === id && a.type === "image",
                  ),
              )
            )
              throw new Error(
                "facts.assetIds must reference images in the fact's own source; omit uncertain image associations",
              );
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
          for (const clue of result.visualEvidence || []) {
            const source = clue.sourceId
              ? p.sources.find((s) => s.id === clue.sourceId)
              : undefined;
            if (clue.sourceId && !source)
              throw new Error("visualEvidence references unknown sourceId");
            if (
              clue.assetId &&
              !(source ? [source] : p.sources).some((s) =>
                s.assets.some((a) => a.id === clue.assetId),
              )
            )
              throw new Error(
                "visualEvidence assetId must belong to its stated source",
              );
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
          if (checked.evidenceRepairs.length)
            add(
              "analyst",
              `已在本地修复 ${checked.evidenceRepairs.length} 条引用定位，无需模型重试`,
              "status",
              { repairedCitations: checked.evidenceRepairs.length },
            );
          return {
            ...result,
            facts: checked.facts,
            mediaPolicyAudit:
              brief.brief.mediaPolicy === "text-only"
                ? {
                    originalAssets,
                    originalImageDecisions,
                    reason: "Explicit text-only brief",
                  }
                : undefined,
            evidenceRepairs: checked.evidenceRepairs,
            evidenceVerification:
              "location-only; matching text/cells does not prove the fact's interpretation",
          };
        },
        images,
      );
      await save(p);
      const designerBatch = await loadImages(
        brief.brief.mediaPolicy === "text-only"
          ? []
          : recommendedImages(
              p,
              p.analysis as Parameters<typeof recommendedImages>[1],
            ),
        resolveModel("designer").model.input.includes("image"),
      );
      const designerImages = designerBatch.images;
      const designerImageInputOrder = designerBatch.imageInputOrder;
      const html = await validated(
        "designer",
        {
          brief: brief.brief,
          analysis: p.analysis,
          imageInputOrder: designerImageInputOrder,
          imageAvailability: {
            unavailable: designerBatch.unavailable,
            omitted: designerBatch.omitted,
          },
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
          return report.html;
        },
        designerImages,
      );
      p.versions.push({
        id: crypto.randomUUID(),
        html,
        runId: p.run?.id,
        checks: pageChecks(p, html, (await validatePage(p, html)).issues),
        label: "生成版本 " + (p.versions.length + 1),
        createdAt: new Date().toISOString(),
      });
    }
    p.status = "complete";
    if (p.run) {
      p.run.completedVersionId = p.versions.at(-1)?.id;
      p.run.completedInputHash = await taskFingerprint(p);
      delete p.run.activeRole;
    }
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
