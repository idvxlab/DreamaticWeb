import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { projectDir } from "./store.js";
import type { Source } from "../../../packages/agents/src/contracts.js";
const CHUNK = 16000;
// Full, bounded extraction is separate from the small project/UI summary.
export async function persistExtraction(source: Source, projectId?: string) {
  if (projectId) {
    const dir = path.join(projectDir(projectId), "sources", source.id);
    await mkdir(path.join(dir, "text"), { recursive: true });
    await mkdir(path.join(dir, "tables"), { recursive: true });
    const text = source.text.slice(0, 8000000);
    if (text.length < source.text.length)
      source.warnings.push("完整文本超过 8,000,000 字符，已达到提取存储上限");
    const chunks = Math.ceil(text.length / CHUNK);
    for (let i = 0; i < chunks; i++)
      await writeFile(
        path.join(dir, "text", i + ".json"),
        JSON.stringify(text.slice(i * CHUNK, (i + 1) * CHUNK)),
        { mode: 0o600 },
      );
    let cells = 0,
      tableCharacters = 0;
    const tables = source.tables.slice(0, 100).map((table, index) => {
      const rows: unknown[][] = [];
      for (const row of table.rows) {
        const rowSize = JSON.stringify(row.slice(0, 200)).length;
        if (cells + row.length > 100000 || tableCharacters + rowSize > 8000000)
          break;
        tableCharacters += rowSize;
        rows.push(
          row
            .slice(0, 200)
            .map((cell) =>
              typeof cell === "string" ? cell.slice(0, 4000) : cell,
            ),
        );
        cells += row.length;
      }
      if (
        rows.length !== table.rows.length ||
        table.rows.some(
          (r) =>
            r.length > 200 ||
            r.some((cell) => typeof cell === "string" && cell.length > 4000),
        )
      )
        source.warnings.push(`${table.name}: 完整表格达到存储上限，请拆分材料`);
      return { index, name: table.name, rows };
    });
    if (source.tables.length > 100)
      source.warnings.push("完整表格只保留前 100 张");
    for (const table of tables)
      await writeFile(
        path.join(dir, "tables", table.index + ".json"),
        JSON.stringify(table),
        { mode: 0o600 },
      );
    source.tables = tables.map(({ name, rows }) => ({ name, rows }));
    source.content = {
      textLength: text.length,
      textHash: createHash("sha256").update(text).digest("hex"),
      textTruncated: text.length < source.text.length,
      chunkSize: CHUNK,
      chunks,
      tables: tables.map(({ index, name, rows }) => ({
        index,
        name,
        rows: rows.length,
      })),
    };
    await writeFile(
      path.join(dir, "manifest.json"),
      JSON.stringify({ ...source.content, warnings: source.warnings }),
      { mode: 0o600 },
    );
  }
  if (source.text.length > 180000) {
    source.text = source.text.slice(0, 180000);
    source.warnings.push(
      projectId
        ? "项目摘要截断；可用 source_read/source_search 读取完整提取内容"
        : "文本超过 180,000 字符，已截断",
    );
  }
  source.tables = source.tables
    .slice(0, 100)
    .map((t) => ({ ...t, rows: t.rows.slice(0, 3000) }));
  return source;
}
export async function readSourceText(
  projectId: string,
  source: Source,
  offset: number,
  limit: number,
) {
  if (!source.content)
    return {
      text: source.text.slice(offset, offset + limit),
      total: source.text.length,
      legacySummaryOnly: true,
    };
  const { textLength, chunkSize } = source.content;
  const end = Math.min(textLength, offset + limit),
    parts: string[] = [];
  for (
    let i = Math.floor(offset / chunkSize);
    i < Math.ceil(end / chunkSize);
    i++
  ) {
    const chunk = JSON.parse(
      await readFile(
        path.join(
          projectDir(projectId),
          "sources",
          source.id,
          "text",
          i + ".json",
        ),
        "utf8",
      ),
    ) as string;
    parts.push(
      chunk.slice(
        Math.max(0, offset - i * chunkSize),
        Math.min(chunkSize, end - i * chunkSize),
      ),
    );
  }
  return { text: parts.join(""), total: textLength, legacySummaryOnly: false };
}
export async function readSourceTable(
  projectId: string,
  source: Source,
  index: number,
) {
  if (!source.content) {
    const table = source.tables[index];
    if (!table) throw new Error("Unknown table index");
    return table;
  }
  if (!source.content.tables.some((t) => t.index === index))
    throw new Error("Unknown table index");
  return JSON.parse(
    await readFile(
      path.join(
        projectDir(projectId),
        "sources",
        source.id,
        "tables",
        index + ".json",
      ),
      "utf8",
    ),
  ) as { name: string; rows: unknown[][] };
}
