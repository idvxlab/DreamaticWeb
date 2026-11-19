import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const value = await read();
    if (done(value)) return value;
    await delay(20);
  }
  throw new Error("Condition did not become true");
}

function pdf() {
  const stream = "BT /F1 24 Tf 70 700 Td (Concurrent PDF evidence) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let content = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(content));
    content += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(content);
  content +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return content;
}

test(
  "server admission, queued cancellation, key rotation, upload backpressure and cleanup",
  { timeout: 60000 },
  async () => {
    let blocked = true;
    let failNext = false;
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const keys: string[] = [];
    const upstream = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString());
      keys.push(req.headers.authorization || "");
      if (failNext) {
        failNext = false;
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: {
              message: "Synthetic rate limit",
              type: "rate_limit_error",
            },
          }),
        );
        return;
      }
      if (blocked) await gate;
      if (res.destroyed) return;
      const tools = body.tools.map((t: any) => t.function?.name || t.name);
      const tool = tools.includes("submit_intent")
        ? {
            name: "submit_intent",
            args: {
              goal: "Website",
              audience: "Visitors",
              content: [],
              features: [],
              design: [],
              constraints: [],
            },
          }
        : tools.includes("submit_facts")
          ? {
              name: "submit_facts",
              args: { summary: "No sources", facts: [], limitations: [] },
            }
          : {
              name: "submit_page",
              args: {
                usedFactIds: [],
                html: "<html><body><h1>Queue result</h1></body></html>",
              },
            };
      res.setHeader("Content-Type", "text/event-stream");
      const send = (value: unknown) =>
        res.write("data: " + JSON.stringify(value) + "\n\n");
      send({
        id: "test",
        object: "chat.completion.chunk",
        model: body.model,
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: "call_" + crypto.randomUUID(),
                  type: "function",
                  function: {
                    name: tool.name,
                    arguments: JSON.stringify(tool.args),
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      });
      send({
        id: "test",
        object: "chat.completion.chunk",
        model: body.model,
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
      });
      send({
        id: "test",
        object: "chat.completion.chunk",
        model: body.model,
        choices: [],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      });
      res.end("data: [DONE]\n\n");
    });
    await new Promise<void>((resolve) =>
      upstream.listen(0, "127.0.0.1", resolve),
    );
    const upstreamUrl = `http://127.0.0.1:${(upstream.address() as { port: number }).port}/v1`;
    const workspace = await mkdtemp(
      path.join(os.tmpdir(), "dreamatic-capacity-api-"),
    );
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "apps/server/src/index.ts"],
      {
        env: {
          ...process.env,
          PORT: "0",
          HOST: "127.0.0.1",
          DREAMATIC_WORKSPACE: workspace,
          DREAMATIC_ACCESS_TOKEN: "capacity-test",
          DREAMATIC_MODE: "live",
          DREAMATIC_MODEL_MODE: "openai-compatible",
          DREAMATIC_BASE_URL: upstreamUrl,
          DREAMATIC_MODEL: "synthetic",
          DREAMATIC_API_KEY: "",
          DREAMATIC_API_KEYS: '["synthetic-key-A","synthetic-key-B"]',
          DREAMATIC_GENERATION_CONCURRENCY: "1",
          DREAMATIC_GENERATION_QUEUE_SIZE: "1",
          DREAMATIC_IMPORT_CONCURRENCY: "1",
          DREAMATIC_UPLOAD_CONCURRENCY: "1",
          DREAMATIC_MODEL_CONCURRENCY_PER_KEY: "1",
          DREAMATIC_MODEL_COOLDOWN_MS: "5000",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let log = "";
    child.stdout.on("data", (d) => {
      log += d;
    });
    child.stderr.on("data", (d) => {
      log += d;
    });
    const stopped = new Promise<void>((resolve) =>
      child.once("close", () => resolve()),
    );
    let slow: http.ClientRequest | undefined;
    try {
      const output = await until(
        async () => {
          if (child.exitCode !== null) throw new Error(log);
          return log;
        },
        (v) => /http:\/\/127.0.0.1:\d+/.test(v),
      );
      const base = output.match(/http:\/\/127.0.0.1:\d+/)![0];
      const request = (url: string, options: RequestInit = {}) =>
        fetch(base + "/api" + url, {
          ...options,
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: "Bearer capacity-test",
            ...(options.body instanceof FormData
              ? {}
              : { "Content-Type": "application/json" }),
            ...options.headers,
          },
        });
      const state = async (id: string) =>
        (await request("/projects/" + id)).json();
      const capacity = async () => (await request("/capacity")).json();
      const create = async () =>
        (await request("/projects", { method: "POST" })).json();
      const run = (id: string) =>
        request(`/projects/${id}/run`, {
          method: "POST",
          body: JSON.stringify({ text: "Create a website" }),
        });
      const configText = await (await request("/config")).text();
      assert.ok(!configText.includes("synthetic-key-"));
      assert.equal(JSON.parse(configText).models.reasoning.hasApiKey, true);
      const savedConfig = await request("/config", {
        method: "PUT",
        body: configText,
      });
      assert.equal(savedConfig.status, 200);
      assert.ok(!(await savedConfig.text()).includes("synthetic-key-"));
      const storedConfig = JSON.parse(
        await readFile(path.join(workspace, "settings.json"), "utf8"),
      );
      assert.deepEqual(storedConfig.models.reasoning.apiKeys, [
        "synthetic-key-A",
        "synthetic-key-B",
      ]);
      const first = await create(),
        queued = await create(),
        rejected = await create();
      assert.equal((await run(first.id)).status, 202);
      await until(
        async () => keys.length,
        (n) => n === 1,
      );
      const admitted = await run(queued.id);
      assert.deepEqual((await admitted.json()).scheduling, {
        state: "queued",
        position: 1,
      });
      const overflow = await run(rejected.id);
      assert.equal(overflow.status, 503);
      assert.equal(overflow.headers.get("Retry-After"), "5");
      assert.equal((await state(rejected.id)).messages.length, 0);
      assert.deepEqual(
        (await (await request(`/projects/${queued.id}/scheduling`)).json())
          .generation,
        { state: "queued", position: 1 },
      );
      await request(`/projects/${queued.id}/cancel`, { method: "POST" });
      await until(
        () => state(queued.id),
        (p) => p.status === "cancelled",
      );
      assert.equal((await capacity()).generation.waiting, 0);
      const next = await create();
      assert.equal((await run(next.id)).status, 202);
      await request(`/projects/${first.id}/cancel`, { method: "POST" });
      await until(
        () => state(first.id),
        (p) => p.status === "cancelled",
      );
      blocked = false;
      unblock();
      const completed = await until(
        () => state(next.id),
        (p) => ["complete", "error"].includes(p.status),
      );
      assert.equal(completed.status, "complete", completed.error);
      assert.ok(
        keys.includes("Bearer synthetic-key-A") &&
          keys.includes("Bearer synthetic-key-B"),
      );
      assert.ok(
        keys.every((k) =>
          ["Bearer synthetic-key-A", "Bearer synthetic-key-B"].includes(k),
        ),
      );
      await until(
        capacity,
        (c) => c.generation.active === 0 && c.models.active === 0,
      );
      const metrics = await (
        await request(`/projects/${next.id}/metrics`)
      ).json();
      assert.ok(metrics.queueWaitMs > 0);
      assert.equal(metrics.inputTokens, metrics.modelCalls * 20);
      assert.equal(metrics.outputTokens, metrics.modelCalls * 10);

      // Hold one incoming body open, proving excess uploads are rejected before buffering.
      const uploading = await create(),
        excess = await create();
      slow = http.request(`${base}/api/projects/${uploading.id}/sources`, {
        method: "POST",
        headers: {
          Authorization: "Bearer capacity-test",
          "Content-Type": "multipart/form-data; boundary=slow-boundary",
          "Content-Length": 1000000,
        },
      });
      slow.on("error", () => {});
      slow.write(
        '--slow-boundary\r\nContent-Disposition: form-data; name="files"; filename="pending.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4\n',
      );
      await until(capacity, (c) => c.uploads.active === 1);
      const form = new FormData();
      form.set(
        "files",
        new Blob([pdf()], { type: "application/pdf" }),
        "test.pdf",
      );
      assert.equal(
        (
          await request(`/projects/${excess.id}/sources`, {
            method: "POST",
            body: form,
          })
        ).status,
        503,
      );
      slow.destroy();
      await until(capacity, (c) => c.uploads.active === 0);
      await until(
        () => readdir(path.join(workspace, ".incoming")),
        (entries) => entries.length === 0,
      );
      const upload = await request(`/projects/${excess.id}/sources`, {
        method: "POST",
        body: form,
      });
      assert.equal(upload.status, 200);
      const imported = await upload.json();
      assert.equal(imported.errors.length, 0);
      assert.equal(imported.sources.length, 1);
      const reading = await (
        await request(
          `/projects/${excess.id}/sources/${imported.sources[0].id}/reading`,
        )
      ).text();
      assert.match(reading, /Concurrent PDF evidence/);
      await until(
        () => readdir(path.join(workspace, ".incoming")),
        (entries) => entries.length === 0,
      );
      assert.equal((await capacity()).imports.active, 0);

      // Exercise the actual Pi HTTP response hook: one failed call, then another pool key.
      const failed = await create();
      const beforeFailure = keys.length;
      failNext = true;
      await run(failed.id);
      const failedState = await until(
        () => state(failed.id),
        (p) => p.status === "error",
      );
      assert.match(failedState.error, /Synthetic rate limit/);
      assert.equal(
        keys.length,
        beforeFailure + 1,
        "provider must not silently retry",
      );
      const failedKey = keys.at(-1);
      const afterFailure = await until(
        capacity,
        (c) => c.generation.active === 0 && c.models.active === 0,
      );
      assert.equal(afterFailure.models.cooling, 1);
      const recovered = await create();
      await run(recovered.id);
      const recoveredState = await until(
        () => state(recovered.id),
        (p) => ["complete", "error"].includes(p.status),
      );
      assert.equal(recoveredState.status, "complete", recoveredState.error);
      assert.notEqual(keys[beforeFailure + 1], failedKey);
      await until(
        capacity,
        (c) => c.generation.active === 0 && c.models.active === 0,
      );

      const clearing = JSON.parse(configText);
      clearing.models.reasoning.clearApiKey = true;
      const cleared = await request("/config", {
        method: "PUT",
        body: JSON.stringify(clearing),
      });
      assert.equal(cleared.status, 200);
      assert.equal((await cleared.json()).models.reasoning.hasApiKey, false);
      assert.ok(
        !(
          await readFile(path.join(workspace, "settings.json"), "utf8")
        ).includes("synthetic-key-"),
      );
    } finally {
      blocked = false;
      unblock();
      slow?.destroy();
      child.kill("SIGTERM");
      await Promise.race([stopped, delay(12000, undefined, { ref: false })]);
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await stopped;
      upstream.closeAllConnections();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
      await rm(workspace, { recursive: true, force: true });
    }
  },
);
