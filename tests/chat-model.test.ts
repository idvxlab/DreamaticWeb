import test from "node:test";
import assert from "node:assert/strict";
import { conversationTurns, latestPhase } from "../apps/web/src/chat-model.js";
import type { Message, RunEvent } from "../packages/shared/project.js";

test("conversation details stay with their turn, including initial clarification records", () => {
  const messages: Message[] = [
    { role: "assistant", text: "Choose a scope", time: "2026-10-20T00:00:00Z" },
    { role: "user", text: "Overview", time: "2026-10-20T00:01:00Z" },
    { role: "assistant", text: "Done", time: "2026-10-20T00:02:00Z" },
    { role: "user", text: "Change color", time: "2026-10-20T00:03:00Z" },
  ];
  const events: RunEvent[] = [0, 1, 2, 3, 4].map((minute) => ({
    id: String(minute),
    role: "designer",
    kind: "status",
    text: "Working",
    time: `2026-10-20T00:0${minute}:00Z`,
  }));
  const turns = conversationTurns(messages, events);
  assert.deepEqual(
    turns.map((t) => t.messages.map((m) => m.text)),
    [["Choose a scope", "Overview", "Done"], ["Change color"]],
  );
  assert.deepEqual(
    turns.map((t) => t.events.map((e) => e.id)),
    [
      ["0", "1", "2"],
      ["3", "4"],
    ],
  );
  assert.deepEqual(conversationTurns([], events)[0].events, events);
  assert.equal(
    latestPhase([...events, { ...events[0], role: "system" }]),
    "正在生成网页",
  );
  assert.equal(
    latestPhase([{ ...events[0], role: "analyst" }]),
    "正在分析资料",
  );
  assert.equal(latestPhase([]), "正在理解需求");
});
