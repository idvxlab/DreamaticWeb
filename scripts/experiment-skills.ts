/** Explicit live experiment through the production pipeline; secrets remain in environment/memory. */
import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { Project, Role } from "../packages/shared/project.js";
import { requestSchema } from "../packages/shared/generation.js";
import { runtimeConfig } from "../apps/server/src/config.js";
import {
  initStore,
  create,
  save,
  get,
  projectDir,
} from "../apps/server/src/store.js";
import { ingest } from "../apps/server/src/ingest.js";
import {
  runProject,
  activeRuns,
} from "../apps/server/src/generation/runtime.js";
import { modelRuntime } from "../apps/server/src/generation/model.js";
import {
  hash,
  persistArtifact,
} from "../apps/server/src/generation/artifacts.js";
import {
  SkillLibrary,
  selectSkills,
} from "../apps/server/src/generation/skills.js";

const args = process.argv.slice(2);
const arg = (name: string) => args[args.indexOf(name) + 1];
if (args.includes("--help") || !args.includes("--live")) {
  console.log(
    "Usage: node --import tsx scripts/experiment-skills.ts --live --source company.pdf --output workspace/experiments/NAME [--only baseline|designer-NAME] [--request TEXT] [--minutes 15]\nUses environment DREAMATIC_* profiles. Baseline runs ingestion + all roles; later entries reuse identical brief/facts in separate visible projects. Each condition runs once, no automatic retries. No credentials are saved.",
  );
  process.exit(args.includes("--help") ? 0 : 1);
}
if (!args.includes("--source") || !args.includes("--output"))
  throw new Error("--source and --output are required");
const output = path.resolve(arg("--output"));
const request = args.includes("--request")
  ? arg("--request")
  : "用上传资料生成公司的产品宣传页。要求：事实和配图准确，手机端可用；视觉成熟、酷炫、惊艳，整页有编排的主题动效，核心视觉与章节转场连贯，并有持续的氛围动效。风格由资料与设计目标决定。";
const minutes = args.includes("--minutes") ? Number(arg("--minutes")) : 15;
if (!(minutes > 0 && minutes <= 30))
  throw new Error("Experimental deadline must be 0–30 minutes per condition");
const config = runtimeConfig();
if (config.mode !== "live" || !config.models.reasoning.apiKey)
  throw new Error("Live DREAMATIC model profile is required");
const profiles = Object.values(config.models).filter(Boolean);
const providers = profiles.map((p) => modelRuntime(p!));
const secrets = profiles.map((p) => p!.apiKey).filter(Boolean) as string[];
const redact = (value: unknown) => {
  let text = JSON.stringify(value, (key, value) =>
    key === "data" && typeof value === "string" && value.length > 1000
      ? {
          omittedImageBytes: Math.floor((value.length * 3) / 4),
          sha256: hash(value),
        }
      : value,
  );
  for (const secret of secrets) text = text.split(secret).join("[REDACTED]");
  return text;
};
await mkdir(output, { recursive: true });
await initStore();
const library = new SkillLibrary();
const variants = [
  "baseline",
  "designer-awwwards",
  "designer-frontend-design",
  "designer-impeccable",
  "designer-impeccable-overdrive",
  "designer-3d-transforms",
];
const only = args.includes("--only") ? arg("--only") : undefined;
if (only && !variants.includes(only))
  throw new Error("Unknown condition: " + only);
const summaryFile = path.join(output, "summary.json");
let summary: any;
try {
  summary = JSON.parse(await readFile(summaryFile, "utf8"));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
summary ||= {
  createdAt: new Date().toISOString(),
  request,
  model: config.models.reasoning.model,
  provider: config.models.reasoning.baseUrl,
  vision: config.models.reasoning.vision,
  note: "One sample per condition, sequential. Default routing is the control, not a no-Skill control. Only Designer timings are directly comparable; downstream variants reuse the baseline's fixed intent and facts. Browser checks run separately. An external per-condition deadline is experimental only, not a production timeout.",
  conditions: [],
};
if (
  summary.request !== request ||
  summary.model !== config.models.reasoning.model
)
  throw new Error("Experiment settings differ; use another output directory");
const flushSummary = () => writeFile(summaryFile, redact(summary));
let interrupted = false;
const stop = () => {
  interrupted = true;
  for (const controller of activeRuns.values()) controller.abort();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
try {
  for (const variant of variants.filter((v) => !only || v === only)) {
    if (interrupted) break;
    if (summary.conditions.some((c: any) => c.variant === variant)) {
      console.log(
        JSON.stringify({ variant, skipped: "existing attempt preserved" }),
      );
      continue;
    }
    const folder = path.join(output, variant);
    await mkdir(folder, { recursive: true });
    let p: Project;
    let parseMs = 0;
    if (variant === "baseline") {
      p = await create();
      const started = performance.now();
      const source = await ingest(
        await readFile(path.resolve(arg("--source"))),
        args.includes("--source-name")
          ? arg("--source-name")
          : path.basename(arg("--source")),
        p.id,
      );
      parseMs = performance.now() - started;
      p.sources.push(source);
    } else {
      const baseline = summary.conditions.find(
        (c: any) => c.variant === "baseline",
      );
      if (!baseline?.hasUpstreamResults)
        throw new Error(
          "A baseline with completed intent/facts is required first",
        );
      const original = await get(baseline.projectId);
      p = await create();
      p.sources = structuredClone(original.sources);
      const replace = (s: string) =>
        s.split(`/assets/${original.id}/`).join(`/assets/${p.id}/`);
      for (const directory of ["assets", "uploads"])
        await cp(
          path.join(projectDir(original.id), directory),
          path.join(projectDir(p.id), directory),
          { recursive: true, mode: constants.COPYFILE_FICLONE },
        );
      for (const source of p.sources) {
        for (const asset of source.assets) asset.url = replace(asset.url);
        const md = replace(
          await readFile(
            path.join(
              projectDir(original.id),
              "sources",
              source.id,
              "reading.md",
            ),
            "utf8",
          ),
        );
        source.content!.readingHash = hash(md);
        source.content!.markdownLength = md.length;
        source.markdown = md.slice(0, 180000);
        const dir = path.join(projectDir(p.id), "sources", source.id);
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, "reading.md"), md, { mode: 0o600 });
        await writeFile(
          path.join(dir, "manifest.json"),
          JSON.stringify({ ...source.content, warnings: source.warnings }),
          { mode: 0o600 },
        );
      }
      const brief = structuredClone(original.brief) as any;
      const analysis = JSON.parse(replace(JSON.stringify(original.analysis)));
      const analystNames = selectSkills(
        "analyst",
        { text: request, editing: false },
        (await library.catalog()).skills,
      );
      const analystSignature = await library.signature("analyst", analystNames);
      const analystProfile = config.models.analyst || config.models.reasoning;
      const analystPolicy = hash(
        (await readFile("config/agents/analyst.md", "utf8")) +
          JSON.stringify(analystProfile) +
          analystSignature,
      );
      const sourceKey = hash(
        p.sources.map((s) => `${s.id}:${s.content!.readingHash}`).join("|"),
      );
      const factsKey = hash(
        analystPolicy + sourceKey + JSON.stringify([brief.goal, brief.content]),
      );
      const intent = await persistArtifact(
        p.id,
        "intent",
        original.generation!.intent!.key,
        brief,
      );
      const facts = await persistArtifact(p.id, "facts", factsKey, analysis);
      p.generation = {
        intent: intent.ref,
        intentPolicy: original.generation!.intentPolicy,
        facts: facts.ref,
      };
      p.brief = brief;
      p.analysis = analysis;
    }
    p.title = `Skill 实验 · ${variant}`;
    p.titleEdited = true;
    const text =
      (variant === "baseline" ? "" : `/skill:${variant}\n`) + request;
    p.messages.push({ role: "user", text, time: new Date().toISOString() });
    await save(p);
    const trace: unknown[] = [];
    const failures: unknown[] = [];
    let candidate = 0;
    const candidates: { name: string; html: string }[] = [];
    const observe = (role: Role, event: AgentEvent) => {
      if (
        !["message_end", "tool_execution_start", "tool_execution_end"].includes(
          event.type,
        )
      )
        return;
      trace.push({
        elapsedMs: Math.round(performance.now() - started),
        role,
        ...event,
      });
      if (event.type === "tool_execution_start") {
        console.log(
          JSON.stringify({
            variant,
            role,
            tool: event.toolName,
            event: "start",
          }),
        );
        if (
          event.toolName === "submit_page" &&
          typeof event.args?.html === "string"
        )
          candidates.push({
            name: `candidate-${++candidate}.html`,
            html: event.args.html,
          });
      }
      if (event.type === "tool_execution_end" && event.isError) {
        const failed = {
          role,
          tool: event.toolName,
          toolCallId: event.toolCallId,
          result: event.result,
        };
        failures.push(failed);
        console.log(redact({ variant, event: "tool_failure", ...failed }));
      }
      if (
        event.type === "message_end" &&
        event.message.role === "assistant" &&
        ["error", "aborted"].includes(event.message.stopReason)
      )
        failures.push({
          role,
          event: "provider_failure",
          message: event.message,
        });
    };
    const started = performance.now();
    await writeFile(
      path.join(folder, "started.json"),
      JSON.stringify({
        variant,
        projectId: p.id,
        time: new Date().toISOString(),
      }),
    );
    let lastTraceLength = 0,
      checkpointWrite = Promise.resolve();
    const checkpoint = setInterval(() => {
      if (lastTraceLength === trace.length) return;
      lastTraceLength = trace.length;
      const snapshot = redact(trace);
      checkpointWrite = checkpointWrite.then(() =>
        writeFile(path.join(folder, "trace-partial.json"), snapshot),
      );
    }, 15000);
    const timer = setTimeout(
      () => activeRuns.get(p.id)?.abort(),
      minutes * 60000,
    );
    console.log(JSON.stringify({ variant, event: "started", projectId: p.id }));
    try {
      await runProject(
        p,
        requestSchema.parse({
          text,
          mode: variant === "baseline" ? "auto" : "redesign",
        }),
        save,
        (e) =>
          console.log(
            redact({ variant, event: "status", role: e.role, text: e.text }),
          ),
        {
          config,
          skills: library,
          onAgentEvent: observe,
          streamFn: (model, context, opts) => {
            const provider = providers.find(
              (p) =>
                p.model.id === model.id && p.model.baseUrl === model.baseUrl,
            );
            if (!provider)
              throw new Error("Experiment provider profile mismatch");
            return provider.streamFn(model, context, {
              ...opts,
              onResponse: (response, responseModel) => {
                trace.push({
                  type: "http_response",
                  role: p.run?.activeRole,
                  elapsedMs: Math.round(performance.now() - started),
                  status: response.status,
                  requestId:
                    response.headers["x-request-id"] ||
                    response.headers["request-id"],
                });
                return opts?.onResponse?.(response, responseModel);
              },
            });
          },
        },
      );
    } finally {
      clearTimeout(timer);
      clearInterval(checkpoint);
      await checkpointWrite;
    }
    await writeFile(path.join(folder, "trace.json"), redact(trace));
    for (const c of candidates)
      await writeFile(path.join(folder, c.name), c.html);
    if (p.versions.length)
      await writeFile(
        path.join(folder, "accepted.html"),
        p.versions.at(-1)!.html,
      );
    const assistantTurns = trace.filter(
      (e: any) => e.type === "message_end" && e.message.role === "assistant",
    ) as any[];
    const toolResults = trace.filter(
      (e: any) => e.type === "tool_execution_end",
    ) as any[];
    const row = {
      variant,
      projectId: p.id,
      status: p.status,
      error: p.error,
      elapsedMs: Math.round(performance.now() - started),
      parseMs,
      hasUpstreamResults: Boolean(p.generation?.intent && p.generation?.facts),
      metrics: p.generation?.metrics,
      toolFailures: failures,
      toolCalls: toolResults.map((e) => ({
        role: e.role,
        tool: e.toolName,
        isError: e.isError,
        durationMs: e.durationMs,
      })),
      assistantStopReasons: assistantTurns.map((e) => ({
        role: e.role,
        reason: e.message.stopReason,
        input: e.message.usage.input,
        output: e.message.usage.output,
      })),
      candidateCount: candidates.length,
      acceptedCharacters: p.versions.at(-1)?.html.length,
      checks: p.versions.at(-1)?.checks,
    };
    await writeFile(path.join(folder, "result.json"), redact(row));
    summary.conditions.push(row);
    await flushSummary();
    console.log(
      redact({
        variant,
        event: "finished",
        projectId: p.id,
        status: p.status,
        error: p.error,
        metrics: p.generation?.metrics,
        failures: failures.length,
      }),
    );
  }
} finally {
  process.off("SIGTERM", stop);
  process.off("SIGINT", stop);
  library.close();
}
