import test from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { bindMediaLabels } from "../apps/server/src/generation/media-labels.js";
test("neutral label binding changes only owned image alternatives, preserving URLs and page content", () => {
  const r = bindMediaLabels(
    '<html><head><style>body{color:red}</style></head><body><h1>Product</h1><img src="/assets/owned.png" alt="Company team"><img src="/assets/other.png" alt="Other"><p>Existing text</p></body></html>',
    { "/assets/owned.png": '资料配图 " < &' },
  );
  const $ = cheerio.load(r.html);
  assert.equal($("img").first().attr("src"), "/assets/owned.png");
  assert.equal($("img").first().attr("alt"), '资料配图 " < &');
  assert.equal($("img").last().attr("alt"), "Other");
  assert.equal($("p").text(), "Existing text");
  assert.equal($("style").text(), "body{color:red}");
  assert.equal(r.updates.length, 1);
  assert.equal(r.updates[0].original, "Company team");
});
