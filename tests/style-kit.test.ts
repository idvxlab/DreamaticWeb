import test from "node:test";
import assert from "node:assert/strict";
import { withStyle } from "../apps/server/src/generation/style-kit.js";

test("a planned style kit always reaches the page once, after the page kit", () => {
  const page = `<html lang="zh"><head><link rel="stylesheet" href="skill://designer-taste/assets/taste.css"></head><body><h1>P</h1></body></html>`;
  const out = withStyle(page, "designer-style-night");
  assert.match(out, /taste\.css"><link rel="stylesheet" href="skill:\/\/designer-style-night\/assets\/night\.css">/);
  assert.match(out, /<html lang="zh" data-style="night">/);
  assert.equal(withStyle(out, "designer-style-night"), out, "idempotent");
  const own = `<html data-style="night"><head><link rel="stylesheet" href="skill://designer-taste/assets/taste.css"><link rel="stylesheet" href="skill://designer-style-night/assets/night.css"></head><body></body></html>`;
  assert.equal((withStyle(own, "designer-style-night").match(/night\.css/g) || []).length, 1);
});
