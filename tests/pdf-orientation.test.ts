import test from "node:test";
import assert from "node:assert/strict";
import { turnOf } from "../apps/server/src/pdf-orientation.js";

test("a picture drawn turned on the page is turned upright by the matching quarter or half turn", () => {
  assert.equal(turnOf([100, 0, 0, 60, 10, 10]), 0, "upright");
  // The picture's x axis points up the page: drawn a quarter turn anticlockwise.
  assert.equal(turnOf([0, 63.67, -112.48, 0, 237, 666]), 270);
  assert.equal(turnOf([0, -63.67, 112.48, 0, 237, 666]), 90);
  assert.equal(turnOf([-100, 0, 0, -60, 10, 10]), 180);
  assert.equal(turnOf([100, 5, -5, 60, 10, 10]), 0, "a slight skew is not a turn");
});
