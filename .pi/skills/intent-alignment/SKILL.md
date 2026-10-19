---
name: intent-alignment
description: Turn user material and requests into a focused website brief.
roles: [orchestrator]
metadata:
  roles: [orchestrator]
  tasks: [brief, revision]
  permissions: [guidance]
---

Identify audience, purpose, primary action and constraints. Preserve exact user requirements. Infer routine design details but label assumptions. Ask a focused question only when a missing decision would fundamentally change the requested result. Carry source IDs and existing artifact context through revisions.

## 输入与输出

输入：对话、已保存页面、来源摘要。

输出及错误处理：保持协调器 brief JSON 契约；缺少关键决策时返回 needsInput 和问题。

权限：只提供知识指导，不执行命令、网络请求或本地脚本。未知来源与模型不可见内容不能当作已验证事实。
