import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { projectDir } from "./store.js";
import type { Source } from "../../../packages/shared/project.js";
import {
  readingMarkdown,
  type StructuredExtraction,
} from "./document-structure.js";
const MAX = 8000000;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** Tables are derived solely from the canonical Markdown; no independent cell store. */
export function markdownTables(markdown: string) {
  const $ = cheerio.load(markdown, { xmlMode: false });
  return $("table[data-source-table]")
    .toArray()
    .map((node, index) => {
      if ($(node).attr("data-source-table") !== String(index))
        throw new Error("Invalid Markdown table index");
      const name = JSON.parse($(node).attr("data-name") || "null");
      if (typeof name !== "string")
        throw new Error("Invalid Markdown table name");
      const rows = $(node)
        .find("tr")
        .toArray()
        .map((row) =>
          $(row)
            .children("td")
            .toArray()
            .map((cell) => JSON.parse($(cell).text())),
        );
      return { name, rows };
    });
}

export async function persistExtraction(
  source: Source,
  projectId?: string,
  structured?: StructuredExtraction,
) {
  if ((source.text?.length ?? 0) > MAX || structured?.truncated)
    throw new Error(
      "Markdown conversion incomplete; split and reimport this source",
    );
  const sourceTables = structured?.tables ?? source.tables;
  if (
    sourceTables.length > 100 ||
    sourceTables.reduce(
      (n, t) => n + t.rows.reduce((sum, r) => sum + r.length, 0),
      0,
    ) > 100000
  )
    throw new Error(
      "Markdown table limit exceeded; split and reimport this source",
    );
  // Normalize exactly as JSON storage does, including sparse/undefined cells.
  const tables = JSON.parse(JSON.stringify(sourceTables)) as Source["tables"];
  const reading = readingMarkdown(
    source.text ?? "",
    structured?.blocks || [],
    tables,
  );
  if (source.assets.length) {
    // Canonical Markdown directly names every usable original/extracted media URL.
    reading.markdown +=
      "\n\n## Media assets\n\n" +
      source.assets
        .map(
          (a) =>
            `- [${a.name.replace(/[\[\]\n\r]/g, " ")}](${a.url}) · ${a.type} · ${a.mime} · id:${a.id}`,
        )
        .join("\n") +
      "\n";
  }
  if (
    reading.truncated ||
    reading.markdown.length > MAX ||
    (!reading.markdown.trim() && !source.assets.length)
  )
    throw new Error(
      "Markdown conversion incomplete; split and reimport this source",
    );
  // Round trip every typed cell/name before committing the canonical artifact.
  const decoded = markdownTables(reading.markdown);
  if (JSON.stringify(decoded) !== JSON.stringify(tables))
    throw new Error("Markdown table round-trip validation failed");
  source.content = {
    readingFormat: "markdown-v2",
    readingHash: digest(reading.markdown),
    readingComplete: true,
    markdownLength: reading.markdown.length,
    tables: decoded.map((t, index) => ({
      index,
      name: t.name,
      rows: t.rows.length,
    })),
  };
  // This is a Markdown preview, never a plain-text extraction summary.
  source.markdown = reading.markdown.slice(0, 180000);
  delete source.text;
  source.tables = decoded.map((t) => ({ ...t, rows: t.rows.slice(0, 3000) }));
  if (projectId) {
    const dir = path.join(projectDir(projectId), "sources", source.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "reading.md"), reading.markdown, {
      mode: 0o600,
    });
    await writeFile(
      path.join(dir, "manifest.json"),
      JSON.stringify({ ...source.content, warnings: source.warnings }),
      { mode: 0o600 },
    );
    // Only this freshly persisted source is cleaned; old sources require reimport.
    for (const obsolete of [
      "text",
      "tables",
      "raw-text.json",
      "structure.json",
    ])
      await rm(path.join(dir, obsolete), { recursive: true, force: true });
  }
  return source;
}

type CanonicalDocument = {
  markdown: string;
  hash: string;
  tables?: ReturnType<typeof markdownTables>;
};
// Weak keys release finished projects; entries contain only verified data, never previews.
const documents = new WeakMap<
  Source,
  { key: string; value: Promise<CanonicalDocument> }
>();
export async function readCanonicalSource(projectId: string, source: Source) {
  const content = source.content;
  if (content?.readingFormat !== "markdown-v2")
    throw new Error(
      "This older source has no canonical Markdown document; reimport it before running agents",
    );
  if (
    !content.readingComplete ||
    !content.readingHash ||
    !Number.isInteger(content.markdownLength)
  )
    throw new Error(
      `Markdown integrity check failed for ${source.name}; reimport the source before running agents`,
    );
  const filename = path.join(
    projectDir(projectId),
    "sources",
    source.id,
    "reading.md",
  );
  const file = await stat(filename, { bigint: true });
  const key = [
    filename,
    file.ino,
    file.size,
    file.mtimeNs,
    file.ctimeNs,
    content.readingFormat,
    content.readingComplete,
    content.readingHash,
    content.markdownLength,
  ].join(":");
  const cached = documents.get(source);
  if (cached?.key === key) return cached.value;
  // Reject oversized files before allocating the complete UTF-8 buffer.
  if (file.size > BigInt(MAX * 4))
    throw new Error("Markdown file exceeds storage limit");
  const value = (async (): Promise<CanonicalDocument> => {
    const markdown = await readFile(filename, "utf8");
    const hash = digest(markdown);
    if (
      markdown.length > MAX ||
      markdown.length !== content.markdownLength ||
      hash !== content.readingHash
    )
      throw new Error(
        `Markdown integrity check failed for ${source.name}; reimport the source before running agents`,
      );
    return { markdown, hash };
  })();
  documents.set(source, { key, value });
  return value;
}
export async function readSourceMarkdown(
  projectId: string,
  source: Source,
  offset: number,
  limit: number,
) {
  const { markdown, hash } = await readCanonicalSource(projectId, source);
  return {
    markdown: markdown.slice(offset, offset + limit),
    sourceHash: hash,
    total: markdown.length,
    nextOffset: Math.min(markdown.length, offset + limit),
    instruction:
      "All offsets and sourceHash refer to this canonical Markdown (zero-based UTF-16, end exclusive). Read only needed remaining ranges. Media links resolve to the project asset catalog. Tables retain typed cells in this same Markdown.",
  };
}
export async function readSourceTable(
  projectId: string,
  source: Source,
  index: number,
) {
  const document = await readCanonicalSource(projectId, source);
  document.tables ??= markdownTables(document.markdown);
  const table = document.tables[index];
  if (!table) throw new Error("Unknown Markdown table index");
  // Tool consumers cannot mutate the shared verified cache.
  return structuredClone(table);
}
