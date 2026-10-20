import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  readFile,
  stat,
  rm,
  writeFile,
  mkdir,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("HTTP ingestion, model configuration persistence, authorization, conflict and safe export", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "dreamatic-api-"));
  const interrupted = crypto.randomUUID();
  await mkdir(path.join(workspace, "projects"));
  await writeFile(
    path.join(workspace, "projects", interrupted + ".json"),
    JSON.stringify({
      id: interrupted,
      status: "running",
      messages: [],
      events: [],
      sources: [],
      versions: [],
    }),
  );
  const server = spawn(
    process.execPath,
    ["--import", "tsx", "apps/server/src/index.ts"],
    {
      env: {
        ...process.env,
        PORT: "0",
        HOST: "127.0.0.1",
        DREAMATIC_WORKSPACE: workspace,
        DREAMATIC_MODE: "demo",
        DREAMATIC_ACCESS_TOKEN: "test-access",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  server.stdout.on("data", (d) => {
    output += d;
  });
  server.stderr.on("data", (d) => {
    output += d;
  });
  try {
    // Port 0 is reported by the listening callback, avoiding fixed test ports.
    const base = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Server did not start: " + output)),
        20000,
      );
      server.on("exit", () => {
        clearTimeout(timer);
        reject(new Error(output));
      });
      server.stdout.on("data", () => {
        const match = output.match(/http:\/\/127.0.0.1:(\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve("http://127.0.0.1:" + match[1]);
        }
      });
    });
    const request = (url: string, options: RequestInit = {}) =>
      fetch(base + "/api" + url, {
        ...options,
        headers: {
          Authorization: "Bearer test-access",
          ...(options.body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
          ...options.headers,
        },
      });
    assert.equal((await fetch(base + "/api/health")).status, 401);
    assert.equal(
      (
        await request("/health", {
          headers: { Origin: "https://untrusted.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await (await request("/projects/" + interrupted)).json()).status,
      "error",
    );
    const cfg = await (await request("/config")).json();
    const secret = "test-private-key-not-for-browser";
    const saved = await request("/config", {
      method: "PUT",
      body: JSON.stringify({
        ...cfg,
        mode: "demo",
        models: {
          ...cfg.models,
          reasoning: { ...cfg.models.reasoning, apiKey: secret },
        },
      }),
    });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).models.reasoning.hasApiKey, true);
    assert.ok(!(await (await request("/config")).text()).includes(secret));
    assert.equal(
      (await stat(path.join(workspace, "settings.json"))).mode & 0o777,
      0o600,
    );
    assert.match(
      await readFile(path.join(workspace, "settings.json"), "utf8"),
      new RegExp(secret),
    );
    assert.equal(
      (
        await request("/config", {
          method: "PUT",
          body: JSON.stringify({
            ...cfg,
            models: {
              ...cfg.models,
              reasoning: {
                ...cfg.models.reasoning,
                baseUrl: "file:///etc/passwd",
              },
            },
          }),
        })
      ).status,
      400,
    );
    const p = await (await request("/projects", { method: "POST" })).json();
    const form = new FormData();
    form.append(
      "files",
      new Blob(["标题,值\n测试,42"], { type: "text/csv" }),
      "source.csv",
    );
    form.append("files", new Blob(["unsupported"]), "malware.exe");
    const result = await (
      await request(`/projects/${p.id}/sources`, { method: "POST", body: form })
    ).json();
    assert.equal(result.sources.length, 1, JSON.stringify(result));
    assert.equal(result.errors.length, 1);
    assert.equal(result.sources[0].tables[0].rows[1][1], "42");
    const reading = await request(
      `/projects/${p.id}/sources/${result.sources[0].id}/reading`,
    );
    assert.equal(reading.status, 200);
    assert.match(reading.headers.get("content-type") || "", /text\/markdown/);
    assert.match(await reading.text(), /测试/);
    assert.equal(
      (
        await request(
          `/projects/${p.id}/sources/${crypto.randomUUID()}/reading`,
        )
      ).status,
      404,
    );

    const imageForm = new FormData();
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9JkAAAAASUVORK5CYII=",
      "base64",
    );
    imageForm.append(
      "files",
      new Blob([png], { type: "image/png" }),
      "logo.png",
    );
    const imageResult = await (
      await request(`/projects/${p.id}/sources`, {
        method: "POST",
        body: imageForm,
      })
    ).json();
    assert.equal(imageResult.errors.length, 0, JSON.stringify(imageResult));
    const imageUrl = imageResult.sources[0].assets[0].url;
    assert.match(imageUrl, new RegExp(`/assets/${p.id}/`));
    assert.equal((await fetch(base + imageUrl)).status, 200);

    assert.match(
      await readFile(
        path.join(workspace, "projects", p.id, result.sources[0].originalFile),
        "utf8",
      ),
      /测试,42/,
    );

    assert.equal(
      (
        await request(`/projects/${p.id}/run`, {
          method: "POST",
          body: JSON.stringify({ text: "用资料创建数据网页" }),
        })
      ).status,
      202,
    );
    let generated: any;
    for (let i = 0; i < 60; i++) {
      generated = await (await request(`/projects/${p.id}`)).json();
      if (generated.status !== "running") break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(generated.status, "complete", generated.error);
    assert.equal(generated.pagePreviews, undefined);
    assert.ok(generated.run?.id);
    for (const checkpoint of Object.values(generated.run.checkpoints) as any[])
      assert.equal(
        checkpoint.result,
        undefined,
        "polling responses omit duplicate stage artifacts",
      );
    assert.equal(
      (await request(`/projects/${interrupted}/resume`, { method: "POST" }))
        .status,
      409,
      "legacy tasks must not invent checkpoints",
    );
    const messageCount = generated.messages.length;
    assert.equal(
      (await request(`/projects/${p.id}/resume`, { method: "POST" })).status,
      202,
    );
    await new Promise((r) => setTimeout(r, 50));
    const resumed = await (await request(`/projects/${p.id}`)).json();
    assert.equal(resumed.versions.length, generated.versions.length);
    assert.equal(
      resumed.messages.length,
      messageCount,
      "resume does not append duplicate requests",
    );
    assert.ok(
      await stat(
        path.join(
          workspace,
          "projects",
          p.id,
          "pages",
          generated.versions[0].id + ".html",
        ),
      ),
    );
    assert.match(
      await (await request(`/projects/${p.id}/export`)).text(),
      /data:image\/png;base64,/,
    );

    const baseVersionId = generated.versions.at(-1).id;
    const body = JSON.stringify({
      baseVersionId,
      html: '<html><body><h1>Saved</h1><script>parent.alert(1)</script><form action="https://evil.example"><button>Submit</button></form></body></html>',
    });
    assert.equal(
      (await request(`/projects/${p.id}/versions`, { method: "POST", body }))
        .status,
      200,
    );
    assert.equal(
      (await request(`/projects/${p.id}/versions`, { method: "POST", body }))
        .status,
      409,
    );
    const exported = await (await request(`/projects/${p.id}/export`)).text();
    assert.match(exported, /Saved/);
    assert.match(exported, /script-src 'none'/);
    assert.doesNotMatch(exported, /<script|action="https/);
    assert.equal(
      (
        await request(`/projects/${p.id}`, {
          method: "PATCH",
          body: JSON.stringify({ title: "   " }),
        })
      ).status,
      400,
    );
    const renamed = await (
      await request(`/projects/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "我的品牌网站" }),
      })
    ).json();
    assert.equal(renamed.title, "我的品牌网站");
    assert.equal(renamed.titleEdited, true);
    assert.equal(
      (await request(`/projects/${p.id}`, { method: "DELETE" })).status,
      200,
    );
    assert.ok(
      !(await (await request("/projects")).json()).some(
        (item: any) => item.id === p.id,
      ),
    );
    await assert.rejects(
      () => readFile(path.join(workspace, "projects", p.id, "project.json")),
      { code: "ENOENT" },
    );
    const { readdir } = await import("node:fs/promises");
    assert.deepEqual(
      await readdir(path.join(workspace, "trash")).catch(() => []),
      [],
    );
    const alternate = path.join(workspace, "alternate");
    const currentConfig = await (await request("/config")).json();
    assert.equal(
      (
        await request("/config", {
          method: "PUT",
          body: JSON.stringify({ ...currentConfig, workspace: alternate }),
        })
      ).status,
      200,
    );
    assert.equal(
      (await (await request("/config")).json()).workspace,
      alternate,
    );
    const other = await (await request("/projects", { method: "POST" })).json();
    assert.ok(
      await stat(path.join(alternate, "projects", other.id, "project.json")),
    );
    assert.equal(
      (
        await request("/config", {
          method: "PUT",
          body: JSON.stringify({ ...currentConfig, workspace }),
        })
      ).status,
      200,
    );
    assert.ok(
      !(await (await request("/projects")).json()).some(
        (item: any) => item.id === other.id,
      ),
    );
    assert.ok(
      await stat(path.join(alternate, "projects", other.id, "project.json")),
    );
  } finally {
    const exit = new Promise((r) => server.once("exit", r));
    server.kill();
    if (server.exitCode === null) await exit;
    await rm(workspace, { recursive: true, force: true });
  }
});
