import type { Message, RunEvent } from "../../../packages/shared/project";

/** Attribute details by turn boundaries, not by the latest role or latest run. */
export function conversationTurns(messages: Message[], events: RunEvent[]) {
  const starts = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === "user");
  if (!starts.length) return [{ id: "initial", messages, events }];
  const prefix = messages.slice(0, starts[0].index);
  return starts.map(({ message, index }, i) => {
    const next = starts[i + 1];
    const start = Date.parse(message.time),
      end = next ? Date.parse(next.message.time) : Infinity;
    return {
      id: `${message.time}-${index}`,
      messages: [
        ...(i === 0 ? prefix : []),
        ...messages.slice(index, next?.index),
      ],
      events: events.filter(
        (e) =>
          (i === 0 || Date.parse(e.time) >= start) && Date.parse(e.time) < end,
      ),
    };
  });
}
export function latestPhase(events: RunEvent[]) {
  const role = [...events]
    .reverse()
    .find((e) =>
      ["orchestrator", "analyst", "designer"].includes(e.role),
    )?.role;
  return role === "designer"
    ? "正在生成网页"
    : role === "analyst"
      ? "正在分析资料"
      : "正在理解需求";
}
