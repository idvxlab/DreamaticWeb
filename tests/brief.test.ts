import test from "node:test";
import assert from "node:assert/strict";
import { handoffBriefSchema } from "../packages/agents/src/brief.js";

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
