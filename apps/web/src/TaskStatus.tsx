import { AlertCircle, Loader2, Pause, ArrowRight } from "lucide-react";
import type { ProjectResponse } from "../../../packages/agents/src/contracts";
import { latestPhase } from "./chat-model";
import { useI18n } from "./i18n";
export default function TaskStatus({
  project,
  disabled,
  onResume,
}: {
  project: ProjectResponse;
  disabled: boolean;
  onResume: () => Promise<void>;
}) {
  const { t } = useI18n();
  const state = project.status;
  if (!["running", "needs_input", "error", "cancelled"].includes(state))
    return null;
  const failed = state === "error",
    stopped = state === "cancelled";
  const title = failed
    ? "生成未完成"
    : stopped
      ? "已停止生成"
      : state === "needs_input"
        ? "等待确认"
        : latestPhase(project.events);
  return (
    <section
      className={`task-status ${failed ? "task-error" : ""}`}
      aria-label={t("任务状态")}
    >
      <div className="task-status-heading" role="status" aria-live="polite">
        {failed ? (
          <AlertCircle size={15} />
        ) : stopped ? (
          <Pause size={15} />
        ) : state === "running" ? (
          <Loader2 size={15} className="spin" />
        ) : null}
        <span>{t(title)}</span>
      </div>
      {(failed || stopped) && (
        <>
          {project.error && <p>{t(project.error)}</p>}
          {project.run ? (
            <>
              <button
                className="task-resume"
                disabled={disabled}
                onClick={() => void onResume()}
              >
                {t("继续未完成任务")}
                <ArrowRight size={13} />
              </button>
              <small>
                {t("有效的已完成阶段将复用；需求或资料变化时重新执行。")}
              </small>
            </>
          ) : (
            <small>{t("历史任务没有可验证断点，请重新发送需求")}</small>
          )}
        </>
      )}
    </section>
  );
}
