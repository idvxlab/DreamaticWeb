import test from "node:test";
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import path from "node:path";
import { create, projectDir, removeProject } from "../apps/server/src/store.js";
import {
  intentMarkdown,
  loadArtifact,
  persistArtifact,
} from "../apps/server/src/generation/artifacts.js";

test("immutable Markdown keeps prior checkpoints readable across metadata publication and skips identical writes", async () => {
  const p = await create();
  const initial = {
    goal: "Initial",
    audience: "Visitors",
    content: [],
    features: [],
    design: [],
    constraints: [],
  };
  try {
    const first = await persistArtifact(p.id, "intent", "first", initial);
    const oldFile = path.join(
      projectDir(p.id),
      "results",
      `intent-${first.hash}.md`,
    );
    const before = await stat(oldFile, { bigint: true });
    const same = await persistArtifact(p.id, "intent", "new-policy", initial);
    assert.equal(same.written, false);
    assert.equal(
      (await stat(oldFile, { bigint: true })).mtimeNs,
      before.mtimeNs,
    );
    const second = await persistArtifact(p.id, "intent", "second", {
      ...initial,
      goal: "Updated",
    });
    assert.notEqual(second.hash, first.hash);
    assert.deepEqual(
      (await loadArtifact(p.id, "intent", first.ref))!.data,
      initial,
    );
    assert.deepEqual((await loadArtifact(p.id, "intent", second.ref))!.data, {
      ...initial,
      goal: "Updated",
    });
    const latest = await stat(path.join(projectDir(p.id), "results/intent.md"));
    const current = await stat(
      path.join(projectDir(p.id), "results", `intent-${second.hash}.md`),
    );
    assert.equal(
      latest.ino,
      current.ino,
      "friendly result link does not duplicate content",
    );
  } finally {
    await removeProject(p.id);
  }
});

test("intent briefs keep user-stated design apart from overridable defaults and old briefs still parse", async () => {
  const { intentSchema } = await import("../packages/shared/generation.js");
  const brief = intentSchema.parse({
    goal: "宣传",
    audience: "客户",
    content: [],
    features: [],
    design: ["首屏有明显的主题动效"],
    designDefaults: ["深色背景"],
    constraints: [],
  });
  const markdown = intentMarkdown(brief);
  assert.match(
    markdown,
    /## design\n- "首屏有明显的主题动效"\n\n## designDefaults\n- "深色背景"/,
  );
  const old = intentSchema.parse({
    goal: "g",
    audience: "a",
    content: [],
    features: [],
    design: [],
    constraints: [],
  });
  assert.equal(old.designDefaults, undefined);
  assert.doesNotMatch(intentMarkdown(old), /designDefaults/);
});
