import test from "node:test";
import assert from "node:assert/strict";
import type { Analysis } from "../packages/shared/generation.js";
import type { Asset } from "../packages/shared/project.js";
import { factsMarkdown } from "../apps/server/src/generation/artifacts.js";
import { designerContext } from "../apps/server/src/generation/designer-context.js";

// Decode the transmitted table cells, including the documented shared fields.
function rows(markdown: string) {
  const result: Record<string, unknown>[] = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const prefix = "Shared fields for every row: ";
    if (!lines[i].startsWith(prefix)) continue;
    const shared = JSON.parse(lines[i].slice(prefix.length));
    i += 2;
    const columns = lines[i].slice(2, -2).split(" | ");
    i += 2;
    for (; lines[i]?.startsWith("| "); i++) {
      const values = lines[i]
        .slice(2, -2)
        .split(" | ")
        .map((value) => JSON.parse(value));
      result.push({
        ...shared,
        ...Object.fromEntries(columns.map((key, n) => [key, values[n]])),
      });
    }
  }
  return result;
}
const withoutKey = (records: Record<string, unknown>[]) =>
  records.map(({ key: _key, ...record }) => record);
const sourceId = "11111111-1111-4111-8111-111111111111";
function fixture() {
  const facts: Analysis = {
    summary: "Synthetic product comparison",
    facts: Array.from({ length: 30 }, (_, i) => ({
      id: `fact-${i}`,
      text: `Model ${i}: 87% only in case A | measured at 20 °C.\nRated ≠ measured. "Quoted" \\ literal.`,
      sourceId,
      assetIds: [`22222222-2222-4222-8222-${String(i).padStart(12, "0")}`],
    })),
    limitations: ["No independent validation | not a company-wide guarantee."],
  };
  const assets: Asset[] = Array.from({ length: 30 }, (_, i) => ({
    id: `22222222-2222-4222-8222-${String(i).padStart(12, "0")}`,
    name: `Frame ${i} | detail.png`,
    type: "image",
    mime: "image/png",
    url: `/assets/${sourceId}/${i}.png`,
    width: 300 + i,
    height: 200 + i,
  }));
  return {
    facts,
    catalog: [
      { id: sourceId, name: "Synthetic source", format: "pdf", assets },
    ],
  };
}

test("compact Designer input retains exact facts, conditions, IDs, URLs and metadata", () => {
  const { facts, catalog } = fixture();
  const before = JSON.stringify({ facts, catalog });
  const original = `${factsMarkdown(facts)}\n\n# Media catalog\n${JSON.stringify(catalog)}`;
  const output = designerContext(facts, catalog, factsMarkdown(facts));
  assert.ok(output.length < original.length);
  const [factView, mediaView] = output.split("# Media catalog");
  assert.deepEqual(rows(factView), facts.facts);
  const media = rows(mediaView);
  // More pictures than one look shows: the facts' cited pictures, in fact order, are marked key.
  assert.deepEqual(
    media.filter((row) => row.key).map((row) => row.id),
    catalog[0].assets.slice(0, 18).map((asset) => asset.id),
  );
  assert.deepEqual(withoutKey(media), catalog[0].assets);
  assert.ok(factView.includes(JSON.stringify(facts.summary)));
  assert.ok(
    factView.includes(
      JSON.stringify(facts.limitations[0]).replaceAll("|", "\\u007c"),
    ),
  );
  assert.equal(JSON.stringify({ facts, catalog }), before);
  assert.equal(designerContext(facts, catalog, factsMarkdown(facts)), output);
});

test("mixed optional asset fields and source boundaries preserve presence and order", () => {
  const { facts, catalog } = fixture();
  const source = catalog[0];
  source.assets.splice(1, 0, {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Product demonstration.mp4",
    type: "video",
    mime: "video/mp4",
    url: "/assets/demo.mp4",
    width: undefined,
  });
  const second = {
    ...source,
    id: "second-source",
    assets: source.assets.slice(0, 2),
  };
  const output = designerContext(facts, [source, second], factsMarkdown(facts));
  const mediaView = output.split("# Media catalog")[1];
  assert.deepEqual(
    withoutKey(rows(mediaView)),
    JSON.parse(JSON.stringify([...source.assets, ...second.assets])),
  );
  assert.ok(mediaView.includes('"id":"second-source"'));
  assert.equal(Object.hasOwn(rows(mediaView)[1], "width"), false);
});

test("empty selected facts stay empty while the complete media catalog remains", () => {
  const { facts, catalog } = fixture();
  facts.facts = [];
  const output = designerContext(facts, catalog, factsMarkdown(facts));
  const [factView, mediaView] = output.split("# Media catalog");
  assert.deepEqual(rows(factView), []);
  assert.equal(rows(mediaView).length, catalog[0].assets.length);
  assert.ok(!factView.includes("fact-0"));
});

test("small contexts use the unchanged canonical representation when it is shorter", () => {
  const facts: Analysis = { summary: "Brief", facts: [], limitations: [] };
  const canonical = factsMarkdown(facts);
  assert.equal(
    designerContext(facts, [], canonical),
    `${canonical}\n\n# Media catalog\n[]`,
  );
});
