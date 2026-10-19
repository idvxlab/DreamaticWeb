import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { chromium } from "playwright-core";
import { registerBrowserPreview } from "../apps/server/src/browser-preview.js";
import {
  create,
  save,
  removeProject,
  projectDir,
} from "../apps/server/src/store.js";
import { extract } from "../apps/server/src/extract.js";
import { readdir, utimes } from "node:fs/promises";
import path from "node:path";

test("default-browser snapshot preserves unsaved HTML, scopes assets, expires and is deleted with project", async () => {
  const project = await create();
  project.sources.push(
    await extract(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9JkAAAAASUVORK5CYII=",
        "base64",
      ),
      "photo.png",
      project.id,
    ),
  );
  await save(project);
  const opened: string[] = [];
  let fail = false;
  const app = express();
  app.use(express.json());
  app.get("/assets/:project/:file", (req, res) =>
    res.sendFile(
      path.join(projectDir(req.params.project), "assets", req.params.file),
    ),
  );
  registerBrowserPreview(app, async (url) => {
    if (fail) throw Error("No browser");
    opened.push(url);
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (html: string) =>
    fetch(base + `/api/projects/${project.id}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html }),
    });
  const html = `<html><body><h1>Unsaved canvas</h1><img alt="Source photo" src="${project.sources[0].assets[0].url}"><script>alert(1)</script></body></html>`;
  try {
    assert.equal((await post(html)).status, 200);
    assert.equal(opened.length, 1);
    assert.match(opened[0], new RegExp(`^${base}/browser-preview/`));
    const response = await fetch(opened[0]);
    const content = await response.text();
    assert.match(content, /Unsaved canvas/);
    assert.match(content, new RegExp(project.sources[0].assets[0].url));
    assert.doesNotMatch(content, /<script/);
    assert.match(
      response.headers.get("content-security-policy") || "",
      /sandbox/,
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    const browser = await chromium.launch({
      executablePath:
        process.env.DREAMATIC_BROWSER_PATH ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
    });
    try {
      const page = await browser.newPage();
      await page.goto(opened[0]);
      assert.equal(await page.locator("h1").innerText(), "Unsaved canvas");
      assert.equal(
        await page
          .locator("img")
          .evaluate((element) => (element as HTMLImageElement).naturalWidth),
        1,
      );
    } finally {
      await browser.close();
    }
    assert.equal(project.versions.length, 0);
    const foreign = html.replace(project.id, crypto.randomUUID());
    assert.equal((await post(foreign)).status, 400);
    assert.equal(opened.length, 1);
    fail = true;
    assert.equal((await post(html)).status, 503);
    const directory = path.join(projectDir(project.id), "previews", "browser");
    const files = await readdir(directory);
    assert.equal(files.length, 1);
    await utimes(path.join(directory, files[0]), new Date(0), new Date(0));
    assert.equal((await fetch(opened[0])).status, 404);
    fail = false;
    assert.equal((await post(html)).status, 200);
    await removeProject(project.id);
    assert.equal((await fetch(opened[1])).status, 404);
  } finally {
    await removeProject(project.id).catch(() => {});
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
