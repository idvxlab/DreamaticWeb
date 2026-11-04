import test from "node:test";
import assert from "node:assert/strict";
import type { OfficeContentNode } from "officeparser";
import type { Asset } from "../packages/shared/project.js";
import {
  documentMediaAssociations,
  canonicalMediaAssociations,
} from "../apps/server/src/document-media.js";

const asset = (name: string): Asset => ({
  id: crypto.randomUUID(),
  name,
  type: "image",
  mime: "image/png",
  url: `/assets/${crypto.randomUUID()}/${crypto.randomUUID()}.png`,
});
const text = (value: string, x: number, y: number): OfficeContentNode => ({
  type: "text",
  text: value,
  bounds: { x, y, width: 100, height: 20 },
});
const image = (name: string, x: number, y: number): OfficeContentNode => ({
  type: "image",
  metadata: { attachmentName: name },
  bounds: { x, y, width: 120, height: 80 },
});

test("A3 separates columns and horizontal caption regions without classifying photos", () => {
  const assets = ["left.png", "right.png", "curve.png", "decoration.png"].map(
    asset,
  );
  const result = documentMediaAssociations(
    [
      {
        type: "page",
        metadata: { pageNumber: 4, pageWidth: 1000, pageHeight: 720 },
        children: [
          text("PERFORMANCE INDEX - AA-RF63", 50, 90),
          text("PERFORMANCE INDEX - AA-RF73", 550, 90),
          image("left.png", 250, 170),
          image("right.png", 750, 170),
          text("应用场景", 550, 451),
          text("性能曲线", 741, 451),
          image("curve.png", 737, 483),
        ],
      },
    ],
    assets,
  );
  assert.equal(result.entries[0].section, "AA-RF63");
  assert.equal(result.entries[1].section, "AA-RF73");
  assert.equal(result.entries[2].placement, "性能曲线");
  assert.equal(result.entries[3].section, undefined);
  assert.equal(result.entries[3].placement, "未定位");
  assert.match(result.markdown, /类别未识别/);
  assert.doesNotMatch(result.markdown, /实物照片|尺寸图/);
  assert.match(canonicalMediaAssociations(result.markdown), /AA-RF73/);
  assert.equal(
    canonicalMediaAssociations("old source without generated associations"),
    "",
  );
});

test("portrait and missing geometry retain captions/pages without guessing two-column membership", () => {
  const a = asset("caption.png");
  const captioned: OfficeContentNode = {
    type: "image",
    metadata: {
      attachmentName: a.name,
      altText: "Original caption [not a model label]",
    },
  };
  const result = documentMediaAssociations(
    [
      {
        type: "page",
        metadata: { pageNumber: 2, pageWidth: 600, pageHeight: 800 },
        children: [text("PERFORMANCE INDEX - AA-RF63", 50, 90), captioned],
      },
    ],
    [a],
  );
  assert.equal(result.entries[0].section, undefined);
  assert.equal(result.entries[0].page, 2);
  assert.equal(
    result.entries[0].caption,
    "Original caption [not a model label]",
  );
  assert.match(result.markdown, /原文图注\/alt/);
  assert.equal(documentMediaAssociations([], [a]).markdown, "");
});

test("deduplicated media keep distinct page occurrences through attachment aliases", () => {
  const a = asset("original.png");
  const result = documentMediaAssociations(
    [1, 2].map((pageNumber) => ({
      type: "page",
      metadata: { pageNumber },
      children: [image(`alias-${pageNumber}.png`, 0, 0)],
    })),
    [a],
    new Map([
      ["alias-1.png", a],
      ["alias-2.png", a],
    ]),
  );
  assert.deepEqual(
    result.entries.map((entry) => [entry.assetId, entry.page]),
    [
      [a.id, 1],
      [a.id, 2],
    ],
  );
});
