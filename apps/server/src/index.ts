import "dotenv/config";
import { registerBrowserPreview } from "./browser-preview.js";
import { readSourceMarkdown } from "./source-content.js";
import express from "express";
import multer from "multer";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  create,
  get,
  save,
  initStore,
  removeProject,
  projectDir,
  projectIds,
  publicProject,
} from "./store.js";
import { extractUrl, FORMATS } from "./extract.js";
import { activeRuns, runProject } from "./generation/runtime.js";
import { requestSchema } from "../../../packages/shared/generation.js";
import type { RunEvent } from "../../../packages/shared/project.js";
import { ingest } from "./ingest.js";
import {
  initConfig,
  readConfig,
  writeConfig,
  configUpdating,
} from "./config.js";
import { pageChecks } from "./page-checks.js";
import { validatePage } from "./page-validation.js";
import { APP_VERSION } from "../../../packages/shared/app-info.js";
await initStore();
await initConfig();
// Interrupted runs retain persisted artifacts and the pending request for explicit resume.
for (const name of await projectIds()) {
  try {
    const p = await get(name);
    if (p.status === "running") {
      p.status = "error";
      p.error = "服务重启中断了任务，可继续未完成任务。";
      await save(p);
    }
  } catch {}
}
const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(express.json({ limit: "6mb" }));
const listeners = new Map<string, Set<express.Response>>();
app.use("/api", (req, res, next) => {
  if (
    !process.env.DREAMATIC_ACCESS_TOKEN &&
    !["127.0.0.1", "localhost", "[::1]", "::1"].includes(req.hostname)
  )
    return res.status(403).json({ error: "本地服务拒绝未知 Host" });
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host)
        return res.status(403).json({ error: "拒绝跨站请求" });
    } catch {
      return res.status(403).end();
    }
  }
  const token = process.env.DREAMATIC_ACCESS_TOKEN;
  if (token && req.headers.authorization !== "Bearer " + token)
    return res.status(401).json({ error: "请输入访问令牌" });
  next();
});
app.get("/assets/:project/:file", (req, res) => {
  if (!/^[a-f\d-]{36}\.[a-z\d]+$/i.test(req.params.file))
    return res.status(404).end();
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.sendFile(
    path.join(projectDir(req.params.project), "assets", req.params.file),
  );
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 12, fields: 2 },
});
app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    version: APP_VERSION,
    language: readConfig().language,
    mode: readConfig().mode,
    generationAvailable: true,
    harness: "pi-agent-core@1.3.0",
    provider: readConfig().models.reasoning.mode,
    model: readConfig().models.reasoning.model,
    formats: FORMATS,
  }),
);
app.get("/api/config", (_req, res) => res.json(readConfig()));
app.put("/api/config", async (req, res) => {
  if (activeRuns.size || sourceJobs.size)
    return res.status(409).json({ error: "请等待资料解析结束后再修改配置" });
  res.json(await writeConfig(req.body));
});
app.get("/api/skills/diagnostics", (_req, res) => res.json([]));
app.get("/api/skills", (_req, res) => res.json([]));
app.use("/api/projects", (_req, res, next) => {
  if (configUpdating)
    return res.status(409).json({ error: "工作目录正在切换，请稍后重试" });
  next();
});
app.get("/api/projects", async (_req, res) => {
  const list = [];
  for (const name of await projectIds()) {
    try {
      const p = await get(name);
      list.push({
        id: p.id,
        title: p.title,
        status: p.status,
        updatedAt: p.messages.at(-1)?.time || "",
      });
    } catch {}
  }
  res.json(list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
});

app.post("/api/projects", async (_req, res) =>
  res.status(201).json(await create()),
);
app.get("/api/projects/:id", async (req, res) =>
  res.json(publicProject(await get(req.params.id))),
);
const sourceJobs = new Set<string>();
function mutable(id: string) {
  if (sourceJobs.has(id)) throw new Error("资料正在解析，请完成后再继续");
  if (activeRuns.has(id))
    throw new Error("生成进行中，请先停止再编辑资料或页面");
}
app.patch("/api/projects/:id", async (req, res) => {
  const p = await get(req.params.id);
  mutable(p.id);
  const { title } = z
    .object({ title: z.string().trim().min(1).max(120) })
    .parse(req.body);
  p.title = title;
  p.titleEdited = true;
  await save(p);
  res.json(p);
});
app.delete("/api/projects/:id", async (req, res) => {
  const p = await get(req.params.id);
  mutable(p.id);
  // Lock until the persisted project has moved out of the active project directory.
  sourceJobs.add(p.id);
  try {
    await removeProject(p.id);
    res.json({ ok: true });
  } finally {
    sourceJobs.delete(p.id);
  }
});
app.post(
  "/api/projects/:id/sources",
  upload.array("files", 12),
  async (req, res) => {
    const p = await get(String(req.params.id));
    mutable(p.id);
    sourceJobs.add(p.id);
    const results = [];
    const errors = [];
    try {
      for (const f of (req.files as Express.Multer.File[]) || []) {
        try {
          const name = Buffer.from(f.originalname, "latin1").toString("utf8");
          const s = await ingest(f.buffer, name, p.id, p.sources);
          if (!p.sources.some((source) => source.id === s.id))
            p.sources.push(s);
          results.push(s);
        } catch (e) {
          errors.push({
            name: f.originalname,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      await save(p);
      res.json({ sources: results, errors });
    } finally {
      sourceJobs.delete(p.id);
    }
  },
);
app.post("/api/projects/:id/url", async (req, res) => {
  const p = await get(req.params.id);
  mutable(p.id);
  const { url } = z.object({ url: z.url().max(2048) }).parse(req.body);
  sourceJobs.add(p.id);
  try {
    const s = await extractUrl(url, p.id, p.sources);
    if (!p.sources.some((source) => source.id === s.id)) p.sources.push(s);
    await save(p);
    res.json(s);
  } finally {
    sourceJobs.delete(p.id);
  }
});
app.get("/api/projects/:id/sources/:source/reading", async (req, res) => {
  const p = await get(req.params.id);
  const source = p.sources.find((s) => s.id === req.params.source);
  if (!source || !source.content?.readingFormat) {
    res.status(404).json({ error: "此资料尚无 Markdown 文档，请重新导入" });
    return;
  }
  const { markdown } = await readSourceMarkdown(p.id, source, 0, 8000000);
  res.attachment("reading.md").type("text/markdown").send(markdown);
});
app.delete("/api/projects/:id/sources/:source", async (req, res) => {
  const p = await get(req.params.id);
  mutable(p.id);
  p.sources = p.sources.filter((s) => s.id !== req.params.source);
  await save(p);
  res.json({ ok: true });
});
function emit(id: string, event: RunEvent) {
  for (const res of listeners.get(id) || [])
    res.write("data: " + JSON.stringify(event) + "\n\n");
}
function start(
  p: Awaited<ReturnType<typeof get>>,
  input: unknown,
  resume = false,
) {
  const request = requestSchema.parse(input);
  void runProject(p, request, save, (event) => emit(p.id, event), {
    resume,
  }).catch((error) =>
    console.error(
      "任务保存失败：",
      error instanceof Error ? error.message : String(error),
    ),
  );
}
app.post("/api/projects/:id/run", async (req, res) => {
  const p = await get(req.params.id);
  mutable(p.id);
  const request = requestSchema.parse(req.body);
  if (p.status === "needs_input")
    return res.status(409).json({ error: "请先回答待确认的问题" });
  p.messages.push({
    role: "user",
    text: request.text,
    time: new Date().toISOString(),
  });
  if (!p.titleEdited && p.title === "未命名网页")
    p.title = request.text.slice(0, 28);
  start(p, request);
  res.status(202).json({ ok: true });
});
app.post("/api/projects/:id/resume", async (req, res) => {
  const p = await get(req.params.id);
  if (activeRuns.has(p.id))
    return res.status(202).json({ ok: true, alreadyRunning: true });
  mutable(p.id);
  if (!p.generation?.pending || !["error", "cancelled"].includes(p.status))
    return res.status(409).json({ error: "没有可继续的任务" });
  start(p, p.generation.pending, true);
  res.status(202).json({ ok: true });
});
app.post("/api/projects/:id/questions/:question/answer", async (req, res) => {
  const p = await get(req.params.id);
  mutable(p.id);
  const question = p.questions?.find((q) => q.id === req.params.question);
  if (
    !question ||
    question.answeredAt ||
    p.status !== "needs_input" ||
    !p.generation?.pending
  )
    return res.status(409).json({ error: "此问题已失效，请刷新项目" });
  const answer = z
    .object({
      selected: z.array(z.string()).max(12).default([]),
      text: z.string().trim().max(20000).default(""),
    })
    .parse(req.body);
  if (
    (!answer.text && !answer.selected.length) ||
    new Set(answer.selected).size !== answer.selected.length ||
    answer.selected.some((id) => !question.options.some((o) => o.id === id)) ||
    (question.mode === "single" && answer.selected.length > 1) ||
    (question.mode === "text" && answer.selected.length)
  )
    throw new Error("请填写有效答案");
  question.answer = answer;
  question.answeredAt = new Date().toISOString();
  p.messages.push({
    role: "user",
    text: [
      ...question.options
        .filter((o) => answer.selected.includes(o.id))
        .map((o) => o.label),
      answer.text,
    ]
      .filter(Boolean)
      .join("\n"),
    time: question.answeredAt,
  });
  start(p, p.generation.pending, true);
  res.status(202).json({ ok: true });
});
app.post("/api/projects/:id/cancel", async (req, res) => {
  await get(req.params.id);
  activeRuns.get(req.params.id)?.abort();
  res.json({ ok: true });
});
app.get("/api/projects/:id/sources/:source/original", async (req, res) => {
  const p = await get(req.params.id);
  const source = p.sources.find((s) => s.id === req.params.source);
  if (
    !source?.originalFile ||
    !/^uploads\/[a-f\d-]{36}\.[a-z\d]+$/i.test(source.originalFile)
  )
    return res.status(404).json({ error: "原始文件不可用" });
  res
    .attachment(
      source.format === "website" ? source.name + ".html" : source.name,
    )
    .sendFile(path.join(projectDir(p.id), source.originalFile));
});
app.get("/api/projects/:id/metrics", async (req, res) =>
  res.json((await get(req.params.id)).generation?.metrics || null),
);
app.get("/api/projects/:id/results/:kind", async (req, res) => {
  const p = await get(req.params.id);
  if (!["intent", "facts"].includes(req.params.kind))
    return res.status(404).end();
  const { loadArtifact } = await import("./generation/artifacts.js");
  const kind = req.params.kind as "intent" | "facts";
  const artifact = await loadArtifact(p.id, kind, p.generation?.[kind]);
  if (!artifact) return res.status(404).json({ error: "结果尚未生成" });
  res
    .attachment(kind + ".md")
    .type("text/markdown")
    .send(artifact.markdown);
});
app.get("/api/projects/:id/events", async (req, res) => {
  const p = await get(req.params.id);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  let set = listeners.get(p.id);
  if (!set) {
    set = new Set();
    listeners.set(p.id, set);
  }
  set.add(res);
  res.write(": connected\n\n");
  const timer = setInterval(() => res.write(": heartbeat\n\n"), 20000);
  req.on("close", () => {
    clearInterval(timer);
    set!.delete(res);
    if (!set!.size) listeners.delete(p.id);
  });
});
app.post("/api/projects/:id/versions", async (req, res) => {
  const p = await get(req.params.id);
  mutable(p.id);
  const { html, label, baseVersionId } = z
    .object({
      html: z.string().min(20).max(2500000),
      baseVersionId: z.string().optional(),
      label: z.string().max(80).default("手动编辑"),
    })
    .parse(req.body);
  if (
    baseVersionId !== undefined &&
    baseVersionId !== (p.versions.at(-1)?.id || "")
  )
    return res
      .status(409)
      .json({ error: "页面已有新版本，请重新加载后再编辑，当前修改尚未保存" });
  const report = await validatePage(p, html);
  const v = {
    id: crypto.randomUUID(),
    html: report.html,
    checks: pageChecks(p, report.html, report.issues),
    label,
    createdAt: new Date().toISOString(),
  };
  p.versions.push(v);
  await save(p);
  res.json(v);
});
app.get("/api/projects/:id/export", async (req, res) => {
  const p = await get(req.params.id);
  const v = req.query.version
    ? p.versions.find((v) => v.id === req.query.version)
    : p.versions.at(-1);
  if (!v) return res.status(404).json({ error: "没有可导出的页面" });
  let html = v.html;
  const matches = [
    ...new Set(
      html.match(/\/assets\/[a-f\d-]{36}\/[a-f\d-]{36}\.[a-z\d]+/g) || [],
    ),
  ];
  for (const url of matches) {
    const file = path.basename(url);
    try {
      const b = await readFile(path.join(projectDir(p.id), "assets", file));
      const { fileTypeFromBuffer } = await import("file-type");
      const t = await fileTypeFromBuffer(b);
      if (t)
        html = html
          .split(url)
          .join("data:" + t.mime + ";base64," + b.toString("base64"));
    } catch {}
  }
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="dreamatic-page.html"',
  );
  res.type("html").send(html);
});
registerBrowserPreview(app);
app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在" }));
app.use(express.static(path.resolve("dist/web")));
app.get("/{*path}", (_req, res) =>
  res.sendFile(path.resolve("dist/web/index.html")),
);
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err instanceof Error ? err.message : err);
    res
      .status(
        err instanceof z.ZodError
          ? 400
          : err instanceof multer.MulterError
            ? 413
            : 400,
      )
      .json({ error: err instanceof Error ? err.message : "请求失败" });
  },
);
const host = process.env.HOST || "127.0.0.1";
if (
  !["127.0.0.1", "localhost", "::1"].includes(host) &&
  !process.env.DREAMATIC_ACCESS_TOKEN
)
  throw new Error("对外监听必须设置 DREAMATIC_ACCESS_TOKEN");
const server = app.listen(Number(process.env.PORT || 4310), host, () =>
  console.log(
    `Dreamatic · Web http://${host}:${(server.address() as { port: number }).port} (Pi 1.3.0)`,
  ),
);
