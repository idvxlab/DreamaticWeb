import test from "node:test";
import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { create, removeProject, projectDir } from "../apps/server/src/store.js";
import { extract } from "../apps/server/src/extract.js";
import {
  EvidenceValidationError,
  sourceSnapshots,
  textEvidence,
  validateFactEvidence,
} from "../packages/agents/src/evidence.js";

const citation = (quote: string, start = 0) => ({
  kind: "text" as const,
  start,
  end: start + quote.length,
  quote,
});

test("local relocation reads canonical Markdown, preserves UTF-16 and audits unchanged facts", async () => {
  const p = await create();
  try {
    const quote = "🌿公司年度报告说明实际收入为100万元。";
    const original = "a".repeat(15995) + quote + "z".repeat(180000);
    const source = await extract(Buffer.from(original), "report.txt", p.id);
    p.sources.push(source);
    const fact = {
      text: "实际收入为100万元",
      sourceId: source.id,
      evidence: citation(quote, 900000),
    };
    const result = await validateFactEvidence(p, [fact]);
    assert.equal(result.facts[0].evidence?.kind, "text");
    assert.deepEqual(result.facts[0].evidence, {
      ...citation(quote, 15995),
      sourceHash: (await sourceSnapshots(p.id)(source)).hash,
    });
    assert.equal(result.facts[0].text, fact.text);
    assert.equal(fact.evidence.start, 900000, "input is not mutated");
    assert.equal(result.evidenceRepairs[0].method, "exact-relocation");
    assert.deepEqual(result.evidenceRepairs[0].before, fact.evidence);
    const repeated = await validateFactEvidence(p, result.facts);
    assert.equal(
      repeated.evidenceRepairs.length,
      0,
      "revalidation is idempotent",
    );
  } finally {
    await removeProject(p.id);
  }
});

test("only CRLF/LF is normalized; reconstructed ranges point to the exact original text", async () => {
  const p = await create();
  try {
    const original = "🌿前言\r\n公司年度报告：\r\n实际收入为100万元。\r\n结束";
    const source = await extract(Buffer.from(original), "lines.txt", p.id);
    p.sources.push(source);
    const quote = "公司年度报告：\n实际收入为100万元。";
    const result = await validateFactEvidence(p, [
      { text: "收入", sourceId: source.id, evidence: citation(quote) },
    ]);
    const evidence = result.facts[0].evidence!;
    assert.equal(evidence.kind, "text");
    if (evidence.kind !== "text") return;
    assert.equal(original.slice(evidence.start, evidence.end), evidence.quote);
    assert.equal(evidence.start, original.indexOf("公司"));
    assert.equal(evidence.quote, quote.replace(/\n/g, "\r\n"));
    assert.equal(result.evidenceRepairs[0].method, "line-endings");
  } finally {
    await removeProject(p.id);
  }
});

test("ambiguous, short, numeric, substantive, legacy, stale and table problems are batched without changing evidence", async () => {
  const p = await create();
  try {
    const duplicate = "公司年度报告说明实际收入为100万元。";
    const line = "公司年度报告说明\n实际收入为100万元。";
    const source = await extract(
      Buffer.from(
        `${duplicate}\n${duplicate}\n${line}\n${line.replace("\n", "\r\n")}\n12345678901234567890\n产品 A 100\nCafé 公司年度实际收入为100万元。`,
      ),
      "ambiguous.txt",
      p.id,
    );
    const legacy = { ...source, id: crypto.randomUUID(), content: undefined };
    const table = await extract(
      Buffer.from("名称,金额\n甲,100\n乙,100"),
      "table.csv",
      p.id,
    );
    p.sources.push(source, legacy, table);
    const facts = [
      {
        text: "重复",
        sourceId: source.id,
        evidence: citation(duplicate, 999999),
      },
      {
        text: "换行重复",
        sourceId: source.id,
        evidence: citation(line, 999999),
      },
      {
        text: "数字",
        sourceId: source.id,
        evidence: citation("12345678901234567890", 999999),
      },
      {
        text: "短引用",
        sourceId: source.id,
        evidence: citation("产品 A", 999999),
      },
      {
        text: "改了数字",
        sourceId: source.id,
        evidence: citation(duplicate.replace("100", "200"), 999999),
      },
      {
        text: "摘要",
        sourceId: legacy.id,
        evidence: citation(duplicate, 999999),
      },
      {
        text: "来源变化",
        sourceId: source.id,
        evidence: { ...citation(duplicate), sourceHash: "0".repeat(64) },
      },
      {
        text: "错误来源",
        sourceId: crypto.randomUUID(),
        evidence: citation(duplicate),
      },
      {
        text: "类型错误",
        sourceId: table.id,
        evidence: {
          kind: "cell" as const,
          tableIndex: 0,
          row: 1,
          column: 1,
          value: 100,
        },
      },
      {
        text: "表不存在",
        sourceId: table.id,
        evidence: {
          kind: "cell" as const,
          tableIndex: 999,
          row: 1,
          column: 1,
          value: "100",
        },
      },
      {
        text: "不得折叠空格",
        sourceId: source.id,
        evidence: citation("公司年度报告说明实际收入 为100万元。", 999999),
      },
      {
        text: "不规范化Unicode",
        sourceId: source.id,
        evidence: citation("Cafe\u0301 公司年度实际收入为100万元。", 999999),
      },
    ];
    const before = structuredClone(facts);
    await assert.rejects(
      () => validateFactEvidence(p, facts),
      (error: unknown) => {
        assert.ok(error instanceof EvidenceValidationError);
        assert.equal(error.issues.length, facts.length);
        assert.deepEqual(
          error.issues.map((i) => i.factIndex),
          facts.map((_, i) => i),
        );
        assert.deepEqual(
          error.issues.map((i) => i.code),
          [
            "ambiguous_quote",
            "ambiguous_quote",
            "short_quote",
            "short_quote",
            "quote_not_found",
            "source_unavailable",
            "stale_source",
            "unknown_source",
            "cell_mismatch",
            "table_unavailable",
            "quote_not_found",
            "quote_not_found",
          ],
        );
        return true;
      },
    );
    assert.deepEqual(facts, before);
  } finally {
    await removeProject(p.id);
  }
});

test("already correct short quotes and cells verify location only, while absent evidence stays unverified", async () => {
  const p = await create();
  try {
    const source = await extract(
      Buffer.from("名称,金额\n甲,100"),
      "cells.csv",
      p.id,
    );
    p.sources.push(source);
    const result = await validateFactEvidence(p, [
      {
        text: "This interpretation is not certified",
        sourceId: source.id,
        evidence: citation("名称", source.markdown!.indexOf("名称")),
      },
      {
        text: "金额",
        sourceId: source.id,
        evidence: {
          kind: "cell",
          tableIndex: 0,
          row: 1,
          column: 1,
          value: "100",
        },
      },
      { text: "旧格式", sourceId: source.id },
    ]);
    assert.deepEqual(
      result.facts.map((f) => f.locationVerified),
      [true, true, false],
    );
    assert.equal(result.evidenceRepairs.length, 0);
  } finally {
    await removeProject(p.id);
  }
});

test("missing Markdown blocks repair rather than searching a partial snapshot; cancellation is honored", async () => {
  const p = await create();
  try {
    const source = await extract(
      Buffer.from("a".repeat(16000) + "公司年度报告说明实际收入为100万元。"),
      "missing.txt",
      p.id,
    );
    p.sources.push(source);
    await rm(path.join(projectDir(p.id), "sources", source.id, "reading.md"));
    await assert.rejects(
      () =>
        validateFactEvidence(p, [
          {
            text: "收入",
            sourceId: source.id,
            evidence: citation("公司年度报告说明实际收入为100万元。"),
          },
        ]),
      (e: unknown) =>
        e instanceof EvidenceValidationError &&
        e.issues[0].code === "source_unavailable",
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      () => validateFactEvidence(p, [], controller.signal),
      /abort/i,
    );
  } finally {
    await removeProject(p.id);
  }
});

test("source hashes reject changed text; repairs never cross sources or trust truncated extractions", async () => {
  const p = await create();
  try {
    const quote = "公司年度报告说明实际收入为100万元。";
    const source = await extract(Buffer.from(quote), "current.txt", p.id);
    const other = await extract(
      Buffer.from("另一份公司资料说明实际收入为200万元。"),
      "other.txt",
      p.id,
    );
    p.sources.push(source, other);
    const before = textEvidence(
      await sourceSnapshots(p.id)(source),
      0,
      quote.length,
    );
    // Replace a same-length stored extraction; stale checks must run even when
    // the old offset/quotation could otherwise be repaired.
    await writeFile(
      path.join(projectDir(p.id), "sources", source.id, "reading.md"),
      quote.replace("100", "200"),
    );
    await assert.rejects(
      () =>
        validateFactEvidence(p, [
          { text: "旧引用", sourceId: source.id, evidence: before },
          {
            text: "不跨来源",
            sourceId: other.id,
            evidence: citation(quote, 9000),
          },
        ]),
      (e: unknown) => {
        assert.ok(e instanceof EvidenceValidationError);
        assert.deepEqual(
          e.issues.map((i) => i.code),
          ["source_unavailable", "quote_not_found"],
        );
        return true;
      },
    );
    other.content!.readingComplete = false;
    await assert.rejects(
      () =>
        validateFactEvidence(p, [
          {
            text: "截断",
            sourceId: other.id,
            evidence: citation(other.markdown!, 9000),
          },
        ]),
      (e: unknown) =>
        e instanceof EvidenceValidationError &&
        e.issues[0].code === "source_unavailable",
    );
  } finally {
    await removeProject(p.id);
  }
});

test("overlapping quotations are ambiguous even when an ordinary non-overlapping scan finds one", async () => {
  const p = await create();
  try {
    const source = await extract(
      Buffer.from("a".repeat(13)),
      "overlap.txt",
      p.id,
    );
    p.sources.push(source);
    await assert.rejects(
      () =>
        validateFactEvidence(p, [
          {
            text: "重叠",
            sourceId: source.id,
            evidence: citation("a".repeat(12), 9999),
          },
        ]),
      (e: unknown) =>
        e instanceof EvidenceValidationError &&
        e.issues[0].code === "ambiguous_quote",
    );
  } finally {
    await removeProject(p.id);
  }
});
