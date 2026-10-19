import type { Role } from "./contracts.js";
const common = [
  "list_skills",
  "use_skill",
  "project_context_read",
  "source_read",
  "source_search",
  "asset_inspect",
];
export const roles: Record<
  Role,
  { name: string; tools: string[]; status: string }
> = {
  orchestrator: {
    name: "Orchestrator",
    tools: [...common, "submit_result", "ask_user"],
    status: "正在理解需求并对齐设计目标",
  },
  analyst: {
    name: "Analyst",
    tools: [...common, "submit_result", "table_query"],
    status: "正在分析资料、核对证据和筛选素材",
  },
  designer: {
    name: "Designer",
    tools: [...common, "page_validate", "page_preview", "page_patch"],
    status: "正在设计界面并生成响应式页面",
  },
};
export function checkRoleTools(
  role: Role,
  declared: unknown,
  supplied: string[],
) {
  const expected = [...roles[role].tools].sort().join(",");
  if (
    !Array.isArray(declared) ||
    [...declared].sort().join(",") !== expected ||
    [...supplied].sort().join(",") !== expected
  )
    throw new Error(`Role tool contract mismatch: ${role}`);
}
