import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  CapacityError,
  integerEnv,
  queueWaitMs,
  WorkQueue,
} from "../capacity.js";

type Credential = {
  queue: WorkQueue;
  nextStart: number;
  cooldownUntil: number;
  lastUsed: number;
};

/** Credentials are chosen only from the current profile, never from another user's profile. */
export class ModelCapacity {
  private credentials = new Map<string, Credential>();
  private cursor = 0;
  constructor(
    private concurrency = integerEnv("DREAMATIC_MODEL_CONCURRENCY_PER_KEY", 4),
    private maxWaiting = integerEnv(
      "DREAMATIC_MODEL_QUEUE_SIZE_PER_KEY",
      100,
      0,
    ),
    private rpm = integerEnv("DREAMATIC_MODEL_RPM_PER_KEY", 0, 0),
    private waitMs = queueWaitMs,
    private cooldownMs = integerEnv("DREAMATIC_MODEL_COOLDOWN_MS", 30000),
    private maxCredentials = integerEnv(
      "DREAMATIC_MODEL_MAX_CREDENTIALS",
      4096,
    ),
  ) {}
  private entry(baseUrl: string, key: string) {
    const id = createHash("sha256")
      .update(baseUrl.replace(/\/+$/, "") + "\0" + key)
      .digest("hex");
    let entry = this.credentials.get(id);
    if (!entry) {
      // Idle credentials can be discarded after their rate/cooldown windows expire.
      if (this.credentials.size >= this.maxCredentials) {
        const now = Date.now();
        for (const [name, value] of this.credentials) {
          const s = value.queue.snapshot();
          if (
            !s.active &&
            !s.waiting &&
            now - value.lastUsed > 60000 &&
            value.cooldownUntil <= now &&
            value.nextStart <= now
          )
            this.credentials.delete(name);
        }
        if (this.credentials.size >= this.maxCredentials)
          throw new CapacityError(
            "model_capacity_full",
            "模型配置容量已满，请稍后重试",
          );
      }
      entry = {
        queue: new WorkQueue(
          "模型请求",
          this.concurrency,
          this.maxWaiting,
          this.waitMs,
        ),
        nextStart: 0,
        cooldownUntil: 0,
        lastUsed: Date.now(),
      };
      this.credentials.set(id, entry);
    }
    return entry;
  }
  async acquire(baseUrl: string, keys: string[], signal?: AbortSignal) {
    signal?.throwIfAborted();
    const unique = [...new Set(keys)];
    if (!unique.length) unique.push("");
    const offset = this.cursor++ % unique.length;
    const candidates = unique
      .map((key, i) => {
        const entry = this.entry(baseUrl, key),
          s = entry.queue.snapshot();
        const wait = Math.max(
          0,
          entry.cooldownUntil - Date.now(),
          entry.nextStart - Date.now(),
        );
        return {
          key,
          entry,
          s,
          wait,
          order: (i - offset + unique.length) % unique.length,
        };
      })
      .filter(
        (c) =>
          !c.s.closed &&
          (c.s.active < c.s.concurrency || c.s.waiting < c.s.maxWaiting),
      )
      .sort(
        (a, b) =>
          a.wait - b.wait ||
          a.s.active + a.s.waiting - (b.s.active + b.s.waiting) ||
          a.order - b.order,
      );
    if (!candidates.length)
      throw new CapacityError(
        "model_queue_full",
        "模型请求等待队列已满，请稍后重试",
      );
    const { key, entry } = candidates[0];
    const deadline = Date.now() + this.waitMs;
    const release = await entry.queue.acquire(signal).ready;
    let released = false;
    const done = () => {
      if (!released) {
        released = true;
        entry.lastUsed = Date.now();
        release();
      }
    };
    try {
      // Reserve only at actual admission. A cooldown must not release a burst of old reservations.
      while (true) {
        signal?.throwIfAborted();
        const now = Date.now();
        const start = Math.max(now, entry.nextStart, entry.cooldownUntil);
        if (start >= deadline)
          throw new CapacityError(
            "model_queue_timeout",
            "模型配额等待超时，请稍后重试",
          );
        if (start > now) {
          await delay(start - now, undefined, { signal });
          continue;
        }
        if (this.rpm) entry.nextStart = now + 60000 / this.rpm;
        break;
      }
      signal?.throwIfAborted();
      entry.lastUsed = Date.now();
      return {
        key,
        release: done,
        response: (status: number) => {
          if (status === 429 || status === 503)
            entry.cooldownUntil = Math.max(
              entry.cooldownUntil,
              Date.now() + this.cooldownMs,
            );
        },
      };
    } catch (error) {
      done();
      throw error;
    }
  }
  snapshot() {
    return [...this.credentials.values()].reduce(
      (total, entry) => {
        const s = entry.queue.snapshot();
        total.active += s.active;
        total.waiting += s.waiting;
        if (entry.cooldownUntil > Date.now()) total.cooling++;
        return total;
      },
      { credentials: this.credentials.size, active: 0, waiting: 0, cooling: 0 },
    );
  }
}

export const modelCapacity = new ModelCapacity();
