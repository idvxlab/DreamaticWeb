import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  rm,
  copyFile,
  access,
  link,
} from "node:fs/promises";
import path from "node:path";
import type { Project } from "../../../packages/shared/project.js";
export const ROOT = process.cwd();
export const SETTINGS_ROOT = path.resolve(
  process.env.DREAMATIC_WORKSPACE || path.join(ROOT, "workspace"),
);
export let DATA = SETTINGS_ROOT;
export const projects = new Map<string, Project>();
const writes = new Map<string, Promise<void>>();
const pageContents = new Map<string, string>();
const metadata = new Map<string, string>();
export function projectDir(id: string) {
  if (!/^[a-f\d-]{36}$/.test(id)) throw new Error("无效项目 ID");
  return path.join(DATA, "projects", id);
}
export async function projectIds() {
  return (await readdir(path.join(DATA, "projects"), { withFileTypes: true }))
    .filter((e) => e.isDirectory() && /^[a-f\d-]{36}$/.test(e.name))
    .map((e) => e.name);
}
export async function initStore() {
  await mkdir(path.join(DATA, "projects"), { recursive: true });
  const migratedAssets = new Set<string>();
  // Migrate legacy flat records only after the complete project copy is durable.
  for (const name of await readdir(path.join(DATA, "projects"))) {
    if (!/^[a-f\d-]{36}\.json$/.test(name)) continue;
    const old = path.join(DATA, "projects", name);
    let content = await readFile(old, "utf8");
    const p = JSON.parse(content) as Project;
    const dir = projectDir(p.id);
    await mkdir(path.join(dir, "assets"), { recursive: true });
    for (const url of new Set(
      content.match(/\/assets\/[a-f\d-]{36}\.[a-z\d]+/gi) || [],
    )) {
      const file = path.basename(url);
      migratedAssets.add(file);
      await copyFile(
        path.join(DATA, "assets", file),
        path.join(dir, "assets", file),
      );
      content = content.split(url).join(`/assets/${p.id}/${file}`);
    }
    const migrated = JSON.parse(content) as Project;
    try {
      await access(path.join(dir, "project.json"));
    } catch {
      await save(migrated);
    }
    await rm(old);
  }
  // Remove only files successfully copied into the migrated project directories.
  for (const file of migratedAssets)
    await rm(path.join(DATA, "assets", file), { force: true });
}
export async function switchWorkspace(value: string) {
  const next = path.resolve(value);
  if (next === DATA) return;
  await Promise.all([...writes.values()]);
  const previous = DATA;
  DATA = next;
  projects.clear();
  pageContents.clear();
  metadata.clear();
  try {
    await initStore();
  } catch (error) {
    DATA = previous;
    projects.clear();
    throw error;
  }
  process.env.DREAMATIC_WORKSPACE = DATA;
}
export async function save(p: Project) {
  projects.set(p.id, p);
  // Page bodies are immutable files; project metadata carries version identities only.
  const snapshot = {
    ...p,
    versions: p.versions.map(({ html: _, ...version }) => version),
  };
  const content = JSON.stringify(snapshot, null, 2),
    dir = projectDir(p.id);
  const pages = p.versions.map((v) => ({ ...v }));
  const next = (writes.get(p.id) || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      await mkdir(path.join(dir, "pages"), { recursive: true });
      for (const version of pages) {
        if (!/^[a-f\d-]{36}$/.test(version.id)) throw new Error("无效版本 ID");
        const filename = path.join(dir, "pages", version.id + ".html");
        const known = pageContents.get(filename);
        if (known && known !== version.html)
          throw new Error("已有版本不可覆盖，请创建新版本");
        if (known) continue;
        try {
          const tempPage = filename + "." + crypto.randomUUID() + ".tmp";
          try {
            await writeFile(tempPage, version.html, {
              mode: 0o600,
              flag: "wx",
            });
            await link(tempPage, filename);
          } finally {
            await rm(tempPage, { force: true });
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          if ((await readFile(filename, "utf8")) !== version.html)
            throw new Error("已有版本不可覆盖，请创建新版本");
        }
        pageContents.set(filename, version.html);
      }
      if (metadata.get(dir) === content) return;
      const target = path.join(dir, "project.json"),
        temp = target + "." + crypto.randomUUID() + ".tmp";
      await writeFile(temp, content, { mode: 0o600 });
      await rename(temp, target);
      metadata.set(dir, content);
    });
  writes.set(p.id, next);
  try {
    await next;
  } finally {
    if (writes.get(p.id) === next) writes.delete(p.id);
  }
}
export async function get(id: string) {
  const dir = projectDir(id);
  let p = projects.get(id);
  if (!p) {
    p = JSON.parse(
      await readFile(path.join(dir, "project.json"), "utf8"),
    ) as Project;
    await Promise.all(
      p.versions.map(async (version) => {
        if (!/^[a-f\d-]{36}$/.test(version.id)) throw new Error("无效版本 ID");
        if (typeof version.html !== "string")
          version.html = await readFile(
            path.join(dir, "pages", version.id + ".html"),
            "utf8",
          );
      }),
    );
    projects.set(id, p);
  }
  return p;
}
/** Expose only historical display metadata, never stored execution artifacts. */
export function publicProject(
  p: Project,
): import("../../../packages/shared/project.js").ProjectResponse {
  const { pagePreviews: _, generation: __, ...view } = p;
  return {
    ...view,
    run: p.run
      ? {
          id: p.run.id,
          activeRole: p.run.activeRole,
          completedVersionId: p.run.completedVersionId,
          checkpoints: Object.fromEntries(
            Object.entries(p.run.checkpoints).map(([role, checkpoint]) => [
              role,
              { completedAt: checkpoint?.completedAt },
            ]),
          ),
        }
      : undefined,
  };
}
export async function create() {
  const p: Project = {
    id: crypto.randomUUID(),
    title: "未命名网页",
    messages: [],
    sources: [],
    versions: [],
    events: [],
    status: "idle",
  };
  await save(p);
  return p;
}
export async function removeProject(id: string) {
  await get(id);
  await writes.get(id);
  await rm(projectDir(id), { recursive: true, force: true });
  projects.delete(id);
  metadata.delete(projectDir(id));
  for (const file of pageContents.keys())
    if (file.startsWith(projectDir(id) + path.sep)) pageContents.delete(file);
  // Clean recovery copies from older releases, too.
  const legacy = await readdir(path.join(DATA, "trash")).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  for (const name of legacy)
    if (name.startsWith(id + ".") && name.endsWith(".json"))
      await rm(path.join(DATA, "trash", name));
}
