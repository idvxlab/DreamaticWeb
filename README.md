# Dreamatic · Web

基于 Pi 1.3.0 公共 Agent 和 provider API 的三角色网页创作系统。保留现有工作台和 GrapesJS 视觉设计，后端以减少端到端重复处理为目标。

## 启动

Node.js ≥22.19.0。

```sh
npm ci --ignore-scripts
cp .env.example .env
npm run dev
```

打开 [开发工作台](http://127.0.0.1:5173)，在「模型与设置」填写模型 URL、名称和密钥，选择实时模式。OpenAI 使用 Responses；OpenAI 兼容型使用 Chat Completions。Analyst、Designer 可单独配置，默认继承推理模型。需要支持工具调用的模型。

演示模式不调用模型，并明确提示切换实时模式；不会将本地示例冒充生成结果。测试中的示例均明确标注，使用本机模拟端点。

```sh
npm run check
npm test
npm run build
npm start
npm run test:ui
```

生产服务：[本机 4310 端口](http://127.0.0.1:4310)。浏览器测试使用本机 Chrome，可设置 `CHROME_PATH`。

## 核心流程

1. 文档和网页导入后保存原始文件、唯一规范 Markdown 和关联媒体。相同输入指纹和解析配置复用已有结果；URL 再导入会检查主页面及已记录媒体依赖的内容变化。
2. 首次生成依次运行 Orchestrator、Analyst、Designer。简报和事实以结构化 Markdown 交接，内存中直接复用已加载内容。
3. 局部编辑复用有效简报和事实，只调用 Designer，按选择器提交最小页面补丁。事实列表可勾选内容并带入调整请求。
4. 新增资料使事实缓存失效；目标或受众变化时重做意图。明确要求整体重设计时允许整页生成。普通编辑不开放整页提交工具。
5. 每个阶段提交结果后直接终止，不追加确认调用或逐条事实核验。文件完整性、资源归属、页面结构和 HTML 安全策略仍保留。

角色定义在 `config/agents/*.md`，每次任务重新加载；修改对应文件后会使相关缓存失效，无需修改业务代码。任务结果在项目内 `results/intent.md` 和 `results/facts.md`，与角色定义分开管理。

## 文件与复用

```text
<workspace>/projects/<id>/
  project.json       # 元数据、对话、UI 投影和结果指纹；不重复内嵌 HTML
  uploads/           # 上传原件或下载的主网页内容
  sources/<id>/      # reading.md 和完整性清单
  assets/            # 可直接使用的原始媒体及文档提取媒体
  results/           # intent.md、facts.md
  pages/             # 不可变的页面版本 HTML
  previews/          # 手动打开的浏览器快照
```

素材按内容寻址，避免相同媒体重复写入；独立图片/视频的原件与素材通过硬链接共享物理文件。Markdown 直接包含可解析的项目素材 URL。前端按原始文件、Markdown 解析文档和媒体分类展示，并支持原件与 Markdown 下载。

PDF、DOCX、XLSX 和其他已支持格式继续使用现有本地解析器；图片、视频不解码、不转录、不调用模型。旧 DOC/XLS 需转换为 DOCX/XLSX。扫描 PDF 的 OCR 和需要登录或执行脚本的网页不在当前实现范围。

网页只抓取指定页面和最多 12 项相关媒体，不递归爬站。重导入需要检查远程依赖，因此仍有网络请求。按需在 Designer 中查看图片只在启用视觉能力时开放，不会在导入阶段自动发给模型。

## API 与运行

- `POST /api/projects/:id/run`：`text`，可选 `mode: auto|edit|redesign|intent`、`selectedFactIds`、`refreshFacts`。
- `POST /api/projects/:id/resume`：复用已持久化的有效阶段继续中断任务。
- `POST /api/projects/:id/cancel`：中止 Pi 执行，保留已有版本与阶段结果。
- `GET /api/projects/:id/results/intent|facts`：下载阶段 Markdown。
- `GET /api/projects/:id/metrics`：请求级耗时、Pi provider 请求数、额外来源读取、结果写入及补丁范围。
- `GET /api/projects/:id/sources/:source/original|reading`：下载原件或规范 Markdown。

每次任务的输出结果通常各一次调用即可完成；需要分段读取大型文档或修正实质错误时允许工具后续轮次，最多六轮、每阶段五分钟。没有批量事实审查、自动浏览器视觉审查或隐式重试整个流程。

现有项目 JSON 支持读取内嵌 HTML 的旧存储格式；后续保存采用独立 HTML 文件。设置文件仍在初始 workspace 的 `settings.json`，密钥权限 0600，API 不回传密钥。不要将 workspace 或凭据提交。

默认只监听回环地址，对外监听须设置 `DREAMATIC_ACCESS_TOKEN`。保留同源限制、SSRF 防护、HTML 白名单、CSP 和 iframe sandbox。页面局部补丁绑定版本 ID，不能覆盖并发更新。项目删除会永久删除该独立目录。

详细架构、Pi 核实记录和验证边界见 [架构与验证](docs/architecture.md)。

## 专业 Skills

`.agents/skills` 保存 10 项可移植 Skill。Pi 通过官方 `loadSkillsFromDir` 发现、`formatSkillsForPrompt` 展示目录、`createReadTool` 按需读取；角色权限和文件缓存由应用适配。仅添加锁定版本的 `pi-coding-agent@1.3.0` 原生加载依赖，不启用它的 CLI、shell 或额外 Agent。

Analyst 默认使用 `analyst-information-extraction`。Designer 根据任务选择网站类型并组合必要的架构、视觉或交互指导，最多四项；简单文字编辑不加载设计 Skill。选定正文在现有模型请求前注入，不额外调用模型选择 Skill。可用 `/skill:designer-editorial` 明确选择已安装技能。参考资料通过受限原生 `read` 工具按需加载，不预读全部参考内容。

`GET /api/skills` 展示真实目录，`/api/skills/diagnostics` 返回原生发现诊断。新增或修改目录被 watcher 发现；相关 Skill/参考文件变化影响对应缓存指纹，不因修改无关技能而重跑分析。指标增加 Skills、加载字符数、预加载耗时和实际 provider token 用量。

同一目录由 Codex 原生 `.agents/skills` 发现；`.claude/skills` 是指向它的符号链接。格式与资源访问已检查，Claude 客户端是否执行通过须以当前环境的实际测试为准。完整职责、兼容性与质量/性能报告见 [Skills 实施记录](docs/skills.md)。

显式离线评估（只发送脚本内合成材料，不重放用户文档）：

```sh
node --import tsx scripts/evaluate-skills.ts --live --output /private/tmp/dreamatic-skill-evaluation
```

该命令会使用当前项目配置的模型，最多四次请求。生产运行不执行评分或对照提取。支持 `--role analyst|designer` 与 `--condition baseline|skills` 限定单个对照样本。

## 事实勾选与页面更新

页面版本记录 Designer 实际采用的 `appliedFactIds`，事实卡片默认勾选当前页面已采用的事实。勾选变化只修改待应用选择；与已应用状态不同时才显示「更新页面」，支持取消全部。点击后复用已有简报与分析结果，仅通过 Designer 增量修改页面；成功后同步版本关联，失败保留原页面与待应用选择。历史恢复同步恢复对应事实关联，刷新后从版本记录恢复勾选。旧版本缺少关联记录时不推断为全部已采用，可通过显式选择更新建立记录。
