import test from "node:test";
import assert from "node:assert/strict";
import { businessOutput } from "../packages/agents/src/observations.js";
import type { RunEvent } from "../packages/agents/src/contracts.js";

test("business excerpts redact configured keys, bound persisted text and retain metadata when older output is evicted", () => {
  const before = process.env.DREAMATIC_API_KEY;
  process.env.DREAMATIC_API_KEY = "PRIVATE_API_KEY";
  try {
    const redacted = businessOutput([], "result: PRIVATE_API_KEY");
    assert.doesNotMatch(redacted.businessOutput, /PRIVATE_API_KEY/);
    assert.match(redacted.businessOutput, /REDACTED/);
    const events: RunEvent[] = [];
    for (let i = 0; i < 12; i++)
      events.push({
        id: String(i),
        role: "analyst",
        kind: "status",
        time: "",
        text: "output",
        details: businessOutput(events, "x".repeat(9000)),
      });
    assert.ok(
      events.reduce(
        (n, e) => n + String(e.details?.businessOutput || "").length,
        0,
      ) <= 64000,
    );
    assert.equal(events[0].details?.outputOmitted, true);
    assert.equal(events[0].details?.outputCharacters, 9000);
    assert.equal(events.at(-1)!.details!.outputTruncated, true);
    assert.equal(String(events.at(-1)!.details!.businessOutput).length, 8000);
  } finally {
    if (before === undefined) delete process.env.DREAMATIC_API_KEY;
    else process.env.DREAMATIC_API_KEY = before;
  }
});
