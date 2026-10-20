import { z } from "zod";
import type { Project, Source } from "./contracts.js";
import {
  readCanonicalSource,
  readSourceTable,
} from "../../../apps/server/src/source-content.js";

export const evidenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    quote: z.string().min(1).max(4000),
    sourceHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  }),
  z.object({
    kind: z.literal("cell"),
    tableIndex: z.number().int().nonnegative(),
    row: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
    value: z.unknown(),
  }),
]);
type Evidence = z.infer<typeof evidenceSchema>;
type TextEvidence = Extract<Evidence, { kind: "text" }>;
type Fact = { text: string; sourceId: string; evidence?: Evidence };
export type SourceSnapshot = { text: string; hash: string; complete: boolean };

/** Share verified Markdown snapshots with reads and table tools. */
export function sourceSnapshots(projectId: string) {
  return async (source: Source): Promise<SourceSnapshot> => {
    const { markdown, hash } = await readCanonicalSource(projectId, source);
    return { text: markdown, hash, complete: true };
  };
}

export function textEvidence(
  snapshot: SourceSnapshot,
  start: number,
  end: number,
): TextEvidence {
  return {
    kind: "text",
    start,
    end,
    quote: snapshot.text.slice(start, end),
    sourceHash: snapshot.hash,
  };
}

type Issue = {
  factIndex: number;
  sourceId: string;
  code: string;
  reason: string;
};
export class EvidenceValidationError extends Error {
  constructor(public readonly issues: Issue[]) {
    super(
      `Evidence quote/cell validation failed: ${JSON.stringify(issues)}. Use tool-returned evidence; do not alter facts or remove evidence to bypass validation.`,
    );
    this.name = "EvidenceValidationError";
  }
}

function exactRange(text: string, evidence: TextEvidence) {
  return (
    evidence.end > evidence.start &&
    evidence.end <= text.length &&
    evidence.end - evidence.start <= 4000 &&
    text.slice(evidence.start, evidence.end) === evidence.quote
  );
}

function matches(text: string, quote: string) {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = quote
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(escape)
    .join("\\r?\\n");
  const regex = new RegExp(pattern, "gu");
  const found: { start: number; end: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    found.push({ start: match.index, end: match.index + match[0].length });
    if (found.length === 2) break;
    // Include overlapping occurrences when deciding uniqueness.
    regex.lastIndex =
      match.index + (text.codePointAt(match.index)! > 0xffff ? 2 : 1);
  }
  return found;
}

export async function validateFactEvidence<T extends Fact>(
  project: Project,
  facts: T[],
  signal?: AbortSignal,
) {
  const snapshotFor = sourceSnapshots(project.id);
  const tables = new Map<
    string,
    Promise<Awaited<ReturnType<typeof readSourceTable>>>
  >();
  const issues: Issue[] = [];
  const repaired: {
    factIndex: number;
    sourceId: string;
    method: "exact-relocation" | "line-endings";
    before: TextEvidence;
    after: TextEvidence;
  }[] = [];
  const checked: (T & { locationVerified: boolean })[] = [];
  for (const [factIndex, fact] of facts.entries()) {
    signal?.throwIfAborted();
    const source = project.sources.find((s) => s.id === fact.sourceId);
    const issue = (code: string, reason: string) =>
      issues.push({ factIndex, sourceId: fact.sourceId, code, reason });
    if (!source) {
      issue("unknown_source", "Unknown sourceId in this project");
      continue;
    }
    const evidence = fact.evidence;
    if (!evidence) {
      checked.push({ ...fact, locationVerified: false });
      continue;
    }
    if (evidence.kind === "cell") {
      const key = `${source.id}:${evidence.tableIndex}`;
      try {
        if (!tables.has(key))
          tables.set(
            key,
            readSourceTable(project.id, source, evidence.tableIndex),
          );
        const table = await tables.get(key)!;
        const row = table.rows[evidence.row];
        if (
          !row ||
          evidence.column >= row.length ||
          !Object.hasOwn(evidence, "value") ||
          JSON.stringify(row[evidence.column]) !==
            JSON.stringify(evidence.value)
        ) {
          issue(
            "cell_mismatch",
            `Cell ${evidence.tableIndex}/${evidence.row}/${evidence.column} does not match; cell coordinates/values are never auto-repaired`,
          );
          continue;
        }
      } catch {
        issue(
          "table_unavailable",
          `Cannot read table ${evidence.tableIndex}; verify its source and index`,
        );
        continue;
      }
      checked.push({ ...fact, locationVerified: true });
      continue;
    }
    let snapshot: SourceSnapshot;
    try {
      snapshot = await snapshotFor(source);
    } catch {
      issue(
        "source_unavailable",
        "Cannot read verified canonical Markdown; no relocation attempted",
      );
      continue;
    }
    if (evidence.sourceHash && evidence.sourceHash !== snapshot.hash) {
      issue(
        "stale_source",
        "Canonical Markdown changed since evidence was read; read this source again",
      );
      continue;
    }
    if (exactRange(snapshot.text, evidence)) {
      checked.push({ ...fact, locationVerified: true });
      continue;
    }
    if (!snapshot.complete) {
      issue(
        "incomplete_source",
        "Canonical Markdown is incomplete; cannot establish unique original location",
      );
      continue;
    }
    // Avoid relocating isolated numbers, labels and very short excerpts.
    if (
      [...evidence.quote.replace(/\s/gu, "")].length < 12 ||
      (evidence.quote.match(/\p{L}/gu)?.length ?? 0) < 4
    ) {
      issue(
        "short_quote",
        `Quote at [${evidence.start},${evidence.end}) is too short for automatic relocation; request a meaningful surrounding excerpt`,
      );
      continue;
    }
    // Include line-ending equivalents even if an exact occurrence exists elsewhere:
    // an exact match plus a CRLF equivalent is still ambiguous.
    const found = matches(snapshot.text, evidence.quote);
    if (found.length !== 1) {
      issue(
        found.length ? "ambiguous_quote" : "quote_not_found",
        `Quote at [${evidence.start},${evidence.end}) ${found.length ? "has multiple matching locations" : "does not occur in the source"}; no nearest-match or semantic replacement applied`,
      );
      continue;
    }
    const { start, end } = found[0];
    const after = textEvidence(snapshot, start, end);
    if (!exactRange(snapshot.text, after)) {
      issue(
        "invalid_repair_range",
        "Recovered range is invalid or exceeds 4000 UTF-16 units",
      );
      continue;
    }
    repaired.push({
      factIndex,
      sourceId: source.id,
      method:
        after.quote === evidence.quote ? "exact-relocation" : "line-endings",
      before: evidence,
      after,
    });
    checked.push({ ...fact, evidence: after, locationVerified: true });
  }
  signal?.throwIfAborted();
  if (issues.length) throw new EvidenceValidationError(issues);
  return { facts: checked, evidenceRepairs: repaired };
}
