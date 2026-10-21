import { useState } from "react";
import { MessageCircleQuestion, ArrowRight, Loader2 } from "lucide-react";
import type { Clarification } from "../../../packages/shared/project";
import { useI18n } from "./i18n";
export default function QuestionCard({
  question,
  disabled,
  onAnswer,
}: {
  question: Clarification;
  disabled: boolean;
  onAnswer: (answer: { selected: string[]; text: string }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string[]>([]),
    [text, setText] = useState(""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="question-card"
      aria-label={t("回答智能体问题")}
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving || disabled) return;
        setSaving(true);
        setError("");
        try {
          await onAnswer({ selected, text: text.trim() });
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="question-card-heading">
        <MessageCircleQuestion size={16} />
        <strong>{t("请确认")}</strong>
        <span>
          {t(
            question.mode === "multiple"
              ? "可多选"
              : question.mode === "single"
                ? "单选"
                : "文字回答",
          )}
        </span>
      </div>
      <fieldset disabled={disabled || saving}>
        <legend>{question.title}</legend>
        {question.mode !== "text" && (
          <div className="question-options">
            {question.options.map((option) => (
              <label
                key={option.id}
                className={selected.includes(option.id) ? "selected" : ""}
              >
                <input
                  type={question.mode === "multiple" ? "checkbox" : "radio"}
                  name={question.id}
                  value={option.id}
                  checked={selected.includes(option.id)}
                  onChange={(event) =>
                    setSelected(
                      question.mode === "single"
                        ? [option.id]
                        : event.target.checked
                          ? [...selected, option.id]
                          : selected.filter((id) => id !== option.id),
                    )
                  }
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        )}
        <label className="question-custom">
          {t(question.mode === "text" ? "回答" : "自己的答案或补充说明")}
          <textarea
            aria-label={t("回答")}
            value={text}
            maxLength={20000}
            rows={3}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("也可以直接用自己的话回答")}
          />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="question-error">
          {t(error)}
        </p>
      )}
      <button
        className="question-submit"
        type="submit"
        disabled={disabled || saving || (!selected.length && !text.trim())}
      >
        {saving ? (
          <Loader2 size={14} className="spin" />
        ) : (
          <ArrowRight size={14} />
        )}
        {t(saving ? "正在提交…" : "提交并继续")}
      </button>
    </form>
  );
}
