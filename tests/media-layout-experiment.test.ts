import test from "node:test";
import assert from "node:assert/strict";
import { mediaLayoutContext } from "../scripts/media-layout-context.js";
test("layout associations separate columns and chart regions, without claiming visual semantics", () => {
  const text = (text: string, x: number, y: number) => ({
    type: "text",
    text,
    bounds: { x, y, width: 100, height: 20 },
  });
  const image = (name: string, x: number, y: number) => ({
    type: "image",
    metadata: { attachmentName: name },
    bounds: { x, y, width: 120, height: 80 },
  });
  const source: any = {
    assets: [
      { id: "left", name: "left.png", url: "/assets/left.png" },
      { id: "right", name: "right.png", url: "/assets/right.png" },
      { id: "chart", name: "chart.png", url: "/assets/chart.png" },
    ],
  };
  const r = mediaLayoutContext(
    [
      {
        type: "page",
        metadata: { pageNumber: 5, pageWidth: 1000, pageHeight: 720 },
        children: [
          text("PERFORMANCE INDEX - DH-RF63", 50, 95),
          text("PERFORMANCE INDEX - DH-RF73", 550, 95),
          image("left.png", 250, 170),
          image("right.png", 750, 170),
          text("性能曲线", 550, 490),
          image("chart.png", 580, 520),
        ],
      },
    ],
    source,
  );
  assert.equal(r.entries[0].section, "DH-RF63");
  assert.equal(r.entries[1].section, "DH-RF73");
  assert.equal(r.entries[2].section, "DH-RF73");
  assert.equal(r.entries[2].placement, "性能曲线");
  assert.equal(r.entries[0].placement, "产品资料图");
  assert.equal(r.entries[0].visualKind, "unknown");
  assert.doesNotMatch(r.markdown, /nearbyBefore|not confirmed/);
});

test("side-by-side captions at the same vertical position remain in their horizontal region", () => {
  const bounds = (x: number, y: number, width: number, height: number) => ({
    x,
    y,
    width,
    height,
  });
  const image = (name: string, x: number, width: number) => ({
    type: "image",
    metadata: { attachmentName: name },
    bounds: bounds(x, 483, width, 165),
  });
  const p = {
    type: "page",
    metadata: { pageNumber: 4, pageWidth: 1009, pageHeight: 720 },
    children: [
      {
        type: "text",
        text: "PERFORMANCE INDEX - DH-RF54",
        bounds: bounds(550, 95, 150, 28),
      },
      { type: "text", text: "应用场景", bounds: bounds(564, 451, 44, 15) },
      { type: "text", text: "性能曲线", bounds: bounds(741, 451, 44, 15) },
      image("curve.png", 737, 199),
      image("application.png", 604, 61),
    ],
  };
  const source: any = {
    assets: [
      { id: "curve", name: "curve.png", url: "/assets/curve.png" },
      {
        id: "application",
        name: "application.png",
        url: "/assets/application.png",
      },
    ],
  };
  const r = mediaLayoutContext([p], source);
  assert.equal(r.entries[0].placement, "性能曲线");
  assert.equal(r.entries[1].placement, "应用场景");
  assert.equal(r.entries[0].displayLabel, "DH-RF54 性能曲线");
});

test("a right-column case heading never claims left-column decorative media", () => {
  const b = (x: number, y: number) => ({ x, y, width: 200, height: 30 });
  const p = {
    type: "page",
    metadata: { pageNumber: 8, pageWidth: 1000, pageHeight: 720 },
    children: [
      { type: "text", text: "案例一：企业产品应用", bounds: b(580, 100) },
      {
        type: "image",
        metadata: { attachmentName: "case.png" },
        bounds: b(755, 318),
      },
      {
        type: "image",
        metadata: { attachmentName: "decoration.png" },
        bounds: b(0, 0),
      },
    ],
  };
  const source: any = {
    assets: [
      { id: "case", name: "case.png", url: "/assets/case.png" },
      {
        id: "decoration",
        name: "decoration.png",
        url: "/assets/decoration.png",
      },
    ],
  };
  const r = mediaLayoutContext([p], source);
  assert.equal(r.entries[0].section, "案例一：企业产品应用");
  assert.equal(r.entries[1].section, null);
});
