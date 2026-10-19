import { useEffect, useRef, useState } from "react";
import grapesjs, { type Editor as GrapesEditor } from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import zh from "grapesjs/locale/zh";
import { useI18n } from "./i18n";
import { api } from "./api";
import { blockCard } from "./block-cards";
import { PREVIEW_CSP } from "../../../packages/shared/html-policy";
import type { Asset } from "../../../packages/agents/src/contracts";
import {
  MousePointer2,
  Layers,
  Blocks,
  SlidersHorizontal,
  Code2,
  Undo2,
  Redo2,
  Save,
  Eye,
  ExternalLink,
  Monitor,
  Tablet,
  Smartphone,
} from "lucide-react";
interface Props {
  projectId: string;
  assets: Asset[];
  html: string;
  draftHtml?: string;
  onDraft: (html: string | null) => void;
  onSave: (html: string) => Promise<void>;
  onDirty: (dirty: boolean) => void;
  locked: boolean;
}
export default function Editor({
  projectId,
  assets,
  html,
  draftHtml,
  onDraft,
  onSave,
  onDirty,
  locked,
}: Props) {
  const { t, language } = useI18n();
  const host = useRef<HTMLDivElement>(null),
    editor = useRef<GrapesEditor>(null);
  const baseline = useRef("");
  const resetting = useRef(false);
  const [modified, setModified] = useState(false);
  const metadata = useRef({
    title: "Dreamatic · Web",
    lang: "zh-CN",
    description: "",
  });
  const rememberMetadata = (value: string) => {
    const doc = new DOMParser().parseFromString(value, "text/html");
    metadata.current = {
      title: doc.title || "Dreamatic · Web",
      lang: doc.documentElement.lang || "zh-CN",
      description:
        doc
          .querySelector('meta[name="description"]')
          ?.getAttribute("content") || "",
    };
  };
  const snapshot = (e: GrapesEditor) => e.getHtml() + "\n" + e.getCss();
  const [tab, setTab] = useState("styles"),
    [device, setDevice] = useState("Desktop"),
    [preview, setPreview] = useState(false),
    [mobileInspector, setMobileInspector] = useState(false),
    [code, setCode] = useState(false),
    [source, setSource] = useState(""),
    [saving, setSaving] = useState(false),
    [opening, setOpening] = useState(false),
    [openError, setOpenError] = useState("");
  const callbacks = useRef({ onSave, onDirty, onDraft });
  callbacks.current = { onSave, onDirty, onDraft };
  useEffect(() => {
    if (!host.current) return;
    const mountIds = ["blocks", "styles", "layers", "selectors", "traits"];
    mountIds.forEach((id) => document.getElementById(id)?.replaceChildren());
    const e = grapesjs.init({
      container: host.current,
      i18n: { locale: language, localeFallback: "en", messages: { zh } },
      height: "100%",
      width: "auto",
      storageManager: false,
      fromElement: false,
      noticeOnUnload: false,
      panels: { defaults: [] },
      assetManager: {
        upload: false,
        assets: assets
          .filter((a) => a.type === "image")
          .map((a) => ({ src: a.url, name: a.name })),
      },
      parser: {
        optionsHtml: {
          allowScripts: false,
          allowUnsafeAttr: false,
          allowUnsafeAttrValue: false,
        },
      },
      canvas: {
        scripts: [],
        styles: [],
        allowExternalDrop: false,
        frameContent: `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"></head><body></body></html>`,
      },
      deviceManager: {
        devices: [
          { name: "Desktop", width: "" },
          { name: "Tablet", width: "768px", widthMedia: "992px" },
          { name: "Mobile", width: "390px", widthMedia: "480px" },
        ],
      },
      blockManager: { appendTo: "#blocks" },
      styleManager: {
        appendTo: "#styles",
        sectors: [
          {
            name: t("布局"),
            open: true,
            buildProps: [
              "display",
              "flex-direction",
              "justify-content",
              "align-items",
              "gap",
              "width",
              "height",
              "min-height",
              "padding",
              "margin",
            ],
          },
          {
            name: t("文字"),
            open: true,
            buildProps: [
              "font-family",
              "font-size",
              "font-weight",
              "line-height",
              "letter-spacing",
              "color",
              "text-align",
            ],
          },
          {
            name: t("外观"),
            open: true,
            buildProps: [
              "background-color",
              "border",
              "border-radius",
              "box-shadow",
              "opacity",
            ],
          },
        ],
      },
      layerManager: { appendTo: "#layers" },
      selectorManager: { appendTo: "#selectors" },
      traitManager: { appendTo: "#traits" },
    });
    editor.current = e;
    e.on("canvas:frame:load", ({ el }: { el: HTMLIFrameElement }) => {
      el.setAttribute("sandbox", "allow-same-origin");
      el.setAttribute("title", t("网页设计画布"));
    });
    const secureFrame = () => {
      const frame = e.Canvas.getFrameEl();
      if (!frame) return;
      frame.setAttribute("sandbox", "allow-same-origin");
      const doc = frame.contentDocument;
      if (
        doc?.head &&
        !doc.head.querySelector('meta[http-equiv="Content-Security-Policy"]')
      ) {
        const meta = doc.createElement("meta");
        meta.httpEquiv = "Content-Security-Policy";
        meta.content = PREVIEW_CSP;
        doc.head.prepend(meta);
      }
    };
    e.on("canvas:frame:load:body", secureFrame);
    e.on("update", secureFrame);
    e.on("load", () => {
      // Keep one selector view when GrapesJS remounts managers during canvas load.
      document
        .getElementById("selectors")
        ?.replaceChildren(e.SelectorManager.render([]));
    });
    const blocks = [
      [
        "text",
        t("文字"),
        '<p style="font-size:16px;line-height:1.8;padding:12px">双击编辑这段文字</p>',
      ],
      [
        "heading",
        t("标题"),
        '<h2 style="font-size:36px;padding:12px">写下新的标题</h2>',
      ],
      [
        "section",
        t("内容区块"),
        '<section style="padding:48px 24px;min-height:160px;background:#f1f0e8"><h2>新的章节</h2><p>在这里讲述你的故事。</p></section>',
      ],
      [
        "columns",
        t("双列布局"),
        '<div style="display:flex;gap:24px;padding:24px"><div style="width:50%;min-height:120px;padding:16px;background:#eee">左侧内容</div><div style="width:50%;min-height:120px;padding:16px;background:#eee">右侧内容</div></div>',
      ],
      [
        "image",
        t("图片"),
        { type: "image", style: { width: "100%", "max-width": "600px" } },
      ],
      [
        "link",
        t("链接按钮"),
        '<a href="#" style="display:inline-block;padding:14px 24px;background:#293d2c;color:white;border-radius:24px">了解更多 →</a>',
      ],
      [
        "video",
        t("视频"),
        {
          type: "video",
          attributes: { controls: true },
          style: { width: "100%" },
        },
      ],
      [
        "divider",
        t("分隔线"),
        '<hr style="border:0;border-top:1px solid #ddd;margin:24px 0">',
      ],
    ];
    blocks.forEach(([id, label, content]) =>
      e.BlockManager.add(String(id), {
        ...blockCard(String(id), String(label), t),
        content: content as any,
      }),
    );
    e.on("update", () => {
      if (resetting.current) return;
      const dirty = snapshot(e) !== baseline.current;
      setModified(dirty);
      callbacks.current.onDraft(dirty ? getHtml() : null);
      callbacks.current.onDirty(dirty);
    });
    return () => {
      e.destroy();
      editor.current = null;
      mountIds.forEach((id) => document.getElementById(id)?.replaceChildren());
    };
  }, []);
  useEffect(() => {
    const e = editor.current;
    if (!e) return;
    const initial = baseline.current === "";
    resetting.current = true;
    rememberMetadata(html);
    e.setStyle("");
    e.setComponents(html);
    baseline.current = snapshot(e);
    if (initial && draftHtml) {
      rememberMetadata(draftHtml);
      e.setStyle("");
      e.setComponents(draftHtml);
    }
    e.UndoManager.clear();
    resetting.current = false;
    const dirty = snapshot(e) !== baseline.current;
    setModified(dirty);
    callbacks.current.onDirty(dirty);
    if (!dirty) callbacks.current.onDraft(null);
  }, [html]);
  useEffect(() => {
    const e = editor.current;
    if (!e) return;
    e.I18n.setLocale(language);
    const names: Record<string, string> = {
      text: t("文字"),
      heading: t("标题"),
      section: t("内容区块"),
      columns: t("双列布局"),
      image: t("图片"),
      link: t("链接按钮"),
      video: t("视频"),
      divider: t("分隔线"),
    };
    for (const [id, label] of Object.entries(names)) {
      const block = e.BlockManager.get(id);
      if (block) block.set(blockCard(id, t(label), t));
    }
    e.StyleManager.getSectors().forEach(
      (sector: { set: (key: string, value: string) => void }, index: number) =>
        sector.set("name", t(["布局", "文字", "外观"][index] || "")),
    );
    e.Canvas.getFrameEl()?.setAttribute("title", t("网页设计画布"));
  }, [language]);
  useEffect(() => {
    editor.current?.setDevice(device);
  }, [device]);
  useEffect(() => {
    editor.current?.AssetManager.add(
      assets
        .filter((a) => a.type === "image")
        .map((a) => ({ src: a.url, name: a.name })),
    );
  }, [assets]);
  useEffect(() => {
    const e = editor.current;
    if (!e) return;
    if (preview) e.runCommand("preview");
    else e.stopCommand("preview");
  }, [preview]);
  const getHtml = () => {
    const e = editor.current!;
    const doc = document.implementation.createHTMLDocument(
      metadata.current.title,
    );
    doc.documentElement.lang = metadata.current.lang;
    const charset = doc.createElement("meta");
    charset.setAttribute("charset", "utf-8");
    const viewport = doc.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width,initial-scale=1";
    const description = doc.createElement("meta");
    description.name = "description";
    description.content = metadata.current.description;
    const style = doc.createElement("style");
    style.textContent = e.getCss() || "";
    doc.head.prepend(charset);
    doc.head.append(viewport, description, style);
    doc.body.innerHTML = e.getHtml();
    return "<!doctype html>" + doc.documentElement.outerHTML;
  };
  async function openInBrowser() {
    if (opening) return;
    setOpening(true);
    setOpenError("");
    try {
      await api(`/projects/${projectId}/open`, {
        method: "POST",
        body: JSON.stringify({ html: getHtml() }),
      });
    } catch (error) {
      setOpenError((error as Error).message);
    } finally {
      setOpening(false);
    }
  }
  function discard() {
    const e = editor.current;
    if (!e || locked || saving) return;
    resetting.current = true;
    rememberMetadata(html);
    e.select();
    e.setStyle("");
    e.setComponents(html);
    e.UndoManager.clear();
    baseline.current = snapshot(e);
    resetting.current = false;
    setSource("");
    setCode(false);
    setModified(false);
    callbacks.current.onDraft(null);
    callbacks.current.onDirty(false);
  }
  async function save() {
    setSaving(true);
    try {
      await onSave(getHtml());
      onDirty(false);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className={"design-editor " + (locked ? "locked" : "")}>
      {openError && <p role="alert">{t(openError)}</p>}
      <div className="editor-toolbar">
        <div className="segmented">
          {[
            [MousePointer2, false, t("设计")],
            [Eye, true, t("预览")],
          ].map(([Icon, p, label]) => {
            const I = Icon as typeof Eye;
            return (
              <button
                key={String(label)}
                className={preview === p ? "active" : ""}
                onClick={() => setPreview(p as boolean)}
              >
                <I size={13} />
                {t(label as string)}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={opening || locked}
          onClick={() => void openInBrowser()}
          title={t("在系统默认浏览器中打开当前页面")}
        >
          <ExternalLink size={13} />
          {opening ? t("打开中…") : t("打开")}
        </button>
        <div className="device-switch">
          {[
            [Monitor, "Desktop"],
            [Tablet, "Tablet"],
            [Smartphone, "Mobile"],
          ].map(([Icon, d]) => {
            const I = Icon as typeof Eye;
            return (
              <button
                aria-label={String(d)}
                title={String(d)}
                key={String(d)}
                className={device === d ? "active" : ""}
                onClick={() => setDevice(d as string)}
              >
                <I size={15} />
              </button>
            );
          })}
        </div>
        <span className="toolbar-spacer" />
        <button
          className="inspector-toggle"
          aria-label={t("切换样式面板")}
          onClick={() => setMobileInspector(!mobileInspector)}
        >
          <SlidersHorizontal size={14} />
        </button>
        <button
          title={t("撤销")}
          aria-label={t("撤销")}
          disabled={locked}
          onClick={() => editor.current?.UndoManager.undo()}
        >
          <Undo2 size={14} />
        </button>
        <button
          title={t("重做")}
          aria-label={t("重做")}
          disabled={locked}
          onClick={() => editor.current?.UndoManager.redo()}
        >
          <Redo2 size={14} />
        </button>
        <button
          disabled={locked}
          title={t("HTML 源码")}
          aria-label={t("HTML 源码")}
          onClick={() => {
            setSource(getHtml());
            setCode(true);
          }}
        >
          <Code2 size={15} />
        </button>
        <button
          className="discard-edit"
          disabled={locked || saving || !modified}
          onClick={discard}
          title={t("放弃当前未保存的修改")}
        >
          {t("放弃")}
        </button>
        <button
          className="save-edit"
          disabled={locked || saving || !modified}
          onClick={() => void save().catch(() => {})}
        >
          <Save size={13} />
          {saving ? t("保存中") : t("保存")}
        </button>
      </div>
      <div className="editor-workspace">
        <div className="canvas-container" ref={host} />
        <aside
          className={
            "inspector " +
            (preview ? "hidden " : "") +
            (mobileInspector ? "mobile-open" : "")
          }
        >
          <div className="inspector-tabs">
            {[
              [SlidersHorizontal, "styles", t("样式")],
              [Blocks, "blocks", t("组件")],
              [Layers, "layers", t("图层")],
            ].map(([Icon, id, label]) => {
              const I = Icon as typeof Eye;
              return (
                <button
                  className={tab === id ? "active" : ""}
                  key={String(id)}
                  onClick={() => setTab(id as string)}
                >
                  <I size={13} />
                  {t(label as string)}
                </button>
              );
            })}
          </div>
          <div className="inspector-body">
            <div hidden={tab !== "styles"}>
              <p className="inspector-hint">
                {t("选中画布中的元素，调整外观。")}
                <br />
                {t("双击文字即可直接修改。")}
              </p>
              <div id="selectors" />
              <div id="traits" />
              <div id="styles" />
            </div>
            <div className="component-library" hidden={tab !== "blocks"}>
              <div className="component-library-intro">
                <strong>{t("搭建你的页面")}</strong>
                <span>{t("拖入画布，组合内容与布局")}</span>
              </div>
              <div id="blocks" />
            </div>
            <div id="layers" hidden={tab !== "layers"} />
          </div>
        </aside>
      </div>
      {code && (
        <div className="modal-backdrop">
          <section className="code-modal">
            <h3>{t("HTML 源码")}</h3>
            <p>{t("修改后点击应用。活动脚本会在保存时移除。")}</p>
            <textarea
              aria-label={t("HTML 源码编辑")}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
            <div>
              <button onClick={() => setCode(false)}>{t("取消")}</button>
              <button
                disabled={locked}
                className="primary"
                onClick={() => {
                  rememberMetadata(source);
                  editor.current?.setStyle("");
                  editor.current?.setComponents(source);
                  setCode(false);
                  onDirty(true);
                }}
              >
                {t("应用到画布")}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
