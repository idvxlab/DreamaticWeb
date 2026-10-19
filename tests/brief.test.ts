import test from "node:test";
import assert from "node:assert/strict";
import {
  budgetCell,
  handoffBriefSchema,
} from "../packages/agents/src/brief.js";

test("brief handoff normalizes legacy briefs and validates explicit media/scope choices", () => {
  const brief = handoffBriefSchema.parse({
    goal: "Website",
    custom: "preserve legacy extension",
  });
  assert.equal(brief.mediaPolicy, "relevant-images");
  assert.deepEqual(brief.preserve, []);
  assert.equal(brief.custom, "preserve legacy extension");
  assert.equal(
    handoffBriefSchema.parse({
      goal: "Text website",
      scope: "revise",
      mediaPolicy: "text-only",
    }).mediaPolicy,
    "text-only",
  );
  assert.throws(() =>
    handoffBriefSchema.parse({ goal: "Website", mediaPolicy: "anything" }),
  );
  assert.throws(() => handoffBriefSchema.parse({}));
});

test("table context keeps original JSON types and clearly marks truncated values", () => {
  for (const value of [
    42,
    0,
    false,
    true,
    null,
    "42",
    { result: 42 },
    [1, 2],
  ]) {
    assert.deepEqual(budgetCell(value, 1000).value, value);
  }
  const cell = budgetCell("x".repeat(3000), 100);
  assert.equal((cell.value as any).truncated, true);
  assert.ok(cell.size > (cell.value as any).preview.length);
  assert.match((cell.value as any).instruction, /not citation evidence/);
  assert.equal((budgetCell("something", 0).value as any).preview, "");
});
