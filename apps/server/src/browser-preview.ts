import type { Express } from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { get, projectDir } from "./store.js";
import { validatePage } from "./page-validation.js";
import { PREVIEW_CSP } from "../../../packages/shared/html-policy.js";
const execute = promisify(execFile);
const lifetime = 60 * 60 * 1000;
async function openSystemBrowser(url: string) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "rundll32"
        : "xdg-open";
  const args =
    process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  await execute(command, args, { timeout: 10000 });
}
/** Local application: the OS opener runs on the machine hosting this service. */
export function registerBrowserPreview(app: Express, open = openSystemBrowser) {
  app.post("/api/projects/:id/open", async (req, res) => {
    const project = await get(req.params.id);
    const { html } = z
      .object({ html: z.string().min(20).max(2500000) })
      .parse(req.body);
    const result = await validatePage(project, html);
    if (!result.valid)
      return res
        .status(400)
        .json({
          error: "页面验证未通过，无法打开",
          issues: result.issues.filter((i) => i.severity === "error"),
        });
    const directory = path.join(projectDir(project.id), "previews", "browser");
    await mkdir(directory, { recursive: true });
    const files = await Promise.all(
      (await readdir(directory))
        .filter((name) => /^[a-f\d-]{36}\.html$/.test(name))
        .map(async (name) => ({
          name,
          time: (await stat(path.join(directory, name))).mtimeMs,
        })),
    );
    files.sort((a, b) => b.time - a.time);
    for (const file of files.filter(
      (file, index) => index >= 9 || Date.now() - file.time > lifetime,
    ))
      await rm(path.join(directory, file.name), { force: true });
    const snapshot = crypto.randomUUID();
    const file = path.join(directory, snapshot + ".html");
    await writeFile(file, result.html, { flag: "wx" });
    // Use the listening socket, never an untrusted Host header or user-supplied URL.
    const url = `http://127.0.0.1:${req.socket.localPort}/browser-preview/${project.id}/${snapshot}`;
    try {
      await open(url);
    } catch {
      await rm(file, { force: true });
      return res
        .status(503)
        .json({ error: "无法启动系统默认浏览器，请检查本机浏览器设置" });
    }
    res.json({ opened: true });
  });
  // Unguessable, short-lived read-only snapshot URL; no access token in URLs.
  app.get("/browser-preview/:project/:snapshot", async (req, res) => {
    const ids = z
      .object({ project: z.string().uuid(), snapshot: z.string().uuid() })
      .safeParse(req.params);
    if (!ids.success) return res.status(404).end();
    const file = path.join(
      projectDir(ids.data.project),
      "previews",
      "browser",
      ids.data.snapshot + ".html",
    );
    try {
      if (Date.now() - (await stat(file)).mtimeMs > lifetime)
        return res.status(404).end();
      const html = await readFile(file, "utf8");
      res.setHeader("Content-Security-Policy", PREVIEW_CSP + "; sandbox");
      res.setHeader("Cache-Control", "no-store");
      res.type("html").send(html);
    } catch {
      res.status(404).end();
    }
  });
}
