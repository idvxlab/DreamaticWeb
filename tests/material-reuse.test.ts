import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat, rm } from "node:fs/promises";
import path from "node:path";
import { create, projectDir, removeProject } from "../apps/server/src/store.js";
import { ingest } from "../apps/server/src/ingest.js";
import { readCanonicalSource } from "../apps/server/src/source-content.js";

test("content fingerprints reuse parsing and original media use one physical file with canonical Markdown links", async () => {
  const p = await create();
  try {
    const buffer = Buffer.from("Title,Value\nBrand,42");
    const first = await ingest(buffer, "source.csv", p.id);
    p.sources.push(first);
    const file = path.join(projectDir(p.id), "sources", first.id, "reading.md");
    const before = await stat(file, { bigint: true });
    const second = await ingest(buffer, "source.csv", p.id, p.sources);
    assert.equal(second, first);
    assert.equal((await stat(file, { bigint: true })).mtimeNs, before.mtimeNs);
    const changed = await ingest(
      Buffer.from("Title,Value\nBrand,43"),
      "source.csv",
      p.id,
      p.sources,
    );
    assert.notEqual(changed.id, first.id);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9JkAAAAASUVORK5CYII=",
      "base64",
    );
    const media = await ingest(png, "logo.png", p.id);
    const assetPath = path.join(
      projectDir(p.id),
      "assets",
      path.basename(media.assets[0].url),
    );
    const originalPath = path.join(projectDir(p.id), media.originalFile!);
    assert.deepEqual(await readFile(originalPath), png);
    assert.equal(
      (await stat(originalPath)).ino,
      (await stat(assetPath)).ino,
      "logical original and asset share one inode",
    );
    const markdown = (await readCanonicalSource(p.id, media)).markdown;
    assert.ok(markdown.includes(media.assets[0].url));
    assert.ok(markdown.includes(media.assets[0].id));
    assert.equal((await stat(originalPath)).mode & 0o777, 0o600);
    // A missing Markdown result is repaired rather than reused.
    await rm(file);
    assert.notEqual(
      (await ingest(buffer, "source.csv", p.id, p.sources)).id,
      first.id,
    );
    // Minimal recognizable MP4 container, stored unchanged without a codec/model pass.
    const mp4 = Buffer.from(
      "00000018667479706d703432000000006d70343269736f6d",
      "hex",
    );
    const video = await ingest(mp4, "clip.mp4", p.id);
    assert.equal(video.assets[0].type, "video");
    assert.deepEqual(
      await readFile(path.join(projectDir(p.id), video.originalFile!)),
      mp4,
    );
    assert.ok(
      (await readCanonicalSource(p.id, video)).markdown.includes(
        video.assets[0].url,
      ),
    );
  } finally {
    await removeProject(p.id);
  }
});

test("website imports preserve raw HTML, reuse unchanged Markdown and media, and invalidate changed remote dependencies", async (t) => {
  const dns = (await import("node:dns/promises")).default;
  const http = (await import("node:http")).default;
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  const { extractUrl } = await import("../apps/server/src/extract.js");
  let page =
    '<html><head><title>Example</title></head><body><h1>Brand</h1><img src="/logo.png"></body></html>';
  let image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9JkAAAAASUVORK5CYII=",
    "base64",
  );
  let requests = 0;
  t.mock.method(dns, "lookup", async () => [
    { address: "93.184.216.34", family: 4 },
  ]);
  t.mock.method(http, "get", ((
    url: URL,
    _options: unknown,
    callback: Function,
  ) => {
    requests++;
    const request = Object.assign(new EventEmitter(), {
      setTimeout: () => request,
      destroy: (error: Error) => request.emit("error", error),
    });
    const media = url.pathname.endsWith(".png");
    const response = Object.assign(new PassThrough(), {
      statusCode: 200,
      headers: { "content-type": media ? "image/png" : "text/html" },
    });
    queueMicrotask(() => {
      callback(response);
      response.end(media ? image : Buffer.from(page));
    });
    return request;
  }) as unknown as typeof http.get);
  const p = await create();
  try {
    const first = await extractUrl("http://example.test/page", p.id);
    p.sources.push(first);
    const file = path.join(projectDir(p.id), "sources", first.id, "reading.md");
    const before = await stat(file, { bigint: true });
    assert.equal(requests, 2);
    assert.equal(
      await readFile(path.join(projectDir(p.id), first.originalFile!), "utf8"),
      page,
    );
    const again = await extractUrl("http://example.test/page", p.id, p.sources);
    assert.equal(again, first);
    assert.equal(
      requests,
      4,
      "explicit reimport checks page and bounded media dependency",
    );
    assert.equal((await stat(file, { bigint: true })).mtimeNs, before.mtimeNs);
    image = Buffer.concat([image, Buffer.from([1])]);
    const updated = await extractUrl(
      "http://example.test/page",
      p.id,
      p.sources,
    );
    assert.notEqual(updated.id, first.id);
    assert.notEqual(updated.assets[0].url, first.assets[0].url);
    p.sources.push(updated);
    page = page.replace("Brand", "Updated brand");
    const changed = await extractUrl(
      "http://example.test/page",
      p.id,
      p.sources,
    );
    assert.equal(
      changed.assets[0].url,
      updated.assets[0].url,
      "unchanged media bytes retain the content-addressed resource",
    );
    assert.ok(
      (await readCanonicalSource(p.id, changed)).markdown.includes(
        "Updated brand",
      ),
    );
  } finally {
    await removeProject(p.id);
  }
});
