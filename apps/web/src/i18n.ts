import { useSyncExternalStore } from "react";
export type Language = "zh" | "en";
let language: Language =
  localStorage.getItem("dreamatic-language") === "en" ? "en" : "zh";
const listeners = new Set<() => void>();
export function setLanguage(next: Language) {
  language = next;
  localStorage.setItem("dreamatic-language", next);
  document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  for (const listener of listeners) listener();
}
const english: Record<string, string> = {
  "原始文件 /": "Original files /",
  "Markdown 解析文档 /": "Parsed Markdown /",
  已选事实: "Selected facts",
  清除事实选择: "Clear fact selection",
  使用选定事实调整页面: "Update page with selected facts",
  选择事实: "Select fact",
  用户输入: "User input",
  已提取: "Extracted",
  "查看从 Markdown 提取的信息事实，选择需要用于页面调整的内容。":
    "Review facts extracted from Markdown and select content for page updates.",
  "根据选定事实调整相关章节，保留其他设计和内容。":
    "Update the relevant sections using the selected facts, preserving the remaining design and content.",
  "下载 Markdown 文档": "Download Markdown document",
  事实: "Fact",
  关联图片: "Linked images",
  在卡片中查看图片: "View image in card",
  收起图片: "Collapse image",
  "查看 Markdown 依据": "View Markdown evidence",
  "Markdown 引用": "Markdown excerpt",
  单元格原值: "Original cell value",
  事实列表: "Facts",
  "从资料中发现事实。": "Facts from your sources.",
  "查看 Analyst 已保存的事实与来源。引用位置核对不代表事实解读已被独立证实。":
    "Review facts and sources saved by Analyst. Verified citation locations do not independently confirm the interpretation.",
  分析摘要与限制: "Analysis summary and limitations",
  "当前展示上次已保存的分析结果，本次分析完成后将更新。":
    "Showing the previous saved analysis until the current analysis is complete.",
  搜索事实: "Search facts",
  搜索事实或来源: "Search facts or sources",
  按来源筛选事实: "Filter facts by source",
  全部来源: "All sources",
  来源不可用: "Source unavailable",
  显示事实: "Showing facts",
  未提供引用定位: "Citation location not provided",
  引用位置已核对: "Citation location checked",
  引用位置未核对: "Citation location not checked",
  文本范围: "Text range",
  表格索引: "Table index",
  行索引: "Row index",
  列索引: "Column index",
  "索引从 0 开始，行索引包含表头。":
    "Indices start at zero; row indices include the header.",
  "此事实未保存可展示的Markdown 引用。":
    "No original citation was saved for this fact.",
  "没有匹配的事实，请调整搜索或来源筛选。":
    "No matching facts. Adjust the search or source filter.",
  "选择或创建项目后查看分析事实。": "Select or create a project to view facts.",
  "本次分析暂无已提取的事实。": "This analysis contains no extracted facts.",
  "正在等待 Analyst 保存分析结果。":
    "Waiting for Analyst to save the analysis.",
  "分析完成后，相关事实将在这里展示。":
    "Facts will appear here after analysis.",
  查看事实列表: "View facts",
  正在等待模型响应: "Waiting for model response",
  本轮模型响应完成: "Model turn finished",
  正在生成业务回复: "Generating response text",
  正在生成工具参数: "Generating tool arguments",
  "模型处理中，尚未返回业务结果":
    "Model processing; business result not available yet",
  "结构化业务输出（校验通过）": "Structured business output (validated)",
  "结构化业务输出（校验未通过）":
    "Structured business output (validation failed)",
  "业务回复（未作为最终结果校验）":
    "Response text (not validated as final output)",
  本轮耗时: "Turn elapsed",
  回复字符: "Response characters",
  工具参数字符: "Tool argument characters",
  查看业务输出: "View business output",
  输出字符: "Output characters",
  "仅展示业务内容，不含内部推理":
    "Business content only; no internal reasoning",
  内容已截断: "Content truncated",
  "较早的业务输出已省略，仅保留统计": "Older output omitted; metrics retained",
  查看校验详情: "View validation details",
  系统消息: "System message",
  用户消息: "User message",
  对话记录: "Conversation",
  执行详情: "Execution details",
  任务状态: "Task status",
  生成未完成: "Generation incomplete",
  等待确认: "Awaiting confirmation",
  正在生成网页: "Generating page",
  正在分析资料: "Analyzing sources",
  正在理解需求: "Understanding request",
  请确认: "Please confirm",
  回答: "Answer",
  回到最新: "Jump to latest",
  "结果已保存，可在右侧画布预览和编辑":
    "Saved. Preview and edit in the canvas on the right.",
  "历史任务没有可验证断点，请重新发送需求":
    "This task has no verified checkpoint. Send your request again.",
  等待回答: "Awaiting your answer",
  回答智能体问题: "Answer agent question",
  可多选: "Select any",
  单选: "Select one",
  文字回答: "Text response",
  自己的答案或补充说明: "Your own answer or additional details",
  也可以直接用自己的话回答: "You can also answer in your own words",
  "正在提交…": "Submitting…",
  提交并继续: "Submit & continue",
  "请先保存画布修改再回答问题。": "Save your canvas edits before answering.",
  请选择选项或填写自己的答案: "Choose an option or enter your own answer.",
  "此问题已经回答，请等待任务继续":
    "This question was already answered. Wait for the task to continue.",
  "此问题已失效，请刷新项目":
    "This question is no longer active. Refresh the project.",
  "等待你的回答，提交后将继续生成":
    "Waiting for your answer. Generation will continue after submission.",

  "Workspace 路径": "Workspace path",
  "保存后切换工作目录，原目录中的项目保留在原位置。":
    "Saving switches the workspace. Projects in the previous folder remain there.",
  "Workspace 路径必须是绝对路径": "The workspace path must be absolute.",
  "请选择独立的 Workspace 目录": "Choose a dedicated workspace folder.",
  项目操作: "Project actions",
  重命名: "Rename",
  删除项目: "Delete project",
  重命名项目: "Rename project",
  项目名称: "Project name",
  保存名称: "Save name",
  确认删除: "Delete project",
  "将从本机永久删除整个项目目录，包括上传资料、全部页面及版本，无法恢复。":
    "Permanently delete the entire project folder, including uploads, pages, and all versions. This cannot be undone.",
  "请先保存画布修改再删除项目。":
    "Save your canvas edits before deleting this project.",
  协调智能体: "Orchestrator",
  理解与调度: "Plan & coordinate",
  检查存在警告: "Check warnings",
  当前修改尚未检查: "Current edits not checked",
  草稿有待修复问题: "Draft needs corrections",
  已检查对应版本: "Saved version previewed",
  尚未确认浏览器预览结果: "Browser preview not verified",
  "草稿已保存，打开前需要修复：":
    "Draft saved; fix these issues before opening: ",
  分析与筛选: "Analysis & selection",
  继续未完成任务: "Resume unfinished task",
  "有效的已完成阶段将复用；需求或资料变化时重新执行。":
    "Reuse valid completed stages; changed requirements or sources require rerunning.",
  分析智能体: "Analyst",
  解析与提取: "Read & analyze",
  设计智能体: "UI Designer",
  设计与生成: "Design & build",
  "手动编辑 ·": "Visual edit ·",
  "画布有未保存修改，请先点击“保存版本”再切换项目或生成。":
    "You have unsaved edits. Save a version before switching projects or generating.",
  让内容成为体验: "Turn content into experiences",
  新建网页: "New website",
  搜索项目: "Search projects",
  工作空间: "Workspace",
  网页工作台: "Web workspace",
  资料与素材: "Sources & assets",
  技能库: "Skills",
  最近项目: "Recent projects",
  "正在生成…": "Generating…",
  已完成: "Complete",
  需要处理: "Needs attention",
  网页项目: "Website project",
  未命名网页: "Untitled website",
  "从一个想法开始，": "Start with an idea.",
  "你的网页会出现在这里。": "Your websites will appear here.",
  模型与设置: "Models & settings",
  创作工作空间: "Creative workspace",
  切换侧栏: "Toggle sidebar",
  新的网页创作: "Create a new website",
  有未保存修改: "Unsaved changes",
  正在创作: "Creating",
  已就绪: "Ready",
  版本: "Versions",
  导出网页: "Export HTML",
  与想法对话: "Talk to your ideas",
  查看技能: "Browse skills",
  "你的资料，": "Your content,",
  "下一个精彩网页。": "your next great website.",
  "上传文档，分享链接，或描述你的想法。":
    "Upload files, share a link, or describe an idea.",
  "让三位智能体一起，把内容变成体验。":
    "Three agents turn your content into an experience.",
  品牌介绍页: "Brand website",
  "将品牌资料变成有质感的品牌官网，突出品牌故事、产品特点和联系方式。":
    "Create a refined brand website from my materials, highlighting the brand story, products, and contact information.",
  数据可视化: "Data visualization",
  "根据我提供的表格制作一个清晰的数据展示网页，保留数值来源和单位。":
    "Create a clear data presentation website from my spreadsheet, preserving sources and units.",
  活动与提案: "Events & proposals",
  "根据上传的提案制作活动介绍网页，突出议程、亮点和参与方式。":
    "Create an event website from my proposal, highlighting the agenda, key moments, and how to participate.",
  你: "You",
  智能体协作中: "Agents working",
  最近运行记录: "Recent activity",
  结构化结果已接收: "Structured result accepted",
  结构化提交未通过校验: "Structured submission failed validation",
  "结果校验通过，阶段完成": "Result verified; stage complete",
  "输出格式未通过，正在进行一次格式修复":
    "Invalid output format; applying one format-only repair",
  "结果校验仍未通过，任务已停止":
    "Result validation failed again; task stopped",
  "模型输出达到长度上限，结果可能被截断，请缩小任务后重试":
    "Model output reached its length limit and may be incomplete. Reduce the task and retry.",
  收起运行记录: "Collapse activity",
  展开运行记录: "Expand activity",
  运行记录列表: "Activity log",
  演示: "Demo",
  文档分析与来源: "Analysis & evidence",
  "从真实内容出发。": "Start with real content.",
  "所有来源、表格和媒体都保存在项目中，供智能体分析与页面复用。":
    "Sources, tables, and media stay with your project for analysis and reuse.",
  上传资料: "Upload sources",
  网站链接: "Website URL",
  "字符 ·": "characters ·",
  "素材 ·": "assets ·",
  表格: "tables",
  "还没有资料，添加第一份灵感。": "No sources yet. Add your first inspiration.",
  "提取的素材 /": "Extracted assets /",
  移除: "Remove",
  网页需求: "Website requirements",
  "描述你想调整的地方…": "Describe what you would like to change…",
  "描述你想创建的网页，或拖入资料…":
    "Describe your website, or drop files here…",
  上传文档: "Upload files",
  添加网站链接: "Add website URL",
  本地演示模式: "Local demo",
  停止生成: "Stop generation",
  生成网页: "Generate website",
  "PDF · Word · Excel · PPT · 图片 · URL":
    "PDF · Word · Excel · PPT · Images · URL",
  "⌘ ↵ 发送": "⌘ ↵ Send",
  设计画布: "Design canvas",
  "可视化编辑 · HTML": "Visual editing · HTML",
  "把灵感，变成看得见的作品": "Make your ideas tangible",
  版本记录: "Version history",
  "恢复：": "Restore: ",
  正在加载设计画布: "Loading the design canvas",
  为你的内容而设计: "Designed for your content",
  "好内容，值得一个好网页。": "Great content deserves a great website.",
  "从左侧开始对话，智能体将在这里构建你的页面。":
    "Start a conversation and watch your website take shape here.",
  "生成之后，可以直接编辑每一个细节。":
    "Then edit every detail directly on the canvas.",
  多模态理解: "Multimodal understanding",
  多智能体协作: "Multiple agents, one workflow",
  所见即所得: "Visual editing",
  关闭错误: "Dismiss error",
  关闭弹窗: "Close dialog",
  添加一个网站: "Add a website",
  "提取公开网页中的文本、表格和媒体素材。":
    "Import text, tables, and media from a public webpage.",
  "网站 URL": "Website URL",
  "支持静态公开网页；不绕过登录，不遍历站外链接。":
    "Public static pages only. Login-protected content and linked pages are not crawled.",
  正在抓取与解析: "Fetching and analyzing",
  导入网站内容: "Import website",
  按需加载的设计知识: "Design knowledge, on demand",
  "每个智能体根据当前任务，主动发现并加载所需 Skill。":
    "Each agent discovers and loads the skills relevant to its task.",
  "管理员可添加独立设计技能，下一次任务自动发现。":
    "Administrators can add design skills, available on the next task.",
  "服务访问令牌（可选）": "Workspace access token (optional)",
  链接服务: "Connect to service",
  关闭资料: "Close source",
  "来源：": "Source: ",
  "预览显示前 30 行；完整提取数据保存在项目中。":
    "Previewing the first 30 rows. Full extracted data is saved in the project.",
  "此来源没有可用的 Markdown 文档，请重新导入。":
    "No Markdown document is available. Please reimport this source.",
  布局: "Layout",
  文字: "Text",
  外观: "Appearance",
  网页设计画布: "Website design canvas",
  标题: "Heading",
  内容区块: "Section",
  双列布局: "Two columns",
  图片: "Image",
  链接按钮: "Link button",
  视频: "Video",
  分隔线: "Divider",
  基础组件: "Basic components",
  内容排版: "Content",
  布局与交互: "Layout & actions",
  图片与媒体: "Images & media",
  搭建你的页面: "Build your page",
  "拖入画布，组合内容与布局": "Drag onto the canvas to build your layout",
  段落与说明文字: "Paragraphs and descriptions",
  突出页面内容层级: "Create a clear hierarchy",
  组织完整内容章节: "Organize a full section",
  并排展示两组内容: "Arrange content side by side",
  展示产品与品牌图片: "Show products and brand images",
  引导访问与页面跳转: "Guide visitors to the next step",
  嵌入视频播放区域: "Add a video player",
  分隔章节与内容层次: "Separate sections clearly",
  设计: "Design",
  预览: "Preview",
  切换样式面板: "Toggle style panel",
  撤销: "Undo",
  重做: "Redo",
  "HTML 源码": "HTML source",
  保存中: "Saving",
  保存版本: "Save version",
  样式: "Styles",
  组件: "Blocks",
  图层: "Layers",
  "选中画布中的元素，调整外观。": "Select an element to adjust its appearance.",
  "双击文字即可直接修改。": "Double-click text to edit it.",
  "修改后点击应用。活动脚本会在保存时移除。":
    "Apply your changes to the canvas. Scripts are removed when saving.",
  "HTML 源码编辑": "HTML source editor",
  取消: "Cancel",
  应用到画布: "Apply to canvas",
  系统菜单: "System menu",
  系统设置: "Settings",
  系统推理模型: "Reasoning model",
  文档分析模型: "Document analysis",
  "HTML UI 页面生成模型": "HTML UI generation",
  系统: "System",
  配置模块: "Configuration modules",
  关闭设置: "Close settings",
  保存配置: "Save configuration",
  保存: "Save",
  放弃: "Discard",
  放弃当前未保存的修改: "Discard all unsaved changes",
  "画布有未保存修改，请先保存或放弃修改，再继续此操作。":
    "The canvas has unsaved changes. Save or discard them before continuing.",
  打开: "Open",
  "打开中…": "Opening…",
  在系统默认浏览器中打开当前页面:
    "Open the current page in the default browser",
  "页面验证未通过，无法打开":
    "The page did not pass validation and could not be opened.",
  "无法启动系统默认浏览器，请检查本机浏览器设置":
    "Could not launch the default browser. Check your local browser settings.",
  保存并关闭: "Save and close",
  配置已保存: "Configuration saved",
  "Enter 发送 · Shift + Enter 换行":
    "Enter to send · Shift + Enter for a new line",
  "保存中…": "Saving…",
  "读取并保存 Dreamatic· Web 配置": "Manage your Dreamatic· Web configuration",
  "保存后自动应用于后续任务。密钥仅保存在本机服务端。":
    "Changes apply to future tasks. Keys stay on the local server.",
  "正在读取模型设置…": "Loading settings…",
  模型模式: "Model mode",
  "OpenAI 兼容型": "OpenAI-compatible",
  "模型调用 URL": "Model API URL",
  模型名称: "Model name",
  填写服务商提供的模型名称: "Enter the model name supplied by your provider",
  支持图片输入: "Supports image input",
  "API 密钥": "API key",
  "已配置；留空保留": "Configured; leave blank to keep",
  未配置: "Not configured",
  清除已保存密钥: "Clear saved key",
  留空保留当前密钥: "Leave blank to keep the current key",
  "示例：": "Example: ",
  使用系统推理模型: "Use the reasoning model",
  独立配置: "Configure separately",
  "为当前任务配置核心推理与需求调度模型。":
    "Configure the core model for reasoning and task coordination.",
  "未独立配置时，自动使用系统推理模型的完整配置。":
    "Inherits the reasoning model's full configuration unless configured separately.",
  "分别设置模型模式、调用地址、名称和密钥。":
    "Set the model mode, API URL, name, and key independently.",
  界面语言: "Interface language",
  运行模式: "Run mode",
  实时模型: "Live models",
  "本地演示 · 不调用 AI": "Local demo · no AI calls",
  "生成期间不能更换配置，请先停止任务。":
    "Stop active generation before changing configuration.",
  "配置正在保存，请稍后重试":
    "Configuration is being saved. Please try again shortly.",
  "请同时填写模型调用 URL 和模型名称":
    "Enter both the model API URL and model name.",
  "模型调用 URL 必须是不包含凭据的 HTTP/HTTPS 地址":
    "Use an HTTP/HTTPS API URL without embedded credentials.",
  "请在模型与设置中填写系统推理模型的调用 URL 和模型名称":
    "Enter the reasoning model's API URL and name in Models & settings.",
  请求失败: "Request failed",
  导出失败: "Export failed",
  请输入访问令牌: "Enter the workspace access token",
  请等待所有生成任务结束后再修改模型配置:
    "Wait for all generation tasks to finish before changing configuration.",
  正在理解需求并对齐设计目标: "Understanding requirements and aligning goals",
  "正在分析来源、提取关键信息和媒体":
    "Analyzing sources and extracting content",
  正在设计界面并生成响应式页面: "Designing and generating a responsive page",
  "页面已保存，可预览与编辑": "Page saved. Ready to preview and edit.",
  已停止生成: "Generation stopped",
  "等待模型有效响应超时，请检查模型服务或稍后重试":
    "Timed out waiting for a model response. Check the model service or retry later.",
  "模型输出停滞超时，请检查模型服务或稍后重试":
    "Model output stalled. Check the model service or retry later.",
  "智能体阶段总时限超时，请缩小任务或调整阶段时限":
    "Agent stage reached its total time limit. Reduce the task or adjust the stage limit.",
  "模型正在输出，任务继续执行": "Model is responding; task continues",
  "模型调用超时，请检查端点或缩小任务后重试":
    "Model request timed out. Check the endpoint or try a smaller task.",
  "输出验证未通过，正在进行一次定向修复":
    "Output validation failed. Applying one targeted repair.",
  "演示模式：使用本地示例流程，不调用语言模型":
    "Demo mode: running a local sample without AI calls",
  生成可编辑的演示页面: "Creating an editable demo page",
  "网页已生成。可在设计窗口直接编辑、切换设备预览并导出 HTML。":
    "Your website is ready. Edit it, preview devices, or export HTML.",
  "演示网页已就绪。可以选中元素编辑文字、样式和布局，或在下方继续提出修改要求。":
    "Your demo is ready. Edit text, styles, and layout, or describe your next change.",
  "当前模型不支持图片输入，本阶段仅使用文本、表格和媒体元数据":
    "This model does not support images. Using text, tables, and media metadata.",
  "页面已有新版本，请重新加载后再编辑，当前修改尚未保存":
    "A newer version exists. Reload before editing; your changes have not been saved.",
  "服务重启中断了生成，可重新发送需求继续。":
    "Generation was interrupted by a restart. Resend your request to continue.",
};
export function translate(value: string, lang: Language): string {
  if (lang === "zh") return value;
  if (english[value]) return english[value];
  const demo = value.match(/^已读取 (\d+) 份资料；演示不会进行模型语义分析$/);
  if (demo)
    return `Read ${demo[1]} sources; demo mode does not perform AI analysis`;
  const extractedImages = value.match(
    /^已提取 (\d+) 张资料图片，正在筛选页面素材$/,
  );
  if (extractedImages)
    return `Extracted ${extractedImages[1]} source images; selecting page assets`;
  const response = value.match(/^模型开始响应（等待 (\d+) ms）$/);
  if (response) return `Model started responding (waited ${response[1]} ms)`;
  const outputEnd = value.match(
    /^模型输出结束（(\d+) ms，(\d+) 轮），正在校验结果$/,
  );
  if (outputEnd)
    return `Model output ended (${outputEnd[1]} ms, ${outputEnd[2]} turns); validating result`;
  const completed = value.match(/^阶段完成（(\d+) ms，(\d+) 轮）$/);
  if (completed)
    return `Stage complete (${completed[1]} ms, ${completed[2]} turns)`;
  const tool = value.match(
    /^(开始执行工具|工具完成|工具失败|工具执行超时)：(.*)$/,
  );
  if (tool)
    return (
      (
        {
          开始执行工具: "Starting tool",
          工具完成: "Tool complete",
          工具失败: "Tool failed",
          工具执行超时: "Tool timed out",
        } as Record<string, string>
      )[tool[1]] +
      ": " +
      tool[2]
    );
  if (value.startsWith("工具：")) return "Tool: " + value.slice(3);
  if (value.startsWith("已加载 ")) return "Loaded " + value.slice(4);
  if (value.startsWith("生成版本 "))
    return "Generated version " + value.slice(5);
  if (value.startsWith("演示版本 ")) return "Demo version " + value.slice(5);
  return value;
}
export function useI18n() {
  const lang = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => language,
  );
  return {
    language: lang,
    setLanguage,
    t: (value: string) => translate(value, lang),
  };
}
