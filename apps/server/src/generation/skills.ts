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
export const SKILL_BODY_CHARACTER_LIMIT = 24000;
export const SKILL_REFERENCE_BYTE_LIMIT = 48000;
export const SKILL_ASSET_BYTE_LIMIT = 512 * 1024;

/** Portable Markdown declares only the references essential to this Skill. */
function requiredReferences(body: string) {
  const section =
    body.split(/^## Required references[ \t]*\r?$/m)[1]?.split(/^## /m)[0] ||
    "";
  return [
    ...new Set(
      [...section.matchAll(/\]\((references\/[^)]+\.md)\)/g)].map((m) => m[1]),
    ),
  ];
}
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
    /论文|学术|研究(?:报告|解读|成果|介绍)|出版|长文|文章|专题|博客|\bpaper\b|\bresearch\b|\bacademic\b|\beditorial\b|\bmagazine\b|\bblog\b|\barticle\b/i,
  ],
  [
    "designer-saas-website",
    /\bsaas\b|企业(?:网站|官网)|公司(?:网站|官网)|软件平台|enterprise|corporate|company website/i,
  ],
  [
    "designer-landing-page",
    /落地页|营销|宣传|推广|品牌介绍|产品(?:官网|首页|介绍|展示|发布)|发布会|\blanding\b|\bcampaign\b|marketing|promotion(?:al)?\b|product launch/i,
  ],
];
/** The page kit that new company, product, campaign and institution pages are built on. */
const PAGE_KIT = "designer-taste";
const PAGE_KIT_SITES = ["designer-landing-page", "designer-saas-website"];
/** User wording that asks for an expressive showcase rather than a plain informational page. */
const EXPRESSIVE =
  /炫酷|酷炫|惊艳|高级感|质感|大气|沉浸|视觉冲击|设计感|氛围|有冲击力|\b(?:stunning|striking|immersive|premium|bold|award|cinematic|wow)\b/i;
/** Explicit motion or animation requests. */
const MOTION =
  /动效|动画|动起来|转场|氛围动|滚动(?:叙事|动)|\b(?:motion|animat(?:e|ed|ion|ions)|transition|scroll[- ]driven|parallax)\b/i;
export function positiveRequirements(text: string) {
  return text
    .replace(/(?:但是|但要|但需|but\s+)/gi, "，需要")
    .split(/[，,。；;\n]/)
    .map((clause) =>
      clause.replace(
        /(?:不(?:需要|要|做|使用|支持|用)|无需|不要|禁止|without\b|do not\b|don't\b|no\s+)[^，,。；;\n]*/gi,
        "",
      ),
    )
    .join("\n");
}
/** Routing is host policy, not another model or a second Skill registry. */
export function selectSkills(
  role: Role,
  context: SkillContext,
  available: readonly Skill[],
) {
  const allowed = available.filter((s) => roleFor(s.name) === role);
  const exists = (name: string) => allowed.some((s) => s.name === name);
  const explicit = [
    ...new Set(
      [...context.text.matchAll(/\/skill:([a-z0-9-]+)/g)]
        .map((m) => m[1])
        .filter((name) => roleFor(name) === role),
    ),
  ];
  for (const name of explicit)
    if (!exists(name)) throw new Error(`Skill 不可用于 ${role}：${name}`);
  if (explicit.length > 4) throw new Error("一次最多显式选择 4 项 Skill");
  // Explicit Designer selections are the complete set, including on edits.
  // This keeps experiments from silently mixing the original visual/motion Skills.
  if (role === "designer" && explicit.length) return explicit;
  const chosen = new Set<string>(
    role === "analyst"
      ? ["analyst-information-extraction", ...explicit]
      : explicit,
  );
  if (role === "analyst") chosen.add("analyst-information-extraction");
  if (role === "designer") {
    const local = positiveRequirements(context.text);
    const combined =
      local + "\n" + positiveRequirements(JSON.stringify(context.brief || {}));
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
      // The user's own words decide the site type; the brief only fills a gap.
      const match =
        categories.find(([, pattern]) => pattern.test(local)) ||
        categories.find(([, pattern]) => pattern.test(combined));
      // Company, product, campaign and institution pages are built on the page kit, which
      // carries its own layout, blocks, motion moments and looks (styles and block sets are
      // supplied after the plan). Dashboards, catalogues, portfolios and editorial sites keep
      // their subject Skills.
      if (!match || PAGE_KIT_SITES.includes(match[0])) {
        chosen.add(PAGE_KIT);
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
        return [...chosen].filter((name) => exists(name));
      }
      chosen.add(match[0]);
      // Only what the user asked for (request text and user-stated design) raises
      // ambition; Orchestrator's designDefaults never do.
      const brief = (context.brief || {}) as {
        design?: unknown;
        features?: unknown;
      };
      const pinned =
        local +
        "\n" +
        positiveRequirements(JSON.stringify([brief.design, brief.features]));
      const expressive = EXPRESSIVE.test(pinned);
      // A committed visual world replaces the generic visual method; motion gets its own method.
      chosen.add(expressive ? "designer-impeccable" : "designer-visual-design");
      if (MOTION.test(pinned)) chosen.add("designer-motion-design");
      // Research and long-form editorial pages need a reading architecture and honest
      // document interactions (anchors, figures, captions and disclosures), not only a
      // visual treatment. This restores the complementary small-Skill composition used
      // before company/product requests moved onto the page kit.
      if (match[0] === "designer-editorial") {
        chosen.add("designer-web-architecture");
        chosen.add("designer-interaction-design");
      }
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
  /**
   * Text of a stylesheet or script a Skill ships under its own assets/ folder,
   * for the host to inline into a page. Only Skills loaded for this stage, only
   * .css/.js under assets/, realpath-contained and size-limited; never Markdown,
   * scripts elsewhere or original uploads.
   */
  async assetText(role: Role, names: readonly string[], reference: string) {
    const match =
      /^([a-z0-9]+(?:-[a-z0-9]+)*)\/(assets\/[a-z0-9._/-]+\.(?:css|js))$/i.exec(
        reference,
      );
    if (!match || reference.includes(".."))
      throw new Error("Skill 资源引用格式无效：" + reference);
    const entry = (await this.catalog()).skills.find(
      (s) =>
        s.name === match[1] &&
        roleFor(s.name) === role &&
        names.includes(s.name),
    );
    if (!entry)
      throw new Error("只能引用本阶段已加载 Skill 的资源：" + reference);
    const resolved = await realpath(path.join(entry.baseDir, match[2])).catch(
      () => {
        throw new Error("Skill 资源不存在：" + reference);
      },
    );
    if (!resolved.startsWith(path.join(entry.baseDir, "assets") + path.sep))
      throw new Error("Skill 资源必须位于其 assets 目录：" + reference);
    const file = await stat(resolved, { bigint: true });
    if (file.size > BigInt(SKILL_ASSET_BYTE_LIMIT))
      throw new Error("Skill 资源超过 512 KB：" + reference);
    const stamp = [file.ino, file.size, file.mtimeNs, file.ctimeNs].join(":");
    const hit = this.buffers.get(resolved);
    if (hit?.stamp === stamp) return hit.buffer.toString("utf8");
    const buffer = await readFile(resolved);
    this.io.reads++;
    this.buffers.set(resolved, { stamp, buffer });
    return buffer.toString("utf8");
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
  private async permitted(
    filename: string,
    role: Role,
    names?: readonly string[],
  ) {
    const resolved = await realpath(filename);
    const entry = (await this.catalog()).skills.find(
      (s) =>
        roleFor(s.name) === role &&
        (!names || names.includes(s.name)) &&
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
    if (file.size > BigInt(SKILL_REFERENCE_BYTE_LIMIT))
      throw new Error("Skill 文档超过 48 KB，请拆分按需参考资料");
    return {
      resolved,
      stamp: [file.ino, file.size, file.mtimeNs, file.ctimeNs].join(":"),
    };
  }
  reader(
    role: Role,
    onRead?: (name: string, characters: number) => void,
    names?: readonly string[],
  ): AgentTool {
    const native = createReadTool(this.root, {
      operations: {
        access: async (filename) => {
          await this.permitted(filename, role, names);
        },
        readFile: async (filename) => {
          const { resolved, stamp } = await this.permitted(
            filename,
            role,
            names,
          );
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
        (names
          ? "Read only the explicitly selected Skills and their references Markdown. "
          : "Read a role-authorized SKILL.md or its references Markdown. ") +
        "Other files, originals and scripts are not accessible.",
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
      const required = new Set(requiredReferences(text));
      for (const match of text.matchAll(/\]\((references\/[^)]+\.md)\)/g)) {
        const resource = await this.permitted(
          path.resolve(skill.baseDir, match[1]),
          role,
        );
        parts.push(resource.resolved + ":" + resource.stamp);
        if (required.has(match[1]))
          await this.reader(role, undefined, names).execute("signature", {
            path: resource.resolved,
          });
      }
    }
    return hash(parts.join("|"));
  }
  async prepare(
    role: Role,
    names: string[],
    options: { selectedOnly?: boolean } = {},
  ) {
    const catalog = (await this.catalog()).skills.filter(
      (s) => roleFor(s.name) === role,
    );
    const blocks: string[] = [];
    const references: string[] = [];
    const loaded: string[] = [];
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
      const unit = {
        characters: body.length,
        blocks: [
          `<skill name="${name}" location="${skill.filePath}">\n${body}\n</skill>`,
        ],
        references: [] as string[],
      };
      const raw = this.buffers.get(skill.filePath)!.buffer.toString("utf8");
      for (const reference of requiredReferences(raw)) {
        const filename = path.resolve(skill.baseDir, reference);
        const result = await this.reader(role, undefined, names).execute(
          "preload-reference",
          { path: filename },
        );
        const content = result.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        unit.characters += content.length;
        unit.references.push(`${name}/${reference}`);
        unit.blocks.push(
          `<skill-reference skill="${name}" location="${filename}">\n${content}\n</skill-reference>`,
        );
      }
      if (characters + unit.characters > SKILL_BODY_CHARACTER_LIMIT) {
        // Explicit selections are the user's exact set; automatic routing keeps
        // its higher-priority entries and leaves the rest instead of failing.
        // An entry that cannot fit even alone is a library error, not a routing choice.
        if (options.selectedOnly || !loaded.length)
          throw new Error(
            `选定 Skills 和核心参考超过 ${SKILL_BODY_CHARACTER_LIMIT} 字符预算，请缩小选择`,
          );
        continue;
      }
      characters += unit.characters;
      loaded.push(name);
      references.push(...unit.references);
      blocks.push(...unit.blocks);
    }
    return {
      prompt: loaded.length
        ? `${formatSkillsForPrompt(options.selectedOnly ? catalog.filter((s) => loaded.includes(s.name)) : catalog, "read")}\n\nSelected skills and their required references are loaded below; apply them without reading them again. For other linked references, use read with the absolute Skill location's directory plus the relative reference path. ${options.selectedOnly ? "Only these selected Skills and their references are available." : "Read other relevant references only when needed."}\n${blocks.join("\n\n")}`
        : "",
      names: loaded,
      characters,
      references,
    };
  }
}
export const skillLibrary = new SkillLibrary();
