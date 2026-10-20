import test from "node:test";
import assert from "node:assert/strict";
import { factImages, factsFor } from "../apps/web/src/fact-model.js";
import type {
  ProjectResponse,
  Source,
  Asset,
} from "../packages/agents/src/contracts.js";

test("fact cards require explicit image associations and never fall back to source-level images", () => {
  const image = (id: string): Asset => ({
    id,
    name: id,
    type: "image",
    mime: "image/png",
    url: `/assets/project/${id}.png`,
  });
  const source = (id: string, assets: Asset[]): Source => ({
    id,
    assets,
    name: id,
    format: "pdf",
    text: "",
    tables: [],
    warnings: [],
    provenance: "upload",
  });
  const p: ProjectResponse = {
    id: "project",
    title: "Test",
    status: "complete",
    messages: [],
    events: [],
    versions: [],
    sources: [
      source("a", [
        image("logo"),
        image("product"),
        image("extra"),
        { ...image("foreign"), url: "/assets/other/foreign.png" },
      ]),
      source("b", [image("other")]),
    ],
    analysis: {
      facts: [{ text: "Claim", sourceId: "a" }],
      assets: [
        {
          url: "/assets/project/logo.png",
          sourceId: "a",
          purpose: "Brand logo",
        },
        {
          url: "/assets/project/product.png",
          sourceId: "a",
          purpose: "Product",
        },
        { url: "/assets/project/extra.png", sourceId: "a", purpose: "Extra" },
        {
          url: "/assets/project/other.png",
          sourceId: "b",
          purpose: "Other source",
        },
      ],
    },
  };
  const fact = factsFor(p)[0];
  const linked = factImages(p, {
    ...fact,
    assetIds: ["product", "other", "foreign", "product"],
  });
  assert.deepEqual(
    linked.map((i) => i.asset.id),
    ["product"],
  );
  assert.deepEqual(
    factImages(p, fact),
    [],
    "legacy facts with no explicit link remain text-only even when their source has recommended pictures",
  );
  assert.equal(linked[0].purpose, "Product");
  assert.deepEqual(
    factImages(p, { ...fact, assetIds: [] }),
    [],
    "an intentional no-image association must not fall back",
  );
  assert.deepEqual(
    factImages(p, { ...fact, assetIds: ["missing"] }),
    [],
    "invalid links must not silently substitute another picture",
  );
  assert.deepEqual(factImages(p, { ...fact, sourceId: "missing" }), []);
  assert.deepEqual(factsFor(null), []);
});
