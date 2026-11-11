import type { Analysis } from "../../../../packages/shared/generation.js";
import type { Source } from "../../../../packages/shared/project.js";

// Invalidate only Designer reuse when its input representation changes.
export const DESIGNER_CONTEXT_VERSION = "shared-fields-markdown-v2-key";
type Catalog = Pick<Source, "id" | "name" | "format" | "assets">[];
const cell = (value: unknown) =>
  JSON.stringify(value).replaceAll("|", "\\u007c");

function table(records: object[]) {
  if (!records.length) return "No rows.\n";
  // Contiguous groups retain order and distinguish absent optional fields.
  const groups: Record<string, unknown>[][] = [];
  let shape = "";
  for (const record of records) {
    const row = Object.fromEntries(
      Object.entries(record).filter(([, value]) => value !== undefined),
    );
    const nextShape = JSON.stringify(Object.keys(row));
    if (nextShape !== shape || !groups.length) {
      groups.push([]);
      shape = nextShape;
    }
    groups.at(-1)!.push(row);
  }
  return groups
    .map((rows) => {
      const keys = Object.keys(rows[0]);
      const shared = keys.filter(
        (key) =>
          !["id", "text", "name", "url"].includes(key) &&
          rows.every(
            (row) => JSON.stringify(row[key]) === JSON.stringify(rows[0][key]),
          ),
      );
      const defaults = Object.fromEntries(
        shared.map((key) => [key, rows[0][key]]),
      );
      const columns = keys.filter((key) => !shared.includes(key));
      return `Shared fields for every row: ${cell(defaults)}\n\n| ${columns.join(" | ")} |\n| ${columns.map(() => "---").join(" | ")} |\n${rows.map((row) => "| " + columns.map((key) => cell(row[key])).join(" | ") + " |").join("\n")}\n`;
    })
    .join("\n");
}

/** How many pictures one asset_view call shows (three contact sheets). */
export const KEY_CANDIDATES = 18;

/**
 * When a source offers more pictures than one look can show well, the harness marks the
 * likely key ones (no model call): pictures the prepared facts cite, in fact order, then the
 * largest; page backdrops and flat graphics come last. The Designer looks at these first.
 */
export function keyCandidates(analysis: Analysis, catalog: Catalog) {
  const images = catalog.flatMap((s) => s.assets).filter((a) => a.type === "image");
  if (images.length <= KEY_CANDIDATES) return new Set<string>();
  const cited = analysis.facts.flatMap((f) => f.assetIds || []);
  const rank = (a: (typeof images)[number]) => {
    const at = cited.indexOf(a.id);
    const weak = a.flags?.some((f) => f === "graphic" || f === "page-background");
    return [at < 0 ? 1 : 0, weak ? 1 : 0, at < 0 ? -((a.width || 0) * (a.height || 0)) : at];
  };
  const ordered = [...images].sort((a, b) => {
    const [x, y] = [rank(a), rank(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  return new Set(ordered.slice(0, KEY_CANDIDATES).map((a) => a.id));
}

/** A transient Designer view; canonical artifacts and all field values stay intact. */
export function designerContext(
  analysis: Analysis,
  catalog: Catalog,
  canonicalFacts: string,
) {
  const original = `${canonicalFacts}\n\n# Media catalog\n${JSON.stringify(catalog)}`;
  const facts = `# Information Facts\n\n## Summary\n${cell(analysis.summary)}\n\n## Facts\n${table(analysis.facts)}\n## Limitations\n${analysis.limitations.map((text) => "- " + cell(text)).join("\n")}\n\n`;
  const key = keyCandidates(analysis, catalog);
  const media =
    "# Media catalog\n\nAll rows below retain the original IDs and exact media URLs. Shared fields apply to each row in that table." +
    (key.size
      ? ` Rows with key: true are the ${key.size} likely key pictures (cited by the facts, then the largest): look at them first.`
      : "") +
    "\n\n" +
    catalog
      .map(
        (source) =>
          `## Source\n${cell({ id: source.id, name: source.name, format: source.format })}\n\n${table(source.assets.map((a) => (key.has(a.id) ? { ...a, key: true } : a)))}`,
      )
      .join("\n");
  const compact = facts + media;
  return compact.length < original.length ? compact : original;
}
