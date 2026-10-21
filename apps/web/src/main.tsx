import React, { useEffect, useRef, useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  Sparkles,
  MousePointer2,
  Plus,
  Globe,
  Paperclip,
  ArrowUp,
  Square,
  ArrowUpRight,
  FolderOpen,
  FileText,
  Image,
  Settings2,
  ChevronDown,
  Check,
  Download,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  Link2,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  BrainCircuit,
  ScanText,
  Paintbrush,
  BookOpen,
  Search,
  ArrowRight,
  Leaf,
} from "lucide-react";
import type {
  ProjectResponse as Project,
  Role,
  Source,
  RunEvent,
} from "../../../packages/shared/project";
import { api, download, token } from "./api";
import "./styles.css";
import Settings from "./Settings";
import ConversationThread from "./ConversationThread";
import FactsView from "./FactsView";
import { factsFor } from "./fact-model";
import ProjectActions from "./ProjectActions";
import BrandMenu from "./BrandMenu";
import { useI18n } from "./i18n";
const Editor = lazy(() => import("./Editor"));
const roles: {
  id: Role;
  name: string;
  label: string;
  icon: typeof Sparkles;
}[] = [
  {
    id: "orchestrator",
    name: "协调智能体",
    label: "理解与调度",
    icon: BrainCircuit,
  },
  { id: "analyst", name: "分析智能体", label: "分析与筛选", icon: ScanText },
  { id: "designer", name: "设计智能体", label: "设计与生成", icon: Paintbrush },
];
function App() {
  const { t, language, setLanguage } = useI18n();
  const [project, setProject] = useState<Project | null>(null),
    [projects, setProjects] = useState<any[]>([]),
    [health, setHealth] = useState<any>(null),
    [skills, setSkills] = useState<any[]>([]),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [side, setSide] = useState(() => window.innerWidth >= 760),
    [view, setView] = useState<"chat" | "sources" | "facts">("chat"),
    [modal, setModal] = useState<"url" | "skills" | "settings" | null>(null),
    [url, setUrl] = useState(""),
    [query, setQuery] = useState(""),
    [selectedSource, setSelectedSource] = useState<Source | null>(null),
    [version, setVersion] = useState(""),
    [history, setHistory] = useState(false);
  const drafts = useRef(new Map<string, string>());
  const [selectedFactIds, setSelectedFactIds] = useState<string[]>([]);
  useEffect(() => setSelectedFactIds([]), [project?.id]);
  const file = useRef<HTMLInputElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const input = composerInput.current;
    if (input) {
      input.style.height = "auto";
      input.style.height = Math.min(180, input.scrollHeight) + "px";
    }
  }, [text, view]);
  const running = project?.status === "running";
  const current =
    project?.versions.find((v) => v.id === version) || project?.versions.at(-1);
  const handleError = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));
  async function refresh() {
    setProjects(await api("/projects"));
  }
  async function boot() {
    try {
      const health = await api("/health");
      setHealth(health);
      setLanguage(health.language || "zh");
      setSkills(await api("/skills"));
      const list = await api<any[]>("/projects");
      setProjects(list);
      const saved = localStorage.getItem("dreamatic-project");
      if (saved && list.some((p) => p.id === saved))
        setProject(await api("/projects/" + saved));
      else if (list[0]) setProject(await api("/projects/" + list[0].id));
      else {
        setProject(null);
        localStorage.removeItem("dreamatic-project");
      }
    } catch (e) {
      handleError(e);
    }
  }
  useEffect(() => {
    void boot();
  }, []);
  useEffect(() => {
    if (project) localStorage.setItem("dreamatic-project", project.id);
  }, [project?.id]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty || drafts.current.size > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!project?.id || !running) return;
    const id = project.id;
    let stopped = false;
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/projects/" + id + "/events", {
          headers: token() ? { Authorization: "Bearer " + token() } : undefined,
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const line = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            if (!line.startsWith("data: ")) continue;
            const event = JSON.parse(line.slice(6)) as RunEvent;
            setProject((p) =>
              p?.id === id && !p.events.some((e) => e.id === event.id)
                ? { ...p, events: [...p.events, event] }
                : p,
            );
          }
        }
      } catch {}
    })();
    const timer = setInterval(() => {
      api<Project>("/projects/" + id)
        .then((p) => {
          if (!stopped) {
            setProject(p);
            if (p.status !== "running") void refresh();
          }
        })
        .catch(handleError);
    }, 1200);
    return () => {
      stopped = true;
      ctrl.abort();
      clearInterval(timer);
    };
  }, [project?.id, running]);
  async function saveHtml(html: string) {
    if (!project) return;
    await api("/projects/" + project.id + "/versions", {
      method: "POST",
      body: JSON.stringify({
        html,
        baseVersionId: project.versions.at(-1)?.id || "",
        label:
          t("手动编辑 \u00B7 ") +
          new Date().toLocaleTimeString(language === "zh" ? "zh-CN" : "en-US", {
            hour: "2-digit",
            minute: "2-digit",
          }),
      }),
    });
    drafts.current.delete(project.id);
    const latest = await api<Project>("/projects/" + project.id);
    setProject(latest);
    setVersion("");
    setDirty(false);
    const problems =
      latest.versions
        .at(-1)
        ?.checks?.issues.filter((i) => i.severity === "error") || [];
    setError(
      problems.length
        ? t("草稿已保存，打开前需要修复：") +
            problems.map((i) => i.message).join("；")
        : "",
    );
  }
  function canLeave() {
    if (dirty) {
      setError(t("画布有未保存修改，请先保存或放弃修改，再继续此操作。"));
      return false;
    }
    return true;
  }
  async function newProject() {
    try {
      setProject(await api("/projects", { method: "POST" }));
      setDirty(false);
      setError("");
      setVersion("");
      setView("chat");
      setText("");
      await refresh();
    } catch (e) {
      handleError(e);
    }
  }
  async function ensure() {
    return project || (await api<Project>("/projects", { method: "POST" }));
  }
  async function send() {
    if (!text.trim() || running || busy || !canLeave()) return;
    setError("");
    try {
      const p = await ensure();
      await api("/projects/" + p.id + "/run", {
        method: "POST",
        body: JSON.stringify({
          text,
          ...(selectedFactIds.length ? { selectedFactIds } : {}),
        }),
      });
      setProject(await api("/projects/" + p.id));
      setText("");
      setSelectedFactIds([]);
      setVersion("");
      setView("chat");
      await refresh();
    } catch (e) {
      handleError(e);
    }
  }
  async function upload(files: FileList | File[] | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      const p = await ensure();
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      const result = await api("/projects/" + p.id + "/sources", {
        method: "POST",
        body: form,
      });
      setProject(await api("/projects/" + p.id));
      if (result.errors.length)
        setError(
          result.errors.map((e: any) => e.name + "：" + e.error).join("\n"),
        );
      await refresh();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }
  async function addUrl() {
    setBusy(true);
    try {
      const p = await ensure();
      await api("/projects/" + p.id + "/url", {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      setProject(await api("/projects/" + p.id));
      setModal(null);
      setUrl("");
      await refresh();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  const lastRole = project?.events
    .filter((e) => e.kind === "status")
    .at(-1)?.role;
  const assets = [
    ...new Map(
      (project?.sources.flatMap((s) => s.assets) || []).map((asset) => [
        asset.id,
        asset,
      ]),
    ).values(),
  ];
  const evidence = project?.analysis as
    | {
        summary?: string;
        facts?: {
          text: string;
          sourceId: string;
        }[];
        limitations?: string[];
      }
    | undefined;
  return (
    <div className={"app " + (!side ? "sidebar-off" : "")}>
      <aside className="sidebar">
        <BrandMenu
          onWorkbench={() => setView("chat")}
          onSettings={() => {
            if (canLeave()) setModal("settings");
          }}
        />
        <button className="new-project" onClick={() => void newProject()}>
          <Plus size={16} />
          {t("新建网页")}
          <span>⌘ N</span>
        </button>
        <div className="sidebar-search">
          <Search size={14} />
          <input
            aria-label={t("搜索项目")}
            placeholder={t("搜索项目")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <p className="nav-label">{t("工作空间")}</p>
        <button
          className={"nav-button " + (view === "chat" ? "active" : "")}
          onClick={() => setView("chat")}
        >
          <Globe size={15} />
          {t("网页工作台")}
          <ArrowUpRight size={13} />
        </button>
        <button
          className={"nav-button " + (view === "sources" ? "active" : "")}
          onClick={() => setView("sources")}
        >
          <FolderOpen size={15} />
          {t("资料与素材")}
          <span>{project?.sources.length || 0}</span>
        </button>
        <button
          className={"nav-button " + (view === "facts" ? "active" : "")}
          onClick={() => setView("facts")}
        >
          <ScanText size={15} />
          {t("事实列表")}
          <span>{factsFor(project).length}</span>
        </button>
        <div className="project-label">
          <p className="nav-label">{t("最近项目")}</p>
          <span>{projects.length}</span>
        </div>
        <div className="project-list">
          {projects
            .filter((p) => p.title.includes(query))
            .map((p) => (
              <div key={p.id} className="project-entry">
                <button
                  className={
                    "project-item " + (project?.id === p.id ? "selected" : "")
                  }
                  onClick={async () => {
                    if (p.id === project?.id) return;
                    try {
                      setProject(await api("/projects/" + p.id));
                      setDirty(false);
                      setError("");
                      setVersion("");
                    } catch (e) {
                      handleError(e);
                    }
                  }}
                >
                  <span className="project-icon">
                    <Globe size={14} />
                  </span>
                  <span>
                    <strong>
                      {p.title === "未命名网页" ? t(p.title) : p.title}
                    </strong>
                    <small>
                      {p.status === "running"
                        ? t("正在生成\u2026")
                        : p.status === "complete"
                          ? t("已完成")
                          : p.status === "error"
                            ? t("需要处理")
                            : p.status === "needs_input"
                              ? t("等待回答")
                              : t("网页项目")}
                    </small>
                  </span>
                  {p.status === "running" && <i className="live-dot" />}
                </button>
                <ProjectActions
                  title={p.title}
                  locked={
                    p.status === "running" || (p.id === project?.id && busy)
                  }
                  onRename={async (title) => {
                    const updated = await api<Project>("/projects/" + p.id, {
                      method: "PATCH",
                      body: JSON.stringify({ title }),
                    });
                    if (project?.id === p.id)
                      setProject((current) =>
                        current
                          ? {
                              ...current,
                              title: updated.title,
                              titleEdited: true,
                            }
                          : current,
                      );
                    await refresh();
                  }}
                  onDelete={async () => {
                    if (project?.id === p.id && !canLeave())
                      throw new Error(t("请先保存画布修改再删除项目。"));
                    await api("/projects/" + p.id, { method: "DELETE" });
                    const list = await api<any[]>("/projects");
                    drafts.current.delete(p.id);
                    setProjects(list);
                    if (project?.id === p.id) {
                      setProject(
                        list[0]
                          ? await api<Project>("/projects/" + list[0].id)
                          : null,
                      );
                      localStorage.removeItem("dreamatic-project");
                      setVersion("");
                      setDirty(false);
                      setText("");
                      setHistory(false);
                      setSelectedSource(null);
                      setError("");
                    }
                  }}
                />
              </div>
            ))}
          {!projects.length && (
            <p className="sidebar-empty">
              {t("从一个想法开始，")}
              <br />
              {t("你的网页会出现在这里。")}
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="profile">
            <span>D</span>
            <div>
              <strong>{t("创作工作空间")}</strong>
              <small>LOCAL WORKSPACE</small>
            </div>
            <Leaf size={17} />
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <button
              className="icon-button"
              title={t("切换侧栏")}
              onClick={() => setSide(!side)}
            >
              {side ? (
                <PanelLeftClose size={17} />
              ) : (
                <PanelLeftOpen size={17} />
              )}
            </button>
            <span className="breadcrumb">{t("工作空间")}</span>
            <span className="slash">/</span>
            <strong>{project?.title || t("新的网页创作")}</strong>
            <span className="web-badge">WEB</span>
          </div>
          <div>
            <span className="save-status">
              <i className={running ? "working" : ""} />
              {dirty
                ? t("有未保存修改")
                : running
                  ? t("正在创作")
                  : project?.status === "needs_input"
                    ? t("等待回答")
                    : t("已就绪")}
            </span>
            <button
              disabled={!current || running || dirty}
              onClick={() => setHistory(!history)}
            >
              <History size={14} />
              {t("版本")}
            </button>
            <button
              className="export-button"
              disabled={!current || dirty}
              onClick={() =>
                void download(
                  "/projects/" + project!.id + "/export?version=" + current!.id,
                ).catch(handleError)
              }
            >
              <Download size={14} />
              {t("导出网页")}
            </button>
          </div>
        </header>
        <div className="workspace">
          <section className="conversation">
            <div className="panel-heading">
              <div>
                <span className="orange-dot" />
                <strong>
                  {view === "chat"
                    ? t("与想法对话")
                    : view === "facts"
                      ? t("事实列表")
                      : t("资料与素材")}
                </strong>
                <small>
                  {view === "chat"
                    ? "CHAT"
                    : view === "facts"
                      ? "FACTS"
                      : "SOURCES"}
                </small>
              </div>
              <button
                className="icon-button"
                title={t("查看技能")}
                onClick={() => setModal("skills")}
              >
                <Plus size={15} />
              </button>
            </div>
            <div className="agents-strip">
              {roles.map(({ id, name, label, icon: Icon }, i) => (
                <React.Fragment key={id}>
                  {i > 0 && <span className="agent-connector" />}
                  <div
                    className={
                      "agent-chip " +
                      (running && lastRole === id ? "current" : "")
                    }
                    title={t(name)}
                  >
                    <Icon size={15} />
                    <span>{t(label)}</span>
                    {running && lastRole === id && <i />}
                  </div>
                </React.Fragment>
              ))}
            </div>
            {view === "chat" ? (
              <>
                {!project?.messages.length ? (
                  <div className="chat-scroll">
                    <div className="welcome">
                      <div className="welcome-mark">
                        <Sparkles size={26} />
                      </div>
                      <p className="eyebrow">FROM CONTENT TO EXPERIENCE</p>
                      <h1>
                        {t("你的资料，")}
                        <br />
                        {t("下一个精彩网页。")}
                      </h1>
                      <p>
                        {t("上传文档，分享链接，或描述你的想法。")}
                        <br />
                        {t("让三位智能体一起，把内容变成体验。")}
                      </p>
                      <div className="suggestions">
                        {[
                          [
                            t("品牌介绍页"),
                            t(
                              "将品牌资料变成有质感的品牌官网，突出品牌故事、产品特点和联系方式。",
                            ),
                          ],
                          [
                            t("数据可视化"),
                            t(
                              "根据我提供的表格制作一个清晰的数据展示网页，保留数值来源和单位。",
                            ),
                          ],
                          [
                            t("活动与提案"),
                            t(
                              "根据上传的提案制作活动介绍网页，突出议程、亮点和参与方式。",
                            ),
                          ],
                        ].map(([label, prompt]) => (
                          <button
                            key={t(label)}
                            onClick={() => setText(prompt)}
                          >
                            <span>{t(label)}</span>
                            <ArrowUpRight size={14} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <ConversationThread
                    key={project.id}
                    project={project}
                    busy={busy}
                    dirty={dirty}
                    demo={health?.mode === "demo"}
                    onAnswer={async (question, answer) => {
                      if (!canLeave())
                        throw new Error(t("请先保存画布修改再回答问题。"));
                      await api(
                        `/projects/${project.id}/questions/${question.id}/answer`,
                        { method: "POST", body: JSON.stringify(answer) },
                      );
                      setProject(await api<Project>("/projects/" + project.id));
                      setError("");
                      setText("");
                      setVersion("");
                      await refresh();
                    }}
                    onResume={async () => {
                      setBusy(true);
                      try {
                        await api(`/projects/${project.id}/resume`, {
                          method: "POST",
                        });
                        setProject(await api(`/projects/${project.id}`));
                      } catch (e) {
                        handleError(e);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {evidence?.summary && (
                      <details className="evidence-panel">
                        <summary>
                          <ScanText size={13} />
                          {t("文档分析与来源")}
                        </summary>
                        <p>{evidence.summary}</p>
                        <button onClick={() => setView("facts")}>
                          <ScanText size={12} />
                          {t("查看事实列表")}
                        </button>
                        {evidence.limitations?.map((limitation, i) => (
                          <p className="evidence-limit" key={i}>
                            {limitation}
                          </p>
                        ))}
                      </details>
                    )}
                  </ConversationThread>
                )}
              </>
            ) : view === "facts" ? (
              <FactsView
                key={project?.id || "no-project"}
                project={project}
                selectedIds={selectedFactIds}
                onSelectionChange={setSelectedFactIds}
                onUseSelected={() => {
                  setView("chat");
                  setText(t("根据选定事实调整相关章节，保留其他设计和内容。"));
                }}
              />
            ) : (
              <div className="sources-view">
                <div className="sources-intro">
                  <h3>{t("从真实内容出发。")}</h3>
                  <p>
                    {t(
                      "所有来源、表格和媒体都保存在项目中，供智能体分析与页面复用。",
                    )}
                  </p>
                </div>
                <div className="source-actions">
                  <button
                    disabled={running || busy}
                    onClick={() => file.current?.click()}
                  >
                    <Plus size={14} />
                    {t("上传资料")}
                  </button>
                  <button
                    disabled={running || busy}
                    onClick={() => setModal("url")}
                  >
                    <Link2 size={14} />
                    {t("网站链接")}
                  </button>
                </div>
                {!!project?.sources.length && (
                  <>
                    <p className="section-kicker">
                      {t("原始文件 /")}{" "}
                      {project.sources.filter((s) => s.originalFile).length}
                    </p>
                    <div className="attached-files">
                      {project.sources
                        .filter((s) => s.originalFile)
                        .map((s) => (
                          <button
                            className="secondary"
                            key={s.id}
                            onClick={() =>
                              void download(
                                `/projects/${project.id}/sources/${s.id}/original`,
                                s.format === "website"
                                  ? s.name + ".html"
                                  : s.name,
                              ).catch(handleError)
                            }
                          >
                            <Download size={12} /> {s.name}
                          </button>
                        ))}
                    </div>
                    <p className="section-kicker">
                      {t("Markdown 解析文档 /")} {project.sources.length}
                    </p>
                  </>
                )}
                {project?.sources.map((s) => (
                  <button
                    className="source-card"
                    key={s.id}
                    onClick={() => setSelectedSource(s)}
                  >
                    <span className="source-format">
                      {s.format.toUpperCase()}
                    </span>
                    <div>
                      <strong>{s.name}</strong>
                      <small>
                        {(s.content?.markdownLength ?? 0).toLocaleString()}
                        {t("字符 \u00B7")} {s.assets.length}
                        {t("素材 \u00B7")}
                        {s.tables.length}
                        {t("表格")}
                      </small>
                    </div>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
                {!project?.sources.length && (
                  <div className="empty-sources">
                    <FolderOpen size={32} />
                    <p>{t("还没有资料，添加第一份灵感。")}</p>
                  </div>
                )}
                {assets.length > 0 && (
                  <>
                    <p className="section-kicker">
                      {t("提取的素材 /")}
                      {assets.length}
                    </p>
                    <div className="asset-grid">
                      {assets.map((a) => (
                        <a
                          key={a.id}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          title={a.name}
                        >
                          {a.type === "image" ? (
                            <img src={a.url} alt={a.name} />
                          ) : a.type === "video" ? (
                            <video src={a.url} controls />
                          ) : (
                            <FileText size={24} />
                          )}
                          <span>{a.name}</span>
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="composer-area">
              {selectedFactIds.length > 0 && (
                <div className="attached-files">
                  <span>
                    {t("已选事实")} {selectedFactIds.length}
                    <button
                      aria-label={t("清除事实选择")}
                      onClick={() => setSelectedFactIds([])}
                    >
                      <X size={10} />
                    </button>
                  </span>
                </div>
              )}
              {project?.sources.length ? (
                <div className="attached-files">
                  {project.sources.map((s) => (
                    <span key={s.id} title={s.name}>
                      <FileText size={11} />
                      {s.name}
                      <button
                        aria-label={t("移除 ") + s.name}
                        disabled={running}
                        onClick={async () => {
                          try {
                            await api(
                              "/projects/" + project.id + "/sources/" + s.id,
                              { method: "DELETE" },
                            );
                            setProject(await api("/projects/" + project.id));
                          } catch (e) {
                            handleError(e);
                          }
                        }}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <div
                className="composer"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!running) void upload(e.dataTransfer.files);
                }}
              >
                <textarea
                  ref={composerInput}
                  rows={2}
                  aria-label={t("网页需求")}
                  placeholder={
                    current
                      ? t("描述你想调整的地方\u2026")
                      : t("描述你想创建的网页，或拖入资料\u2026")
                  }
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing &&
                      e.nativeEvent.keyCode !== 229
                    ) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <div className="composer-tools">
                  <button
                    title={t("上传文档")}
                    aria-label={t("上传文档")}
                    disabled={busy || running}
                    onClick={() => file.current?.click()}
                  >
                    {busy ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <Paperclip size={16} />
                    )}
                  </button>
                  <button
                    title={t("添加网站链接")}
                    aria-label={t("添加网站链接")}
                    disabled={busy || running}
                    onClick={() => setModal("url")}
                  >
                    <Globe size={16} />
                  </button>
                  <span>
                    {health?.mode === "demo"
                      ? t("本地演示模式")
                      : health?.model || "Dreamatic"}
                  </span>
                  <button
                    className="send-button"
                    aria-label={running ? t("停止生成") : t("生成网页")}
                    disabled={!running && (!text.trim() || busy)}
                    onClick={() =>
                      running
                        ? void api("/projects/" + project!.id + "/cancel", {
                            method: "POST",
                          }).catch(handleError)
                        : void send()
                    }
                  >
                    {running ? (
                      <Square size={13} fill="currentColor" />
                    ) : (
                      <ArrowUp size={18} />
                    )}
                  </button>
                </div>
              </div>
              <div className="composer-footnote">
                <span>
                  {t(
                    "PDF \u00B7 Word \u00B7 Excel \u00B7 PPT \u00B7 图片 \u00B7 URL",
                  )}
                </span>
                <span>{t("Enter 发送 · Shift + Enter 换行")}</span>
              </div>
            </div>
          </section>
          <section className="canvas-panel">
            <div className="panel-heading">
              <div>
                <span className="green-dot" />
                <strong>{t("设计画布")}</strong>
                <small>CANVAS</small>
              </div>
              <span className="canvas-caption">
                {current
                  ? dirty
                    ? t("当前修改尚未检查")
                    : current.checks?.issues.some((i) => i.severity === "error")
                      ? t("草稿有待修复问题")
                      : current.checks?.status === "warnings"
                        ? t("检查存在警告")
                        : current.checks?.status === "previewed"
                          ? t("已检查对应版本")
                          : t("尚未确认浏览器预览结果")
                  : t("把灵感，变成看得见的作品")}
              </span>
            </div>
            {history && (
              <div className="history-menu">
                <strong>{t("版本记录")}</strong>
                <button
                  className="icon-button"
                  onClick={() => setHistory(false)}
                >
                  <X size={13} />
                </button>
                {project?.versions
                  .slice()
                  .reverse()
                  .map((v, i) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        if (!canLeave()) return;
                        void api("/projects/" + project!.id + "/versions", {
                          method: "POST",
                          body: JSON.stringify({
                            html: v.html,
                            baseVersionId: project!.versions.at(-1)?.id || "",
                            label: t("恢复：") + v.label,
                          }),
                        })
                          .then(() => api<Project>("/projects/" + project!.id))
                          .then((p) => {
                            setProject(p);
                            setVersion("");
                            setHistory(false);
                          })
                          .catch(handleError);
                      }}
                    >
                      <History size={13} />
                      <span>
                        {t(v.label)}
                        <small>
                          {new Date(v.createdAt).toLocaleString(
                            language === "zh" ? "zh-CN" : "en-US",
                          )}
                        </small>
                      </span>
                      {current?.id === v.id && <Check size={13} />}
                    </button>
                  ))}
              </div>
            )}
            {current ? (
              <Suspense
                fallback={
                  <div className="loading">
                    <Loader2 className="spin" />
                    {t("正在加载设计画布")}
                  </div>
                }
              >
                <Editor
                  projectId={project!.id}
                  draftHtml={drafts.current.get(project!.id)}
                  onDraft={(html) => {
                    if (html === null) drafts.current.delete(project!.id);
                    else drafts.current.set(project!.id, html);
                  }}
                  key={project!.id}
                  assets={assets}
                  html={current.html}
                  onSave={async (h) => {
                    try {
                      await saveHtml(h);
                    } catch (e) {
                      handleError(e);
                      throw e;
                    }
                  }}
                  onDirty={setDirty}
                  locked={!!running}
                />
              </Suspense>
            ) : (
              <div className="empty-canvas">
                <div className="canvas-top-label">
                  <i /> YOUR NEXT WEBSITE STARTS HERE
                </div>
                <div className="blueprint">
                  <div className="blueprint-browser">
                    <span />
                    <span />
                    <span />
                    <div />
                  </div>
                  <div className="blueprint-content">
                    <div className="blueprint-nav">
                      <span />
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="blueprint-hero">
                      <div>
                        <small />
                        <strong />
                        <strong />
                        <p />
                        <p />
                        <button />
                      </div>
                      <div className="blueprint-art">
                        <div />
                        <span>✳</span>
                      </div>
                    </div>
                    <div className="blueprint-cards">
                      <div />
                      <div />
                      <div />
                    </div>
                  </div>
                  <span className="floating-label">
                    <Paintbrush size={13} />
                    {t("为你的内容而设计")}
                  </span>
                  <span className="floating-cursor">
                    <MousePointer2 size={18} fill="currentColor" />
                    Dreamatic
                  </span>
                </div>
                <h2>{t("好内容，值得一个好网页。")}</h2>
                <p>
                  {t("从左侧开始对话，智能体将在这里构建你的页面。")}
                  <br />
                  {t("生成之后，可以直接编辑每一个细节。")}
                </p>
                <div className="canvas-features">
                  <span>
                    <FileText size={13} />
                    {t("多模态理解")}
                  </span>
                  <span>
                    <Sparkles size={13} />
                    {t("多智能体协作")}
                  </span>
                  <span>
                    <MousePointer2 size={13} />
                    {t("所见即所得")}
                  </span>
                </div>
                <div className="canvas-bottom-label">
                  <span>CONTENT → DESIGN → EXPERIENCE</span>
                  <span>CREATED WITH DREAMATIC</span>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
      <input
        hidden
        type="file"
        multiple
        ref={file}
        accept={health?.formats.map((f: string) => "." + f).join(",")}
        onChange={(e) => void upload(e.target.files)}
      />
      {error && (
        <div className="toast" role="alert">
          <AlertCircle size={17} />
          <span>{t(error)}</span>
          <button aria-label={t("关闭错误")} onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {modal === "settings" && (
        <Settings
          running={!!running}
          onClose={() => setModal(null)}
          onApplied={() => {
            setError("");
            void boot();
          }}
        />
      )}
      {modal && modal !== "settings" && (
        <div className="modal-backdrop" onMouseDown={() => setModal(null)}>
          <section className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <button
              className="modal-close icon-button"
              aria-label={t("关闭弹窗")}
              onClick={() => setModal(null)}
            >
              <X size={17} />
            </button>
            {modal === "url" ? (
              <>
                <span className="modal-icon">
                  <Globe size={24} />
                </span>
                <h2>{t("添加一个网站")}</h2>
                <p>{t("提取公开网页中的文本、表格和媒体素材。")}</p>
                <label>
                  {t("网站 URL")}
                  <input
                    type="url"
                    autoFocus
                    placeholder="https://example.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && url && !busy) void addUrl();
                    }}
                  />
                </label>
                <p className="subtle">
                  {t("支持静态公开网页；不绕过登录，不遍历站外链接。")}
                </p>
                <button
                  className="primary wide"
                  disabled={!url || busy}
                  onClick={() => void addUrl()}
                >
                  {busy ? (
                    <Loader2 size={15} className="spin" />
                  ) : (
                    <Link2 size={15} />
                  )}{" "}
                  {busy ? t("正在抓取与解析") : t("导入网站内容")}
                </button>
              </>
            ) : (
              <>
                <span className="modal-icon">
                  <BookOpen size={24} />
                </span>
                <h2>{t("按需加载的设计知识")}</h2>
                <p>{t("每个智能体根据当前任务，主动发现并加载所需 Skill。")}</p>
                <div className="skills-list">
                  {skills.map((s) => (
                    <article key={s.name}>
                      <div>
                        <strong>{s.name}</strong>
                        <span>
                          {s.roles
                            .map((r: Role) =>
                              t(roles.find((a) => a.id === r)?.label || r),
                            )
                            .join(" / ")}
                        </span>
                      </div>
                      <p>{s.description}</p>
                    </article>
                  ))}
                </div>
                <p className="subtle">
                  {t("管理员可添加独立设计技能，下一次任务自动发现。")}
                </p>
              </>
            )}
          </section>
        </div>
      )}
      {selectedSource && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setSelectedSource(null)}
        >
          <section
            className="modal source-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label={t("关闭资料")}
              onClick={() => setSelectedSource(null)}
            >
              <X size={17} />
            </button>
            <span className="source-format">
              {selectedSource.format.toUpperCase()}
            </span>
            <h2>{selectedSource.name}</h2>
            <p className="provenance">
              {t("来源：")}
              {selectedSource.provenance}
            </p>
            {selectedSource.content?.readingFormat && project && (
              <button
                className="secondary"
                onClick={() =>
                  void download(
                    `/projects/${project.id}/sources/${selectedSource.id}/reading`,
                    selectedSource.name.replace(/\.[^.]+$/, "") + ".md",
                  ).catch(handleError)
                }
              >
                <Download size={13} />
                {t("下载 Markdown 文档")}
              </button>
            )}
            {selectedSource.warnings.map((w, i) => (
              <p className="source-warning" key={i}>
                <AlertCircle size={13} />
                {t(w)}
              </p>
            ))}
            {selectedSource.tables.map((table, i) => (
              <div className="source-table" key={i}>
                <strong>{table.name}</strong>
                <table>
                  <tbody>
                    {table.rows.slice(0, 30).map((r, j) => (
                      <tr key={j}>
                        {r.map((v, k) => (
                          <td key={k}>
                            {typeof v === "object"
                              ? JSON.stringify(v)
                              : String(v ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {table.rows.length > 30 && (
                  <small>
                    {t("预览显示前 30 行；完整提取数据保存在项目中。")}
                  </small>
                )}
              </div>
            ))}
            <pre>
              {selectedSource.markdown?.slice(0, 20000) ||
                t("此来源没有可用的 Markdown 文档，请重新导入。")}
            </pre>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
