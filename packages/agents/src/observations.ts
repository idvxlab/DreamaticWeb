import type { RunEvent } from "./contracts.js";

/** Bounded local business-output excerpts; never pass thinking blocks or arbitrary tool arguments here. */
export function businessOutput(events: RunEvent[], text: string) {
  const keys = [
    process.env.DREAMATIC_API_KEY,
    process.env.DREAMATIC_ANALYST_API_KEY,
    process.env.DREAMATIC_DESIGNER_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.ANTHROPIC_API_KEY,
  ].filter((key): key is string => Boolean(key));
  let clean = text;
  for (const key of keys) clean = clean.split(key).join("[REDACTED]");
  const preview = clean.slice(0, 8000);
  let remaining = 64000 - preview.length;
  // Retain newest excerpts; preserve metadata for evicted older ones.
  for (const event of [...events].reverse()) {
    const previous = event.details?.businessOutput;
    if (typeof previous !== "string") continue;
    if (previous.length > remaining) {
      delete event.details!.businessOutput;
      event.details!.outputOmitted = true;
    } else remaining -= previous.length;
  }
  return {
    businessOutput: preview,
    outputCharacters: text.length,
    outputTruncated: clean.length > preview.length,
  };
}
