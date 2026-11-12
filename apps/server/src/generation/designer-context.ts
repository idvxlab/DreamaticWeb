import type { Analysis } from "../../../../packages/shared/generation.js";
import type { Source } from "../../../../packages/shared/project.js";

// Invalidate only Designer reuse when its input representation changes.
export const DESIGNER_CONTEXT_VERSION = "shared-fields-markdown-v2-offered-media";
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

/** A transient Designer view; canonical artifacts and all field values stay intact. */
export function designerContext(
  analysis: Analysis,
  catalog: Catalog,
  canonicalFacts: string,
) {
  const original = `${canonicalFacts}\n\n# Media catalog\n${JSON.stringify(catalog)}`;
  const facts = `# Information Facts\n\n## Summary\n${cell(analysis.summary)}\n\n## Facts\n${table(analysis.facts)}\n## Limitations\n${analysis.limitations.map((text) => "- " + cell(text)).join("\n")}\n\n`;
  const media =
    "# Media catalog\n\nAll rows below retain the original IDs and exact media URLs. Shared fields apply to each row in that table.\n\n" +
    catalog
      .map(
        (source) =>
          `## Source\n${cell({ id: source.id, name: source.name, format: source.format })}\n\n${table(source.assets)}`,
      )
      .join("\n");
  const compact = facts + media;
  return compact.length < original.length ? compact : original;
}
