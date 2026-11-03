import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { extract } from "../apps/server/src/extract.js";
import {
  create,
  save,
  initStore,
  projectDir,
} from "../apps/server/src/store.js";
import {
  runProject,
  activeRuns,
} from "../apps/server/src/generation/runtime.js";
import { modelRuntime } from "../apps/server/src/generation/model.js";
import { requestSchema } from "../packages/shared/generation.js";
import type { RuntimeConfig } from "../packages/shared/config.js";
import {
  hash,
  persistArtifact,
} from "../apps/server/src/generation/artifacts.js";
import { getCurrentSystemMessage } from "@earendil-works/pi-ai";
import { mediaLayoutContext } from "./media-layout-context.js";
if (process.argv.includes("--help")) {
  console.log(
    "Usage: DREAMATIC_WORKSPACE=<output-directory> EXPERIMENT_PDF=<pdf-file> node --import tsx scripts/compare-asset-routes.ts [--expanded|--compact|--short-ids] [--prepare-only]\n--expanded: A/B once each, expanded media and shared layout associations.\n--compact: B once, compact catalog + area ordering + neutral alt binding.\n--short-ids: compact B once, with exact short-media-ID lookup.\n--prepare-only: parse and prepare inputs without a model call.\nModel: set both DREAMATIC_API_BASE_URL and DREAMATIC_API_KEY; DREAMATIC_MODEL defaults to qwen3.5-plus. Otherwise uses your global OpenCode api_cz_qwen profile. Unset proxy environment variables for direct requests. Credentials are never written to results.",
  );
  process.exit(0);
}
if (
  !process.env.DREAMATIC_WORKSPACE ||
  (!process.env.EXPERIMENT_PDF && !process.argv.includes("--probe"))
)
  throw new Error(
    "请设置 DREAMATIC_WORKSPACE 和 EXPERIMENT_PDF；用 --help 查看用法",
  );
const root = path.resolve(process.env.DREAMATIC_WORKSPACE!);
await mkdir(root, { recursive: true });
const apiBase = process.env.DREAMATIC_API_BASE_URL,
  apiKey = process.env.DREAMATIC_API_KEY;
if (Boolean(apiBase) !== Boolean(apiKey))
  throw new Error("DREAMATIC_API_BASE_URL 和 DREAMATIC_API_KEY 需同时设置");
const provider =
  apiBase && apiKey
    ? { baseURL: apiBase, apiKey }
    : JSON.parse(
        await readFile(
          path.join(os.homedir(), ".config/opencode/opencode.json"),
          "utf8",
        ),
      ).providers.api_cz_qwen.settings;
const profile = {
  mode: "openai-compatible" as const,
  baseUrl: provider.baseURL,
  apiKey: provider.apiKey,
  model: process.env.DREAMATIC_MODEL || "qwen3.5-plus",
  vision: true,
};
// Direct fetch with proxy variables unset; never serialize the credential-bearing profile.
const runtime = modelRuntime(profile);
if (process.argv.includes("--probe")) {
  const image = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const r = await fetch(profile.baseUrl + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${profile.apiKey}`,
    },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: profile.model,
      max_tokens: 80,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Identify the color and use report_color." },
            {
              type: "image_url",
              image_url: {
                url: "data:image/png;base64," + image.toString("base64"),
              },
            },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "report_color",
            parameters: {
              type: "object",
              properties: { color: { type: "string" } },
              required: ["color"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "report_color" } },
    }),
  });
  const data: any = await r.json();
  console.log(
    JSON.stringify({
      probe: true,
      http: r.status,
      model: profile.model,
      tool: data.choices?.[0]?.message?.tool_calls?.[0]?.function?.name,
      color: data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments,
      usage: data.usage,
      error: data.error ? String(data.error.message).slice(0, 300) : undefined,
    }),
  );
  process.exit(r.ok ? 0 : 1);
}
await initStore();
const p = await create();
const pdf = process.env.EXPERIMENT_PDF!;
const bytes = await readFile(pdf);
const started = performance.now();
let experimentParsedDocument: any;
let parsedMediaSummary: any;
const source = await extract(bytes, "大横智旋公司简介2026.pdf", p.id, {
  onParsed: (parsed) => {
    experimentParsedDocument = { content: parsed.content };
    const types: Record<string, number> = {};
    for (const a of parsed.attachments)
      types[a.type] = (types[a.type] || 0) + 1;
    parsedMediaSummary = { attachments: parsed.attachments.length, types };
  },
});
const parseMs = performance.now() - started;
p.sources.push(source);
const contextStarted = performance.now();
const entries: any[] = [];
function walk(nodes: any[], page?: number) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const pageNo = n.metadata?.pageNumber || page;
    if (n.type === "image") {
      const name = n.metadata?.attachmentName;
      const asset = source.assets.find((a) => a.name === name);
      if (asset)
        entries.push({
          assetId: asset.id,
          url: asset.url,
          name,
          page: pageNo || null,
          bounds: n.bounds || null,
          caption: n.metadata?.altText || n.metadata?.title || null,
          nearbyBefore: nodes
            .slice(Math.max(0, i - 3), i)
            .map((s) => s.text || "")
            .join(" ")
            .slice(-700),
          nearbyAfter: nodes
            .slice(i + 1, i + 4)
            .map((s) => s.text || "")
            .join(" ")
            .slice(0, 700),
          association: "document adjacency, not confirmed image subject",
        });
    }
    if (n.children) walk(n.children, pageNo);
  }
}
walk(experimentParsedDocument?.content || []);
for (const a of source.assets)
  if (!entries.some((e) => e.assetId === a.id))
    entries.push({
      assetId: a.id,
      url: a.url,
      name: a.name,
      page: null,
      caption: null,
      association: "unknown; no program-extracted neighboring text",
    });
const contextMs = performance.now() - contextStarted;
const shortIds = process.argv.includes("--short-ids");
const compact = shortIds || process.argv.includes("--compact");
const mediaAliases = Object.fromEntries(
  source.assets.map((a, i) => [
    `S1-I${String(i + 1).padStart(3, "0")}`,
    { sourceId: source.id, assetId: a.id },
  ]),
);
const aliasByAsset = Object.fromEntries(
  Object.entries(mediaAliases).map(([alias, a]) => [a.assetId, alias]),
);
const expanded = compact || process.argv.includes("--expanded");
const geometry = expanded || process.argv.includes("--geometry");
const layoutStart = performance.now();
const layout = mediaLayoutContext(
  experimentParsedDocument?.content || [],
  source,
  { compact, aliases: shortIds ? aliasByAsset : undefined },
);
const layoutMs = performance.now() - layoutStart;
if (geometry) {
  await writeFile(
    path.join(root, "layout-source.json"),
    JSON.stringify(experimentParsedDocument.content),
  );
  await writeFile(path.join(root, "layout-context.md"), layout.markdown);
}
await writeFile(
  path.join(root, "image-context.json"),
  JSON.stringify(geometry ? layout.entries : entries, null, 2),
);
// Offline contact sheet for human review, never sent to either model arm.
const thumbs = [];
for (let i = 0; i < source.assets.length; i++) {
  const a = source.assets[i];
  if (a.type !== "image") continue;
  try {
    const img = await sharp(
      path.join(projectDir(p.id), "assets", path.basename(a.url)),
    )
      .resize(220, 140, { fit: "inside" })
      .extend({ top: 0, bottom: 25, left: 0, right: 0, background: "white" })
      .png()
      .toBuffer();
    thumbs.push({
      input: img,
      left: (i % 4) * 250,
      top: Math.floor(i / 4) * 190,
    });
  } catch {}
}
if (thumbs.length)
  await sharp({
    create: {
      width: 1000,
      height: Math.ceil(source.assets.length / 4) * 190,
      channels: 3,
      background: "#eee",
    },
  })
    .composite(thumbs)
    .png()
    .toFile(path.join(root, "asset-contact-sheet.png"));
const text =
  "用上面的资料帮我生成我们公司的产品宣传页。要求：事实和产品参数准确，图片与产品对应，信息清楚，桌面和手机都能正常浏览；不要编造资料没有提供的内容。";
const cfg: RuntimeConfig = {
  mode: "live",
  workspace: root,
  language: "zh",
  models: { reasoning: profile, analyst: null, designer: null },
};
const reports: any[] = [];
const brief = {
  goal: "公司产品宣传页",
  audience: "潜在客户与合作伙伴",
  content: ["公司简介", "核心产品和准确参数", "应用场景", "联系方式"],
  features: ["单页", "桌面和手机正常浏览"],
  design: ["清楚专业的企业产品宣传页"],
  constraints: ["事实和参数来自资料", "图片与产品对应", "不编造缺失信息"],
};
p.brief = brief;
const intentPolicy = hash(
  (await readFile("config/agents/orchestrator.md", "utf8")) +
    JSON.stringify(profile),
);
const seed = await persistArtifact(
  p.id,
  "intent",
  hash(intentPolicy + text),
  brief,
);
let intentSeed: any = { intent: seed.ref, intentPolicy };
const completedVersions: any[] = [];
const allEvents: any[] = [];
const sourceFile = path.join(
  projectDir(p.id),
  "sources",
  source.id,
  "reading.md",
);
const originalMarkdown = await readFile(sourceFile, "utf8");
const arms = shortIds
  ? ["B5-compact-short-ids"]
  : compact
    ? ["B4-compact-ranked-text"]
    : expanded
      ? ["A3-expanded-optional-vision", "B3-expanded-text"]
      : geometry
        ? ["B2-layout-text", "A2-layout-optional-vision"]
        : ["A-compressed", "B-text-context"];
for (const arm of process.argv.includes("--prepare-only") ? [] : arms) {
  let preprocessMs = parseMs;
  if (geometry) {
    const t = performance.now();
    // Same canonical association data for BOTH arms; tool availability is the only treatment.
    const catalogStart = originalMarkdown.lastIndexOf(
      "\n\n## Media assets\n\n",
    );
    const markdown =
      (compact && catalogStart >= 0
        ? originalMarkdown.slice(0, catalogStart)
        : originalMarkdown) + layout.markdown;
    await writeFile(sourceFile, markdown, { mode: 0o600 });
    source.content!.readingHash = hash(markdown);
    source.content!.markdownLength = markdown.length;
    source.markdown = markdown.slice(0, 180000);
    await writeFile(
      path.join(projectDir(p.id), "sources", source.id, "manifest.json"),
      JSON.stringify({ ...source.content, warnings: source.warnings }),
    );
    preprocessMs = parseMs + layoutMs + (performance.now() - t);
    console.log(
      JSON.stringify({
        arm,
        preprocessMs,
        layoutMs,
        contextCharacters: layout.markdown.length,
      }),
    );
  }
  p.versions = [];
  p.messages = [{ role: "user", text, time: new Date().toISOString() }];
  p.events = [];
  p.generation = intentSeed ? structuredClone(intentSeed) : {};
  p.status = "idle";
  delete p.run;
  delete p.error;
  const calls: any[] = [];
  const mediaLabelAudits: any[] = [];
  const mediaAliasAudits: any[] = [];
  let role = "unknown";
  const budget = setTimeout(
    () => activeRuns.get(p.id)?.abort(),
    12 * 60 * 1000,
  );
  const start = performance.now();
  console.log(
    JSON.stringify({
      arm,
      event: "started",
      projectId: p.id,
      parseMs,
      contextMs,
      assets: source.assets.length,
      mapped: entries.filter(
        (e) => e.page || e.caption || e.nearbyBefore || e.nearbyAfter,
      ).length,
    }),
  );
  try {
    await runProject(
      p,
      requestSchema.parse({ text }),
      save,
      (e) => {
        role = e.role;
        if (e.kind === "status" || e.kind === "error")
          console.log(JSON.stringify({ arm, role, event: e.text }));
      },
      {
        config: cfg,
        ...(geometry
          ? {
              experimentalNoImages: arm.startsWith("B"),
              experimentalLayoutFromMarkdown: true,
              ...(compact
                ? {
                    experimentalCompactCatalog: true,
                    ...(shortIds
                      ? {
                          experimentalMediaAliases: mediaAliases,
                          experimentalAliasAudit: (audit: unknown) =>
                            mediaAliasAudits.push(audit),
                        }
                      : {}),
                    experimentalMediaLabels: Object.fromEntries(
                      layout.entries.map((e) => [e.url, e.displayLabel]),
                    ),
                    experimentalLabelAudit: (audit: unknown) =>
                      mediaLabelAudits.push(audit),
                  }
                : {}),
            }
          : arm.startsWith("B")
            ? {
                experimentalMediaContext: JSON.stringify(entries),
                experimentalNoImages: true,
              }
            : {}),
        streamFn: (m, c, o) => {
          let imageBytes = 0;
          for (const msg of c.messages)
            if (Array.isArray(msg.content))
              for (const part of msg.content)
                if (part.type === "image")
                  imageBytes += Buffer.from(part.data, "base64").length;
          const toolHistory = c.messages.flatMap((msg) =>
            Array.isArray(msg.content)
              ? msg.content
                  .filter((v: any) => v.type === "toolCall")
                  .map((v: any) => v.name)
              : [],
          );
          const record: any = {
            role,
            started: performance.now() - start,
            inputImageBytes: imageBytes,
            toolHistory,
            precedingToolResults: c.messages
              .filter((msg) => msg.role === "toolResult")
              .map((msg: any) => ({
                toolName: msg.toolName,
                isError: msg.isError,
                text: msg.content
                  .filter((part: any) => part.type === "text")
                  .map((part: any) => part.text)
                  .join("\n")
                  .slice(0, 2000),
              })),
            availableTools: getCurrentSystemMessage(
              c.messages,
            )?.toolsAdded?.map((t) => t.name),
          };
          calls.push(record);
          const stream = runtime.streamFn(m, c, {
            ...o,
            maxRetries: 0,
            onResponse: (response) => {
              record.httpStatus = response.status;
              o?.onResponse?.(response);
            },
          });
          void stream
            .result()
            .then((message) => {
              record.elapsedMs = performance.now() - start - record.started;
              record.usage = message.usage;
            })
            .catch(() => {});
          return stream;
        },
      },
    );
  } finally {
    clearTimeout(budget);
  }
  const report = {
    arm,
    status: p.status,
    error: p.error,
    elapsedMs: Math.round(performance.now() - start),
    parseMs,
    preprocessMs,
    layoutMs: geometry ? layoutMs : undefined,
    contextMs: geometry ? layoutMs : arm.startsWith("B") ? contextMs : 0,
    metrics: p.generation?.metrics,
    calls,
    mediaLabelAudits,
    mediaAliasAudits,
    warning: compact
      ? "one B4 run; same PDF, fixed brief, 78 original assets; combines compact canonical media listings, area-based candidate ordering and deterministic neutral alt binding. Not a single-variable tool-availability comparison with A3/B3. No image classification or extra model review. Timing excludes shared parsing."
      : geometry
        ? `one run each; ${arms.join(" then ")}; same fixed brief and same canonical layout context, only asset_view availability differs; no forced viewing; timing excludes shared parsing; layout rules are a geometry prototype, not a cross-layout validated parser`
        : "one run; A first, B second; SAME fixed intent fixture reused for BOTH; comparison covers Analyst+Designer, not an independent full-pipeline benchmark; provider caching/order may affect timing; no forced image viewing",
    projectId: p.id,
  };
  reports.push(report);
  await writeFile(
    path.join(root, arm + ".json"),
    JSON.stringify(report, null, 2),
  );
  if (p.versions.length) {
    const v = p.versions.at(-1)!;
    v.label = arm;
    completedVersions.push(structuredClone(v));
    await writeFile(path.join(root, arm + ".html"), v.html);
  }
  allEvents.push(...p.events);
  if (p.generation?.facts) {
    const factsFile = path.join(
      projectDir(p.id),
      "results",
      `facts-${p.generation.facts.hash}.md`,
    );
    await writeFile(
      path.join(root, arm + "-facts.md"),
      await readFile(factsFile),
    );
  }
  console.log(
    JSON.stringify({
      arm,
      status: p.status,
      elapsedMs: report.elapsedMs,
      metrics: report.metrics,
      error: p.error,
    }),
  );
  if (!intentSeed && p.generation?.intent)
    intentSeed = {
      intent: p.generation.intent,
      intentPolicy: p.generation.intentPolicy,
    };
}
p.versions = completedVersions;
p.events = allEvents;
p.title = "图片路线 A/B 实验 · Qwen";
await save(p);
await writeFile(
  path.join(root, "comparison.json"),
  JSON.stringify(
    {
      baseline: "e476822",
      model: profile.model,
      sourceSha256: createHash("sha256").update(bytes).digest("hex"),
      source: pdf,
      parseMs,
      contextMs,
      layoutMs,
      geometry,
      compact,
      shortIds,
      assetCount: source.assets.length,
      parsedMediaSummary,
      contextMatched: entries.filter(
        (e) => e.page || e.caption || e.nearbyBefore || e.nearbyAfter,
      ).length,
      prompt: text,
      reports,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ finished: true, root, projectId: p.id }));
process.exit(0);
