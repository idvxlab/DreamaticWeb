import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  create,
  get,
  save,
  projects,
  projectDir,
  removeProject,
} from "../apps/server/src/store.js";
import { ingest } from "../apps/server/src/ingest.js";
import { imagePreview } from "../apps/server/src/image-preview.js";

test("legacy null source is skipped without rewriting original metadata or losing valid sources", async () => {
  const p = await create();
  try {
    const valid = await ingest(
      Buffer.from("name,value\nTest,42"),
      "test.csv",
      p.id,
    );
    p.sources.push(valid);
    await save(p);
    const filename = path.join(projectDir(p.id), "project.json");
    const raw = JSON.stringify({ ...p, sources: [null, valid] });
    await writeFile(filename, raw);
    projects.delete(p.id);
    const recovered = await get(p.id);
    assert.equal(recovered.sources.length, 1);
    assert.equal(recovered.sources[0].id, valid.id);
    assert.match(recovered.sourceRecoveryWarning!, /重新上传/);
    assert.equal(await readFile(filename, "utf8"), raw);
  } finally {
    await removeProject(p.id);
  }
});

test("large image preview is cached and bounded while original bytes remain unchanged", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dreamatic-image-"));
  try {
    const source = path.join(dir, "large.png");
    const original = await sharp({
      create: { width: 3000, height: 3000, channels: 3, background: "#aabbcc" },
    })
      .png()
      .toBuffer();
    const padded = Buffer.concat([original, Buffer.alloc(5 * 1024 * 1024)]);
    await writeFile(source, padded);
    const preview = await imagePreview(source, path.join(dir, "cache"));
    assert.ok(preview.length < 1024 * 1024);
    const info = await sharp(preview).metadata();
    assert.equal(info.format, "jpeg");
    assert.ok(info.width! <= 1600 && info.height! <= 1600);
    assert.deepEqual(
      await imagePreview(source, path.join(dir, "cache")),
      preview,
    );
    assert.deepEqual(await readFile(source), padded);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
