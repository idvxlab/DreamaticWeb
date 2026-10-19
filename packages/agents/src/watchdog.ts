import type { AgentEvent } from "@earendil-works/pi-agent-core";

export function limitSetting(
  name: string,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
) {
  const value = process.env[name];
  if (!value) return fallback;
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > max)
    throw new Error(`${name} 必须是有效的非负整数（0 表示不限制）`);
  return limit;
}

export function timeoutSetting(
  name: string,
  fallback: number,
  allowZero = false,
) {
  const ms = limitSetting(name, fallback, 2147483647);
  if (!allowZero && ms === 0)
    throw new Error(`${name} 必须是有效的正整数毫秒数`);
  return ms;
}

/** Watches public Agent events; never inspects model content or tool arguments. */
export function watchAgent(
  limits: { total: number; first: number; idle: number; tool: number },
  abort: () => void,
  report: (text: string) => void,
) {
  let error: Error | undefined;
  let phaseTimer: ReturnType<typeof setTimeout>;
  let first = true;
  let turnStarted = Date.now();
  let lastProgress = 0;
  const tools = new Map<
    string,
    { name: string; started: number; timer: ReturnType<typeof setTimeout> }
  >();
  const fail = (reason: string) => {
    if (error) return;
    error = new Error(reason);
    abort();
  };
  const arm = (ms: number, reason: string) => {
    clearTimeout(phaseTimer);
    phaseTimer = setTimeout(() => fail(reason), ms);
  };
  const wait = () => {
    first = true;
    turnStarted = Date.now();
    arm(limits.first, "等待模型有效响应超时，请检查模型服务或稍后重试");
  };
  const totalTimer =
    limits.total > 0
      ? setTimeout(
          () => fail("智能体阶段总时限超时，请缩小任务或调整阶段时限"),
          limits.total,
        )
      : undefined;
  wait();
  return {
    get error() {
      return error;
    },
    event(event: AgentEvent) {
      if (error) return;
      if (event.type === "turn_start") wait();
      if (event.type === "message_update") {
        const update = event.assistantMessageEvent;
        if (
          (update.type === "text_delta" ||
            update.type === "thinking_delta" ||
            update.type === "toolcall_delta") &&
          update.delta.length
        ) {
          if (first) {
            first = false;
            report(`模型开始响应（等待 ${Date.now() - turnStarted} ms）`);
          }
          if (!tools.size)
            arm(limits.idle, "模型输出停滞超时，请检查模型服务或稍后重试");
          if (Date.now() - lastProgress > 15000) {
            lastProgress = Date.now();
            report("模型正在输出，任务继续执行");
          }
        }
      }
      if (event.type === "tool_execution_start") {
        clearTimeout(phaseTimer);
        const name = event.toolName;
        tools.set(event.toolCallId, {
          name,
          started: Date.now(),
          timer: setTimeout(() => fail(`工具执行超时：${name}`), limits.tool),
        });
        report(`开始执行工具：${name}`);
      }
      if (event.type === "tool_execution_end") {
        const tool = tools.get(event.toolCallId);
        if (tool) {
          clearTimeout(tool.timer);
          tools.delete(event.toolCallId);
          report(
            `工具${event.isError ? "失败" : "完成"}：${tool.name}（${Date.now() - tool.started} ms）`,
          );
        }
        if (!tools.size) wait();
      }
    },
    close() {
      clearTimeout(totalTimer);
      clearTimeout(phaseTimer);
      for (const tool of tools.values()) clearTimeout(tool.timer);
    },
  };
}
