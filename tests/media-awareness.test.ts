import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  createAssistantMessageEventStream,
  getCurrentSystemMessage,
  type AssistantMessage,
  type JsonObject,
} from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { OfficeContentNode } from "officeparser";
import type { RuntimeConfig } from "../packages/shared/config.js";
import type { Asset, Source } from "../packages/shared/project.js";
import { create, save, removeProject } from "../apps/server/src/store.js";
import { ingest } from "../apps/server/src/ingest.js";
import { runProject } from "../apps/server/src/generation/runtime.js";
import { requestSchema, type Analysis } from "../packages/shared/generation.js";
import { validatePage } from "../apps/server/src/page-validation.js";
import { contactSheet } from "../apps/server/src/image-preview.js";
import {
  imageSignals,
  mediaLayout,
  usableAsset,
  recallFactAssets,
} from "../apps/server/src/media-layout.js";
import { persistExtraction } from "../apps/server/src/source-content.js";

const png = (svg: string) => sharp(Buffer.from(svg)).png().toBuffer();
const W = `width="400" height="300"`;

test("pixel signals flag only flat tiles and empty frames; line drawings and photos stay usable", async () => {
  const gradient = await png(
    `<svg xmlns="http://www.w3.org/2000/svg" ${W}><defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="#74d4f0"/><stop offset="1" stop-color="#8fdcf4"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>`,
  );
  const frame = await png(
    `<svg xmlns="http://www.w3.org/2000/svg" ${W}><rect width="400" height="300" fill="#fff"/><rect x="6" y="6" width="388" height="288" rx="18" fill="none" stroke="#111" stroke-width="8"/></svg>`,
  );
  const drawing = await png(
    `<svg xmlns="http://www.w3.org/2000/svg" ${W}><rect width="400" height="300" fill="#fff"/><path d="M20 150 Q200 120 380 150 Q200 180 20 150" fill="none" stroke="#222" stroke-width="2"/><circle cx="200" cy="150" r="12" fill="none" stroke="#222" stroke-width="2"/><line x1="20" y1="60" x2="380" y2="60" stroke="#222"/></svg>`,
  );
  const photo = await sharp({
    create: {
      width: 300,
      height: 200,
      channels: 3,
      background: "#808080",
      noise: { type: "gaussian", mean: 128, sigma: 60 },
    },
  })
    .png()
    .toBuffer();
  assert.deepEqual(await imageSignals(gradient), ["flat"]);
  assert.deepEqual(await imageSignals(frame), ["frame-only"]);
  assert.deepEqual(await imageSignals(drawing), []);
  assert.deepEqual(await imageSignals(photo), []);
});

test("layout gives page, nearby printed text, composite slices and page-sized backgrounds", () => {
  const nodes = [
    {
      type: "page",
      metadata: { pageNumber: 4, pageWidth: 1000, pageHeight: 700 },
      children: [
        {
          type: "text",
          text: "性能曲线",
          bounds: { x: 520, y: 80, width: 80, height: 20 },
        },
        {
          type: "text",
          text: "DH-RF54 碳纤维螺旋桨",
          bounds: { x: 60, y: 80, width: 200, height: 20 },
        },
        {
          type: "image",
          metadata: { attachmentName: "curve.png" },
          bounds: { x: 520, y: 110, width: 300, height: 220 },
        },
        {
          type: "image",
          metadata: { attachmentName: "photo.png" },
          bounds: { x: 60, y: 110, width: 300, height: 200 },
        },
        {
          type: "image",
          metadata: { attachmentName: "left.png" },
          bounds: { x: 0, y: 500, width: 200, height: 100 },
        },
        {
          type: "image",
          metadata: { attachmentName: "right.png" },
          bounds: { x: 200, y: 500, width: 200, height: 100 },
        },
      ],
    },
    {
      type: "page",
      metadata: { pageNumber: 5, pageWidth: 1000, pageHeight: 700 },
      children: [
        {
          type: "image",
          metadata: { attachmentName: "cover.png" },
          bounds: { x: 0, y: 0, width: 1000, height: 700 },
        },
        {
          type: "text",
          text: "⚁岤电끮轠偒咙䪮助",
          bounds: { x: 100, y: 100, width: 200, height: 20 },
        },
      ],
    },
  ] as unknown as OfficeContentNode[];
  const layout = mediaLayout(nodes);
  assert.equal(layout.get("curve.png")!.page, 4);
  assert.equal(layout.get("curve.png")!.context, "性能曲线");
  assert.equal(layout.get("photo.png")!.context, "DH-RF54 碳纤维螺旋桨");
  assert.equal(layout.get("photo.png")!.fragment, false);
  assert.equal(layout.get("left.png")!.fragment, true);
  assert.equal(layout.get("right.png")!.fragment, true);
  assert.equal(layout.get("cover.png")!.pageBackground, true);
  assert.equal(
    layout.get("cover.png")!.context,
    undefined,
    "garbled font text is not quoted",
  );
});

test("canonical Markdown lists page, nearby text and flags without claiming visual content", async () => {
  const source = {
    id: "s",
    name: "doc.pdf",
    format: "pdf",
    text: "Body",
    tables: [],
    warnings: [],
    provenance: "test",
    assets: [
      {
        id: "a1",
        name: "p4.png",
        type: "image",
        url: "/assets/x/a1.png",
        mime: "image/png",
        width: 10,
        height: 8,
        page: 4,
        context: "性能曲线",
      },
      {
        id: "a2",
        name: "p1.png",
        type: "image",
        url: "/assets/x/a2.png",
        mime: "image/png",
        page: 1,
        flags: ["flat"],
      },
    ],
  } as never;
  await persistExtraction(source);
  const markdown = (source as { markdown: string }).markdown;
  assert.match(markdown, /id:a1 · 10×8 · page:4 · nearby:"性能曲线"/);
  assert.match(markdown, /id:a2 · page:1 · flags:flat/);
  assert.match(markdown, /not its visual content/);
});

test("contact sheet returns one bounded JPEG for several images", async () => {
  const dir = process.env.DREAMATIC_WORKSPACE!;
  const files: string[] = [];
  for (const [i, color] of ["#f00", "#0f0", "#00f"].entries()) {
    const file = `${dir}/sheet-${i}.png`;
    await sharp({
      create: {
        width: 900 + i * 100,
        height: 500,
        channels: 3,
        background: color,
      },
    })
      .png()
      .toFile(file);
    files.push(file);
  }
  const sheet = await contactSheet(files);
  const meta = await sharp(sheet).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width, 768, "three tiles use two columns");
  assert.equal(meta.height, 768);
  assert.ok(sheet.length < 1024 * 1024);
  await assert.rejects(contactSheet([]));
});

const config: RuntimeConfig = {
  mode: "live",
  workspace: process.env.DREAMATIC_WORKSPACE!,
  language: "zh",
  models: {
    reasoning: {
      mode: "openai-compatible",
      baseUrl: "http://127.0.0.1:1/v1",
      model: "local-test",
      apiKey: "test",
      vision: true,
    },
    analyst: null,
    designer: null,
  },
};
function answer(model: Parameters<StreamFn>[0], name: string, args: unknown) {
  const stream = createAssistantMessageEventStream();
  const message: AssistantMessage = {
    role: "assistant",
    api: model.api,
    provider: model.provider,
    model: model.id,
    content: [
      {
        type: "toolCall",
        id: crypto.randomUUID(),
        name,
        arguments: args as JsonObject,
      },
    ],
    stopReason: "toolUse",
    timestamp: Date.now(),
    usage: {
      input: 10,
      output: 10,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 20,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
  queueMicrotask(() => {
    stream.push({ type: "done", reason: "toolUse", message });
    stream.end(message);
  });
  return stream;
}

test("batched asset_view costs one round; flagged media leave the catalog, facts and generated pages", async () => {
  const p = await create();
  try {
    const images: Source[] = [];
    for (const [i, color] of ["#c33", "#3c3", "#33c"].entries())
      images.push(
        await ingest(
          await sharp({
            create: {
              width: 64 + i,
              height: 64,
              channels: 3,
              background: "#808080",
              noise: { type: "gaussian", mean: 128, sigma: 50 },
            },
          })
            .composite([
              {
                input: {
                  create: {
                    width: 8,
                    height: 8,
                    channels: 3,
                    background: color,
                  },
                },
                left: 0,
                top: 0,
              },
            ])
            .png()
            .toBuffer(),
          `image-${i}.png`,
          p.id,
        ),
      );
    // Mark one medium as an import-time flat tile, as the PDF path does.
    images[2].assets[0].flags = ["flat"];
    p.sources.push(...images);
    await save(p);
    const [a, b, flat] = images.map((s) => s.assets[0]);
    assert.equal(usableAsset(flat), false);
    let viewed = false,
      rejected = false,
      designerInput = "";
    const streamFn: StreamFn = (model, context) => {
      const sys = getCurrentSystemMessage(context.messages)!;
      const prompt =
        typeof sys.content === "string"
          ? sys.content
          : sys.content.map((c) => c.text).join("\n");
      if (prompt.includes("# Orchestrator"))
        return answer(model, "submit_intent", {
          goal: "展示",
          audience: "访客",
          content: ["产品"],
          features: [],
          design: [],
          constraints: [],
        });
      if (prompt.includes("# Analyst"))
        return answer(model, "submit_facts", {
          summary: "s",
          facts: [
            { id: "f", text: "产品", sourceId: images[0].id, assetIds: [a.id] },
            {
              id: "g",
              text: "背景",
              sourceId: images[2].id,
              assetIds: [flat.id],
            },
          ],
          limitations: [],
        });
      designerInput ||= JSON.stringify(context.messages);
      if (!viewed) {
        viewed = true;
        return answer(model, "asset_view", { assetIds: [a.id, b.id] });
      }
      const results = context.messages.filter((m) => m.role === "toolResult");
      if (!rejected) {
        const last = JSON.stringify(results.at(-1)!.content);
        assert.match(last, /Contact sheet tiles/);
        assert.equal(
          results.at(-1)!.content.filter((c) => c.type === "image").length,
          1,
        );
        rejected = true;
        return answer(model, "submit_page", {
          usedFactIds: ["f"],
          html: `<html><body><h1>P</h1><img alt="x" src="${flat.url}"></body></html>`,
        });
      }
      assert.match(
        JSON.stringify(results.at(-1)!.content),
        /asset_unusable|flat colour tile/,
      );
      return answer(model, "submit_page", {
        usedFactIds: ["f"],
        html: `<html><body><h1>P</h1><img alt="Product" src="${a.url}"><img alt="Detail" src="${b.url}"></body></html>`,
      });
    };
    await runProject(
      p,
      requestSchema.parse({ text: "生成展示页" }),
      save,
      () => {},
      { config, streamFn },
    );
    assert.equal(p.status, "complete", p.error);
    assert.ok(
      !designerInput.includes(flat.id),
      "flagged media are not offered to Designer",
    );
    const analysis = p.analysis as Analysis;
    assert.deepEqual(analysis.facts.find((f) => f.id === "g")!.assetIds, []);
    assert.equal(
      p.generation!.metrics!.modelCalls,
      5,
      "2 upstream + view + rejected page + corrected page",
    );
    const manual = await validatePage(
      p,
      `<html><body><h1>M</h1><img alt="x" src="${flat.url}"></body></html>`,
    );
    assert.equal(manual.valid, true, "manual saves only warn");
    assert.ok(
      manual.issues.some(
        (i) => i.code === "asset_unusable" && i.severity === "warning",
      ),
    );
  } finally {
    await removeProject(p.id);
  }
});

test("recall adds an image only when its printed label names exactly one fact of the same source", () => {
  const image = (id: string, context: string, flags?: Asset["flags"]) =>
    ({
      id,
      name: id,
      type: "image",
      url: "/assets/x/" + id + ".png",
      mime: "image/png",
      context,
      flags,
    }) as Asset;
  const sources = [
    {
      id: "doc",
      assets: [
        image("photo63", "DH-RF63 碳纤维复合材料航空螺旋桨 / 额定扭矩"),
        image("curve", "性能曲线"),
        image("shared", "碳纤维复合材料航空螺旋桨"),
        image("backdrop", "DH-RF63 碳纤维复合材料航空螺旋桨", [
          "page-background",
        ]),
        image("blank", "DH-RF63 碳纤维复合材料航空螺旋桨", ["frame-only"]),
      ],
    },
    {
      id: "other",
      assets: [image("elsewhere", "DH-RF63 碳纤维复合材料航空螺旋桨")],
    },
  ];
  const facts = [
    {
      id: "a",
      sourceId: "doc",
      text: "DH-RF63 碳纤维复合材料航空螺旋桨：直径63英寸，性能曲线见资料",
      assetIds: ["drawing63"],
    },
    {
      id: "b",
      sourceId: "doc",
      text: "DH-RF54 碳纤维复合材料航空螺旋桨：直径54英寸",
      assetIds: [],
    },
  ];
  assert.equal(recallFactAssets(facts, sources), 1);
  assert.deepEqual(
    facts[0].assetIds,
    ["drawing63", "photo63"],
    "existing choice kept, matching photo added",
  );
  assert.deepEqual(
    facts[1].assetIds,
    [],
    "a heading shared by both facts and short labels are not matched",
  );
  assert.equal(recallFactAssets(facts, sources), 0, "idempotent");
  const full = [
    {
      sourceId: "doc",
      text: facts[0].text,
      assetIds: Array.from({ length: 20 }, (_, i) => "x" + i),
    },
  ];
  assert.equal(recallFactAssets(full, sources), 0, "schema limit respected");
});

test("contentOutline is written before the page and unimplemented sections are recorded, not rejected", async () => {
  const p = await create();
  try {
    const streamFn: StreamFn = (model, context) => {
      const sys = getCurrentSystemMessage(context.messages)!;
      const prompt =
        typeof sys.content === "string"
          ? sys.content
          : sys.content.map((c) => c.text).join("\n");
      if (prompt.includes("# Orchestrator"))
        return answer(model, "submit_intent", {
          goal: "展示",
          audience: "访客",
          content: ["产品"],
          features: [],
          design: [],
          constraints: [],
        });
      if (prompt.includes("# Analyst"))
        return answer(model, "submit_facts", {
          summary: "s",
          facts: [],
          limitations: [],
        });
      return answer(model, "submit_page", {
        contentOutline: [
          {
            id: "offer",
            purpose: "先明白提供什么",
            content: "主张",
            form: "大标题与主体图",
          },
          { id: "proof", purpose: "相信性能", content: "参数", form: "对比表" },
        ],
        html: '<html><body><h1 id="offer">P</h1></body></html>',
        usedFactIds: [],
      });
    };
    await runProject(
      p,
      requestSchema.parse({ text: "生成展示页" }),
      save,
      () => {},
      { config, streamFn },
    );
    assert.equal(p.status, "complete", p.error);
    assert.equal(p.generation!.metrics!.modelCalls, 3);
    const issue = p.versions[0].checks!.issues.find(
      (i) => i.code === "outline_missing",
    );
    assert.match(issue!.message, /proof/);
    assert.doesNotMatch(issue!.message, /offer/);
  } finally {
    await removeProject(p.id);
  }
});
