import type { OfficeContentNode } from "officeparser";
export type ReadingBlock = {
  kind: string;
  start: number;
  end: number;
  page?: number;
  level?: number;
  tableIndex?: number;
  bounds?: { x: number; y: number; width: number; height: number };
  repeatedMargin?: boolean;
};
export type StructuredExtraction = {
  version: 1;
  engine: string;
  text: string;
  blocks: ReadingBlock[];
  tables: { name: string; rows: unknown[][] }[];
  truncated: boolean;
};
/** One traversal owns body/annotation order, table values and table indices. */
export function structureDocument(
  nodes: OfficeContentNode[],
  engine = "officeparser",
): StructuredExtraction {
  let text = "",
    truncated = false;
  const blocks: ReadingBlock[] = [];
  const tables: StructuredExtraction["tables"] = [];
  const clean = (value: string) =>
    value
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000b\u000e-\u001f]/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  const emit = (
    value: string,
    kind: string,
    page?: number,
    node?: OfficeContentNode,
    index?: number,
  ) => {
    const normalized = clean(value);
    if (!normalized) return;
    if (
      blocks.length >= 20000 ||
      text.length + normalized.length + 2 > 8000000
    ) {
      truncated = true;
      return;
    }
    if (text) text += "\n\n";
    const start = text.length;
    text += normalized;
    blocks.push({
      kind,
      start,
      end: text.length,
      page,
      tableIndex: index,
      level:
        node?.type === "heading"
          ? Math.max(1, Math.min(6, node.metadata?.level || 1))
          : undefined,
      bounds: node?.bounds,
    });
  };
  // Nested lists/tables are emitted separately; never flatten them into a parent's cell/text.
  const nodeText = (node: OfficeContentNode): string =>
    node.text ||
    (node.children || [])
      .filter((c) => c.type !== "table" && c.type !== "list")
      .map(
        (child, index) =>
          `${index && (child.type === "paragraph" || child.type === "heading") ? "\n" : ""}${nodeText(child)}`,
      )
      .join("");
  const annotations = (node: OfficeContentNode, page?: number) => {
    walk(node.notes || [], page);
    walk(node.comments || [], page);
  };
  // Inline descendants may own notes or nested structural content even when their
  // containing paragraph already supplies combined text. Visit only those extras.
  const extras = (items: OfficeContentNode[], page?: number) => {
    for (const node of items) {
      if (node.type === "table" || node.type === "list") walk([node], page);
      else {
        annotations(node, page);
        extras(node.children || [], page);
      }
    }
  };
  const walk = (
    items: OfficeContentNode[],
    page?: number,
    listItem = false,
  ) => {
    for (const node of items) {
      if (node.type === "page" || node.type === "slide") {
        const meta = node.metadata as
          { pageNumber?: number; slideNumber?: number } | undefined;
        const number = meta?.pageNumber ?? meta?.slideNumber;
        emit(
          number ? `[${node.type} ${number}]` : `[${node.type}]`,
          node.type,
          number,
        );
        walk(node.children || [], number);
        annotations(node, number);
      } else if (node.type === "list") {
        walk(node.children || [], page, true);
        annotations(node, page);
      } else if (node.type === "table") {
        const index = tables.length;
        tables.push({
          name: `Table ${index + 1}`,
          rows: (node.children || [])
            .filter((r) => r.type === "row")
            .map((r) =>
              (r.children || []).filter((c) => c.type === "cell").map(nodeText),
            ),
        });
        emit(`[Table ${index + 1}]`, "table", page, node, index);
        extras(node.children || [], page);
        annotations(node, page);
      } else if (
        node.type === "paragraph" ||
        node.type === "heading" ||
        !node.children?.length
      ) {
        emit(nodeText(node), listItem ? "list-item" : node.type, page, node);
        extras(node.children || [], page);
        annotations(node, page);
      } else {
        walk(node.children, page, listItem);
        annotations(node, page);
      }
    }
  };
  walk(nodes);
  const margins = new Map<string, ReadingBlock[]>();
  for (const block of blocks)
    if (block.kind === "header" || block.kind === "footer") {
      const key = block.kind + ":" + text.slice(block.start, block.end);
      margins.set(key, [...(margins.get(key) || []), block]);
    }
  for (const group of margins.values())
    if (group.length >= 3)
      for (const block of group) block.repeatedMargin = true;
  return { version: 1, engine, text, blocks, tables, truncated };
}

/** Generate the sole canonical evidence document locally. */
export function readingMarkdown(
  text: string,
  blocks: ReadingBlock[],
  tables: { name: string; rows: unknown[][] }[],
) {
  const escapeHtml = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const escape = (value: unknown) =>
    escapeHtml(value).replace(/([\\`*_[\]{}#+!|])/g, "\\$1");
  // JSON cell bodies preserve original types, whitespace, formulas and nested values.
  // The table tools decode these directly from this Markdown, never a sidecar.
  const cellText = (value: unknown) =>
    escapeHtml(JSON.stringify(value ?? null));
  const tableOpen = (table: { name: string }, index: number) =>
    `<table data-source-table="${index}" data-name="${escapeHtml(JSON.stringify(table.name)).replace(/"/g, "&quot;")}">`;
  let chars = 0,
    truncated = false;
  const parts: string[] = [];
  const append = (value: string) => {
    if (chars + value.length > 8000000) {
      truncated = true;
      return false;
    }
    parts.push(value);
    chars += value.length + 2;
    return true;
  };
  let previousEnd = 0;
  for (const b of blocks) {
    if (
      !Number.isInteger(b.start) ||
      !Number.isInteger(b.end) ||
      b.start < previousEnd ||
      b.end < b.start ||
      b.end > text.length
    )
      throw new Error("Invalid Markdown source mapping");
    if (text.slice(previousEnd, b.start).trim())
      append(escape(text.slice(previousEnd, b.start)));
    previousEnd = b.end;
    if (
      b.kind === "table" &&
      (b.tableIndex === undefined || !tables[b.tableIndex])
    )
      throw new Error("Markdown table mapping has no matching table");
    if (!append(`<!-- block:${b.kind}${b.page ? ` page:${b.page}` : ""} -->`))
      break;
    const content = text.slice(b.start, b.end);
    if (b.kind === "table" && b.tableIndex !== undefined) {
      const table = tables[b.tableIndex];
      if (
        !append(
          `### ${escape(table?.name || `Table ${b.tableIndex + 1}`)} (tableIndex ${b.tableIndex})`,
        )
      )
        break;
      if (table) {
        // No assumption that row zero is a semantic header; HTML preserves all rows equally.
        if (!append(tableOpen(table, b.tableIndex))) break;
        for (const row of table.rows) {
          if (
            !append(
              "<tr>" +
                row.map((cell) => `<td>${cellText(cell)}</td>`).join("") +
                "</tr>",
            )
          )
            break;
        }
        append("</table>");
      }
    } else if (
      !append(
        b.kind === "heading"
          ? `${"#".repeat(b.level || 1)} ${escape(content)}`
          : b.kind === "page" || b.kind === "slide"
            ? `## ${escape(content)}`
            : b.kind === "list-item"
              ? `- ${escape(content)}`
              : escape(content),
      )
    )
      break;
    if (truncated) break;
  }
  const covered = blocks.at(-1)?.end || 0;
  if (covered < text.length) append(escape(text.slice(covered)));
  // Formats handled by other parsers may not expose positional table blocks.
  const represented = new Set(blocks.map((b) => b.tableIndex));
  for (const [index, table] of tables.entries()) {
    if (represented.has(index) || truncated) continue;
    if (!append(`### ${escape(table.name)} (tableIndex ${index})`)) break;
    if (!append(tableOpen(table, index))) break;
    for (const row of table.rows)
      if (
        !append(
          "<tr>" +
            row.map((cell) => `<td>${cellText(cell)}</td>`).join("") +
            "</tr>",
        )
      )
        break;
    append("</table>");
  }
  return { markdown: parts.join("\n\n"), truncated };
}
