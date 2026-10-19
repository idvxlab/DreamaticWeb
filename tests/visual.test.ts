import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile, truncate } from "node:fs/promises";
import { create, projectDir, removeProject } from "../apps/server/src/store.js";
import {
  submissionBriefSchema,
  handoffBriefSchema,
} from "../packages/agents/src/brief.js";
import {
  imageHandoff,
  recommendedImages,
  visualEvidenceSchema,
} from "../packages/agents/src/visual.js";
import type { Source } from "../packages/agents/src/contracts.js";

test("visual constraints are optional for old briefs, bounded and preserved in new submissions", () => {
  const old = {
    goal: "Site",
    audience: "Readers",
    language: "zh",
    scope: "create",
    requirements: [],
    preserve: [],
    assumptions: [],
    acceptance: [],
    mediaPolicy: "relevant-images",
  };
  assert.equal(submissionBriefSchema.parse(old).visualConstraints, undefined);
  const visualConstraints = {
    requested: ["Use brand blue"],
    avoid: ["No fluorescent accents"],
    preserve: ["Keep logo colors"],
  };
  assert.deepEqual(
    submissionBriefSchema.parse({ ...old, visualConstraints })
      .visualConstraints,
    visualConstraints,
  );
  assert.deepEqual(handoffBriefSchema.parse({ goal: "Legacy" }).preserve, []);
  assert.throws(() =>
    visualEvidenceSchema.parse([
      { role: "brand", basis: "guessed-as-fact", cues: "Blue", colors: [] },
    ]),
  );
  assert.equal(
    visualEvidenceSchema.parse([
      {
        role: "reference",
        basis: "inferred",
        cues: "No visible logo; suggested blue for the audience",
        colors: ["blue"],
      },
    ]).length,
    1,
  );
});

test("final recommendations load later-discovered brand images, reuse initial data and keep count/capability/scope budgets", async () => {
  const p = await create();
  try {
    const dir = path.join(projectDir(p.id), "assets");
    await mkdir(dir, { recursive: true });
    const source: Source = {
      id: crypto.randomUUID(),
      name: "Brand",
      format: "pdf",
      text: "",
      tables: [],
      warnings: [],
      provenance: "upload",
      assets: [],
    };
    p.sources = [source];
    for (let i = 0; i < 10; i++) {
      const id = crypto.randomUUID();
      await writeFile(path.join(dir, id + ".png"), Buffer.from([i]));
      source.assets.push({
        id,
        name: i === 9 ? "Logo" : "Photo",
        type: "image",
        url: `/assets/${p.id}/${id}.png`,
        mime: "image/png",
      });
    }
    const catalog = source.assets.map((asset) => ({ source, asset }));
    const load = imageHandoff(p);
    const initial = await load(catalog, true);
    assert.equal(initial.images.length, 8);
    assert.equal(initial.omitted, 2);
    const analysis = {
      assets: source.assets.map((a) => ({ url: a.url, sourceId: source.id })),
      visualEvidence: visualEvidenceSchema.parse([
        {
          sourceId: source.id,
          assetId: source.assets[9].id,
          role: "brand",
          basis: "observed",
          cues: "Blue logo",
          colors: ["blue"],
        },
      ]),
    };
    const selected = await load(recommendedImages(p, analysis), true);
    assert.equal(
      selected.imageInputOrder[0].assetId,
      source.assets[9].id,
      "logo beyond the initial eight is now actually loaded",
    );
    assert.strictEqual(
      selected.images[1],
      initial.images[0],
      "reuse already encoded image data",
    );
    assert.equal(selected.images.length, 8);
    assert.deepEqual(
      selected.imageInputOrder.map((x) => x.position),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.equal((await load(catalog, false)).images.length, 0);
    assert.equal(
      (await load([], true)).images.length,
      0,
      "text-only handoff remains empty",
    );
    assert.equal(
      recommendedImages(p, {
        assets: [{ sourceId: "wrong", url: source.assets[0].url }],
      }).length,
      0,
    );
    const missing = {
      ...source.assets[0],
      id: crypto.randomUUID(),
      url: `/assets/${p.id}/missing.png`,
    };
    const failed = await load([{ source, asset: missing }], true);
    assert.equal(failed.unavailable[0].reason, "image unavailable");
  } finally {
    await removeProject(p.id);
  }
});

test("image batches retain per-file and total byte limits", async () => {
  const p = await create();
  try {
    const dir = path.join(projectDir(p.id), "assets");
    await mkdir(dir, { recursive: true });
    const source: Source = {
      id: crypto.randomUUID(),
      name: "Images",
      format: "pdf",
      text: "",
      tables: [],
      warnings: [],
      provenance: "upload",
      assets: [],
    };
    for (let i = 0; i < 5; i++) {
      const id = crypto.randomUUID(),
        file = path.join(dir, id + ".png");
      await writeFile(file, "");
      await truncate(file, 4 * 1024 * 1024 + (i === 0 ? 1 : 0));
      source.assets.push({
        id,
        name: "Image",
        type: "image",
        url: `/assets/${p.id}/${id}.png`,
        mime: "image/png",
      });
    }
    const batch = await imageHandoff(p)(
      source.assets.map((asset) => ({ source, asset })),
      true,
    );
    assert.equal(batch.images.length, 3);
    assert.equal(batch.omitted, 2);
    assert.ok(batch.unavailable.every((x) => x.reason === "image byte budget"));
  } finally {
    await removeProject(p.id);
  }
});
