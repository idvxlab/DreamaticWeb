import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import matter from "./frontmatter.js";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Role } from "./contracts.js";
export interface Skill {
  name: string;
  description: string;
  roles: Role[];
  formats: string[];
  tasks: string[];
  permissions: string[];
  file: string;
  content: string;
}
const roles: Role[] = ["orchestrator", "analyst", "designer"];
const strings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
export async function discoverSkillCatalog() {
  const roots = [
    path.resolve(".pi/skills"),
    ...(process.env.DREAMATIC_SKILL_PATHS || "")
      .split(path.delimiter)
      .filter(Boolean),
  ];
  const found = new Map<string, Skill>();
  const diagnostics: string[] = [];
  for (const root of roots) {
    try {
      const base = await realpath(root);
      // Pi owns recursive discovery, frontmatter validation and Agent Skills names.
      const loaded = loadSkillsFromDir({ dir: base, source: "dreamatic" });
      diagnostics.push(...loaded.diagnostics.map((d) => d.message));
      for (const skill of loaded.skills) {
        const file = await realpath(skill.filePath);
        if (!file.startsWith(base + path.sep) || skill.disableModelInvocation)
          continue;
        if (found.has(skill.name)) {
          diagnostics.push(`重复 Skill，保留先发现的版本：${skill.name}`);
          continue;
        }
        const { data, content } = matter(await readFile(file, "utf8"));
        const meta =
          data.metadata && typeof data.metadata === "object"
            ? (data.metadata as Record<string, unknown>)
            : {};
        const allowed = data.roles ?? meta.roles;
        const permissions = strings(meta.permissions);
        if (
          !skill.description ||
          content.length > 60000 ||
          permissions.some((p) => p !== "guidance")
        ) {
          diagnostics.push(
            `Skill ${skill.name} 内容超限、缺少说明或请求不支持的执行权限`,
          );
          continue;
        }
        found.set(skill.name, {
          name: skill.name,
          description: skill.description,
          file,
          content,
          roles:
            allowed === undefined
              ? roles
              : strings(allowed).filter((r): r is Role =>
                  roles.includes(r as Role),
                ),
          formats: strings(meta.formats),
          tasks: strings(meta.tasks),
          permissions: ["guidance"],
        });
      }
    } catch (error) {
      diagnostics.push(
        `Skill 目录不可用：${root} (${(error as Error).message})`,
      );
    }
  }
  return { skills: [...found.values()], diagnostics };
}
export async function discoverSkills() {
  return (await discoverSkillCatalog()).skills;
}
export function skillTools(
  skills: Skill[],
  role: Role,
  onLoad: (name: string) => void,
): AgentTool[] {
  const eligible = skills.filter((s) => s.roles.includes(role));
  return [
    {
      name: "list_skills",
      label: "发现技能",
      description:
        "List eligible skills using optional exact format/task filters. Omit filters to browse when task labels are uncertain; format-independent methods match every format. Tasks include brief, revision, document-analysis, data-analysis, dashboard, website, storytelling, content-architecture, product-showcase and visual-style. If a suitable skill name is already in the supplied catalog, load it directly without listing again. Skills are guidance, not executable code.",
      parameters: Type.Object({
        format: Type.Optional(Type.String()),
        task: Type.Optional(Type.String()),
      }),
      execute: async (_id, args) => ({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              eligible
                .filter((s) => {
                  const q = args as { format?: string; task?: string };
                  return (
                    (!q.format ||
                      !s.formats.length ||
                      s.formats.includes(q.format)) &&
                    (!q.task || !s.tasks.length || s.tasks.includes(q.task))
                  );
                })
                .map(({ name, description, formats, tasks, permissions }) => ({
                  name,
                  description,
                  formats,
                  tasks,
                  permissions,
                })),
            ),
          },
        ],
        details: {},
      }),
    },
    {
      name: "use_skill",
      label: "加载技能",
      description:
        "Load a skill by its exact catalog name when useful for this task.",
      parameters: Type.Object({ name: Type.String() }),
      execute: async (_id, args) => {
        const s = eligible.find(
          (s) => s.name === (args as { name: string }).name,
        );
        if (!s) throw new Error("Skill 不存在或当前角色无权加载");
        onLoad(s.name);
        return {
          content: [{ type: "text", text: s.content }],
          details: { name: s.name },
        };
      },
    },
  ];
}
