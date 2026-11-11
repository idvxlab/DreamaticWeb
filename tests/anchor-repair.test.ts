import test from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { repairAnchors } from "../apps/server/src/anchor-repair.js";

test("existing and empty anchors are returned exactly unchanged", () => {
  const page = `<html><body><a href="#existing">Existing</a><a href="#">Top</a><section id="existing"></section></body></html>`;
  const result = repairAnchors(page);
  assert.equal(result.html, page);
  assert.deepEqual(result.repaired, []);
});

test("a matching heading gives its section the missing target id", () => {
  const result = repairAnchors(
    `<html><body><a href="#services">服务</a><section><h2>技术服务流程</h2></section></body></html>`,
  );
  const $ = cheerio.load(result.html);
  assert.equal($("section").attr("id"), "services");
  assert.equal($("a").attr("href"), "#services");
  assert.deepEqual(result.repaired, ["#services → id on section"]);
});

test("a matching section id replaces the broken href", () => {
  const result = repairAnchors(
    `<html><body><a href="#services">服务</a><section id="svc"><h2>技术服务流程</h2></section></body></html>`,
  );
  const $ = cheerio.load(result.html);
  assert.equal($("a").attr("href"), "#svc");
  assert.deepEqual(result.repaired, ["#services → #svc"]);
});

test("unmatched navigation items are removed with their wrappers", () => {
  const result = repairAnchors(
    `<html><body><nav><ul><li><a href="#x">联系</a></li></ul><div class="nav__item"><a href="#y">地址</a></div></nav></body></html>`,
  );
  const $ = cheerio.load(result.html);
  assert.equal($("nav li").length, 0);
  assert.equal($("nav .nav__item").length, 0);
  assert.equal($("nav a").length, 0);
  assert.deepEqual(result.repaired, [
    "#x → removed nav item",
    "#y → removed nav item",
  ]);
});

test("an unmatched body link is unwrapped without losing its content", () => {
  const result = repairAnchors(
    `<html><body><p>见<a href="#x">附录</a></p></body></html>`,
  );
  const $ = cheerio.load(result.html);
  assert.equal($("p").html(), "见附录");
  assert.equal($("a").length, 0);
  assert.deepEqual(result.repaired, ["#x → unlinked"]);
});

test("a link to the top or from the logo goes to the first section, never removed", () => {
  const result = repairAnchors(
    '<html><body><header><a class="nav__logo" href="#hero">Brand</a><nav><li><a href="#top">首页</a></li></nav></header><main><section><h1>Hi</h1></section></main></body></html>',
  );
  const $ = cheerio.load(result.html);
  assert.equal($("section").attr("id"), "hero");
  assert.equal($(".nav__logo").attr("href"), "#hero");
  assert.equal($("nav a").attr("href"), "#hero");
});
