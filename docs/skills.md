# Skill 注册、发现与加载

使用 Pi 1.3.0 的 `loadSkillsFromDir`，不另建注册数据库。将目录放到 `.pi/skills` 或 `DREAMATIC_SKILL_PATHS` 指定的可信本地目录，即完成注册。每次生成重新发现，按名称去重；目录内递归发现，拒绝越界符号链接。发现问题可通过 `GET /api/skills/diagnostics` 查看。

## 格式

```md
---
name: financial-tables
description: 从财务表格构建有单位、期间和证据来源的数据展示。
metadata:
  roles: [analyst, designer]
  formats: [xlsx, csv, pdf]
  tasks: [data-analysis, dashboard]
  permissions: [guidance]
---

# 适用范围

用户要求财务数据展示且已有相关材料。

# 输入

当前任务 brief、来源 ID、表格、单位、期间、解析警告。

# 执行

保留原值，区分缺失和零，不相加不同单位，不生成无依据的趋势。

# 输出

Analyst 输出事实及 sourceId；Designer 使用带标题和来源说明的表格。
遵循各角色现有 JSON/HTML 输出契约，不替换宿主契约。

# 错误处理

缺少单位、期间或数据截断时明确列入 limitations，必要时请求澄清。
```

兼容已有 Dreamatic 的顶层 `roles` 字段。省略 roles 表示三个角色都可加载；未知角色不会获权。省略 formats/tasks 表示通用技能。

## 工具调用

1. `list_skills({"format":"xlsx","task":"dashboard"})` 返回匹配技能的名称、说明、适用范围和权限；无参数返回当前角色全部可用技能。
2. `use_skill({"name":"financial-tables"})` 返回已发现技能正文并记录加载事件。
3. 当前角色无权访问或名称不存在时返回工具错误，模型可选择另一项技能；发现过程不会执行技能中的脚本。

上传的文档永远不会进入 Skill 目录。permissions 当前只支持 `guidance`；请求 shell/network 等权限的技能会被拒绝并记录诊断。Skill 是按需知识，若需要 OCR 或其他外部能力，应先实现具有限额和权限校验的受控工具，而非让 Markdown 获得主机执行权限。
