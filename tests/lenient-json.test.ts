import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { lenientList } from "../apps/server/src/generation/lenient-json.js";

test("a list sent as a JSON string is read, repairing stray quotes inside its text", () => {
  const facts = [{ id: "a", text: "平台", sourceId: "s", assetIds: [] }];
  assert.deepEqual(lenientList(JSON.stringify(facts)), facts);
  const broken = '[{"id":"a","text":"构建一站式"产学研"平台","sourceId":"s","assetIds":[]}]';
  assert.deepEqual(lenientList(broken), [{ id: "a", text: "构建一站式“产学研”平台", sourceId: "s", assetIds: [] }]);
  assert.deepEqual(lenientList(facts), facts, "a real list passes through");
  assert.equal(lenientList("not a list"), "not a list", "anything else is left for validation");
});
