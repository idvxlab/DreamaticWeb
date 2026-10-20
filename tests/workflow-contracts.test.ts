import test from "node:test";
import assert from "node:assert/strict";
import { create, removeProject } from "../apps/server/src/store.js";
import { validatePage, saveCandidate } from "../packages/agents/src/pages.js";
import { projectTools } from "../packages/agents/src/tools.js";
import { htmlHash, pageChecks } from "../packages/agents/src/page-checks.js";
import { boundedInput } from "../packages/agents/src/input.js";
import {
  submissionBriefSchema,
  handoffBriefSchema,
} from "../packages/agents/src/brief.js";
import { toolFailureSummary } from "../packages/agents/src/tool-errors.js";
import { checkRoleTools, roles } from "../packages/agents/src/roles.js";
import { stageFingerprint } from "../packages/agents/src/checkpoints.js";
import { extract } from "../apps/server/src/extract.js";
import { projectDir } from "../apps/server/src/store.js";
import { rm } from "node:fs/promises";
import path from "node:path";

const html =
  "<html><body><h1>Heading</h1><p>Readable content</p></body></html>";
test("new brief submissions are strict; old brief migration remains explicit", () => {
  assert.throws(() => submissionBriefSchema.parse({ goal: "Website" }));
  assert.throws(() =>
    submissionBriefSchema.parse({
      ...handoffBriefSchema.parse({ goal: "Website" }),
      audience: " ",
      language: "en",
    }),
  );
  const valid = {
    ...handoffBriefSchema.parse({ goal: "Website" }),
    audience: "People",
    language: "en",
  };
  assert.equal(submissionBriefSchema.parse(valid).scope, "create");
  assert.throws(() =>
    submissionBriefSchema.parse({ ...valid, unexpected: "field" }),
  );
  checkRoleTools("designer", roles.designer.tools, roles.designer.tools);
  assert.throws(() =>
    checkRoleTools("analyst", roles.analyst.tools, ["page_patch"]),
  );
});

test("serialized input budget includes metadata; trimming is explicit and never mutates stored data", () => {
  const input = {
    conversation: [{ text: "old".repeat(2000) }, { text: "latest request" }],
    existingHtml: "<html>" + "x".repeat(70000),
    sources: [
      {
        id: "s",
        markdown: "x".repeat(90000),
        markdownCoverage: { end: 90000, complete: true },
        tables: [{ index: 0, name: "Sheet", rows: 100 }],
      },
    ],
  };
  assert.throws(
    () => boundedInput({ sources: [{ text: "must never be sent" }] }),
    /canonical Markdown/,
  );
  const before = structuredClone(input);
  const result = boundedInput(input, 12000);
  assert.ok(result.length <= 12000);
  const parsed = JSON.parse(result);
  assert.equal(parsed.inputCoverage.complete, false);
  assert.equal(parsed.sources[0].markdownCoverage.complete, false);
  assert.equal(parsed.conversation.at(-1).text, "latest request");
  assert.deepEqual(input, before);
  const repair = JSON.parse(
    boundedInput(
      { originalInput: input, invalidOutput: "x".repeat(30000) },
      16000,
    ),
  );
  assert.equal(repair.outputWasClipped, true);
  assert.equal(repair.originalInput.inputCoverage.complete, false);
  assert.throws(
    () => boundedInput({ required: "x".repeat(2000) }, 1000),
    /budget/,
  );
});

test("page tools and final validation share image policy; data images cannot bypass text-only", async () => {
  const p = await create();
  try {
    p.brief = handoffBriefSchema.parse({
      goal: "Text website",
      mediaPolicy: "text-only",
    });
    for (const body of [
      '<img src="data:image/png;base64,YQ==" alt="x">',
      '<div style="background-image:url(data:image/png;base64,YQ==)">Content</div>',
      "<video controls></video>",
      "<div style=\"background:image-set('data:image/png;base64,YQ==' 1x)\">Content</div>",
    ]) {
      const source = html.replace("</body>", body + "</body>");
      const report = await validatePage(p, source);
      assert.equal(report.valid, false);
      assert.ok(report.issues.some((i) => i.code === "media_policy"));
      const tool = projectTools(p, "designer", { vision: false }).find(
        (t) => t.name === "page_validate",
      )!;
      const result = await tool.execute("id", { html: source } as never);
      const data = JSON.parse((result.content[0] as any).text);
      assert.equal(data.valid, report.valid);
      assert.deepEqual(data.issues, report.issues);
    }
  } finally {
    await removeProject(p.id);
  }
});

test("preview checks are bound to exact sanitized content and report viewports without stale claims", async () => {
  const p = await create();
  try {
    const clean = (await validatePage(p, html)).html;
    p.pagePreviews = [
      {
        hash: htmlHash(clean),
        width: 390,
        height: 900,
        overflow: false,
        missingImages: [],
        contrast: [{ selector: "p", ratio: 1, required: 4.5 }],
      },
    ];
    const checked = await validatePage(p, clean);
    assert.equal(checked.valid, false);
    assert.ok(checked.issues.some((i) => i.code === "contrast"));
    assert.equal(pageChecks(p, clean, []).status, "warnings");
    const revised = clean.replace("Readable content", "Changed content");
    assert.equal(pageChecks(p, revised, []).status, "not-previewed");
    assert.equal((await validatePage(p, revised)).valid, true);
    assert.equal(pageChecks(p, clean, []).viewports[0].width, 390);
  } finally {
    await removeProject(p.id);
  }
});

test("tool error summaries never retain HTML, arguments or secrets", () => {
  const error = {
    content: [
      {
        type: "text",
        text: 'Validation failed for tool page_validate\nReceived arguments:\n{"html":"<html>SECRET_KEY</html>"}',
      },
    ],
  };
  const summary = toolFailureSummary(error);
  assert.equal(summary.category, "arguments_schema");
  assert.doesNotMatch(
    JSON.stringify(summary),
    /SECRET_KEY|<html>|Received arguments/,
  );
});

test("role configuration fingerprints invalidate downstream work but not credential rotations or execution limits", async () => {
  const p = await create();
  const before = { ...process.env };
  try {
    p.run = { id: "run", inputHash: "input", checkpoints: {} };
    const first = await stageFingerprint(p, "designer", []);
    process.env.DREAMATIC_API_KEY = "rotated-secret";
    process.env.DREAMATIC_AGENT_MAX_TURNS = "123";
    assert.equal(await stageFingerprint(p, "designer", []), first);
    process.env.DREAMATIC_DESIGNER_MODEL = "different-model";
    assert.notEqual(await stageFingerprint(p, "designer", []), first);
  } finally {
    for (const key of [
      "DREAMATIC_API_KEY",
      "DREAMATIC_AGENT_MAX_TURNS",
      "DREAMATIC_DESIGNER_MODEL",
    ]) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
    await removeProject(p.id);
  }
});

test("compact Markdown reads provide exact evidence from the validated canonical document", async () => {
  const p = await create();
  try {
    const source = await extract(
      Buffer.from("Company report " + "x".repeat(18000)),
      "range.txt",
      p.id,
    );
    p.sources.push(source);

    const tool = projectTools(p, "analyst", { vision: false }).find(
      (t) => t.name === "source_read",
    )!;
    const result = await tool.execute("range", {
      kind: "text",
      sourceId: source.id,
      offset: 0,
      limit: 14,
      compact: true,
    } as never);
    const data = JSON.parse((result.content[0] as any).text);
    assert.equal(data.text, undefined);
    assert.equal(data.evidence[0].quote, "Company report");
    assert.equal(data.evidence[0].sourceHash, source.content?.readingHash);
    assert.equal(data.evidence[0].end, 14);
  } finally {
    await removeProject(p.id);
  }
});

test("evidence failures are not misclassified as argument validation; missing bases differ from conflicts", () => {
  const summary = (text: string) =>
    toolFailureSummary({ content: [{ type: "text", text }] });
  assert.equal(
    summary(
      'Evidence quote/cell validation failed: [{"code":"quote_not_found"}]',
    ).category,
    "evidence",
  );
  assert.equal(
    summary("No saved version: create a candidate").category,
    "no_saved_version",
  );
  assert.equal(
    summary("Missing baseVersionId: read version identity").category,
    "missing_base_version",
  );
  assert.equal(
    summary("Stale baseVersionId: saved page changed").category,
    "version_conflict",
  );
  assert.equal(
    summary(
      "Validation failed for tool page_patch\n - baseVersionId: invalid_format",
    ).category,
    "arguments_schema",
  );
});

test("schema errors mentioning evidence remain schema errors; evidence summaries expose only safe paths", () => {
  const summary = (text: string) =>
    toolFailureSummary({ content: [{ type: "text", text }] });
  assert.equal(
    summary("Validation failed: facts[2].evidence: invalid_type").category,
    "arguments_schema",
  );
  const evidence = summary(
    'Evidence quote/cell validation failed: [{"factIndex":2,"code":"quote_not_found","quote":"PRIVATE"}]',
  );
  assert.equal(evidence.fields, "facts[2].evidence");
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE/);
});
