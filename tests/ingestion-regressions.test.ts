import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, rename } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import type { OfficeContentNode } from "officeparser";
import { create, projectDir, removeProject } from "../apps/server/src/store.js";
import { structureDocument } from "../apps/server/src/document-structure.js";
import { structureHtml } from "../apps/server/src/html-structure.js";
import { extract } from "../apps/server/src/extract.js";
import {
  persistExtraction,
  readSourceMarkdown,
  readSourceTable,
  readCanonicalSource,
} from "../apps/server/src/source-content.js";

const table = (text: string): OfficeContentNode => ({
  type: "table",
  children: [{ type: "row", children: [{ type: "cell", text }] }],
});
test("one traversal retains list/inline annotations and indexes all annotation/body tables consistently", async () => {
  const structured = structureDocument([
    {
      type: "list",
      notes: [{ type: "note", text: "List note" }],
      comments: [table("List comment table")],
      children: [
        {
          type: "paragraph",
          text: "Main item",
          notes: [
            { type: "note", text: "Important limitation" },
            table("Item note table"),
          ],
          comments: [{ type: "comment", text: "Item comment" }],
          children: [
            {
              type: "text",
              text: "Main item",
              notes: [{ type: "note", text: "Inline note" }],
            },
          ],
        },
        {
          type: "list",
          children: [
            {
              type: "paragraph",
              text: "Nested item",
              comments: [{ type: "comment", text: "Nested comment" }],
            },
          ],
        },
      ],
    },
    table("Body table"),
    { type: "paragraph", text: "Body", notes: [table("Body note table")] },
  ]);
  for (const value of [
    "Main item",
    "Important limitation",
    "Item comment",
    "Inline note",
    "List note",
    "Nested item",
    "Nested comment",
  ])
    assert.equal(structured.text.split(value).length - 1, 1, value);
  assert.deepEqual(
    structured.tables.map((t) => t.rows[0][0]),
    ["Item note table", "List comment table", "Body table", "Body note table"],
  );
  assert.deepEqual(
    structured.blocks
      .filter((b) => b.kind === "table")
      .map((b) => b.tableIndex),
    [0, 1, 2, 3],
  );
  const p = await create();
  try {
    const source = await persistExtraction(
      {
        id: crypto.randomUUID(),
        name: "annotations.docx",
        format: "docx",
        text: structured.text,
        tables: structured.tables,
        assets: [],
        warnings: [],
        provenance: "test",
      },
      p.id,
      structured,
    );
    for (let i = 0; i < structured.tables.length; i++)
      assert.deepEqual(
        (await readSourceTable(p.id, source, i)).rows,
        structured.tables[i].rows,
      );
    assert.match(
      (await readSourceMarkdown(p.id, source, 0, 16000)).markdown,
      /Important limitation/,
    );
  } finally {
    await removeProject(p.id);
  }
});

const html = `<html><head><title>Example</title></head><body><nav>Navigation</nav><main>
<h1>Revenue</h1><p>2025 <strong>total</strong><br>Audited</p>
<ul><li>First item<ul><li>Nested item</li></ul></li><li>Second item</li></ul>
<table><caption>Measurements</caption><tr><th>Product</th><th>Value</th></tr><tr><td>UniqueProduct</td><td>100</td></tr></table>
<p>After table</p><script>secretExecutable()</script></main><footer>Footer</footer></body></html>`;
test("HTML uploads and website semantics preserve blocks and emit each table value once", async () => {
  const source = await extract(Buffer.from(html), "example.html");
  assert.match(source.markdown!, /# Revenue/);
  assert.match(source.markdown!, /2025 total\nAudited/);
  assert.match(source.markdown!, /- First item/);
  assert.match(source.markdown!, /- Nested item/);
  assert.match(source.markdown!, /After table/);
  assert.equal(source.markdown!.split("UniqueProduct").length - 1, 1);
  assert.deepEqual(source.tables[0].rows, [
    ["Product", "Value"],
    ["UniqueProduct", "100"],
  ]);
  assert.doesNotMatch(source.markdown!, /secretExecutable/);
  const { structured } = structureHtml(cheerio.load(html), true);
  assert.doesNotMatch(structured.text, /Navigation|Footer/);
  assert.equal(structured.tables.length, 1);
  const articles = structureHtml(
    cheerio.load(
      "<article><p>First article</p></article><article><p>Second article</p></article>",
    ),
    true,
  );
  assert.match(articles.structured.text, /First article/);
  assert.match(articles.structured.text, /Second article/);
});

test("HTML tables preserve nested tables separately and keep merged columns aligned", () => {
  const { structured, warnings } = structureHtml(
    cheerio.load(
      '<table><tr><td rowspan="2">Group</td><td>A</td></tr><tr><td>B</td></tr></table><table><tr><td>Outer<table><tr><td>Inner</td></tr></table></td></tr></table>',
    ),
  );
  assert.deepEqual(
    structured.tables.map((t) => t.rows),
    [
      [
        ["Group", "A"],
        ["", "B"],
      ],
      [["Outer"]],
      [["Inner"]],
    ],
  );
  assert.ok(warnings.length);
});

test("canonical table cache reuses verified parsing, isolates readers and invalidates on file/metadata changes", async () => {
  const p = await create();
  try {
    const source = await extract(
      Buffer.from("Name,Value\nProduct,100"),
      "cache.csv",
      p.id,
    );
    const doc = await readCanonicalSource(p.id, source);
    assert.equal(doc.tables, undefined);
    const first = await readSourceTable(p.id, source, 0);
    const parsed = doc.tables;
    assert.ok(parsed);
    first.rows[1][1] = "bad consumer mutation";
    assert.equal((await readSourceTable(p.id, source, 0)).rows[1][1], "100");
    assert.equal(
      (await readCanonicalSource(p.id, source)).tables,
      parsed,
      "unchanged file is parsed once",
    );
    const filename = path.join(
      projectDir(p.id),
      "sources",
      source.id,
      "reading.md",
    );
    await writeFile(filename + ".replacement", doc.markdown);
    await rename(filename + ".replacement", filename);
    const replaced = await readCanonicalSource(p.id, source);
    assert.notEqual(replaced, doc);
    assert.equal(replaced.tables, undefined);
    source.content!.readingHash = "0".repeat(64);
    await assert.rejects(() => readSourceTable(p.id, source, 0), /integrity/);
    source.content!.readingHash = doc.hash;
    assert.deepEqual((await readSourceTable(p.id, source, 0)).rows, [
      ["Name", "Value"],
      ["Product", "100"],
    ]);
    await writeFile(filename, doc.markdown.replace("100", "200"));
    await assert.rejects(() => readSourceTable(p.id, source, 0), /integrity/);
  } finally {
    await removeProject(p.id);
  }
});

test("structural text retains inline runs without inventing spaces and separates cell paragraphs", () => {
  const structured = structureDocument([
    {
      type: "paragraph",
      text: "",
      children: [
        { type: "text", text: "Long" },
        { type: "text", text: "word" },
      ],
    },
    {
      type: "table",
      children: [
        {
          type: "row",
          children: [
            {
              type: "cell",
              children: [
                { type: "paragraph", text: "First" },
                { type: "paragraph", text: "Second" },
              ],
            },
          ],
        },
      ],
    },
  ]);
  assert.match(structured.text, /Longword/);
  assert.deepEqual(structured.tables[0].rows, [["First\nSecond"]]);
});

test("URL import uses semantic HTML once and treats plain/JSON responses as literal data", async (t) => {
  const dns = (await import("node:dns/promises")).default;
  const http = (await import("node:http")).default;
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  const { extractUrl } = await import("../apps/server/src/extract.js");
  let body = html,
    contentType = "text/html",
    requests = 0;
  t.mock.method(dns, "lookup", async () => [
    { address: "93.184.216.34", family: 4 },
  ]);
  t.mock.method(http, "get", ((
    _url: unknown,
    _options: unknown,
    callback: Function,
  ) => {
    requests++;
    const request = Object.assign(new EventEmitter(), {
      setTimeout: () => request,
      destroy: (error: Error) => request.emit("error", error),
    });
    const response = Object.assign(new PassThrough(), {
      statusCode: 200,
      headers: { "content-type": contentType },
    });
    queueMicrotask(() => {
      callback(response);
      response.end(body);
    });
    return request;
  }) as unknown as typeof http.get);
  const website = await extractUrl("http://example.test/page");
  assert.match(website.markdown!, /# Revenue/);
  assert.equal(website.markdown!.split("UniqueProduct").length - 1, 1);
  assert.equal(website.tables.length, 1);
  contentType = "application/json";
  body = JSON.stringify({
    data: '<img src="http://example.test/should-not-fetch.png">literal',
  });
  const plain = await extractUrl("http://example.test/data");
  assert.match(plain.markdown!, /literal/);
  assert.equal(plain.assets.length, 0);
  assert.equal(
    requests,
    2,
    "data responses must not import apparent HTML assets",
  );
});
