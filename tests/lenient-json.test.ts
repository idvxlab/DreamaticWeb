import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  lenientArgs,
  lenientList,
} from "../apps/server/src/generation/lenient-json.js";

test("a list sent as a JSON string is read, repairing stray quotes inside its text", () => {
  const facts = [{ id: "a", text: "平台", sourceId: "s", assetIds: [] }];
  assert.deepEqual(lenientList(JSON.stringify(facts)), facts);
  const broken = '[{"id":"a","text":"构建一站式"产学研"平台","sourceId":"s","assetIds":[]}]';
  assert.deepEqual(lenientList(broken), [{ id: "a", text: "构建一站式“产学研”平台", sourceId: "s", assetIds: [] }]);
  assert.deepEqual(lenientList(facts), facts, "a real list passes through");
  assert.equal(lenientList("not a list"), "not a list", "anything else is left for validation");
});

test("a facts string that swallowed the following fields gives back both lists", () => {
  const facts = [{ id: "a", text: "参数 [1] 与 {注}", sourceId: "s", assetIds: [] }];
  const limitations = ["图片未查验"];
  const tail = JSON.stringify(facts) + ', "limitations": ' + JSON.stringify(limitations);
  for (const value of ["\n" + tail + "}\n", tail + "}]"]) {
    const out = lenientArgs({ summary: "x", facts: value }, ["facts", "limitations"]);
    assert.deepEqual(out.facts, facts);
    assert.deepEqual(out.limitations, limitations);
    assert.equal(out.summary, "x");
  }
  const sent = lenientArgs({ facts: tail + "}", limitations: ["own"] }, ["facts", "limitations"]);
  assert.deepEqual(sent.limitations, ["own"], "a field sent on its own wins");
  assert.equal(lenientArgs({ facts: "[broken" }, ["facts"]).facts, "[broken");
});
