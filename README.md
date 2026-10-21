# Dreamatic · Web

系统重构准备版本。保留现有 React 工作台、GrapesJS 画布和全部前端视觉设计；原智能体运行时、三角色工作流、模型调用适配、工具、Skill、提示词及相关设计文档已删除。

当前可用：项目创建、重命名和删除，文件及公开网站导入，Markdown 文档下载，已有页面的可视化编辑、版本保存和恢复、响应式预览、浏览器打开及 HTML 导出。项目资料和页面保存在独立的 workspace 目录中。

生成、继续任务和回答后继续执行的接口暂时返回 HTTP 503 与 `GENERATION_UNAVAILABLE`，不会调用模型或创建示例页面。技能列表返回空数组。设置界面及其配置字段保留以维持现有设计，目前仅保存配置，不执行模型调用。历史记录所需的数据类型只用于界面显示。

## 开发与运行

需要 Node.js 22.19+。

```sh
npm ci --ignore-scripts
cp .env.example .env
npm run dev
```

开发前端：[http://127.0.0.1:5173](http://127.0.0.1:5173)。API 默认监听本机 4310 端口。

```sh
npm run check
npm test
npm run build
npm start
```

生产构建由 [http://127.0.0.1:4310](http://127.0.0.1:4310) 同源提供。
`npm run test:ui` 使用本机 Chrome 检查保留的界面与编辑流程，使用明确标注的测试页面，不依赖生成服务。可通过 `CHROME_PATH` 指定 Chrome 路径。

## 目录

- `apps/web`：现有界面、样式和画布。
- `apps/server`：API、资料解析、存储、HTML 校验与预览。
- `packages/shared`：界面数据类型、设置结构与 HTML 策略。
- `tests`：资料解析、页面安全、存储、API 与界面数据处理测试。
- `docs/screenshots`：保留的界面参考截图。
- `workspace`：忽略提交的运行数据。

```text
<workspace>/projects/<project-id>/
  project.json       # 项目及历史界面数据
  uploads/           # 上传原件
  sources/           # 标准 Markdown 文档和清单
  assets/            # 项目图片与其他素材
  pages/             # 保存版本的 HTML
  previews/          # 浏览器预览产物
```

已有用户资料不随代码清理删除。启动时，历史运行中或待回答的任务会标记为中断，避免界面一直等待已移除的执行服务。旧版扁平项目存储仍支持迁移。

## 设置与安全

配置保存在初始 workspace 的 `settings.json`，文件权限为 0600；读取 API 不返回密钥。系统设置中的 Workspace 路径支持切换数据目录，原目录保留，不自动搬运文件。资料解析期间禁止切换。

默认只监听本机回环地址。对外监听必须配置 `DREAMATIC_ACCESS_TOKEN`。网页导入保留 SSRF 防护；编辑和预览使用 HTML 白名单、CSP 和 iframe sandbox。删除项目会永久删除其独立目录。

资料解析由本地解析器完成，不调用模型。可选 PDF 增强依赖 `requirements-documents.txt` 中的 Python 库，由 `DREAMATIC_PDF_ENHANCE` 和 `DREAMATIC_DOCUMENT_PYTHON` 配置；默认关闭，不执行 OCR。
