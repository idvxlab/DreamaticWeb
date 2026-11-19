/** Server-side limits; independent of host CPU count, operating system or test VUs. */
export function integerEnv(
  name: string,
  fallback: number,
  min = 1,
  max = 100000,
) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return value;
}

export class CapacityError extends Error {
  readonly status = 503;
  readonly retryAfter = 5;
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type Release = () => void;
type Waiting = {
  key: string;
  resolve: (release: Release) => void;
  reject: (error: unknown) => void;
  dispose: () => void;
};

/** Bounded FIFO admission. A reservation counts before any asynchronous work starts. */
export class WorkQueue {
  private active = new Set<string>();
  private waiting: Waiting[] = [];
  private closed = false;
  private rejected = 0;
  constructor(
    readonly name: string,
    readonly concurrency: number,
    readonly maxWaiting: number,
    readonly waitMs: number,
  ) {
    if (
      !Number.isInteger(concurrency) ||
      concurrency < 1 ||
      !Number.isInteger(maxWaiting) ||
      maxWaiting < 0 ||
      waitMs < 1
    )
      throw new Error("Invalid queue limits");
  }
  ensureCapacity() {
    if (
      this.closed ||
      (this.active.size >= this.concurrency &&
        this.waiting.length >= this.maxWaiting)
    ) {
      this.rejected++;
      throw new CapacityError(
        "capacity_full",
        `${this.name}繁忙，等待队列已满，请稍后重试`,
      );
    }
  }
  acquire(signal?: AbortSignal, key: string = crypto.randomUUID()) {
    signal?.throwIfAborted();
    this.ensureCapacity();
    if (this.active.has(key) || this.waiting.some((w) => w.key === key))
      throw new Error("Duplicate queue reservation");
    if (this.active.size < this.concurrency) {
      this.active.add(key);
      return { waiting: false, ready: Promise.resolve(this.releaseFor(key)) };
    }
    const ready = new Promise<Release>((resolve, reject) => {
      const remove = (error: unknown) => {
        const index = this.waiting.indexOf(entry);
        if (index < 0) return;
        this.waiting.splice(index, 1);
        entry.dispose();
        reject(error);
      };
      const abort = () => remove(signal?.reason || new Error("任务已取消"));
      const timer = setTimeout(
        () =>
          remove(
            new CapacityError(
              "queue_timeout",
              `${this.name}排队超时，请稍后重试`,
            ),
          ),
        this.waitMs,
      );
      const entry: Waiting = {
        key,
        resolve,
        reject,
        dispose: () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
        },
      };
      this.waiting.push(entry);
      signal?.addEventListener("abort", abort, { once: true });
    });
    return { waiting: true, ready };
  }
  private releaseFor(key: string): Release {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active.delete(key);
      if (!this.closed && this.waiting.length) {
        const next = this.waiting.shift()!;
        next.dispose();
        this.active.add(next.key);
        next.resolve(this.releaseFor(next.key));
      }
    };
  }
  run<T>(
    work: () => Promise<T>,
    signal?: AbortSignal,
    key?: string,
  ): Promise<T> {
    return this.acquire(signal, key).ready.then(async (release) => {
      try {
        signal?.throwIfAborted();
        return await work();
      } finally {
        release();
      }
    });
  }
  state(key: string) {
    if (this.active.has(key)) return { state: "running" as const, position: 0 };
    const i = this.waiting.findIndex((w) => w.key === key);
    return i < 0 ? null : { state: "queued" as const, position: i + 1 };
  }
  snapshot() {
    return {
      active: this.active.size,
      waiting: this.waiting.length,
      concurrency: this.concurrency,
      maxWaiting: this.maxWaiting,
      rejected: this.rejected,
      closed: this.closed,
    };
  }
  close() {
    this.closed = true;
    for (const entry of this.waiting.splice(0)) {
      entry.dispose();
      entry.reject(
        new CapacityError("server_stopping", "服务正在停止，请稍后继续任务"),
      );
    }
  }
}

export const queueWaitMs = integerEnv(
  "DREAMATIC_QUEUE_WAIT_MS",
  300000,
  1,
  86400000,
);
export const generationQueue = new WorkQueue(
  "网页生成",
  integerEnv("DREAMATIC_GENERATION_CONCURRENCY", 4),
  integerEnv("DREAMATIC_GENERATION_QUEUE_SIZE", 100, 0),
  queueWaitMs,
);
export const importQueue = new WorkQueue(
  "资料解析",
  integerEnv("DREAMATIC_IMPORT_CONCURRENCY", 2),
  integerEnv("DREAMATIC_IMPORT_QUEUE_SIZE", 20, 0),
  queueWaitMs,
);
// Reject excess incoming bodies before multer can receive/store them. No buffer queue.
export const uploadSlots = new WorkQueue(
  "文件上传",
  integerEnv("DREAMATIC_UPLOAD_CONCURRENCY", 4),
  0,
  queueWaitMs,
);
