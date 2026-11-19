import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

test("personal access provisioning persists only hashes and rotates the selected user", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dreamatic-access-"));
  const file = path.join(directory, "users.json");
  const issue = async (user: string) => {
    const { stdout } = await promisify(execFile)(process.execPath, [
      "scripts/user-access.mjs",
      file,
      user,
    ]);
    return stdout.trim().split("\n").at(-1)!;
  };
  try {
    const first = await issue("alice"),
      bob = await issue("bob"),
      second = await issue("alice");
    assert.notEqual(first, second);
    const content = await readFile(file, "utf8"),
      saved = JSON.parse(content);
    assert.equal(
      saved.alice,
      createHash("sha256").update(second).digest("hex"),
    );
    assert.equal(saved.bob, createHash("sha256").update(bob).digest("hex"));
    assert.ok(
      !content.includes(first) &&
        !content.includes(second) &&
        !content.includes(bob),
    );
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    await assert.rejects(
      promisify(execFile)(process.execPath, [
        "scripts/user-access.mjs",
        file,
        "../outside",
      ]),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const value = await read();
    if (done(value)) return value;
    await delay(20);
  }
  throw new Error("Timed out waiting for test condition");
}
function mockModel(label: string) {
  const requests: { key: string; model: string; content: string }[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let failure = false;
  const server = http.createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString());
      requests.push({
        key: req.headers.authorization || "",
        model: body.model,
        content: JSON.stringify(body.messages),
      });
      await gate;
      if (res.destroyed) return;
      if (failure) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: { message: "Synthetic provider unavailable" },
          }),
        );
        return;
      }
      const tools = body.tools.map((tool: any) => tool.function.name);
      const result = tools.includes("submit_intent")
        ? {
            name: "submit_intent",
            args: {
              goal: "Website",
              audience: "Visitors",
              content: [],
              design: [],
              features: [],
              constraints: [],
            },
          }
        : tools.includes("submit_facts")
          ? {
              name: "submit_facts",
              args: { summary: "Synthetic facts", facts: [], limitations: [] },
            }
          : {
              name: "submit_page",
              args: {
                usedFactIds: [],
                html: `<html><body><h1>Private result ${label}</h1></body></html>`,
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
                  id: "call_" + randomUUID(),
                  type: "function",
                  function: {
                    name: result.name,
                    arguments: JSON.stringify(result.args),
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
    } catch {
      if (!res.destroyed) res.destroy();
    }
  });
  return {
    requests,
    release: () => release(),
    fail: (value: boolean) => {
      failure = value;
    },
    async listen() {
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      return `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
    },
    async close() {
      release();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

test(
  "two authenticated users share a backend, but never model credentials, config or project access",
  { timeout: 90000 },
  async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "dreamatic-users-"));
    const alpha = mockModel("A"),
      beta = mockModel("B");
    const aUrl = await alpha.listen(),
      bUrl = await beta.listen();
    const aToken = randomBytes(32).toString("base64url"),
      bToken = randomBytes(32).toString("base64url");
    const users = path.join(workspace, "users.json");
    await writeFile(
      users,
      JSON.stringify({
        alice: createHash("sha256").update(aToken).digest("hex"),
        bob: createHash("sha256").update(bToken).digest("hex"),
      }),
      { mode: 0o600 },
    );
    const legacy = randomUUID();
    await mkdir(path.join(workspace, "projects", legacy), { recursive: true });
    await writeFile(
      path.join(workspace, "projects", legacy, "project.json"),
      JSON.stringify({
        id: legacy,
        title: "Legacy unowned",
        messages: [],
        events: [],
        sources: [],
        versions: [],
        status: "idle",
      }),
    );
    let child: ReturnType<typeof spawn> | undefined;
    let stopped: Promise<void>;
    let logs = "";
    async function start() {
      logs = "";
      child = spawn(
        process.execPath,
        ["--import", "tsx", "apps/server/src/index.ts"],
        {
          env: {
            ...process.env,
            HOST: "127.0.0.1",
            PORT: "0",
            DREAMATIC_WORKSPACE: workspace,
            DREAMATIC_USERS_FILE: users,
            DREAMATIC_ALLOWED_MODEL_URLS: JSON.stringify([aUrl, bUrl]),
            DREAMATIC_ACCESS_TOKEN: "shared-token-must-not-work",
            DREAMATIC_MODEL: "GLOBAL-DO-NOT-USE",
            DREAMATIC_BASE_URL: aUrl,
            DREAMATIC_API_KEY: "GLOBAL-SECRET-DO-NOT-USE",
            DREAMATIC_GENERATION_CONCURRENCY: "2",
            DREAMATIC_GENERATION_QUEUE_SIZE: "3",
            DREAMATIC_MODEL_COOLDOWN_MS: "20",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      child.stdout!.on("data", (data) => {
        logs += data;
      });
      child.stderr!.on("data", (data) => {
        logs += data;
      });
      stopped = new Promise((resolve) => child!.once("close", () => resolve()));
      const output = await until(
        async () => {
          if (child!.exitCode !== null) throw new Error(logs);
          return logs;
        },
        (value) => /http:\/\/127.0.0.1:\d+/.test(value),
      );
      return output.match(/http:\/\/127.0.0.1:\d+/)![0];
    }
    async function stop() {
      if (!child) return;
      child.kill("SIGTERM");
      await Promise.race([stopped, delay(12000, undefined, { ref: false })]);
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await stopped;
      child = undefined;
    }
    try {
      let base = await start();
      const request = (token: string, url: string, options: RequestInit = {}) =>
        fetch(base + url, {
          ...options,
          signal: options.signal || AbortSignal.timeout(20000),
          headers: {
            Authorization: "Bearer " + token,
            ...(options.body instanceof FormData
              ? {}
              : { "Content-Type": "application/json" }),
            ...options.headers,
          },
        });
      const json = async (
        token: string,
        url: string,
        options: RequestInit = {},
      ) => {
        const response = await request(token, url, options);
        assert.ok(
          response.ok,
          `${response.status}: ${await response.clone().text()}`,
        );
        return response.json();
      };
      const saveConfig = (token: string, value: unknown) =>
        json(token, "/api/config", {
          method: "PUT",
          body: JSON.stringify(value),
        });
      const create = (token: string) =>
        json(token, "/api/projects", {
          method: "POST",
          body: JSON.stringify({ ownerId: "forged-user" }),
        });
      const run = (token: string, id: string, marker: string) =>
        request(token, `/api/projects/${id}/run`, {
          method: "POST",
          body: JSON.stringify({ text: marker }),
        });
      const state = (token: string, id: string) =>
        json(token, `/api/projects/${id}`);
      const completed = (token: string, id: string) =>
        until(
          () => state(token, id),
          (p) => ["complete", "error", "cancelled"].includes(p.status),
        );
      assert.equal((await fetch(base + "/api/config")).status, 401);
      assert.equal(
        (await request("shared-token-must-not-work", "/api/config")).status,
        401,
      );
      const initialA = await json(aToken, "/api/config"),
        initialB = await json(bToken, "/api/config");
      assert.equal(initialA.userId, "alice");
      assert.equal(initialB.userId, "bob");
      assert.equal(initialA.workspaceLocked, true);
      assert.equal(initialA.workspace, "");
      assert.equal(initialB.models.reasoning.hasApiKey, false);
      assert.equal(initialB.models.reasoning.model, "");
      const empty = await create(bToken);
      assert.equal((await run(bToken, empty.id, "Unconfigured")).status, 400);
      assert.equal(alpha.requests.length + beta.requests.length, 0);
      const configA = {
        ...initialA,
        models: {
          reasoning: {
            mode: "openai-compatible",
            baseUrl: aUrl,
            model: "model-a",
            vision: true,
            apiKey: "FAKE-KEY-A",
          },
          analyst: null,
          designer: null,
        },
      };
      const configB = {
        ...initialB,
        models: {
          reasoning: {
            mode: "openai-compatible",
            baseUrl: bUrl,
            model: "model-b-old",
            vision: true,
            apiKeys: ["FAKE-KEY-B-OLD"],
          },
          analyst: null,
          designer: null,
        },
      };
      await Promise.all([
        saveConfig(aToken, configA),
        saveConfig(bToken, configB),
      ]);
      assert.equal(
        (
          await request(aToken, "/api/config", {
            method: "PUT",
            body: JSON.stringify({
              ...configA,
              workspace: "/tmp/forbidden-workspace",
            }),
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request(aToken, "/api/config", {
            method: "PUT",
            body: JSON.stringify({
              ...configA,
              models: {
                ...configA.models,
                reasoning: {
                  ...configA.models.reasoning,
                  baseUrl: "http://169.254.169.254/v1",
                },
              },
            }),
          })
        ).status,
        400,
      );
      const disguised = await json(aToken, "/api/config?userId=bob", {
        headers: { "X-User-Id": "bob" },
      });
      assert.equal(disguised.userId, "alice");
      assert.equal(disguised.models.reasoning.model, "model-a");
      assert.doesNotMatch(JSON.stringify(disguised), /FAKE-KEY|GLOBAL-SECRET/);
      const a = await create(aToken),
        b = await create(bToken),
        queued = await create(bToken);
      assert.equal(a.ownerId, "alice");
      assert.equal(b.ownerId, "bob");
      assert.deepEqual(
        (await json(aToken, "/api/projects")).map((p: any) => p.id),
        [a.id],
      );
      assert.equal(
        (await request(aToken, `/api/projects/${legacy}`)).status,
        404,
      );
      for (const [method, suffix] of [
        ["GET", ""],
        ["POST", "/run"],
        ["POST", "/resume"],
        ["POST", "/cancel"],
        ["GET", "/events"],
        ["GET", "/export"],
        ["GET", "/metrics"],
        ["GET", "/results/facts"],
        ["GET", "/scheduling"],
        ["POST", "/sources"],
        ["POST", "/versions"],
        ["POST", "/preview-document"],
        ["POST", "/open"],
        ["DELETE", ""],
        ["PATCH", ""],
      ]) {
        assert.equal(
          (await request(bToken, `/api/projects/${a.id}${suffix}`, { method }))
            .status,
          404,
          `${method} ${suffix}`,
        );
      }
      assert.equal((await run(aToken, a.id, "ALICE-ONLY-INPUT")).status, 202);
      assert.equal((await run(bToken, b.id, "BOB-ONLY-INPUT")).status, 202);
      await until(
        async () => [alpha.requests.length, beta.requests.length],
        (counts) => counts.every((n) => n === 1),
      );
      assert.equal((await json(aToken, "/api/capacity")).generation.active, 2);
      const queuedResponse = await run(bToken, queued.id, "BOB-QUEUED-INPUT");
      assert.equal((await queuedResponse.json()).scheduling.state, "queued");
      // A later config update affects the next admission, not running or already queued work.
      const newB = {
        ...configB,
        models: {
          ...configB.models,
          reasoning: {
            ...configB.models.reasoning,
            model: "model-b-new",
            apiKeys: ["FAKE-KEY-B-NEW"],
          },
        },
      };
      await saveConfig(bToken, newB);
      alpha.release();
      beta.release();
      const results = await Promise.all([
        completed(aToken, a.id),
        completed(bToken, b.id),
        completed(bToken, queued.id),
      ]);
      for (const value of results)
        assert.equal(value.status, "complete", value.error);
      assert.match(results[0].versions[0].html, /Private result A/);
      assert.match(results[1].versions[0].html, /Private result B/);
      assert.ok(
        alpha.requests.every(
          (r) =>
            r.key === "Bearer FAKE-KEY-A" &&
            r.model === "model-a" &&
            !r.content.includes("BOB-ONLY-INPUT"),
        ),
      );
      assert.ok(
        beta.requests.every(
          (r) =>
            r.key === "Bearer FAKE-KEY-B-OLD" &&
            r.model === "model-b-old" &&
            !r.content.includes("ALICE-ONLY-INPUT"),
        ),
      );
      const fresh = await create(bToken);
      await run(bToken, fresh.id, "BOB-NEW-INPUT");
      assert.equal((await completed(bToken, fresh.id)).status, "complete");
      assert.ok(
        beta.requests
          .filter((r) => r.content.includes("BOB-NEW-INPUT"))
          .every(
            (r) =>
              r.key === "Bearer FAKE-KEY-B-NEW" && r.model === "model-b-new",
          ),
      );
      const report = await json(aToken, `/api/projects/${a.id}/metrics`);
      assert.equal(report.inputTokens, 60);
      assert.equal(report.outputTokens, 30);

      // All image/file paths, even when the URL is known, remain owner-protected.
      const form = new FormData();
      form.set(
        "files",
        new Blob(
          [
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9JkAAAAASUVORK5CYII=",
              "base64",
            ),
          ],
          { type: "image/png" },
        ),
        "photo.png",
      );
      const upload = await json(aToken, `/api/projects/${a.id}/sources`, {
        method: "POST",
        body: form,
      });
      const source = upload.sources[0],
        asset = source.assets[0].url;
      assert.equal((await request(aToken, asset)).status, 200);
      assert.equal((await request(bToken, asset)).status, 404);
      assert.equal((await fetch(base + asset)).status, 401);
      assert.equal(
        (
          await request(
            bToken,
            `/api/projects/${a.id}/sources/${source.id}/original`,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await request(
            bToken,
            `/api/projects/${a.id}/sources/${source.id}/reading`,
          )
        ).status,
        404,
      );
      const authorized = await request(aToken, "/api/config");
      const cookie = authorized.headers.get("set-cookie")!.split(";")[0];
      assert.match(authorized.headers.get("set-cookie")!, /HttpOnly/);
      assert.equal(
        (await fetch(base + asset, { headers: { Cookie: cookie } })).status,
        200,
      );
      assert.equal(
        (await fetch(base + "/api/config", { headers: { Cookie: cookie } }))
          .status,
        401,
      );
      const html = `<html><body><h1>Private preview A</h1><img src="${asset}" alt="private"><button id="action">Run</button><output id="result"></output><script>document.getElementById('action').onclick=()=>document.getElementById('result').textContent='works'</script></body></html>`;
      const preview = await json(
        aToken,
        `/api/projects/${a.id}/preview-document`,
        { method: "POST", body: JSON.stringify({ html }) },
      );
      assert.match(preview.html, /data:image\/png;base64,/);
      assert.ok(!preview.html.includes(aToken));
      const open = await json(aToken, `/api/projects/${a.id}/open`, {
        method: "POST",
        body: JSON.stringify({ html }),
      });
      assert.ok(open.url.startsWith("/browser-preview/"));
      assert.equal((await request(bToken, open.url)).status, 404);
      assert.equal((await fetch(base + open.url)).status, 401);
      assert.equal(
        (await fetch(base + open.url, { headers: { Cookie: cookie } })).status,
        200,
      );

      const browser = await chromium.launch({
        executablePath: process.env.CHROME_PATH || chromium.executablePath(),
        headless: true,
      });
      try {
        const page = await browser.newPage();
        await page.goto(base);
        await page.evaluate(
          async ({ aToken }) => {
            await fetch("/api/config", {
              headers: { Authorization: "Bearer " + aToken },
            });
          },
          { aToken },
        );
        await page.goto(base + open.url);
        assert.equal(
          await page
            .locator("img")
            .evaluate((img: HTMLImageElement) => img.naturalWidth),
          1,
        );
        await page.locator("#action").click();
        assert.equal(await page.locator("#result").innerText(), "works");
        // Inline images also survive the opaque origin used by the interactive iframe.
        await page.goto(base);
        await page.setContent('<iframe sandbox="allow-scripts"></iframe>');
        await page
          .locator("iframe")
          .evaluate((frame: HTMLIFrameElement, value) => {
            frame.srcdoc = value;
          }, preview.html);
        await until(
          async () =>
            page
              .frameLocator("iframe")
              .locator("img")
              .evaluate((img: HTMLImageElement) => img.naturalWidth),
          (n) => n === 1,
        );
        // The existing settings UI must discard A's loaded draft when logging in as B.
        await page.goto(base);
        await page.evaluate(
          (value) => sessionStorage.setItem("dreamatic-token", value),
          aToken,
        );
        await page.reload();
        await page
          .getByRole("button", { name: "系统菜单", exact: true })
          .click();
        await page
          .getByRole("menuitem", { name: "模型与设置", exact: true })
          .click();
        await page.getByText(/当前用户：alice/).waitFor();
        assert.equal(
          await page.getByLabel("模型名称", { exact: true }).inputValue(),
          "model-a",
        );
        await page.getByRole("tab", { name: "系统", exact: true }).click();
        assert.equal(
          await page.getByLabel("Workspace 路径").isDisabled(),
          true,
        );
        await page
          .getByLabel("个人 / 服务访问令牌", { exact: true })
          .fill(bToken);
        await Promise.all([
          page.waitForEvent("load"),
          page.getByRole("button", { name: "链接服务", exact: true }).click(),
        ]);
        await page
          .getByRole("button", { name: "系统菜单", exact: true })
          .click();
        await page
          .getByRole("menuitem", { name: "模型与设置", exact: true })
          .click();
        await page.getByText(/当前用户：bob/).waitFor();
        assert.equal(
          await page.getByLabel("模型名称", { exact: true }).inputValue(),
          "model-b-new",
        );
      } finally {
        await browser.close();
      }

      // A provider failure/resume continues with the owning user's config after restart.
      alpha.fail(true);
      const failed = await create(aToken);
      await run(aToken, failed.id, "ALICE-RESUME-INPUT");
      assert.equal((await completed(aToken, failed.id)).status, "error");
      await stop();
      alpha.fail(false);
      base = await start();
      assert.equal(
        (await json(bToken, "/api/config")).models.reasoning.model,
        "model-b-new",
      );
      assert.equal(
        (
          await request(bToken, `/api/projects/${failed.id}/resume`, {
            method: "POST",
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await request(aToken, `/api/projects/${failed.id}/resume`, {
            method: "POST",
          })
        ).status,
        202,
      );
      assert.equal((await completed(aToken, failed.id)).status, "complete");
      const cleared = await saveConfig(aToken, {
        ...disguised,
        models: {
          ...disguised.models,
          reasoning: { ...disguised.models.reasoning, clearApiKey: true },
        },
      });
      assert.equal(cleared.models.reasoning.hasApiKey, false);
      assert.equal(
        (await json(bToken, "/api/config")).models.reasoning.hasApiKey,
        true,
      );
      const missingKey = await create(aToken);
      assert.equal(
        (await run(aToken, missingKey.id, "NO-FALLBACK")).status,
        400,
      );
      for (const user of ["alice", "bob"])
        assert.equal(
          (await stat(path.join(workspace, "users", user, "settings.json")))
            .mode & 0o777,
          0o600,
        );
      assert.ok(!logs.includes("FAKE-KEY") && !logs.includes("GLOBAL-SECRET"));
      const persisted = await readFile(
        path.join(workspace, "projects", b.id, "project.json"),
        "utf8",
      );
      assert.doesNotMatch(persisted, /FAKE-KEY|GLOBAL-SECRET/);
      await stop();
      await writeFile(
        users,
        JSON.stringify({
          alice: createHash("sha256").update(aToken).digest("hex"),
        }),
        { mode: 0o600 },
      );
      base = await start();
      assert.equal((await request(bToken, "/api/config")).status, 401);
      assert.equal((await request(aToken, "/api/config")).status, 200);
    } finally {
      await stop();
      await alpha.close();
      await beta.close();
      await rm(workspace, { recursive: true, force: true });
    }
  },
);
