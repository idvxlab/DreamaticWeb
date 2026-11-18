import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { api, token } from "./api";
import { useI18n } from "./i18n";
import { APP_NAME, APP_VERSION } from "../../../packages/shared/app-info";
import type { PublicConfig } from "../../../packages/shared/config";
type Profile = PublicConfig["models"]["reasoning"];
type Tab = "reasoning" | "analyst" | "designer" | "system";

/** The server's configuration, read from its .env file: shown here, never changed from the browser. */
export default function Settings({
  onApplied,
  onClose,
}: {
  onApplied: () => void;
  onClose: () => void;
  running?: boolean;
}) {
  const { t } = useI18n();
  const [config, setConfig] = useState<PublicConfig>();
  const [tab, setTab] = useState<Tab>("reasoning");
  const [error, setError] = useState("");
  const [accessToken, setAccessToken] = useState(token());
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    api<PublicConfig>("/config")
      .then(setConfig)
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
  const profile: Profile | null | undefined =
    tab !== "system" ? config?.models[tab] : undefined;
  const field = (label: string, value: string, wide = false) => (
    <label className={wide ? "config-wide" : undefined}>
      <span>{label}</span>
      <input aria-label={label} value={value} readOnly />
    </label>
  );
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
          if (e.key === "Escape") onClose();
        }}
      >
        <header>
          <div className="settings-icon">
            <SlidersHorizontal size={17} />
          </div>
          <span>
            <strong id="settings-title">{t("系统设置")}</strong>
            <small>{t("由服务器配置")}</small>
          </span>
          <button type="button" aria-label={t("关闭设置")} onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="config-source">
          <code>
            {APP_NAME} v{APP_VERSION}
          </code>
          <span>
            {t("模型与系统设置来自服务器的 .env 文件，修改后重启服务生效；这里只能查看。")}
          </span>
        </div>
        <div className="config-tabs" role="tablist" aria-label={t("配置模块")}>
          {tabs.map((item) => (
            <button
              type="button"
              key={item.id}
              id={`config-tab-${item.id}`}
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={`config-panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
            >
              {item.title}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => e.preventDefault()}>
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
            {config && tab !== "system" && !profile && (
              <p className="config-module-description">
                {t("未独立配置时，自动使用系统推理模型的完整配置。")}
              </p>
            )}
            {config && profile && (
              <>
                {field(t("模型模式"), profile.mode === "openai" ? "OpenAI" : t("OpenAI 兼容型"))}
                {field(t("模型名称"), profile.model || t("未配置"))}
                {field(t("模型调用 URL"), profile.baseUrl || t("未配置"), true)}
                {field(t("API 密钥"), profile.hasApiKey ? t("已配置") : t("未配置"))}
                {field(t("支持图片输入"), profile.vision ? t("是") : t("否"))}
              </>
            )}
            {tab === "system" && (
              <>
                {config && (
                  <>
                    {field(t("Workspace 路径"), config.workspace, true)}
                    {field(t("界面语言"), config.language === "en" ? "English" : "简体中文")}
                    {field(t("运行模式"), config.mode === "demo" ? t("本地演示 · 不调用 AI") : t("实时模型"))}
                  </>
                )}
                <label className="config-wide">
                  <span>{t("服务访问令牌（可选）")}</span>
                  <input
                    type="password"
                    value={accessToken}
                    autoComplete="off"
                    onChange={(e) => setAccessToken(e.target.value)}
                  />
                </label>
                <button
                  className="config-connect"
                  type="button"
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
          <footer>
            <button type="button" onClick={onClose}>
              {t("关闭")}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
