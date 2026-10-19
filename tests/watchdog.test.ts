import test from "node:test";
import assert from "node:assert/strict";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { watchAgent, timeoutSetting } from "../packages/agents/src/watchdog.js";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const delta = {
  type: "message_update",
  assistantMessageEvent: { type: "thinking_delta", delta: "x" },
} as AgentEvent;
const start = {
  type: "tool_execution_start",
  toolCallId: "1",
  toolName: "source_read",
} as AgentEvent;
const end = {
  type: "tool_execution_end",
  toolCallId: "1",
  toolName: "source_read",
  isError: false,
} as AgentEvent;

test("continuous output survives idle window; stalled output stops", async () => {
  let aborted = false;
  const logs: string[] = [];
  const watch = watchAgent(
    { total: 3000, first: 500, idle: 150, tool: 500 },
    () => {
      aborted = true;
    },
    (s) => logs.push(s),
  );
  try {
    for (let i = 0; i < 6; i++) {
      watch.event(delta);
      await sleep(40);
    }
    assert.equal(aborted, false);
    await sleep(200);
    assert.equal(aborted, true);
    assert.match(watch.error!.message, /输出停滞超时/);
    assert.ok(logs.some((s) => s.includes("模型开始响应")));
  } finally {
    watch.close();
  }
});

test("first response and total deadlines are distinct", async () => {
  const first = watchAgent(
    { total: 1000, first: 50, idle: 500, tool: 500 },
    () => {},
    () => {},
  );
  try {
    await sleep(100);
    assert.match(first.error!.message, /等待模型有效响应超时/);
  } finally {
    first.close();
  }
  const total = watchAgent(
    { total: 100, first: 1000, idle: 1000, tool: 1000 },
    () => {},
    () => {},
  );
  try {
    total.event(delta);
    await sleep(150);
    assert.match(total.error!.message, /阶段总时限超时/);
  } finally {
    total.close();
  }
});

test("tools suspend model idle deadline; completion starts fresh response wait", async () => {
  const logs: string[] = [];
  const watch = watchAgent(
    { total: 2000, first: 500, idle: 50, tool: 500 },
    () => {},
    (s) => logs.push(s),
  );
  try {
    watch.event(delta);
    watch.event(start);
    await sleep(150);
    assert.equal(watch.error, undefined);
    watch.event(end);
    await sleep(100);
    assert.equal(watch.error, undefined);
    watch.event(delta);
    assert.ok(logs.some((s) => /工具完成：source_read/.test(s)));
  } finally {
    watch.close();
  }
  const stuck = watchAgent(
    { total: 2000, first: 500, idle: 500, tool: 50 },
    () => {},
    () => {},
  );
  try {
    stuck.event(start);
    await sleep(100);
    assert.match(stuck.error!.message, /工具执行超时：source_read/);
  } finally {
    stuck.close();
  }
});

test("watchdog disposal clears timers and timeout settings reject invalid values", async () => {
  let aborted = false;
  const watch = watchAgent(
    { total: 20, first: 20, idle: 20, tool: 20 },
    () => {
      aborted = true;
    },
    () => {},
  );
  watch.event(start);
  watch.close();
  await sleep(60);
  assert.equal(aborted, false);
  const name = "DREAMATIC_TEST_TIMEOUT_MS";
  try {
    for (const value of ["NaN", "-1", "0", "Infinity", "2147483648"]) {
      process.env[name] = value;
      assert.throws(() => timeoutSetting(name, 100));
    }
    process.env[name] = "25";
    assert.equal(timeoutSetting(name, 100), 25);
  } finally {
    delete process.env[name];
  }
});
