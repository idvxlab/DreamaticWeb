import { useEffect, useRef, useState } from "react";
import { Save, SlidersHorizontal, X } from "lucide-react";
import { api, token } from "./api";
import { useI18n } from "./i18n";
import { APP_NAME, APP_VERSION } from "../../../packages/shared/app-info";
import type {
  ModelProfile,
  PublicConfig,
  RuntimeConfig,
} from "../../../packages/shared/config";
type Profile = ModelProfile & { hasApiKey?: boolean };
type Draft = Omit<RuntimeConfig, "models"> & {
  models: {
    reasoning: Profile;
    analyst: Profile | null;
    designer: Profile | null;
  };
};
type Tab = "reasoning" | "analyst" | "designer" | "system";
function configSnapshot(config: Draft) {
  const profile = (value: Profile | null) =>
    value && {
      mode: value.mode,
      baseUrl: value.baseUrl,
      model: value.model,
      vision: value.vision,
      apiKey: value.apiKey || "",
      clearApiKey: !!value.clearApiKey,
    };
  return JSON.stringify({
    mode: config.mode,
    workspace: config.workspace,
    language: config.language,
    models: {
      reasoning: profile(config.models.reasoning),
      analyst: profile(config.models.analyst),
      designer: profile(config.models.designer),
    },
  });
}

export default function Settings({
  onApplied,
  onClose,
  running,
}: {
  onApplied: () => void;
  onClose: () => void;
  running: boolean;
}) {
  const { t } = useI18n();
  const [config, setConfig] = useState<Draft>();
  const [baseline, setBaseline] = useState("");
  const dirty = !!config && configSnapshot(config) !== baseline;
  const [tab, setTab] = useState<Tab>("reasoning");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [accessToken, setAccessToken] = useState(token());
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    api<PublicConfig>("/config")
      .then((loaded) => {
        setConfig(loaded);
        setBaseline(configSnapshot(loaded));
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    dialog.current?.querySelector<HTMLButtonElement>('[role="tab"]')?.focus();
    return () => previous?.focus();
  }, []);
  const tabs: { id: Tab; title: string }[] = [
    { id: "reasoning", title: t("系统推理模型") },
    { id: "analyst", title: t("文档分析模型") },
    { id: "designer", title: t("HTML UI 页面生成模型") },
    { id: "system", title: t("系统") },
  ];
  function patchProfile(patch: Partial<Profile>) {
    if (!config || tab === "system") return;
    setConfig({
      ...config,
      models: { ...config.models, [tab]: { ...config.models[tab], ...patch } },
    } as Draft);
  }
  async function submit(closeAfterSave = false) {
    if (!config || saving || running || !dirty) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const applied = await api<PublicConfig>("/config", {
        method: "PUT",
        body: JSON.stringify(config),
      });
      setConfig(applied);
      setBaseline(configSnapshot(applied));
      setSaved(true);
      onApplied();
      if (closeAfterSave) onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const profile = tab !== "system" ? config?.models[tab] : undefined;
  return (
    <div className="modal-backdrop config-backdrop" role="presentation">
      <section
        ref={dialog}
        className="settings-modal config-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !saving) onClose();
          if (e.key === "Tab") {
            const controls = [
              ...dialog.current!.querySelectorAll<HTMLElement>(
                "button:not(:disabled), input:not(:disabled), select:not(:disabled), summary",
              ),
            ].filter((el) => el.getClientRects().length);
            const first = controls[0],
              last = controls.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <div className="settings-icon">
            <SlidersHorizontal size={17} />
          </div>
          <span>
            <strong id="settings-title">{t("系统设置")}</strong>
            <small>{t("读取并保存 Dreamatic· Web 配置")}</small>
          </span>
          <button
            type="button"
            aria-label={t("关闭设置")}
            disabled={saving}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="config-source">
          <code>
            {APP_NAME} v{APP_VERSION}
          </code>
          <span>{t("保存后自动应用于后续任务。密钥仅保存在本机服务端。")}</span>
        </div>
        <div className="config-tabs" role="tablist" aria-label={t("配置模块")}>
          {tabs.map((item, index) => (
            <button
              type="button"
              key={item.id}
              id={`config-tab-${item.id}`}
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={`config-panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
              onKeyDown={(e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  const next =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? tabs.length - 1
                        : (index +
                            (e.key === "ArrowRight" ? 1 : -1) +
                            tabs.length) %
                          tabs.length;
                  setTab(tabs[next].id);
                  dialog.current
                    ?.querySelector<HTMLButtonElement>(
                      `#config-tab-${tabs[next].id}`,
                    )
                    ?.focus();
                }
              }}
            >
              {item.title}
            </button>
          ))}
        </div>
        <form
          onChange={() => setSaved(false)}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div
            className="config-form"
            role="tabpanel"
            id={`config-panel-${tab}`}
            aria-labelledby={`config-tab-${tab}`}
          >
            {!config && (
              <p className="config-module-description" role="status">
                {error ? t(error) : t("正在读取模型设置…")}
              </p>
            )}
            {config && tab !== "system" && (
              <>
                <p className="config-module-description">
                  {tab === "reasoning"
                    ? t("为当前任务配置核心推理与需求调度模型。")
                    : t("未独立配置时，自动使用系统推理模型的完整配置。")}
                </p>
                {tab !== "reasoning" && (
                  <label className="config-wide">
                    <span>{t("独立配置")}</span>
                    <select
                      aria-label={t("独立配置")}
                      value={profile ? "custom" : "inherit"}
                      disabled={saving}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          models: {
                            ...config.models,
                            [tab]:
                              e.target.value === "inherit"
                                ? null
                                : {
                                    mode: "openai-compatible",
                                    baseUrl: "",
                                    model: "",
                                    apiKey: "",
                                    vision: true,
                                  },
                          },
                        })
                      }
                    >
                      <option value="inherit">{t("使用系统推理模型")}</option>
                      <option value="custom">{t("独立配置")}</option>
                    </select>
                  </label>
                )}
                {profile && (
                  <>
                    <label>
                      <span>{t("模型模式")}</span>
                      <select
                        aria-label={t("模型模式")}
                        value={profile.mode}
                        disabled={saving}
                        onChange={(e) =>
                          patchProfile({
                            mode: e.target.value as ModelProfile["mode"],
                          })
                        }
                      >
                        <option value="openai">OpenAI</option>
                        <option value="openai-compatible">
                          {t("OpenAI 兼容型")}
                        </option>
                      </select>
                    </label>
                    <label>
                      <span>{t("模型名称")}</span>
                      <input
                        aria-label={t("模型名称")}
                        value={profile.model}
                        disabled={saving}
                        placeholder={t("填写服务商提供的模型名称")}
                        autoComplete="off"
                        onChange={(e) =>
                          patchProfile({ model: e.target.value })
                        }
                      />
                    </label>
                    <label className="config-wide">
                      <span>{t("模型调用 URL")}</span>
                      <input
                        aria-label={t("模型调用 URL")}
                        type="url"
                        value={profile.baseUrl}
                        disabled={saving}
                        placeholder="https://your-api.example/v1"
                        autoComplete="off"
                        onChange={(e) =>
                          patchProfile({ baseUrl: e.target.value })
                        }
                      />
                      <small className="config-example">
                        {t("示例：")}
                        <code>
                          {profile.mode === "openai"
                            ? "https://api.openai.com/v1"
                            : "https://your-provider.example/v1"}
                        </code>
                      </small>
                    </label>
                    <label className="config-wide">
                      <span>
                        {t("API 密钥")}
                        <em>
                          {profile.hasApiKey
                            ? t("已配置；留空保留")
                            : t("未配置")}
                        </em>
                      </span>
                      <input
                        aria-label={t("API 密钥")}
                        type="password"
                        value={profile.apiKey || ""}
                        disabled={saving}
                        autoComplete="new-password"
                        placeholder={t("留空保留当前密钥")}
                        onChange={(e) =>
                          patchProfile({ apiKey: e.target.value })
                        }
                      />
                    </label>
                    <label className="config-check">
                      <input
                        type="checkbox"
                        checked={profile.vision}
                        disabled={saving}
                        onChange={(e) =>
                          patchProfile({ vision: e.target.checked })
                        }
                      />
                      <span>{t("支持图片输入")}</span>
                    </label>
                    {profile.hasApiKey && (
                      <label className="config-check">
                        <input
                          type="checkbox"
                          checked={!!profile.clearApiKey}
                          disabled={saving}
                          onChange={(e) =>
                            patchProfile({ clearApiKey: e.target.checked })
                          }
                        />
                        <span>{t("清除已保存密钥")}</span>
                      </label>
                    )}
                  </>
                )}
              </>
            )}
            {tab === "system" && (
              <>
                {config && (
                  <>
                    <label className="config-wide">
                      <span>{t("Workspace 路径")}</span>
                      <input
                        aria-label={t("Workspace 路径")}
                        value={config.workspace}
                        disabled={saving}
                        placeholder="/absolute/path/to/workspace"
                        onChange={(e) =>
                          setConfig({ ...config, workspace: e.target.value })
                        }
                      />
                      <small className="config-help">
                        {t("保存后切换工作目录，原目录中的项目保留在原位置。")}
                      </small>
                    </label>

                    <label>
                      <span>{t("界面语言")}</span>
                      <select
                        aria-label={t("界面语言")}
                        value={config.language}
                        disabled={saving}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            language: e.target.value as "zh" | "en",
                          })
                        }
                      >
                        <option value="zh">简体中文</option>
                        <option value="en">English</option>
                      </select>
                    </label>
                    <label>
                      <span>{t("运行模式")}</span>
                      <select
                        aria-label={t("运行模式")}
                        value={config.mode}
                        disabled={saving}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            mode: e.target.value as "live" | "demo",
                          })
                        }
                      >
                        <option value="live">{t("实时模型")}</option>
                        <option value="demo">
                          {t("本地演示 · 不调用 AI")}
                        </option>
                      </select>
                    </label>
                  </>
                )}
                <label className="config-wide">
                  <span>{t("服务访问令牌（可选）")}</span>
                  <input
                    type="password"
                    value={accessToken}
                    disabled={saving}
                    autoComplete="off"
                    onChange={(e) => setAccessToken(e.target.value)}
                  />
                </label>
                <button
                  className="config-connect"
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    sessionStorage.setItem("dreamatic-token", accessToken);
                    onApplied();
                  }}
                >
                  {t("链接服务")}
                </button>
              </>
            )}
          </div>
          {error && config && (
            <p className="config-error" role="alert">
              {t(error)}
            </p>
          )}
          {saved && !error && <p role="status">{t("配置已保存")}</p>}
          {running && (
            <p className="config-error">
              {t("生成期间不能更换配置，请先停止任务。")}
            </p>
          )}
          <footer>
            <button type="button" disabled={saving} onClick={onClose}>
              {t("取消")}
            </button>
            <button
              type="submit"
              className="primary"
              disabled={saving || running || !config || !dirty}
            >
              <Save size={14} />
              {saving ? t("保存中…") : t("保存")}
            </button>
            <button
              type="button"
              className="primary"
              disabled={saving || running || !config || !dirty}
              onClick={() => void submit(true)}
            >
              {t("保存并关闭")}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
