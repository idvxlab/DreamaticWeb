import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { useI18n } from "./i18n";
export default function ProjectActions({
  title,
  locked,
  onRename,
  onDelete,
}: {
  title: string;
  locked: boolean;
  onRename: (title: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [action, setAction] = useState<"rename" | "delete" | null>(null),
    [draft, setDraft] = useState(title),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    root.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    if (action) {
      setDraft(title);
      setError("");
      dialog.current
        ?.querySelector<HTMLElement>(action === "rename" ? "input" : "button")
        ?.focus();
    } else trigger.current?.focus();
  }, [action]);
  const close = () => {
    if (!saving) setAction(null);
  };
  return (
    <div className="project-actions" ref={root}>
      <button
        ref={trigger}
        className="project-action-trigger"
        aria-label={t("项目操作") + ": " + title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div
          className="project-action-menu"
          role="menu"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              trigger.current?.focus();
            }
            if (["ArrowDown", "ArrowUp"].includes(e.key)) {
              e.preventDefault();
              const items = [
                ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button",
                ),
              ];
              items[
                (items.indexOf(document.activeElement as HTMLButtonElement) +
                  1) %
                  items.length
              ]?.focus();
            }
          }}
        >
          <button
            role="menuitem"
            disabled={locked}
            onClick={() => {
              setOpen(false);
              setAction("rename");
            }}
          >
            <Pencil size={13} />
            {t("重命名")}
          </button>
          <button
            role="menuitem"
            disabled={locked}
            className="danger"
            onClick={() => {
              setOpen(false);
              setAction("delete");
            }}
          >
            <Trash2 size={13} />
            {t("删除项目")}
          </button>
        </div>
      )}
      {action && (
        <div className="modal-backdrop" onMouseDown={close}>
          <section
            ref={dialog}
            className="modal project-action-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t(action === "rename" ? "重命名项目" : "删除项目")}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              if (e.key === "Tab") {
                const items = [
                  ...e.currentTarget.querySelectorAll<HTMLElement>(
                    "input,button:not(:disabled)",
                  ),
                ];
                if (e.shiftKey && document.activeElement === items[0]) {
                  e.preventDefault();
                  items.at(-1)?.focus();
                } else if (
                  !e.shiftKey &&
                  document.activeElement === items.at(-1)
                ) {
                  e.preventDefault();
                  items[0]?.focus();
                }
              }
            }}
          >
            <button
              className="modal-close icon-button"
              aria-label={t("关闭弹窗")}
              disabled={saving}
              onClick={close}
            >
              <X size={16} />
            </button>
            <h2>{t(action === "rename" ? "重命名项目" : "删除项目")}</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                setError("");
                try {
                  if (action === "rename") await onRename(draft.trim());
                  else await onDelete();
                  setAction(null);
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {action === "rename" ? (
                <label>
                  {t("项目名称")}
                  <input
                    aria-label={t("项目名称")}
                    value={draft}
                    maxLength={120}
                    disabled={saving}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                </label>
              ) : (
                <>
                  <p>{title}</p>
                  <p>
                    {t(
                      "将从本机永久删除整个项目目录，包括上传资料、全部页面及版本，无法恢复。",
                    )}
                  </p>
                </>
              )}
              {error && <p role="alert">{t(error)}</p>}
              <footer>
                <button type="button" disabled={saving} onClick={close}>
                  {t("取消")}
                </button>
                <button
                  type="submit"
                  className={action === "delete" ? "danger-button" : "primary"}
                  disabled={
                    saving || locked || (action === "rename" && !draft.trim())
                  }
                >
                  {saving
                    ? t("保存中…")
                    : t(action === "rename" ? "保存名称" : "确认删除")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
