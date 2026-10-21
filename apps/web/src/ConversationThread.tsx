import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import type { ProjectResponse } from "../../../packages/shared/project";
import type { Clarification } from "../../../packages/shared/project";
import MessageBubble from "./MessageBubble";
import QuestionCard from "./QuestionCard";
import TaskStatus from "./TaskStatus";
import RunLog from "./RunLog";
import { conversationTurns } from "./chat-model";
import { useI18n } from "./i18n";
export default function ConversationThread({
  project,
  busy,
  dirty,
  demo,
  onAnswer,
  onResume,
  children,
}: {
  project: ProjectResponse;
  busy: boolean;
  dirty: boolean;
  demo: boolean;
  onAnswer: (
    q: Clarification,
    answer: { selected: string[]; text: string },
  ) => Promise<void>;
  onResume: () => Promise<void>;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const scroll = useRef<HTMLDivElement>(null),
    following = useRef(true);
  const [away, setAway] = useState(false);
  const running = project.status === "running";
  const pending =
    project.status === "needs_input"
      ? (project.questions || []).filter((q) => !q.answeredAt)
      : [];
  const lastMessage = project.messages.at(-1);
  const anchor = `${project.messages.length}:${project.status}:${pending.length}`;
  const toLatest = () => {
    following.current = true;
    setAway(false);
    scroll.current?.scrollTo({
      top: scroll.current.scrollHeight,
      behavior: "smooth",
    });
  };
  useEffect(() => {
    if (following.current)
      scroll.current?.scrollTo({
        top: scroll.current.scrollHeight,
        behavior: "smooth",
      });
  }, [anchor]);
  return (
    <div className="thread-container">
      <div
        className="chat-scroll"
        ref={scroll}
        onScroll={() => {
          const e = scroll.current!;
          following.current =
            e.scrollHeight - e.scrollTop - e.clientHeight < 64;
          setAway(!following.current);
        }}
      >
        <div className="messages" aria-label={t("对话记录")}>
          {demo && <p className="chat-demo">{t("本地演示模式")}</p>}
          {conversationTurns(project.messages, project.events).map(
            (turn, index, turns) => (
              <div className="conversation-turn" key={turn.id}>
                {turn.messages.map((message, i) => {
                  const question = project.questions?.find(
                    (q) =>
                      q.createdAt === message.time && q.title === message.text,
                  );
                  if (
                    question &&
                    !question.answeredAt &&
                    project.status === "needs_input"
                  )
                    return (
                      <QuestionCard
                        key={question.id}
                        question={question}
                        disabled={busy || running}
                        onAnswer={(answer) => onAnswer(question, answer)}
                      />
                    );
                  return (
                    <MessageBubble
                      key={`${message.time}-${i}`}
                      message={message}
                    />
                  );
                })}
                {index === turns.length - 1 && (
                  <>
                    {pending
                      .filter(
                        (q) =>
                          !project.messages.some(
                            (m) => m.time === q.createdAt && m.text === q.title,
                          ),
                      )
                      .map((q) => (
                        <QuestionCard
                          key={q.id}
                          question={q}
                          disabled={busy || running}
                          onAnswer={(a) => onAnswer(q, a)}
                        />
                      ))}
                    <TaskStatus
                      project={project}
                      disabled={busy || dirty}
                      onResume={onResume}
                    />
                  </>
                )}
                {turn.events.length > 0 && (
                  <RunLog
                    key={`${turn.id}-details`}
                    events={turn.events}
                    running={index === turns.length - 1 && running}
                    demo={demo}
                  />
                )}
              </div>
            ),
          )}
          {project.status === "complete" &&
            lastMessage?.role === "assistant" && (
              <div className="result-meta">
                {t("结果已保存，可在右侧画布预览和编辑")}
              </div>
            )}
          {children}
        </div>
      </div>
      {away && (
        <button className="jump-latest" onClick={toLatest}>
          <ArrowDown size={13} />
          {t("回到最新")}
        </button>
      )}
    </div>
  );
}
