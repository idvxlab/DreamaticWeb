import { Fragment } from "react";
import type { Message } from "../../../packages/agents/src/contracts";
import { useI18n } from "./i18n";

/** Small safe text formatter: links are protocol-checked, HTML is always text. */
function inline(text: string) {
  return text
    .split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^\s)]+\))/g)
    .map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`"))
        return <code key={i}>{part.slice(1, -1)}</code>;
      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link && /^(https?:\/\/|mailto:|tel:)/i.test(link[2]))
        return (
          <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">
            {link[1]}
          </a>
        );
      return <Fragment key={i}>{part}</Fragment>;
    });
}
export default function MessageBubble({ message }: { message: Message }) {
  const { t, language } = useI18n();
  const system = message.role === "assistant";
  const text = system ? t(message.text) : message.text;
  const paragraphs = text.split(/\n\s*\n/);
  return (
    <article
      className={`message ${message.role}`}
      aria-label={t(system ? "系统消息" : "用户消息")}
      title={new Date(message.time).toLocaleString(
        language === "zh" ? "zh-CN" : "en-US",
      )}
    >
      <div className="message-content">
        {paragraphs.map((paragraph, i) => {
          const lines = paragraph.split("\n");
          if (
            system &&
            lines.every((line) => /^\s*(?:[-*]|\d+\.)\s+/.test(line))
          ) {
            const items = lines.map((line, index) => (
              <li key={index}>
                {inline(line.replace(/^\s*(?:[-*]|\d+\.)\s+/, ""))}
              </li>
            ));
            return /^\s*\d+\./.test(lines[0]) ? (
              <ol key={i}>{items}</ol>
            ) : (
              <ul key={i}>{items}</ul>
            );
          }
          return <p key={i}>{system ? inline(paragraph) : paragraph}</p>;
        })}
      </div>
    </article>
  );
}
