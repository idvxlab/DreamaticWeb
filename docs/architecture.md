# 后端架构与验证

## Pi 稳定版核实

2026-10-21 查询 npm 官方 registry 的 `dist-tags.latest`：`@earendil-works/pi-agent-core` 与 `@earendil-works/pi-ai` 均为 1.3.0，Node 要求 ≥22.19.0。GitHub latest 同时指向 [v1.3.0](https://github.com/earendil-works/pi/releases/tag/v1.3.0)。依赖及工具 schema 使用的 typebox 1.3.27 均锁定精确版本。

以安装发布包的 README、公开类型声明和该发布版接口为准，未复制运行时内部代码。当前只需要公共 Agent、provider collection 和自定义工具，不安装 coding-agent CLI 或开放任意 shell/文件系统工具。

重要接口：Agent 构造必须提供 streamFn；使用 createModels/createProvider 绑定官方 openAIResponsesApi 或 openAICompletionsApi；上下文的系统提示和工具位于 transcript system message；自定义工具以 TypeBox schema 声明参数，execute 返回 Pi AgentToolResult。结果提交工具返回 terminate:true，避免多一次自动确认请求。finishTurn 控制上限与已提交结果的退出，取消调用 Agent.abort。

官方参考：[Agent](https://github.com/earendil-works/pi/blob/v1.3.0/packages/agent/README.md)、[providers 与 tools](https://github.com/earendil-works/pi/blob/v1.3.0/packages/ai/README.md)。不依据 main 分支的未发布改动实现业务接口。

## 职责和数据

- Orchestrator 只接收请求、已有简报、已答问题和资料目录；提交意图，或仅在阻塞时提问。
- Analyst 读取一次加载的 canonical Markdown，按需分段；提交文本事实与可选素材 ID。不做独立引用定位或逐条验证。
- Designer 直接接收简报、事实或选定事实、素材目录与现有 HTML。局部模式只开放 page_read/page_patch；首次生成及明确整体重设计开放 submit_page。视觉启用时可按需 asset_view。

工具的结构、ID/素材归属、HTML 策略和文件哈希是必要的数据与安全检查，不等同于模型重复审查。失败的工具执行通过 Pi 原有循环反馈实际错误；最多六轮，正常提交后立即结束。没有额外 reviewer、转写模型或隐式角色。

交接文件使用稳定 Markdown 标题和 JSON 转义的列表项，避免多行文本和媒体 URL 引入歧义。持久化前经过一次结构检查；热路径保留已加载数据，冷加载从 Markdown 解析一次。JSON 项仅用于无歧义字段编码，不另存第二份阶段事实文件。project.json 中 brief/analysis 是前端展示投影，后续工作流以 results Markdown 为准。

## 缓存和执行范围

输入 SHA-256 + 格式 + 解析器版本/配置决定能否复用。复用前检查 Markdown 完整性及原件、素材存在性。URL 重导入比较主页面与记录的媒体依赖；有变化才重新提取。媒体按内容寻址，独立媒体原件与素材共享 inode。原始媒体仅读取必要类型/尺寸头信息并直接保存，不启动文档解析 Worker。

意图缓存依赖角色描述和模型设置；目标/受众变化触发更新。事实缓存依赖 canonical Markdown 指纹、事实角色描述、模型设置以及简报中的目标/内容需求，不受纯样式修改影响。显式 refreshFacts 支持重新提取。Designer 角色描述修改无需重跑未受影响的前两阶段。

编辑的默认路径是复用简报/事实并调用 Designer。明确目标/受众词句及 API mode:intent 可触发意图更新；mode:redesign 允许整页替换。自然语言自动路由采用保守关键词判断，不额外调用分类模型；不确定的复杂意图可用显式 mode。这一策略节省调用，但无法保证识别任意表达。

项目级锁阻止同时生成或修改资料。阶段结果使用哈希命名的不可变 Markdown，intent.md/facts.md 是相同物理文件的便捷硬链接；元数据更新前崩溃时，旧引用仍可读取。内容未变化的结果不重复写入。阶段结果完成后保存，故障后显式 resume 复用有效结果。版本 HTML 单独持久化且不可覆盖，元数据保存不会重复写全部页面；新增 HTML 通过临时文件与独占硬链接发布。冷启动可读取旧项目内嵌的 HTML，升级为新格式时保留版本。

## 性能指标与测试边界

测试使用真实 Pi Agent 循环和发布版 provider，在本机模拟端点验证协议；不调用外部付费模型。

实测请求数：首次生成 3；已有结果的局部编辑 1；相同请求复用 0；新增资料 2（Analyst、Designer）；复用简报/事实的整体重设计 1。局部编辑的 intent.md、facts.md 和旧版本 HTML 的 mtime 不变，结果写入数为 0，整页提交数为 0。新增版本仍需持久化一份完整 HTML，这是当前编辑器/导出格式要求，未引入差分版本数据库。

这些数字证明执行路径和请求范围，不代表真实模型质量、网络延迟或绝对加速倍数。原始基线是已停用生成的准备版本，没有可比较的真实模型端到端耗时。metrics 接口记录每次请求的实际服务端耗时和 provider 调用数；sourceReads 指额外 source_read 工具次数，不是操作系统 read 次数；fullPageWrites 指整页提交模式的新增版本次数，非文件系统写调用数。

已有测试覆盖 PDF/DOCX/XLSX 图片及表格提取、HTML 导入、SSRF/CSP、媒体原件/Markdown 关联、解析复用、三阶段交接、角色热加载、选定事实、增量补丁、重设计、提问/恢复/取消、存储迁移与编辑器。另以 Chat Completions 和 Responses 的本机 SSE 响应检验 provider 兼容性。浏览器回归使用明确标识的手动页面与历史数据，不作为真实模型生成质量证明。

当前限制：不做 OCR、视频解码或转录；不递归抓站或执行目标网页脚本；没有接入生产模型进行视觉质量评估；可选 Python PDF 增强环境若未安装，只验证降级路径。

最终验证：`npm run check`、`npm run build`、39 项自动化测试及 `npm run test:ui` 均通过。生产构建仍提示编辑器包体超过 500 kB；未在本次后端改造中重拆 GrapesJS。

## 2026-10-21 Analyst 400 排查

本地任务记录表明：Orchestrator 成功，Analyst 完成一次 source_read，第二次 provider 请求返回通用 invalid_request 400。原 PDF 的 canonical Markdown 长度 28,021 字符，无异常控制字符或未配对代理字符；没有证据表明解析失败。

发现模型适配器将所有模型固定为 reasoning:false，并将 Agent thinkingLevel 固定为 off。Pi 发布包官方目录将当前 gpt-6.1-sol 标为推理模型，最低支持级别为 low。现改为使用公共 openaiProvider 模型目录的 reasoning、thinkingLevelMap、contextWindow 元数据，选择最低受支持思考级别。Pi 可据此请求并在工具续轮中保留 reasoning.encrypted_content。未知自定义模型仍使用原有普通模型配置，不猜测能力。

新增本机 SSE 回归：模拟无状态推理服务在缺失加密推理项时拒绝工具续轮；旧配置复现第二轮 400，修正配置成功。此模拟证明协议缺陷，并非对原外部网关错误原因的独立证明。当前配置的实际端点另以纯合成文字完成两轮工具往返，返回成功；未重放原用户资料，原任务的唯一根因尚不能由通用 400 确定。

Analyst 现在在既有 120,000 字符总预算内直接使用完整来源，不再逐份强制截断到 20,000 字符；超出总预算仍保留 source_read。错误事件新增协议、模型、第几轮、最近工具、可获得的 HTTP 状态和服务商 request ID，不记录凭据或原文。

本次修正通过类型检查、生产构建和 40 项测试。前端设计未变。原任务复验涉及向外部端点再次发送原文档，自动审批拒绝了该诊断；当前只使用合成数据做外部验证，未改写原任务数据。
