import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  structureDocument,
  readingMarkdown,
} from "../apps/server/src/document-structure.js";
import {
  persistExtraction,
  readSourceMarkdown,
} from "../apps/server/src/source-content.js";
import { create, projectDir, removeProject } from "../apps/server/src/store.js";
import type { OfficeContentNode } from "officeparser";

test("structure keeps paragraph and list boundaries, table placeholders, page geometry", () => {
  const nodes: OfficeContentNode[] = [
    {
      type: "page",
      metadata: { pageNumber: 2 },
      children: [
        { type: "heading", text: "Title", metadata: { level: 2 } },
        {
          type: "paragraph",
          text: "First paragraph.\r\n\r\n\r\nSecond paragraph.",
          bounds: { x: 10, y: 20, width: 100, height: 20 },
          notes: [{ type: "note", text: "Important qualifier" }],
        },
        {
          type: "table",
          children: [
            {
              type: "row",
              children: [
                { type: "cell", text: "A" },
                { type: "cell", text: "B" },
              ],
            },
          ],
        },
        {
          type: "list",
          children: [
            { type: "paragraph", text: "One" },
            { type: "paragraph", text: "Two" },
          ],
        },
      ],
    },
  ];
  const result = structureDocument(nodes);
  assert.match(result.text, /Important qualifier/);
  assert.match(result.text, /First paragraph\.\n\nSecond paragraph\./);
  assert.match(result.text, /\[Table 1\]/);
  assert.doesNotMatch(result.text, /A\tB/);
  assert.equal(result.blocks.find((b) => b.kind === "table")?.tableIndex, 0);
  const heading = result.blocks.find((b) => b.kind === "heading")!;
  assert.equal(result.text.slice(heading.start, heading.end), "Title");
  assert.equal(result.blocks.find((b) => b.bounds)?.page, 2);
  const md = readingMarkdown(result.text, result.blocks, [
    {
      name: "Measurements",
      rows: [
        ["<name>", "Value"],
        ["a|b", false],
        ["x", 0],
      ],
    },
  ]);
  assert.match(md.markdown, /## Title/);
  assert.match(md.markdown, /- One/);
  assert.match(md.markdown, /&lt;name&gt;/);
  assert.match(md.markdown, /<td>false<\/td>/);
  assert.match(md.markdown, /<td>0<\/td>/);
  assert.match(md.markdown, /block:heading/);
});

test("Only Markdown is persisted and ranges read the canonical document", async () => {
  const p = await create();
  try {
    const structured = structureDocument([
      { type: "heading", text: "Heading" },
      { type: "paragraph", text: "Exact supported source claim." },
    ]);
    const source = await persistExtraction(
      {
        id: crypto.randomUUID(),
        name: "doc.docx",
        format: "docx",
        text: structured.text,
        tables: [],
        assets: [],
        warnings: [],
        provenance: "test",
      },
      p.id,
      structured,
    );
    p.sources.push(source);
    const dir = path.join(projectDir(p.id), "sources", source.id);
    assert.deepEqual((await readdir(dir)).sort(), [
      "manifest.json",
      "reading.md",
    ]);
    assert.equal(source.text, undefined);
    const markdown = await readSourceMarkdown(p.id, source, 0, 16000);
    assert.match(markdown.markdown, /# Heading/);
    assert.match(markdown.instruction, /canonical Markdown/);
    const start = markdown.markdown.indexOf("Exact supported source claim.");
    const para = { start, end: start + "Exact supported source claim.".length };
    const raw = await readSourceMarkdown(
      p.id,
      source,
      para.start,
      para.end - para.start,
    );
    assert.equal(raw.markdown, "Exact supported source claim.");
    await assert.rejects(
      () => readSourceMarkdown(p.id, { ...source, content: undefined }, 0, 100),
      /older source/,
    );
  } finally {
    await removeProject(p.id);
  }
});

test("repeated explicit page margins are flagged rather than discarded", () => {
  const s = structureDocument(
    [1, 2, 3].map((pageNumber) => ({
      type: "page",
      metadata: { pageNumber },
      children: [
        { type: "header", text: "Brand" },
        { type: "paragraph", text: `Content ${pageNumber}` },
      ],
    })) as OfficeContentNode[],
  );
  assert.equal(s.blocks.filter((b) => b.repeatedMargin).length, 3);
  assert.equal(s.text.match(/Brand/g)?.length, 3);
});

test("Markdown rejects invalid mappings and damaged or incomplete artifacts, and is the default read", async () => {
  assert.throws(
    () => readingMarkdown("abc", [{ kind: "paragraph", start: 0, end: 4 }], []),
    /mapping/,
  );
  assert.throws(
    () =>
      readingMarkdown(
        "[Table 1]",
        [{ kind: "table", start: 0, end: 9, tableIndex: 0 }],
        [],
      ),
    /matching table/,
  );
  const p = await create();
  try {
    const source = await persistExtraction(
      {
        id: crypto.randomUUID(),
        name: "cells.csv",
        format: "csv",
        text: "",
        tables: [{ name: "cells", rows: [["unique-cell", 0]] }],
        assets: [],
        warnings: [],
        provenance: "test",
      },
      p.id,
    );
    p.sources.push(source);
    const data = await readSourceMarkdown(p.id, source, 0, 16000);
    assert.equal(data.markdown.match(/unique-cell/g)?.length, 1);
    await writeFile(
      path.join(projectDir(p.id), "sources", source.id, "reading.md"),
      "tampered",
    );
    await assert.rejects(
      () => readSourceMarkdown(p.id, source, 0, 100),
      /integrity/,
    );
    source.content!.readingComplete = false;
    await assert.rejects(
      () => readSourceMarkdown(p.id, source, 0, 100),
      /integrity/,
    );
  } finally {
    await removeProject(p.id);
  }
});

test("Markdown is the sole authority for typed cells and citations; UI caches and old files never override it", async () => {
  const p = await create();
  try {
    const values = [
      'a\r\nb\n<>&"|_',
      0,
      false,
      null,
      { formula: "SUM(A1:A2)", result: 3 },
      [1, "two"],
      "",
    ];
    const source = await persistExtraction(
      {
        id: crypto.randomUUID(),
        name: "typed.xlsx",
        format: "xlsx",
        text: "",
        tables: [{ name: 'Sheet "<>&\n1', rows: [values, []] }],
        assets: [],
        warnings: [],
        provenance: "test",
      },
      p.id,
    );
    p.sources.push(source);
    const { readSourceTable } =
      await import("../apps/server/src/source-content.js");
    const { markdown } = await readSourceMarkdown(p.id, source, 0, 8000000);
    source.text = "conflicting legacy text";
    source.markdown = "corrupt display preview";
    source.tables = [{ name: "wrong", rows: [[999]] }];
    assert.deepEqual((await readSourceTable(p.id, source, 0)).rows, [
      values,
      [],
    ]);
    await assert.rejects(
      () =>
        readSourceMarkdown(
          p.id,
          {
            ...source,
            content: { ...source.content!, readingFormat: "markdown-v1" },
          },
          0,
          10,
        ),
      /older source/,
    );
    await writeFile(
      path.join(projectDir(p.id), "sources", source.id, "reading.md"),
      markdown.replace("SUM", "BAD"),
    );
    await assert.rejects(() => readSourceTable(p.id, source, 0), /integrity/);
  } finally {
    await removeProject(p.id);
  }
});

test("incomplete or empty conversion does not publish a canonical document", async () => {
  const p = await create();
  try {
    const source = {
      id: crypto.randomUUID(),
      name: "empty.txt",
      format: "txt",
      text: "",
      tables: [],
      assets: [],
      warnings: [],
      provenance: "test",
    };
    await assert.rejects(() => persistExtraction(source, p.id), /incomplete/);
    const structured = structureDocument([
      { type: "paragraph", text: "Readable" },
    ]);
    structured.truncated = true;
    await assert.rejects(
      () =>
        persistExtraction({ ...source, text: "Readable" }, p.id, structured),
      /incomplete/,
    );
    await assert.rejects(
      () =>
        readFile(
          path.join(projectDir(p.id), "sources", source.id, "reading.md"),
        ),
      /ENOENT/,
    );
  } finally {
    await removeProject(p.id);
  }
});
