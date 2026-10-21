import { watch, type FSWatcher } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  createReadTool,
  formatSkillsForPrompt,
  loadSkillsFromDir,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Role } from "../../../../packages/shared/project.js";
import { hash } from "./artifacts.js";

export const SKILLS_ROOT = path.resolve(".agents/skills");
const roleFor = (name: string): Role | undefined =>
  name.startsWith("analyst-")
    ? "analyst"
    : name.startsWith("designer-")
      ? "designer"
      : undefined;
export interface SkillContext {
  text: string;
  brief?: unknown;
  editing: boolean;
}
const categories: [string, RegExp][] = [
  [
    "designer-dashboard",
    /仪表盘|数据(?:展示|分析|可视化)|看板|\bdashboard\b|\bkpi\b|\banalytic(?:s|al)\b/i,
  ],
  [
    "designer-ecommerce",
    /电商|购物|商城|商品(?:目录|详情)|\be-?commerce\b|\bshop(?:ping)?\b|product catalog/i,
  ],
  ["designer-portfolio", /作品集|项目展示|\bportfolio\b|case stud(?:y|ies)/i],
  [
    "designer-editorial",
    /出版|长文|文章|专题|博客|\beditorial\b|\bmagazine\b|\bblog\b|\barticle\b/i,
  ],
  [
    "designer-saas-website",
    /\bsaas\b|企业(?:网站|官网)|公司(?:网站|官网)|软件平台|enterprise|corporate|company website/i,
  ],
  [
    "designer-landing-page",
    /落地页|营销|品牌介绍|产品(?:官网|首页)|\blanding\b|\bcampaign\b|marketing/i,
  ],
];
/** Routing is host policy, not another model or a second Skill registry. */
export function selectSkills(
  role: Role,
  context: SkillContext,
  available: readonly Skill[],
) {
  const allowed = available.filter((s) => roleFor(s.name) === role);
  const exists = (name: string) => allowed.some((s) => s.name === name);
  const explicit = [...context.text.matchAll(/\/skill:([a-z0-9-]+)/g)]
    .map((m) => m[1])
    .filter((name) => roleFor(name) === role);
  for (const name of explicit)
    if (!exists(name)) throw new Error(`Skill 不可用于 ${role}：${name}`);
  if (explicit.length > 4) throw new Error("一次最多显式选择 4 项 Skill");
  const chosen = new Set<string>(
    role === "analyst"
      ? ["analyst-information-extraction", ...explicit]
      : explicit,
  );
  if (role === "analyst") chosen.add("analyst-information-extraction");
  if (role === "designer") {
    const local = context.text;
    const combined = local + "\n" + JSON.stringify(context.brief || {});
    if (context.editing) {
      if (
        /布局|排版|颜色|字体|间距|视觉|样式|\b(?:layout|color|font|spacing|visual|style)\b/i.test(
          local,
        )
      )
        chosen.add("designer-visual-design");
      if (
        /导航|菜单|交互|折叠|筛选|\b(?:interaction|menu|navigation|accordion|filter|tabs?)\b/i.test(
          local,
        )
      )
        chosen.add("designer-interaction-design");
      if (
        /信息架构|重组|章节结构|\b(?:restructure|architecture)\b/i.test(local)
      )
        chosen.add("designer-web-architecture");
      // Subject expertise only for changes actually involving data or product semantics.
      if (
        /指标|图表|单位|数据|价格|规格|变体|\b(?:metric|chart|data|price|variant|specification)s?\b/i.test(
          local,
        )
      ) {
        const match = categories.find(([, pattern]) => pattern.test(combined));
        if (match) chosen.add(match[0]);
      }
    } else {
      const match = categories.find(([, pattern]) => pattern.test(combined));
      chosen.add(match?.[0] || "designer-web-architecture");
      chosen.add("designer-visual-design");
      if (
        /多页|分层|信息密集|\bmulti[- ]?page\b|hierarchy|complex site/i.test(
          combined,
        )
      )
        chosen.add("designer-web-architecture");
      if (
        /菜单|交互|筛选|表单|\b(?:interaction|menu|filter|form|tabs?)\b/i.test(
          combined,
        )
      )
        chosen.add("designer-interaction-design");
    }
  }
  return [...chosen]
    .filter(
      (name) =>
        exists(name) &&
        (!allowed.find((s) => s.name === name)!.disableModelInvocation ||
          explicit.includes(name)),
    )
    .slice(0, 4);
}

/** Public Pi discovery + reader; this adapter only scopes filesystem access and caches results. */
export class SkillLibrary {
  private dirty = true;
  private watcher?: FSWatcher;
  private loaded: Skill[] = [];
  private diagnostics: ReturnType<typeof loadSkillsFromDir>["diagnostics"] = [];
  private buffers = new Map<string, { stamp: string; buffer: Buffer }>();
  readonly io = { discoveries: 0, reads: 0 };
  constructor(readonly root = SKILLS_ROOT) {}
  invalidate() {
    this.dirty = true;
  }
  close() {
    this.watcher?.close();
  }
  async catalog() {
    if (this.dirty) {
      const result = loadSkillsFromDir({
        dir: this.root,
        source: "dreamatic-project",
      });
      this.io.discoveries++;
      const canonical = await realpath(this.root).catch(() => this.root);
      const checked: Skill[] = [];
      for (const skill of result.skills) {
        const resolved = await realpath(skill.filePath);
        if (
          !resolved.startsWith(canonical + path.sep) ||
          path.basename(skill.filePath) !== "SKILL.md" ||
          !roleFor(skill.name) ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name) ||
          skill.name !== path.basename(skill.baseDir)
        ) {
          result.diagnostics.push({
            type: "warning",
            message:
              "Skill must be a portable role-prefixed directory within the project root",
            path: skill.filePath,
          });
          continue;
        }
        if (!checked.some((s) => s.name === skill.name))
          checked.push({
            ...skill,
            filePath: resolved,
            baseDir: await realpath(skill.baseDir),
          });
      }
      this.loaded = checked;
      this.diagnostics = result.diagnostics;
      this.dirty = false;
      if (!this.watcher)
        try {
          this.watcher = watch(this.root, { recursive: true }, () =>
            this.invalidate(),
          );
          this.watcher.unref();
          this.watcher.on("error", () => {
            this.close();
            this.watcher = undefined;
            this.dirty = true;
          });
        } catch {
          /* Platforms without watchers recheck discovery at the next request. */
        }
    }
    if (!this.watcher) this.dirty = true;
    return { skills: this.loaded, diagnostics: this.diagnostics };
  }
  async list() {
    return (await this.catalog()).skills.map((s) => ({
      name: s.name,
      description: s.description,
      roles: [roleFor(s.name)!],
      formats: [],
      tasks: [],
      permissions: ["guidance"],
    }));
  }
  private async permitted(filename: string, role: Role) {
    const resolved = await realpath(filename);
    const entry = (await this.catalog()).skills.find(
      (s) =>
        roleFor(s.name) === role &&
        (resolved === s.filePath || resolved.startsWith(s.baseDir + path.sep)),
    );
    if (
      !entry ||
      !resolved.endsWith(".md") ||
      (resolved !== entry.filePath &&
        !resolved.startsWith(path.join(entry.baseDir, "references") + path.sep))
    )
      throw new Error("只能读取当前角色的 Skill 和 references Markdown");
    const file = await stat(resolved, { bigint: true });
    if (file.size > 48000n)
      throw new Error("Skill 文档超过 48 KB，请拆分按需参考资料");
    return {
      resolved,
      stamp: [file.ino, file.size, file.mtimeNs, file.ctimeNs].join(":"),
    };
  }
  reader(
    role: Role,
    onRead?: (name: string, characters: number) => void,
  ): AgentTool {
    const native = createReadTool(this.root, {
      operations: {
        access: async (filename) => {
          await this.permitted(filename, role);
        },
        readFile: async (filename) => {
          const { resolved, stamp } = await this.permitted(filename, role);
          let cached = this.buffers.get(resolved);
          if (cached?.stamp !== stamp) {
            cached = { stamp, buffer: await readFile(resolved) };
            this.buffers.set(resolved, cached);
            this.io.reads++;
          }
          onRead?.(path.relative(this.root, resolved), cached.buffer.length);
          return cached.buffer;
        },
        detectImageMimeType: async () => null,
      },
    });
    return {
      ...native,
      execute: (id, args, signal, onUpdate) =>
        native.execute(
          id,
          args as { path: string; offset?: number; limit?: number },
          signal,
          onUpdate,
        ),
      description:
        "Read a role-authorized SKILL.md or its references Markdown. Other files, originals and scripts are not accessible.",
    };
  }
  async signature(role: Role, names: string[]) {
    const skills = (await this.catalog()).skills;
    const parts = [];
    for (const name of names) {
      const skill = skills.find(
        (s) => s.name === name && roleFor(name) === role,
      );
      if (!skill) throw new Error("Skill 不存在：" + name);
      const { stamp } = await this.permitted(skill.filePath, role);
      parts.push(name + ":" + stamp + ":" + skill.description);
      // Watch generation does not survive restart; stat referenced files as cache dependencies too.
      // Read only selected entries through the cached public Pi reader, never all bodies.
      await this.reader(role).execute("signature", { path: skill.filePath });
      const text = this.buffers.get(skill.filePath)!.buffer.toString("utf8");
      for (const match of text.matchAll(/\]\((references\/[^)]+\.md)\)/g)) {
        const resource = await this.permitted(
          path.resolve(skill.baseDir, match[1]),
          role,
        );
        parts.push(resource.resolved + ":" + resource.stamp);
      }
    }
    return hash(parts.join("|"));
  }
  async prepare(role: Role, names: string[]) {
    const catalog = (await this.catalog()).skills.filter(
      (s) => roleFor(s.name) === role,
    );
    const blocks = [];
    let characters = 0;
    for (const name of names) {
      const skill = catalog.find((s) => s.name === name);
      if (!skill) throw new Error("Skill 不可自动加载：" + name);
      const result = await this.reader(role).execute("preload", {
        path: skill.filePath,
      });
      const body = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      characters += body.length;
      if (characters > 18000)
        throw new Error("选定 Skills 超过上下文预算，请缩小选择");
      blocks.push(
        `<skill name="${name}" location="${skill.filePath}">\n${body}\n</skill>`,
      );
    }
    return {
      prompt: names.length
        ? `${formatSkillsForPrompt(catalog, "read")}\n\nSelected skills already loaded below; do not read them again. Other skills/references are optional, only when needed.\n${blocks.join("\n\n")}`
        : "",
      names,
      characters,
    };
  }
}
export const skillLibrary = new SkillLibrary();
