import { useEffect, useRef, useState } from "react";
import { Sparkles, ChevronDown, Globe, Settings2 } from "lucide-react";
import { APP_NAME, APP_VERSION } from "../../../packages/shared/app-info";
import { useI18n } from "./i18n";
export default function BrandMenu({
  onWorkbench,
  onSettings,
}: {
  onWorkbench: () => void;
  onSettings: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="brand-area" ref={root}>
      <button
        ref={trigger}
        className="brand"
        aria-label={t("系统菜单")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "brand-menu" : undefined}
        onClick={() => setOpen(!open)}
      >
        <span className="brand-icon">
          <Sparkles size={22} />
        </span>
        <span>
          <strong>{APP_NAME}</strong>
          <small>{t("让内容成为体验")}</small>
        </span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div
          className="brand-menu"
          id="brand-menu"
          role="menu"
          aria-label={t("系统菜单")}
          onKeyDown={(event) => {
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]',
              ),
            ];
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              const i = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (i +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        items.length) %
                      items.length;
              items[next]?.focus();
            }
          }}
        >
          <div className="brand-menu-version">
            {APP_NAME} v{APP_VERSION}
          </div>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onWorkbench();
            }}
          >
            <Globe size={16} />
            {t("网页工作台")}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSettings();
            }}
          >
            <Settings2 size={16} />
            {t("模型与设置")}
          </button>
        </div>
      )}
    </div>
  );
}
