# 实施计划与复用依据（2026-10-19）

## 开发前检查

- DreamaticWeb 初始目录为空；同级 DreamaticWebV1.zip 含此前源码。仅恢复源码、配置样例和测试，不恢复依赖、运行数据或凭据。
- Dreamatic 2.1.0 使用 React 19、TypeScript 5.9、Vite 7、Pi SDK 0.85.1，角色提示词为 YAML frontmatter + Markdown。复用暖灰底、深色侧栏、橙色操作和浅绿品牌色。
- 本次通过 npm registry 核实 Pi 当前发布版为 1.3.0，与上游 main 的 package.json 一致。锁定三个 @earendil-works/pi 包；运行时用 Agent Core、Models provider API 和 coding-agent 的 Skill 发现接口，不复制内部实现。
- 恢复的基础版本已有 OfficeParser/ExcelJS/CSV 解析、GrapesJS、三阶段 Pi Agent、SSE 和版本存储。

## 实施步骤

1. 复用基础代码并审查：不修改相邻 Dreamatic，不读取其 .env。
2. 使用 Pi 的 loadSkillsFromDir 发现 Skill；在公共契约之上补充角色权限、格式/任务匹配和诊断。技能不能增加 shell/网络权限。
3. 提供下拉式模型配置，服务端保存设置和密钥；三角色可独立选择模型，保存后后续任务生效，活动任务期间禁止切换配置。
4. 强化 HTML 白名单和画布 sandbox，保留 HTML/CSS 与原生交互；不允许运行来源脚本。压缩文档、内容类型、解析规模和来源引用均做校验。
5. 模型结果验证失败允许一次定向格式修复；校验完成前不覆盖旧版本。验证取消、失败、重启、并行编辑冲突。
6. 运行类型检查、关键模块测试、真实 Pi + 本地模型端点契约、HTTP API 和 Chrome 闭环验证；更新实际验证记录和运行说明。

## 交付边界

单用户、单进程、本地优先。文档支持 PDF、DOCX、XLSX、CSV、TXT、PPTX 等；扫描件无 OCR 时明确提示，不声称已识别。页面可视化编辑支持文字、布局、样式、组件、设备预览、撤销重做和版本恢复。页面交互使用锚点、details/summary、原生媒体及 CSS；不执行任意生成 JavaScript。外部模型质量需由实际配置的服务商验证，测试模拟端点不能代替这一点。
