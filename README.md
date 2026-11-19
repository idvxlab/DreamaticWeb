# Dreamatic · Web

基于 Pi 1.3.0 公共 Agent 和 provider API 的三角色网页创作系统。保留现有工作台和 GrapesJS 视觉设计，后端以减少端到端重复处理为目标。

## 服务端并发实验版

本目录是独立实验副本，基于官方提交 `109fa5ed8a7e4e4a042c67b6f4ffd0cd36b4a453`，记录在 `BASE_COMMIT.txt`。正式 `DreamaticWeb` 目录及 `k6-lab` 均不参与修改。实现面向一台服务器上的一个后端进程，不依赖 macOS、开发者电脑配置或压测用户数；没有新增运行依赖。

### 已实现的请求调度

- **网页生成**：默认同时执行 4 个任务，另外最多 100 个任务按提交顺序等待。满载返回 `503`、`code: capacity_full` 和 `Retry-After: 5`，不把拒绝的请求写入项目对话。排队任务可取消、可超时，运行失败也会释放名额。已有前端仍显示运行中，并在运行信息里提示排队。
- **文件上传和 PDF 解析**：默认同时接收 4 个上传请求，文件先写入临时目录；最多 2 个解析任务执行，20 个等待。取得解析名额后才将文件读入内存。断开上传连接或取消任务会清理临时文件、停止对应解析 Worker；Worker 停止后才释放名额。单文件 30 MiB、每次 12 个文件和解析 45 秒上限沿用官方实现。
- **模型请求 / API Key 池**：单 Key 可直接使用；有多把等价 Key 时只在当前角色配置声明的池内分配，优先可用、负载较低的 Key。同一服务地址与同一 Key 在不同角色中的调用共享限制。每 Key 默认并发 4，可配置请求频率；收到 429 或 503 后暂时冷却。已开始的流式请求不会自动换 Key 重放，以免重复计费或重复执行工具。
- **运行信息**：`GET /api/capacity` 返回上传、解析、生成的运行数/等待数/上限，以及模型 Key 数、运行数、等待数和冷却数；`GET /api/projects/:id/scheduling` 返回项目队列位置；生成指标增加 `queueWaitMs`，原有 Token 统计继续保留。这些接口沿用现有访问令牌校验，不返回 Key。
- **停止服务**：SIGTERM/SIGINT 会拒绝新入队、取消等待及运行任务，最多等待 10 秒保存退出。等待顺序不持久化；重启后沿用官方“继续未完成任务”入口，复用已经保存的阶段结果，不自动重新调用模型。

这里的“Token 池”指 API Key 凭据池，不是把模型输入/输出 Token 混在一起计费。限流按请求数和并发数控制，暂不估算 TPM。来自同一供应商账户的多把 Key 可能共享供应商额度，不能把 Key 数量直接当成额度倍数。

### 服务器参数

参数在服务启动时读取，修改后需重启。`.env.example` 包含完整示例。

| 参数                                  | 默认值 | 含义                                               |
| ------------------------------------- | -----: | -------------------------------------------------- |
| `DREAMATIC_GENERATION_CONCURRENCY`    |      4 | 同时执行的完整生成任务数                           |
| `DREAMATIC_GENERATION_QUEUE_SIZE`     |    100 | 等待生成的任务数，0 表示不等待                     |
| `DREAMATIC_IMPORT_CONCURRENCY`        |      2 | 同时解析资料数                                     |
| `DREAMATIC_IMPORT_QUEUE_SIZE`         |     20 | 等待解析的任务数                                   |
| `DREAMATIC_UPLOAD_CONCURRENCY`        |      4 | 同时接收上传请求数，超出直接拒绝                   |
| `DREAMATIC_QUEUE_WAIT_MS`             | 300000 | 每次排队最长等待时间；不限制实际生成总时长         |
| `DREAMATIC_UPLOAD_TIMEOUT_MS`         | 120000 | 接收完整 HTTP 请求体的时间限制                     |
| `DREAMATIC_MODEL_CONCURRENCY_PER_KEY` |      4 | 每个服务地址 + Key 的请求并发上限                  |
| `DREAMATIC_MODEL_QUEUE_SIZE_PER_KEY`  |    100 | 每 Key 的等待名额                                  |
| `DREAMATIC_MODEL_RPM_PER_KEY`         |      0 | 每分钟请求上限，均匀放行；0 表示不开启额外频率限制 |
| `DREAMATIC_MODEL_COOLDOWN_MS`         |  30000 | Key 收到 429/503 后的冷却时间                      |
| `DREAMATIC_MODEL_MAX_CREDENTIALS`     |   4096 | 进程内最多保留的凭据配额状态数，闲置状态可回收     |

同一模型配置可选 `DREAMATIC_API_KEYS='["key-a","key-b"]'`；Analyst、Designer 分别可用 `DREAMATIC_ANALYST_API_KEYS`、`DREAMATIC_DESIGNER_API_KEYS`。数组优先于对应的单个 `API_KEY`，最多 16 把，必须是被授权用于该模型配置的等价凭据。不同用户的私人 Key 不应混成一个共享池。池不通过配置读取接口返回，普通设置更新会保留池，清除密钥会同时清除池。

本实验副本已增加可选的个人配置与项目访问隔离，启用方式见下文。未启用时保留原有单用户设置行为。多用户模式下，每人保存自己的模型配置，不能修改服务器工作目录；没有配置个人 API 时直接提示配置，不会调用服务器或其他用户的 Key。

默认 4 个运行名额加 100 个等待名额只规定接纳策略，不代表服务器已通过 1000 用户压测。大量请求到达时，超出容量的请求会收到繁忙响应。客户端应按 `Retry-After` 加随机间隔重试；上传重试需重新发送文件。实际可接受吞吐量需在目标服务器上测量。

### 部署和验证

在服务器单独放置本目录，使用 Node.js ≥22.19.0，安装依赖、构建后运行一个进程。开发阶段的 `node_modules` 是只读使用的共享链接；迁移时不复制该链接或现有 `dist`，在服务器重新 `npm ci --ignore-scripts`。不要对共享链接进行包安装或依赖升级。

```sh
npm ci --ignore-scripts
cp .env.example .env
# 编辑 .env：设置 HOST、PORT、访问令牌、模型端点以及上述并发参数。
# 对外监听可设 HOST=0.0.0.0，同时启用个人令牌（见下文），或使用单用户 ACCESS_TOKEN。
# DREAMATIC_WORKSPACE 使用服务器上的独立可写绝对路径。
npm run build
npm start
```

同一个 workspace 只运行一个后端进程；当前是单进程内的请求和 Key 分配，**没有实现跨后端实例的负载均衡**。不应通过 PM2 cluster 或多副本共享此 workspace 来扩大并发。下一阶段确需多实例时，再引入共享队列、任务归属和可并发存储。

本阶段验证无需模型账号，以下命令会清除继承的模型环境变量、使用临时 workspace 和模拟接口，并阻止 Node 测试进程连接外部地址；包含真实后端的上传、解析、排队、取消及 SSE 调用检查。它是功能验证，不是服务器吞吐量压测。完整回归还包含原有浏览器用例，需要已安装的 Chrome/Chromium；可通过 `CHROME_PATH` 指定服务器或 CI 上的浏览器可执行文件，不会自动下载浏览器。

```sh
npm run test:offline
```

队列测试中的 1000 项是轻量任务，用于验证并发上限和等待顺序，不是 1000 个真实 PDF 或模型生成请求。真实负载测试继续使用独立的 `k6-lab` 模拟 API，在目标服务器就绪后进行。此次没有启动常驻服务、没有调用真实付费 API。

### 多用户：各自配置模型，共用一个后端

管理员为每人发放一个个人访问令牌。令牌用于识别工作台用户，与用户自己的模型 API Key 是两回事；服务器只保存个人访问令牌的 SHA-256 摘要。无需新建数据库、注册页面或密码系统。

在服务器的本实验副本目录执行以下命令，示例路径可换成管理员自己的私有配置目录：

```sh
node scripts/user-access.mjs /srv/dreamatic/private/users.json alice
node scripts/user-access.mjs /srv/dreamatic/private/users.json bob
```

命令只生成令牌，不请求模型。把每条命令输出的个人令牌分别交给对应用户。相同用户 ID 再执行一次会轮换其令牌；删除 JSON 文件中某位用户的记录可撤销访问。新增、轮换、撤销均在后端重启后生效。不要把旧用户 ID 分配给另一个人，否则其已有配置和项目也会交给新的持有人。

在后端 `.env` 设置：

```dotenv
HOST=0.0.0.0
DREAMATIC_WORKSPACE=/srv/dreamatic/data
DREAMATIC_USERS_FILE=/srv/dreamatic/private/users.json
DREAMATIC_ALLOWED_MODEL_URLS='["https://your-authorized-gateway.example/v1"]'
# HTTPS 反向代理部署时启用：
DREAMATIC_COOKIE_SECURE=true
```

模型地址白名单由管理员填写允许使用的实际 Base URL；每个用户仍可选择各自的模型名称和 Key。支持列出多个模型网关，但用户不能借模型配置请求任意服务器内部地址；模型请求也不跟随重定向。隔离测试只把临时模拟端点列入白名单，没有使用真实网关或 Key。

用户打开工作台后，进入「模型与设置 → 系统」，在「个人 / 服务访问令牌」填入自己的访问令牌并点击「链接服务」。页面会重新载入，清除前一个身份的页面状态和未保存配置。随后在模型设置里填写本人的 URL、模型名及 API Key 并保存；界面会显示当前用户 ID。不同账号做对照时使用独立浏览器配置或浏览器上下文，避免同一个浏览器的图片访问 Cookie 相互覆盖。

隔离规则：

- `GET/PUT /api/config` 仅操作当前令牌对应用户的设置，忽略请求中的 `userId` 和 `X-User-Id`。用户配置存放于 `<workspace>/users/<id>/settings.json`，目录权限 0700、配置文件权限 0600；API Key 不返回给浏览器，也不写入项目记录。服务管理员仍具有磁盘管理权限，这不是密钥托管或加密保险库。
- 启用个人令牌后，不加载全局 `settings.json`，也不继承全局 `DREAMATIC_*` 模型配置；全局 `ACCESS_TOKEN` 不再作为备用登录方式。未填写个人 Key、或清除个人 Key 后，新任务会拒绝启动。
- 新项目由后端写入所属用户。列表、文件、事实、历史版本、导出、预览、运行日志、取消及继续任务接口都会检查项目归属。其他用户请求一律返回 404，匿名请求返回 401。旧的无所属用户项目保留在磁盘，但不会自动分配给任何人或显示在多用户列表中。
- 生成任务入队时复制本人的完整模型配置。随后修改设置仅影响后续提交的新任务；已排队和正在执行的任务继续使用原配置，需要立即停止旧 Key 的使用时先取消这些任务。继续中断任务会读取同一用户的当前配置。
- 所有用户共享生成、上传、解析队列和容量上限；模型请求仍按各自配置中的 Key 分配、限流，不会从另一个用户的池借 Key。这里是全局 FIFO，没有新增按用户轮流调度或独立套餐额度。
- 图片和独立预览使用只读的 HttpOnly Cookie 鉴权，业务 API 始终要求个人 Bearer 令牌；隔离的交互预览通过鉴权接口内嵌所属图片，不把凭据放入生成 HTML。多用户模式的「打开」在访问者浏览器打开页面，不尝试启动服务器的桌面浏览器。

接口路径与单用户模式相同；接入程序只需给请求设置 `Authorization: Bearer <个人访问令牌>`。用户配置只保留一份当前值，任务配置只在内存中保留到任务结束；不引入注册、找回密码、复杂角色权限或分布式队列。部署仍是一个后端进程，跨实例负载均衡尚未实现。

`tests/user-isolation.test.ts` 使用两位假用户、两个模拟模型服务，验证同时生成与全局排队、入队配置快照、越权拒绝、私有文件与预览、浏览器切换身份、重启后继续任务和令牌撤销。完整离线回归命令仍是 `npm run test:offline`，可用 `CHROME_PATH` 指定已安装的浏览器。

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

开发模式修改源码或安装依赖会重启服务，中断正在上传或生成的请求。上传连接中断后可在提示中手动重试，已导入的相同资料会复用；测试长任务时可使用 `npm run build` 后 `npm start`，避免源码监听重启。

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

文档导入默认保留最多 200 个去重素材、累计 80 MiB，达到限制会提示。导入时程序（不调用模型）为文档提取图片记录页码、页面上紧邻的文字，并以像素/版面信号标记纯色块、空白底框、拼接碎片和整页背景；这些信息写入规范 Markdown 的素材列表，只表示版面位置，不是图片内容判断。纯色块与空白底框保留原件，但不进入 Agent 素材目录，事实中的引用会被剔除，生成页面使用它们会被拒绝（手动保存只警告）。Analyst 提交后，程序把“邻近文字只指向一条事实”的同源图片补为该事实的候选（不含整页背景）。

Designer 使用事实里的素材 ID 和素材目录，需要确认图片类型时用一次 asset_view 批量查看（最多 12 张，返回一张编号拼版图），因此看多张只增加一轮调用；单张查看的大图仅在查看时生成压缩预览，网页仍引用原图。新解析不再生成启发式图文关联附录；旧规范 Markdown 和历史记录保持原样，重新导入后才有上述标记。

## API 与运行

- `POST /api/projects/:id/run`：`text`，可选 `mode: auto|edit|redesign|intent|answer`、`selectedFactIds`、`refreshFacts`。`answer` 仅回答，不写页面；自动模式识别“只解释”“先回答”等明确只读要求。
- `POST /api/projects/:id/resume`：复用已持久化的有效阶段继续中断任务。
- `POST /api/projects/:id/cancel`：中止 Pi 执行，保留已有版本与阶段结果。
- `GET /api/projects/:id/results/intent|facts`：下载阶段 Markdown。
- `GET /api/projects/:id/metrics`：请求级耗时、Pi provider 请求数、额外来源读取、结果写入及补丁范围。
- `GET /api/projects/:id/sources/:source/original|reading`：下载原件或规范 Markdown。

每次任务的输出结果通常各一次调用即可完成；需要分段读取大型文档或修正实质错误时允许工具后续轮次，最多六轮。暂时移除每阶段五分钟硬截止，仍可主动停止；provider 自身的超时仍可能报错。没有批量事实审查、自动浏览器视觉审查或隐式重试整个流程。

内联 JavaScript 在保存、编辑和导出中保留，通过“预览”或“打开”执行；设计画布仍用于编辑，不执行脚本。交互预览使用仅 allow-scripts 的隔离环境，无工作台同源权限，CSP 禁止网络请求和外部脚本。使用 script 与 addEventListener，事件属性仍被清理。Designer 看大图时按需生成不超过 1600px、1 MiB 的 JPEG 预览并缓存，网页继续引用原图。

现有项目 JSON 支持读取内嵌 HTML 的旧存储格式；后续保存采用独立 HTML 文件。设置文件仍在初始 workspace 的 `settings.json`，密钥权限 0600，API 不回传密钥。不要将 workspace 或凭据提交。

默认只监听回环地址，对外监听须设置 `DREAMATIC_ACCESS_TOKEN`。保留同源限制、SSRF 防护、HTML 白名单、CSP 和 iframe sandbox。页面局部补丁绑定版本 ID，不能覆盖并发更新。项目删除会永久删除该独立目录。

详细架构、Pi 核实记录和验证边界见 [架构与验证](docs/architecture.md)。

## 专业 Skills

`.agents/skills` 保存 10 项基础 Skill 和 8 项 ZJT 上游适配版（Awwwards、frontend-design、Impeccable、animate、overdrive、Motion Design、web-animation-design、3d-transforms）。Pi 通过官方 `loadSkillsFromDir` 发现、`formatSkillsForPrompt` 展示目录、`createReadTool` 按需读取；角色权限和文件缓存由应用适配。继续使用锁定版本的 `pi-coding-agent@1.3.0`，不启用它的 CLI、shell 或额外 Agent。

Analyst 默认使用 `analyst-information-extraction`。未指定时，Designer 根据任务选择网站类型及必要的架构、视觉或交互指导，最多四项；简单文字编辑不加载设计 Skill。显式 `/skill:名称` 则精确使用所列组合，不再混入默认视觉/交互 Skill，读取权限也限定在该组合及其参考资料。选定正文在现有模型请求前注入，不额外调用模型选择 Skill。参考正文继续按需读取，缓存避免重复读盘。

例如在需求前加两行，再写同一句页面要求：

```text
/skill:designer-impeccable
/skill:designer-3d-transforms
用上传资料生成公司产品宣传页，首屏要有明显、有主题的空间动效，桌面和手机都能正常浏览。
```

正文合计上限为 24,000 字符（原为 18,000），不是 Token 数，也不会自动填满；每次仍最多四项，单个可读 Markdown 文件仍最多 48,000 字节。适配版保留内联 JavaScript、CSS 3D、原生动画和动态 Canvas/WebGL 方向，不假设外部库已加载。每项 `upstream.json` 记录原包/来源/适配文件指纹和改动边界，许可证随包保留。正式生成效果和首次成功率需后续真实实验确认。

运行前可离线检查选择和预算（不调用模型、不生成项目）：

```sh
node --import tsx scripts/check-skills.ts --request '/skill:designer-impeccable /skill:designer-3d-transforms 生成公司官网'
```

需要真实单次对照时，可在已设置 `DREAMATIC_*` 模型环境变量的进程中运行：

```sh
node --import tsx scripts/experiment-skills.ts --live --source /absolute/path/company.pdf --output workspace/experiments/skill-trial
```

默认先跑完整流程，再让 8 个适配版各复用同一份简报和事实、独立生成一次；对比 Designer 耗时。项目保存在同一 Workspace，前端可直接看到。`summary.json` 汇总耗时、模型调用和失败，分组 `trace.json` 保留工具尝试及修复，候选与最终 HTML 单独保存；不写入密钥。Agent 在原流程中的自修复仍计入本次尝试。已有尝试不自动重跑，可用 `--only designer-名称` 限定下一组。Ctrl+C 或 SIGTERM 会中止当前请求并停止后续组。实验默认每组最多 15 分钟，生产流程没有增加超时或审查阶段。浏览器效果、触控、保存重开和导出需要另外验收，工具提交成功不能替代这些检查。

`GET /api/skills` 展示真实目录，`/api/skills/diagnostics` 返回原生发现诊断。新增或修改目录被 watcher 发现；相关 Skill/参考文件变化影响对应缓存指纹，不因修改无关技能而重跑分析。指标增加 Skills、加载字符数、预加载耗时和实际 provider token 用量。

同一目录由 Codex 原生 `.agents/skills` 发现；`.claude/skills` 是指向它的符号链接。格式与资源访问已检查，Claude 客户端是否执行通过须以当前环境的实际测试为准。完整职责、兼容性与质量/性能报告见 [Skills 实施记录](docs/skills.md)。

显式离线评估（只发送脚本内合成材料，不重放用户文档）：

```sh
node --import tsx scripts/evaluate-skills.ts --live --output /private/tmp/dreamatic-skill-evaluation
```

该命令会使用当前项目配置的模型，最多四次请求。生产运行不执行评分或对照提取。支持 `--role analyst|designer` 与 `--condition baseline|skills` 限定单个对照样本。

## 事实勾选与页面更新

页面版本记录 Designer 实际采用的 `appliedFactIds`，事实卡片默认勾选当前页面已采用的事实。勾选变化只修改待应用选择；与已应用状态不同时才显示「更新页面」，支持取消全部。点击后复用已有简报与分析结果，仅通过 Designer 增量修改页面；成功后同步版本关联，失败保留原页面与待应用选择。历史恢复同步恢复对应事实关联，刷新后从版本记录恢复勾选。旧版本缺少关联记录时不推断为全部已采用，可通过显式选择更新建立记录。
