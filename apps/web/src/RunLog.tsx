import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, ListTree, ChevronDown, Loader2 } from "lucide-react";
import type { RunEvent } from "../../../packages/agents/src/contracts";
import { roles } from "../../../packages/agents/src/roles";
import { useI18n } from "./i18n";

export default function RunLog({
  events,
  running,
  demo,
}: {
  events: RunEvent[];
  running: boolean;
  demo: boolean;
}) {
  const { t, language } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const list = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const records = events.filter((event) => event.kind !== "delta");
  useEffect(() => {
    if (expanded && list.current && followLatest.current)
      list.current.scrollTop = list.current.scrollHeight;
  }, [events.length, expanded]);
  return (
    <div className={"run-log " + (expanded ? "is-expanded" : "is-collapsed")}>
      <button
        type="button"
        className="run-log-title"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-label={t(expanded ? "收起运行记录" : "展开运行记录")}
        onClick={() => setExpanded((value) => !value)}
      >
        {running ? (
          <Loader2 size={13} className="spin" />
        ) : (
          <ListTree size={13} />
        )}
        <strong>{t("执行详情")}</strong>
        <span className="run-log-count">{records.length}</span>
        <small>{demo ? t("演示") : "DREAMATIC"}</small>
        <ChevronDown size={14} className="run-log-chevron" />
      </button>
      <div
        ref={list}
        id={listId}
        className="run-log-list"
        hidden={!expanded}
        role="region"
        aria-label={t("运行记录列表")}
        tabIndex={0}
        onScroll={() => {
          const element = list.current!;
          followLatest.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            24;
        }}
      >
        {records.map((event) => (
          <div
            className={
              "log-line " + (event.kind === "error" ? "log-error" : "")
            }
            key={event.id}
          >
            <span className={"log-dot " + event.role} />
            <span>
              <time
                dateTime={event.time}
                title={new Date(event.time).toLocaleString(
                  language === "zh" ? "zh-CN" : "en-US",
                )}
              >
                {new Date(event.time).toLocaleTimeString(
                  language === "zh" ? "zh-CN" : "en-US",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hourCycle: "h23",
                  },
                )}
              </time>{" "}
              ·{" "}
              <strong>
                {event.role === "system" ? t("系统") : roles[event.role].name}
              </strong>{" "}
              · {t(event.text)}
            </span>
            {event.kind === "skill" && <BookOpen size={11} />}
          </div>
        ))}
      </div>
    </div>
  );
}
