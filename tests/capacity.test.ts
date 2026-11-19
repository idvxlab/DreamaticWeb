import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { WorkQueue, CapacityError } from "../apps/server/src/capacity.js";
import { ModelCapacity } from "../apps/server/src/generation/model-capacity.js";

test("1000 lightweight jobs obey the configured server concurrency and finish FIFO", async () => {
  const queue = new WorkQueue("test", 3, 1000, 10000);
  let running = 0,
    peak = 0;
  const started: number[] = [];
  await Promise.all(
    Array.from({ length: 1000 }, (_, n) =>
      queue.run(async () => {
        peak = Math.max(peak, ++running);
        started.push(n);
        await delay(1);
        running--;
        return n;
      }),
    ),
  );
  assert.equal(peak, 3);
  assert.deepEqual(
    started,
    Array.from({ length: 1000 }, (_, n) => n),
  );
  assert.equal(queue.snapshot().active, 0);
  assert.equal(queue.snapshot().waiting, 0);
});

test("queue full, cancelled waits, timeouts and failed work release every reservation", async () => {
  const queue = new WorkQueue("test", 1, 2, 40);
  const first = await queue.acquire(undefined, "first").ready;
  const controller = new AbortController();
  const cancelled = queue.acquire(controller.signal, "cancelled").ready;
  const timedOut = queue.acquire(undefined, "timeout").ready;
  assert.throws(() => queue.acquire(), CapacityError);
  assert.deepEqual(queue.state("timeout"), { state: "queued", position: 2 });
  const cancelCheck = assert.rejects(cancelled);
  const timeoutCheck = assert.rejects(
    timedOut,
    (e: unknown) => e instanceof CapacityError && e.code === "queue_timeout",
  );
  controller.abort();
  await cancelCheck;
  await timeoutCheck;
  first();
  first();
  assert.equal(queue.snapshot().active, 0);
  await assert.rejects(
    queue.run(async () => {
      throw new Error("work failed");
    }),
    /work failed/,
  );
  assert.equal(await queue.run(async () => 42), 42);
  assert.equal(queue.snapshot().waiting, 0);
});

test("shutdown rejects queued jobs and never starts them", async () => {
  const queue = new WorkQueue("test", 1, 2, 1000);
  const release = await queue.acquire().ready;
  const waiting = queue.acquire().ready;
  const rejected = assert.rejects(waiting, /停止/);
  queue.close();
  await rejected;
  release();
  assert.equal(queue.snapshot().active, 0);
  assert.throws(() => queue.acquire(), CapacityError);
});

test("key pools balance permitted credentials and do not borrow another profile credential", async () => {
  const capacity = new ModelCapacity(1, 2, 0, 1000, 100);
  const a = await capacity.acquire("https://upstream.invalid/v1", [
    "key-A",
    "key-B",
  ]);
  const b = await capacity.acquire("https://upstream.invalid/v1", [
    "key-A",
    "key-B",
  ]);
  assert.notEqual(a.key, b.key);
  const other = await capacity.acquire("https://upstream.invalid/v1", [
    "private-C",
  ]);
  assert.equal(other.key, "private-C");
  const controller = new AbortController();
  const waiting = capacity.acquire(
    "https://upstream.invalid/v1",
    ["key-A"],
    controller.signal,
  );
  const cancelled = assert.rejects(waiting);
  controller.abort();
  await cancelled;
  a.release();
  b.release();
  other.release();
  assert.equal(capacity.snapshot().active, 0);
  assert.equal(capacity.snapshot().waiting, 0);
  const failed = await capacity.acquire("https://upstream.invalid/v1", [
    "key-A",
  ]);
  failed.response(429);
  failed.release();
  const healthy = await capacity.acquire("https://upstream.invalid/v1", [
    "key-A",
    "key-B",
  ]);
  assert.equal(healthy.key, "key-B");
  healthy.release();
  assert.equal(JSON.stringify(capacity.snapshot()).includes("key-A"), false);
});

test("per-key rate spacing and cancellation apply before starting an upstream call", async () => {
  const capacity = new ModelCapacity(2, 2, 600, 1000, 10);
  const first = await capacity.acquire("https://rate.invalid/v1", ["rate-key"]);
  const start = performance.now();
  const next = await capacity.acquire("https://rate.invalid/v1", ["rate-key"]);
  assert.ok(performance.now() - start >= 75);
  first.release();
  next.release();
  const controller = new AbortController();
  const waiting = capacity.acquire(
    "https://rate.invalid/v1",
    ["rate-key"],
    controller.signal,
  );
  const cancelled = assert.rejects(waiting);
  controller.abort();
  await cancelled;
  assert.equal(capacity.snapshot().active, 0);
});

test("cooldown never releases a burst that bypasses the per-key rate", async () => {
  const capacity = new ModelCapacity(3, 2, 600, 1500, 150);
  const first = await capacity.acquire("https://cooldown.invalid/v1", ["key"]);
  const arrivals: number[] = [];
  const pending = [1, 2].map(async () => {
    const lease = await capacity.acquire("https://cooldown.invalid/v1", [
      "key",
    ]);
    arrivals.push(performance.now());
    lease.release();
  });
  await delay(10);
  first.response(429);
  first.release();
  await Promise.all(pending);
  assert.ok(arrivals[1] - arrivals[0] >= 75, `arrivals too close: ${arrivals}`);
  assert.equal(capacity.snapshot().active, 0);
});

test("credential registry is bounded without borrowing a different credential", async () => {
  const capacity = new ModelCapacity(1, 1, 0, 1000, 10, 1);
  const active = await capacity.acquire("https://registry.invalid/v1", ["one"]);
  await assert.rejects(
    capacity.acquire("https://registry.invalid/v1", ["two"]),
    (e: unknown) =>
      e instanceof CapacityError && e.code === "model_capacity_full",
  );
  active.release();
  assert.equal(capacity.snapshot().credentials, 1);
  assert.equal(capacity.snapshot().active, 0);
});
