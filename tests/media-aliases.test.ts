import test from "node:test";
import assert from "node:assert/strict";
import { resolveMediaAliases } from "../apps/server/src/generation/media-aliases.js";
test("short media IDs resolve exactly and preserve original input and source ownership", () => {
  const uuid = crypto.randomUUID();
  const input = {
    facts: [{ sourceId: "source-1", assetIds: ["S1-I001", uuid] }],
  };
  const r = resolveMediaAliases(input, {
    "S1-I001": { sourceId: "source-1", assetId: uuid },
  });
  assert.equal(r.converted, 1);
  assert.deepEqual(r.value.facts[0].assetIds, [uuid, uuid]);
  assert.deepEqual(input.facts[0].assetIds, ["S1-I001", uuid]);
  assert.throws(
    () =>
      resolveMediaAliases(
        { facts: [{ sourceId: "source-2", assetIds: ["S1-I001"] }] },
        { "S1-I001": { sourceId: "source-1", assetId: uuid } },
      ),
    /不属于/,
  );
  assert.throws(
    () =>
      resolveMediaAliases(
        { facts: [{ sourceId: "source-1", assetIds: ["S1-I002"] }] },
        { "S1-I001": { sourceId: "source-1", assetId: uuid } },
      ),
    /未知素材编号/,
  );
});
