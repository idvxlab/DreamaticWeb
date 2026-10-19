import "dotenv/config";
import { registerBrowserPreview } from "./browser-preview.js";
import express from "express";
import multer from "multer";
import path from "node:path";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  create,
  get,
  save,
  initStore,
  DATA,
  removeProject,
  projectDir,
  projectIds,
  publicProject,
} from "./store.js";
import { extractUrl, FORMATS } from "./extract.js";
import {
  activeRuns,
  runProject,
  mode,
} from "../../../packages/agents/src/runtime.js";
import {
  discoverSkills,
  discoverSkillCatalog,
} from "../../../packages/agents/src/skills.js";
import { ingest } from "./ingest.js";
import type { RunEvent } from "../../../packages/agents/src/contracts.js";
import {
  initConfig,
  readConfig,
  writeConfig,
  configUpdating,
} from "./config.js";
import { acceptAnswer } from "../../../packages/agents/src/questions.js";
import { pageChecks } from "../../../packages/agents/src/page-checks.js";
import { validatePage } from "../../../packages/agents/src/pages.js";
import { APP_VERSION } from "../../../packages/shared/app-info.js";
await initStore();
await initConfig();
// Interrupted runs remain inspectable and can be resumed after restart.
for (const name of await projectIds()) {
  try {
    const p = await get(name);
    if (p.status === "running") {
      p.status = "error";
      p.error = p.run
        ? "服务重启中断了生成，可点击继续未完成任务。"
        : "服务重启中断了生成，历史任务无断点，请重新发送需求。";
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
const emit = (id: string, e: RunEvent) => {
  for (const res of listeners.get(id) || [])
    res.write("data: " + JSON.stringify(e) + "\n\n");
};
app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    version: APP_VERSION,
    language: readConfig().language,
    mode: mode(),
    provider: readConfig().models.reasoning.mode,
    model: readConfig().models.reasoning.model,
    formats: FORMATS,
  }),
);
app.get("/api/config", (_req, res) => res.json(readConfig()));
app.put("/api/config", async (req, res) => {
  if (activeRuns.size || sourceJobs.size)
    return res
      .status(409)
      .json({ error: "请等待所有生成任务结束后再修改模型配置" });
  res.json(await writeConfig(req.body));
});
app.get("/api/skills/diagnostics", async (_req, res) =>
  res.json((await discoverSkillCatalog()).diagnostics),
);
app.get("/api/skills", async (_req, res) =>
  res.json(
    (await discoverSkills()).map(
      ({ name, description, roles, formats, tasks, permissions }) => ({
        name,
        description,
        roles,
        formats,
        tasks,
        permissions,
      }),
    ),
  ),
);
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
    throw new Error("生成进行中，请先停止再编辑或添加资料");
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
          const s = await ingest(f.buffer, name, p.id);
          const uploadDir = path.join(projectDir(p.id), "uploads");
          await mkdir(uploadDir, { recursive: true });
          const originalFile = s.id + path.extname(name).toLowerCase();
          await writeFile(path.join(uploadDir, originalFile), f.buffer, {
            mode: 0o600,
          });
          s.originalFile = "uploads/" + originalFile;
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
    const s = await extractUrl(url, p.id);
    p.sources.push(s);
    await save(p);
    res.json(s);
  } finally {
    sourceJobs.delete(p.id);
  }
});
app.delete("/api/projects/:id/sources/:source", async (req, res) => {
  const p = await get(req.params.id);
  mutable(p.id);
  p.sources = p.sources.filter((s) => s.id !== req.params.source);
  await save(p);
  res.json({ ok: true });
});
app.post("/api/projects/:id/questions/:question/answer", async (req, res) => {
  const p = await get(req.params.id);
  mutable(p.id);
  const question = p.questions?.find((q) => q.id === req.params.question);
  if (!question || p.status !== "needs_input")
    return res.status(409).json({ error: "此问题已失效，请刷新项目" });
  const text = acceptAnswer(question, req.body);
  p.messages.push({ role: "user", text, time: new Date().toISOString() });
  void runProject(p, save, (e) => emit(p.id, e)).catch(() =>
    console.error("项目保存失败"),
  );
  res.status(202).json({ ok: true });
});
app.post("/api/projects/:id/run", async (req, res) => {
  const p = await get(req.params.id);
  mutable(p.id);
  if (configUpdating)
    return res.status(409).json({ error: "模型配置正在保存，请稍后重试" });
  const { text } = z
    .object({ text: z.string().trim().min(1).max(20000) })
    .parse(req.body);
  const pending = p.questions?.find((q) => !q.answeredAt);
  if (pending && p.status === "needs_input")
    acceptAnswer(pending, { text, selected: [] });
  p.messages.push({ role: "user", text, time: new Date().toISOString() });
  if (!p.titleEdited && p.title === "未命名网页") p.title = text.slice(0, 28);
  void runProject(p, save, (e) => emit(p.id, e)).catch(() =>
    console.error("项目写入失败，请检查 workspace 的可用空间和权限"),
  );
  res.status(202).json({ ok: true });
});
app.post("/api/projects/:id/resume", async (req, res) => {
  const p = await get(req.params.id);
  if (activeRuns.has(p.id))
    return res.status(202).json({ ok: true, alreadyRunning: true });
  mutable(p.id);
  if (!["error", "cancelled", "complete"].includes(p.status))
    return res
      .status(409)
      .json({ error: "当前任务不能继续，请先完成待回答的问题" });
  if (!p.run)
    return res
      .status(409)
      .json({ error: "历史任务没有可验证断点，请重新发送需求" });
  void runProject(p, save, (e) => emit(p.id, e), { resume: true }).catch(() =>
    console.error("恢复任务保存失败"),
  );
  res.status(202).json({ ok: true });
});
app.post("/api/projects/:id/cancel", async (req, res) => {
  activeRuns.get(req.params.id)?.abort();
  res.json({ ok: true });
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
    `Dreamatic · Web http://${host}:${(server.address() as { port: number }).port} (${mode()})`,
  ),
);
