import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createServer, loadConfigFromFile } from "vite";
import { api, ApiConnectionError } from "../apps/web/src/api.js";

test("real development proxy reports a disconnected upload as structured 503 without retrying", async () => {
  let requests = 0;
  const backend = http.createServer((req, res) => {
    requests++;
    req.resume();
    req.on("end", () => {
      if (requests === 1) req.socket.destroy();
      else
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end('{"sources":[],"errors":[]}');
    });
  });
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const address = backend.address() as { port: number };
  const loaded = await loadConfigFromFile({
    command: "serve",
    mode: "development",
  });
  const options = loaded!.config.server!.proxy!["/api"];
  assert.ok(typeof options === "object");
  const vite = await createServer({
    configFile: false,
    root: "apps/web",
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      port: 0,
      proxy: {
        "/api": { ...options, target: `http://127.0.0.1:${address.port}` },
      },
    },
  });
  try {
    await vite.listen();
    const url = vite.resolvedUrls!.local[0] + "api/projects/fixture/sources";
    const first = await fetch(url, { method: "POST", body: "upload" });
    assert.equal(first.status, 503);
    const error = await first.json();
    assert.equal(error.code, "DEV_BACKEND_UNAVAILABLE");
    assert.match(error.error, /可能正在重启/);
    assert.equal(requests, 1);
    const retry = await fetch(url, { method: "POST", body: "upload" });
    assert.equal(retry.status, 200);
    assert.equal(requests, 2);
  } finally {
    await vite.close();
    backend.closeAllConnections();
    await new Promise<void>((resolve) => backend.close(() => resolve()));
  }
});

test("client distinguishes connection failures, business failures and intentional aborts", async (t) => {
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  );
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: { getItem: () => null },
  });
  let response: () => Promise<Response> = async () => {
    throw new TypeError("Failed to fetch");
  };
  t.mock.method(globalThis, "fetch", () => response());
  try {
    await assert.rejects(() => api("/fixture"), ApiConnectionError);
    response = async () =>
      new Response(
        JSON.stringify({
          code: "DEV_BACKEND_UNAVAILABLE",
          error: "后端连接中断",
        }),
        { status: 503 },
      );
    await assert.rejects(() => api("/fixture"), ApiConnectionError);
    response = async () =>
      new Response('{"error":"资料正在解析"}', { status: 400 });
    await assert.rejects(
      () => api("/fixture"),
      (error: Error) =>
        !(error instanceof ApiConnectionError) &&
        error.message === "资料正在解析",
    );
    const abort = new DOMException("Aborted", "AbortError");
    response = async () => {
      throw abort;
    };
    await assert.rejects(
      () => api("/fixture"),
      (error) => error === abort,
    );
  } finally {
    if (original) Object.defineProperty(globalThis, "sessionStorage", original);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});
