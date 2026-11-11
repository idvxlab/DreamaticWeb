import { useEffect, useRef, useState } from "react";
import grapesjs, { type Editor as GrapesEditor } from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import zh from "grapesjs/locale/zh";
import { useI18n } from "./i18n";
import { api } from "./api";
import { parseEditorCss } from "./editor-css";
import {
  parseEditorDocument,
  serializeEditorDocument,
  serializePreviewDocument,
} from "./editor-document";
import { blockCard } from "./block-cards";
import { EDITOR_CSP } from "../../../packages/shared/html-policy";
import type { Asset } from "../../../packages/shared/project";
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

type Translate = (value: string) => string;

const westernFonts = [
  "Arial, Helvetica, sans-serif",
  "Arial Black, Gadget, sans-serif",
  "Brush Script MT, sans-serif",
  "Comic Sans MS, cursive, sans-serif",
  "Courier New, Courier, monospace",
  "Georgia, serif",
  "Helvetica, sans-serif",
  "Impact, Charcoal, sans-serif",
  "Lucida Sans Unicode, Lucida Grande, sans-serif",
  "Tahoma, Geneva, sans-serif",
  "Times New Roman, Times, serif",
  "Trebuchet MS, Helvetica, sans-serif",
  "Verdana, Geneva, sans-serif",
].map((font) => ({ id: font, label: font.split(",")[0] }));

const fontOptions = [
  {
    id: '"PingFang SC", "Hiragino Sans GB", sans-serif',
    label: "苹方",
  },
  { id: '"Microsoft YaHei", sans-serif', label: "微软雅黑" },
  {
    id: '"Noto Sans SC", "Source Han Sans SC", sans-serif',
    label: "思源黑体",
  },
  { id: '"Songti SC", "Noto Serif SC", serif', label: "宋体" },
  ...westernFonts,
];

function stylePropertyOverrides(t: Translate) {
  const sides = (prefix: "padding" | "margin") =>
    ["上", "右", "下", "左"].map((label, index) => ({
      property: `${prefix}-${["top", "right", "bottom", "left"][index]}`,
      label: t(label),
    }));
  return {
    layout: [
      ["display", "显示方式"],
      ["flex-direction", "排列方向"],
      ["justify-content", "主轴对齐"],
      ["align-items", "交叉轴对齐"],
      ["gap", "间距"],
      ["width", "宽度"],
      ["height", "高度"],
      ["min-height", "最小高度"],
      ["padding", "内边距"],
      ["margin", "外边距"],
    ].map(([property, label]) => ({
      property,
      label: t(label),
      ...(["padding", "margin"].includes(property)
        ? { properties: sides(property as "padding" | "margin") }
        : {}),
    })),
    typography: [
      { property: "font-family", label: t("字体"), options: fontOptions },
      ...[
        ["font-size", "字号"],
        ["font-weight", "字重"],
        ["line-height", "行高"],
        ["letter-spacing", "字间距"],
        ["color", "文字颜色"],
        ["text-align", "对齐方式"],
      ].map(([property, label]) => ({ property, label: t(label) })),
    ],
    appearance: [
      { property: "background-color", label: t("背景色") },
      {
        property: "border",
        label: t("边框"),
        properties: [
          { property: "border-width", label: t("粗细") },
          { property: "border-style", label: t("样式") },
          { property: "border-color", label: t("颜色") },
        ],
      },
      {
        property: "border-radius",
        label: t("圆角"),
        properties: [
          ["border-top-left-radius", "左上"],
          ["border-top-right-radius", "右上"],
          ["border-bottom-right-radius", "右下"],
          ["border-bottom-left-radius", "左下"],
        ].map(([property, label]) => ({ property, label: t(label) })),
      },
      {
        property: "box-shadow",
        label: t("阴影"),
        properties: [
          ["box-shadow-h", "水平偏移"],
          ["box-shadow-v", "垂直偏移"],
          ["box-shadow-blur", "模糊"],
          ["box-shadow-spread", "扩散"],
          ["box-shadow-color", "颜色"],
          ["box-shadow-type", "类型"],
        ].map(([property, label]) => ({ property, label: t(label) })),
      },
      { property: "opacity", label: t("不透明度") },
    ],
  };
}

function updateStyleManagerLanguage(e: GrapesEditor, t: Translate) {
  const definitions = stylePropertyOverrides(t);
  const updateProperties = (models: any, overrides: any[]) => {
    models?.forEach((model: any) => {
      const property = model.get("property") || model.get("id");
      const override = overrides.find(
        (item) => item.property === property || item.id === property,
      );
      if (!override) return;
      model.set("label", override.label);
      if (override.options && typeof model.setOptions === "function")
        model.setOptions(override.options);
      if (override.properties && typeof model.getProperties === "function")
        updateProperties(model.getProperties(), override.properties);
    });
  };
  e.StyleManager.getSectors({ array: true }).forEach((sector: any) => {
    const id = sector.get("id") as keyof typeof definitions;
    const sectorName = {
      layout: "布局",
      typography: "文字",
      appearance: "外观",
    }[id];
    if (sectorName) sector.set("name", t(sectorName));
    updateProperties(sector.getProperties(), definitions[id] || []);
  });
}

const editorOnlyRevealCss = `
.section-reveal,
[data-reveal],
.reveal,
.fade-in,
.fade-up,
[style*="opacity:0"],
[style*="opacity: 0"] {
  opacity: 1 !important;
  visibility: visible !important;
  transform: none !important;
  animation: none !important;
  transition: none !important;
}`;
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
  const scripts = useRef<string[]>([]);
  const [modified, setModified] = useState(false);
  const metadata = useRef({
    title: "Dreamatic · Web",
    lang: "zh-CN",
    description: "",
  });
  const loadDocument = (e: GrapesEditor, value: string) => {
    const parsed = parseEditorDocument(value);
    scripts.current = parsed.scripts;
    bodyAttributes.current = parsed.bodyAttributes;
    metadata.current = parsed.metadata;
    e.setStyle("");
    e.setComponents(parsed.markup);
    const wrapper = e.getWrapper();
    wrapper?.setAttributes(bodyAttributes.current);
    // Keep policy in the head model as well: GrapesJS renders that model after
    // frameContent and replaces any manually inserted head nodes on reload.
    wrapper?.head.components([
      {
        tagName: "meta",
        attributes: {
          "http-equiv": "Content-Security-Policy",
          content: EDITOR_CSP,
        },
      },
      // Editor-only: script-driven reveals stay visible in the design canvas.
      // The head model is never serialized by getHtml()/getCss().
      {
        tagName: "style",
        attributes: {
          id: "dreamatic-editor-reveal-style",
          "data-dreamatic-editor-only": "",
        },
        components: editorOnlyRevealCss,
      },
    ]);
  };
  const bodyAttributes = useRef<Record<string, string>>({});
  const snapshot = (e: GrapesEditor) =>
    e.getHtml() + "\n" + e.getCss() + "\n" + scripts.current.join("\n");
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
  const translate = useRef(t);
  translate.current = t;
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
        embedAsBase64: false,
        showUrlInput: false,
        noAssets: `<p class="asset-manager-empty">${t("项目里还没有图片素材")}</p>`,
        assets: assets
          .filter((a) => a.type === "image")
          .map((a) => ({ src: a.url, name: a.name })),
      },
      parser: {
        parserCss: parseEditorCss,
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
        frameContent: `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${EDITOR_CSP}"></head><body></body></html>`,
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
            id: "layout",
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
            properties: stylePropertyOverrides(t).layout as any,
          },
          {
            id: "typography",
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
            properties: stylePropertyOverrides(t).typography as any,
          },
          {
            id: "appearance",
            name: t("外观"),
            open: true,
            buildProps: [
              "background-color",
              "border",
              "border-radius",
              "box-shadow",
              "opacity",
            ],
            properties: stylePropertyOverrides(t).appearance as any,
          },
        ],
      },
      layerManager: { appendTo: "#layers" },
      selectorManager: { appendTo: "#selectors", componentFirst: true },
      traitManager: { appendTo: "#traits" },
    });
    editor.current = e;
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
        meta.content = EDITOR_CSP;
        doc.head.prepend(meta);
      }
    };
    e.on("canvas:frame:load", ({ el }: { el: HTMLIFrameElement }) => {
      el.setAttribute("sandbox", "allow-same-origin");
      el.setAttribute("title", translate.current("网页设计画布"));
      secureFrame();
    });
    e.on("canvas:frame:load:body", secureFrame);
    e.on("update", secureFrame);
    e.on("load", () => {
      // Keep one selector view when GrapesJS remounts managers during canvas load.
      document
        .getElementById("selectors")
        ?.replaceChildren(e.SelectorManager.render([]));
    });
    e.on("asset:open", () => {
      const container = e.AssetManager.getContainer() as
        HTMLElement | undefined;
      if (!container) return;
      let hint = container.querySelector<HTMLElement>(".asset-manager-hint");
      if (!hint) {
        hint = document.createElement("p");
        hint.className = "asset-manager-hint";
        container.prepend(hint);
      }
      hint.textContent = translate.current(
        "只能选择项目中的图片；新图片请先作为资料上传。",
      );
    });
    let colorAnchor: HTMLElement | null = null;
    const placeColorPicker = () => {
      requestAnimationFrame(() => {
        const picker = document.querySelector<HTMLElement>(
          ".sp-container:not(.sp-hidden)",
        );
        if (!picker || !colorAnchor?.isConnected) return;
        const anchor = colorAnchor.getBoundingClientRect();
        const width = picker.offsetWidth;
        const height = picker.offsetHeight;
        const gap = 6;
        const left = Math.min(
          Math.max(8, anchor.right - width),
          Math.max(8, window.innerWidth - width - 8),
        );
        const preferredTop =
          anchor.bottom + gap + height <= window.innerHeight
            ? anchor.bottom + gap
            : anchor.top - height - gap;
        const top = Math.min(
          Math.max(8, preferredTop),
          Math.max(8, window.innerHeight - height - 8),
        );
        Object.assign(picker.style, {
          position: "fixed",
          left: `${left}px`,
          top: `${top}px`,
        });
      });
    };
    const captureColorAnchor = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLElement>(".gjs-field-color-picker");
      if (!anchor) return;
      colorAnchor = anchor;
      placeColorPicker();
    };
    const inspector = host.current
      ?.closest(".design-editor")
      ?.querySelector(".inspector");
    document.addEventListener("click", captureColorAnchor, true);
    inspector?.addEventListener("scroll", placeColorPicker);
    window.addEventListener("resize", placeColorPicker);
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
        ...(id === "image" ? { activate: true, select: true } : {}),
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
      document.removeEventListener("click", captureColorAnchor, true);
      inspector?.removeEventListener("scroll", placeColorPicker);
      window.removeEventListener("resize", placeColorPicker);
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
    loadDocument(e, html);
    baseline.current = snapshot(e);
    if (initial && draftHtml) {
      loadDocument(e, draftHtml);
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
    updateStyleManagerLanguage(e, t);
    e.AssetManager.getConfig().noAssets = `<p class="asset-manager-empty">${t("项目里还没有图片素材")}</p>`;
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
    return serializeEditorDocument({
      html: e.getHtml(),
      css: e.getCss() || "",
      metadata: metadata.current,
      scripts: scripts.current,
      bodyAttributes: e.getWrapper()?.getAttributes() || {},
    });
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
    e.select();
    loadDocument(e, html);
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
        <span className="editor-animation-note">
          {t("设计视图不运行动画脚本，动画请在“预览”中查看")}
        </span>
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
        <div
          className="canvas-container"
          ref={host}
          style={preview ? { display: "none" } : undefined}
        />
        {preview && (
          <iframe
            title="网页交互预览"
            sandbox="allow-scripts"
            srcDoc={serializePreviewDocument(getHtml())}
            style={{
              border: 0,
              height: "100%",
              width:
                device === "Mobile" ? 390 : device === "Tablet" ? 768 : "100%",
              maxWidth: "100%",
            }}
          />
        )}
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
            <p>{t("修改后点击应用。内联 JavaScript 会保留，在预览中运行。")}</p>
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
                  if (editor.current) loadDocument(editor.current, source);
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
