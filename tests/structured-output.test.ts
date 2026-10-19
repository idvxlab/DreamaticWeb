import test from "node:test";
import assert from "node:assert/strict";
import {
  parseJSON,
  OutputFormatError,
} from "../packages/agents/src/structured-output.js";

test("structured result recovery accepts one whole JSON value with explanatory text or fences", () => {
  const value = {
    summary: 'Quoted "text", {literal braces}, \\slash',
    facts: [{ text: "Evidence" }],
    data: [1, { ok: true }],
  };
  const json = JSON.stringify(value);
  for (const text of [
    json,
    `\uFEFF${json}`,
    `Now I have all the evidence.\n${json}`,
    `Notes before\n\x60\x60\x60json\n${json}\n\x60\x60\x60\nFinished.`,
    `\x60\x60\x60JSON\n${json}\n\x60\x60\x60`,
  ])
    assert.deepEqual(parseJSON(text), value);
});

test("structured result recovery rejects ambiguous, incomplete and invalid JSON without guessing", () => {
  for (const text of [
    "Now I have all the evidence, but no result.",
    'First {"a":1} second {"a":2}',
    'Now {"outer":{"valid":true}',
    'Now {"value":"unterminated}',
    'Now {"a":1',
    'Result {"a":1} followed by {"b":',
    'Result {"a": [1,2}}',
    "Result {'a':1}",
    '{"a":1,}',
    "x".repeat(2500001),
  ])
    assert.throws(() => parseJSON(text), OutputFormatError, text.slice(0, 100));
});
