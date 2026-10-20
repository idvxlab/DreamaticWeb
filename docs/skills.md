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

## 内置方法与选择

| Skill                | 角色                  | 主要使用场景                       |
| -------------------- | --------------------- | ---------------------------------- |
| intent-alignment     | Orchestrator          | 对齐目标、范围与关键选择           |
| evidence-analysis    | Orchestrator、Analyst | 多来源证据取舍、去重和冲突处理     |
| content-architecture | Analyst、Designer     | 从资料组织页面层级及忠实的网页表达 |
| product-showcase     | Analyst、Designer     | 产品系列、型号、参数条件及案例对应 |
| data-storytelling    | Analyst、Designer     | 可比指标、表格与静态数据展示       |
| web-design           | Designer              | 根据访客任务选择通用页面结构       |
| editorial-web        | Designer              | 叙事、长文与图文阅读节奏           |
| accessible-interface | Designer              | 需要详细处理的可访问性问题         |

筛选使用精确标签：brief、revision、document-analysis、data-analysis、
dashboard、website、storytelling、content-architecture、product-showcase。
角色权限始终生效；同时指定 format 和 task 时，两项条件都需要满足。
未声明 formats 的方法不受文件格式限制，例如 DOCX 中的数字表格也能匹配
data-storytelling。只有方法依赖特定格式时才声明 formats，不用格式模拟内容分类。
外部 Skill 可保留自定义任务标签；标签未知时省略过滤，读取可用目录后按说明选择。

名称与简短说明已随角色输入提供，可直接 use_skill，无需重复 list_skills。
不要固定加载全部技能；常规任务选择必要方法，专项方法按实际内容组合。
输出结构、基础可读性、工具权限和修复流程仍由角色提示词与宿主管理，
Skill 不增加新提交契约、访谈阶段、解析能力或执行权限。

## 可选视觉方向

| Skill               | 方向       | 主要方法                                 |
| ------------------- | ---------- | ---------------------------------------- |
| technical-precision | 严谨技术型 | 对齐网格、参数层级、清晰图注与系统性表达 |
| expressive-brand    | 品牌表现型 | 视觉焦点、图文比例、品牌识别与节奏对比   |
| refined-minimal     | 简约精致型 | 比例、留白、排版细节及克制的视觉层级     |

三项均仅供 Designer 使用，标签为 visual-style、website、revision，
不受文件格式限制。list_skills({"task":"visual-style"}) 可筛选四种方向，包括编辑叙事风格；
已有 editorial-web 继续作为叙事阅读方向。应用方法与视觉风格分开选择：
产品页不必采用技术型，技术企业也可以采用简约或品牌表现型。
用户要求优先，其次结合素材、受众和用途判断；有帮助时按需加载一种
主要风格，常规任务不必加载，局部修改默认保留已有方向。
风格方法不绑定色值、整页模板或未实现的交互；配色沿用现有视觉证据
交接与可读性检查，不新增确认流程、模型阶段或固定加载组合。

## 角色与运行能力的适配

共享 Skill 只指导当前角色能够完成的工作：data-storytelling 中由 Analyst
调用 table_query 并携带计算条件与结果，Designer 负责表达已有结果，不自行
请求该工具。可访问性方法限定于当前支持的 HTML/CSS 和原生交互，使用
表格、CSS 图表及 details/summary，避免 canvas 或依赖脚本的自定义模态行为。

文案范围由 Designer 提示词统一定义：首次制作允许忠实改写原始资料，
用户批准的精确文案需要保留，局部修改保留范围外的页面内容。风格 Skill
只补充专项表达方法，沿用统一的配色证据、修改范围、提交与验证规则。
