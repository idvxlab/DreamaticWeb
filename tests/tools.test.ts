import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  create,
  save,
  projectDir,
  removeProject,
} from "../apps/server/src/store.js";
import { extract } from "../apps/server/src/extract.js";
import { projectTools } from "../packages/agents/src/tools.js";
import {
  patchPage,
  readCandidate,
  validatePage,
} from "../packages/agents/src/pages.js";
import { previewPage } from "../apps/server/src/page-preview.js";
const invoke = async (
  tools: ReturnType<typeof projectTools>,
  name: string,
  input: unknown,
) => {
  const tool = tools.find((t) => t.name === name);
  assert.ok(tool, name);
  const result = await tool.execute("test", input as never);
  return {
    data: JSON.parse(
      result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join(""),
    ),
    content: result.content,
  };
};
test("project tools allow more than 48 calls by default and respect configured limits and cancellation", async () => {
  const p = await create();
  const name = "DREAMATIC_AGENT_MAX_TOOL_CALLS";
  const before = process.env[name];
  try {
    delete process.env[name];
    const controller = new AbortController();
    const tools = projectTools(p, "analyst", {
      vision: false,
      signal: controller.signal,
    });
    for (let i = 0; i < 60; i++) {
      await invoke(tools, "project_context_read", { section: "brief" });
    }
    controller.abort();
    await assert.rejects(
      () => invoke(tools, "project_context_read", { section: "brief" }),
      /abort/i,
    );
    process.env[name] = "2";
    const limited = projectTools(p, "analyst", { vision: false });
    for (let i = 0; i < 2; i++) {
      await invoke(limited, "project_context_read", { section: "brief" });
    }
    await assert.rejects(
      () => invoke(limited, "project_context_read", { section: "brief" }),
      /call budget exhausted/,
    );
  } finally {
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
    await removeProject(p.id);
  }
});
test("source tools read beyond UI truncation, locate boundary matches, scope IDs, and paginate context", async () => {
  const p = await create();
  try {
    const text =
      "a".repeat(15998) +
      "BOUNDARY" +
      "z".repeat(190000) +
      "TARGET product-900";
    p.sources.push(await extract(Buffer.from(text), "large.txt", p.id));
    await save(p);
    assert.equal(p.sources[0].text.length, 180000);
    assert.equal(p.sources[0].content?.textLength, text.length);
    const unicode = await extract(
      Buffer.from("x".repeat(15999) + "🌿产品"),
      "unicode.txt",
      p.id,
    );
    p.sources.push(unicode);
    const tools = projectTools(p, "analyst", { vision: false });
    const tail = await invoke(tools, "source_read", {
      sourceId: p.sources[0].id,
      offset: 200000,
      limit: 10000,
    });
    assert.match(tail.data.text, /product-900/);
    assert.equal(tail.data.total, text.length);
    const unicodeRead = await invoke(tools, "source_read", {
      sourceId: unicode.id,
      offset: 15999,
      limit: 4,
    });
    assert.equal(unicodeRead.data.text, "🌿产品");
    const hit = await invoke(tools, "source_search", { query: "BOUNDARY" });
    assert.equal(hit.data.hits[0].start, 15998);
    const foundEvidence = hit.data.hits[0].evidence;
    assert.equal(foundEvidence.start, hit.data.hits[0].quoteStart);
    assert.equal(
      foundEvidence.end - foundEvidence.start,
      foundEvidence.quote.length,
    );
    assert.equal(foundEvidence.quote, hit.data.hits[0].quote);
    assert.match(foundEvidence.sourceHash, /^[a-f0-9]{64}$/);
    assert.notEqual(
      foundEvidence.start,
      hit.data.hits[0].start,
      "legacy keyword coordinates differ from ready-to-submit excerpt",
    );
    assert.ok(
      tail.data.evidence.every(
        (e: any) =>
          e.quote.length <= 4000 && e.end - e.start === e.quote.length,
      ),
    );
    assert.equal(
      tail.data.evidence.map((e: any) => e.quote).join(""),
      tail.data.text,
    );
    assert.equal(unicodeRead.data.evidence[0].quote, "🌿产品");
    const end = await invoke(tools, "source_search", { query: "TARGET" });
    assert.ok(end.data.hits[0].start > 180000);
    await assert.rejects(() =>
      invoke(tools, "source_read", { sourceId: crypto.randomUUID() }),
    );
    p.messages = Array.from({ length: 30 }, (_, i) => ({
      role: "user" as const,
      text: "request " + i,
      time: "",
    }));
    const context = await invoke(tools, "project_context_read", {
      section: "conversation",
      offset: 0,
      limit: 3,
    });
    assert.equal(context.data.messages.length, 3);
    assert.equal(context.data.messages[0].text, "request 0");
    assert.ok(
      !projectTools(p, "orchestrator", { vision: false }).some(
        (t) => t.name === "page_patch",
      ),
    );
    assert.ok(
      !projectTools(p, "designer", { vision: false }).some(
        (t) => t.name === "table_query",
      ),
    );
    await assert.rejects(() =>
      invoke(tools, "project_context_read", { section: "page" }),
    );
  } finally {
    await removeProject(p.id);
  }
});
test("table query operates beyond summary rows, preserves original locations and rejects nonnumeric values", async () => {
  const p = await create();
  try {
    const csv =
      "Item,Amount\n" +
      Array.from(
        { length: 3100 },
        (_, i) => `Item${i},${i === 3099 ? 500 : i === 3098 ? "unknown" : 1}`,
      ).join("\n");
    p.sources.push(await extract(Buffer.from(csv), "data.csv", p.id));
    await save(p);
    assert.equal(p.sources[0].tables[0].rows.length, 3000);
    const tools = projectTools(p, "analyst", { vision: false });
    const result = await invoke(tools, "table_query", {
      sourceId: p.sources[0].id,
      filters: [{ column: 1, op: "gt", value: 400 }],
      aggregate: { operation: "sum", column: 1 },
    });
    assert.equal(result.data.matchedRows, 1);
    assert.equal(result.data.rows[0].row, 3100);
    assert.equal(result.data.aggregate.value, 500);
    const all = await invoke(tools, "table_query", {
      sourceId: p.sources[0].id,
      aggregate: { operation: "sum", column: 1 },
      limit: 1,
    });
    assert.equal(all.data.aggregate.excludedNonNumeric, 1);
    assert.equal(all.data.aggregate.value, 3598);
    const rows = await invoke(tools, "source_read", {
      sourceId: p.sources[0].id,
      kind: "table",
      offset: 3099,
      limit: 2,
    });
    assert.equal(rows.data.rows[1].cells[1], "500");
  } finally {
    await removeProject(p.id);
  }
});
test("candidate patching is atomic, scoped, version checked and never overwrites saved pages", async () => {
  const p = await create();
  try {
    const version = {
      id: crypto.randomUUID(),
      html: '<html><head><title>Brand</title></head><body><h1 id="hero">Before</h1><p>Keep</p></body></html>',
      label: "manual",
      createdAt: "",
    };
    p.versions.push(version);
    await save(p);
    const result = await patchPage(p, {
      baseVersionId: version.id,
      operations: [{ selector: "#hero", action: "set_text", value: "After" }],
    });
    assert.equal(result.valid, true);
    assert.match((await readCandidate(p, result.candidateId)).html, /After/);
    assert.match(p.versions[0].html, /Before/);
    await assert.rejects(() =>
      patchPage(p, {
        baseVersionId: crypto.randomUUID(),
        operations: [{ selector: "#hero", action: "remove" }],
      }),
    );
    await assert.rejects(() =>
      patchPage(p, {
        baseVersionId: version.id,
        operations: [{ selector: "h1,p", action: "set_text", value: "Oops" }],
      }),
    );
    await assert.rejects(() =>
      patchPage(p, {
        baseVersionId: version.id,
        operations: [
          {
            selector: "#hero",
            action: "set_attribute",
            name: "onclick",
            value: "alert(1)",
          },
        ],
      }),
    );
    const other = await create();
    try {
      await assert.rejects(() => readCandidate(other, result.candidateId));
    } finally {
      await removeProject(other.id);
    }
    p.versions.push({ ...version, id: crypto.randomUUID() });
    await assert.rejects(() => readCandidate(p, result.candidateId));
  } finally {
    await removeProject(p.id);
  }
});
test("page validation reports actual anchors, duplicate IDs, foreign assets and sanitized content", async () => {
  const p = await create();
  try {
    const bad = await validatePage(
      p,
      `<html><body><h1 id="same">x</h1><p id="same">y</p><a href="#missing">link</a><img src="/assets/${crypto.randomUUID()}/${crypto.randomUUID()}.png"><script>alert(1)</script></body></html>`,
    );
    assert.equal(bad.valid, false);
    for (const code of [
      "duplicate_id",
      "anchor",
      "asset_scope",
      "removed_content",
    ])
      assert.ok(
        bad.issues.some((i) => i.code === code),
        code,
      );
    assert.doesNotMatch(bad.html, /<script/);
    assert.equal(
      (await validatePage(p, "<html><body></body></html>")).valid,
      false,
    );
  } finally {
    await removeProject(p.id);
  }
});
test("asset inspection scopes IDs and includes image content only for vision-capable models", async () => {
  const p = await create();
  try {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9JkAAAAASUVORK5CYII=",
      "base64",
    );
    p.sources.push(await extract(png, "logo.png", p.id));
    await save(p);
    const id = p.sources[0].assets[0].id;
    const visual = await invoke(
      projectTools(p, "designer", { vision: true }),
      "asset_inspect",
      { assetId: id },
    );
    assert.ok(visual.content.some((c) => c.type === "image"));
    assert.equal(visual.data.dimensions.width, 1);
    const text = await invoke(
      projectTools(p, "analyst", { vision: false }),
      "asset_inspect",
      { assetId: id },
    );
    assert.ok(!text.content.some((c) => c.type === "image"));
    await assert.rejects(() =>
      invoke(projectTools(p, "analyst", { vision: true }), "asset_inspect", {
        assetId: crypto.randomUUID(),
      }),
    );
  } finally {
    await removeProject(p.id);
  }
});
test("isolated browser preview reports overflow, serves project assets and saves screenshot without executing page scripts", async () => {
  const p = await create();
  try {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9JkAAAAASUVORK5CYII=",
      "base64",
    );
    p.sources.push(await extract(png, "logo.png", p.id));
    const html = `<html><head><title>Preview</title></head><body><h1>Safe</h1><img src="${p.sources[0].assets[0].url}"><div style="width:900px">wide</div><script>document.title='EXECUTED';fetch('http://127.0.0.1:4312/api/config')</script></body></html>`;
    const preview = await previewPage(p, html, { width: 390, height: 800 });
    assert.equal(preview.report.title, "Preview");
    assert.equal(preview.report.horizontalOverflow, true);
    assert.ok(Array.isArray(preview.report.textContrast.issues));
    assert.equal(preview.report.missingImages.length, 0);
    assert.ok(preview.png.length > 100);
    assert.ok(
      await readFile(path.join(projectDir(p.id), preview.report.screenshot)),
    );
    const tools = projectTools(p, "designer", { vision: true });
    const validated = await invoke(tools, "page_validate", { html });
    assert.equal(validated.data.valid, false);
    assert.ok(validated.data.issues.some((i: any) => i.code === "overflow"));
    const rendered = await invoke(tools, "page_preview", {
      candidateId: validated.data.candidateId,
      width: 390,
      height: 800,
    });
    assert.ok(rendered.content.some((c) => c.type === "image"));
    assert.equal(rendered.data.horizontalOverflow, true);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() =>
      previewPage(p, html, { width: 390, height: 800 }, controller.signal),
    );
  } finally {
    await removeProject(p.id);
  }
});

test("new-page candidates can be read and repaired without a saved base, while newer versions invalidate drafts", async () => {
  const p = await create();
  const operations = [
    { selector: "#copy", action: "set_style", name: "color", value: "#111" },
  ];
  try {
    const tools = projectTools(p, "designer", { vision: false });
    await assert.rejects(
      () => patchPage(p, { operations }),
      /No saved version/,
    );
    const initial = (
      await invoke(tools, "page_validate", {
        html: '<!doctype html><html><head><title>Draft</title></head><body style="background:white"><h1>Draft</h1><p id="copy" style="color:white">Readable after repair</p></body></html>',
      })
    ).data;
    assert.equal(initial.baseVersionId, "");
    const first = (
      await invoke(tools, "project_context_read", {
        section: "page",
        candidateId: initial.candidateId,
        limit: 50,
      })
    ).data;
    const rest = (
      await invoke(tools, "project_context_read", {
        section: "page",
        candidateId: initial.candidateId,
        offset: first.nextOffset,
      })
    ).data;
    assert.equal(
      first.html + rest.html,
      (await readCandidate(p, initial.candidateId)).html,
    );
    await assert.rejects(
      () =>
        invoke(tools, "project_context_read", {
          section: "page",
          candidateId: initial.candidateId,
          versionId: crypto.randomUUID(),
        }),
      /cannot be combined/,
    );
    await assert.rejects(
      () =>
        invoke(
          projectTools(p, "analyst", { vision: false }),
          "project_context_read",
          { section: "page", candidateId: initial.candidateId },
        ),
      /Only Designer/,
    );
    await invoke(tools, "page_preview", {
      candidateId: initial.candidateId,
      width: 390,
    });
    const rejected = (
      await invoke(tools, "page_validate", { candidateId: initial.candidateId })
    ).data;
    assert.equal(rejected.valid, false);
    assert.ok(rejected.issues.some((i: any) => i.code === "contrast"));
    const repaired = (
      await invoke(tools, "page_patch", {
        candidateId: initial.candidateId,
        operations,
      })
    ).data;
    assert.equal(repaired.baseVersionId, "");
    assert.equal(p.versions.length, 0, "patching must not save a version");
    assert.match(
      (await readCandidate(p, initial.candidateId)).html,
      /color:white/,
    );
    await invoke(tools, "page_preview", {
      candidateId: repaired.candidateId,
      width: 390,
    });
    const accepted = (
      await invoke(tools, "page_validate", {
        candidateId: repaired.candidateId,
      })
    ).data;
    assert.equal(accepted.valid, true);
    assert.ok(!accepted.issues.some((i: any) => i.code === "contrast"));
    await assert.rejects(
      () =>
        patchPage(p, {
          candidateId: repaired.candidateId,
          baseVersionId: crypto.randomUUID(),
          operations,
        }),
      /Stale baseVersionId/,
    );
    p.versions.push({
      id: crypto.randomUUID(),
      html: "new manual page",
      label: "manual",
      createdAt: "",
    });
    await assert.rejects(
      () => patchPage(p, { candidateId: repaired.candidateId, operations }),
      /Candidate is stale/,
    );
    await assert.rejects(
      () => patchPage(p, { operations }),
      /Missing baseVersionId/,
    );
  } finally {
    await removeProject(p.id);
  }
});
