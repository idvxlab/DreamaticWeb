import test from "node:test";
import assert from "node:assert/strict";
import { guardPictures } from "../apps/server/src/picture-guard.js";

test("marked drawings and charts are kept whole; photographs and unmarked pages are untouched", () => {
  const page = `<html><head><style>.f img{object-fit:cover}</style></head><body><div class="f"><img data-kind="drawing" src="/a.png" alt="d"><img data-kind="photo" src="/b.png" alt="p"></div></body></html>`;
  const out = guardPictures(page);
  assert.match(out, /<style data-host="pictures">[^<]*img\[data-kind="drawing"\][^<]*object-fit:contain!important/);
  assert.doesNotMatch(out.match(/<style data-host="pictures">([^<]*)</)![1], /photo/);
  assert.equal(guardPictures(out), out, "idempotent");
  const plain = `<html><head></head><body><img src="/b.png" alt="p"></body></html>`;
  assert.equal(guardPictures(plain), plain);
  const onlyPhoto = `<html><head></head><body><img data-kind="photo" src="/b.png" alt="p"></body></html>`;
  assert.equal(guardPictures(onlyPhoto), onlyPhoto);
});
