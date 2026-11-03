import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { imagePreview } from "../apps/server/src/image-preview.js";
const root = process.env.DREAMATIC_WORKSPACE!;
const comparison = JSON.parse(
  await readFile(path.join(root, "comparison.json"), "utf8"),
);
const p = JSON.parse(
  await readFile(
    path.join(
      root,
      "projects",
      comparison.reports[0].projectId,
      "project.json",
    ),
    "utf8",
  ),
);
const context = JSON.parse(
  await readFile(path.join(root, "image-context.json"), "utf8"),
);
const candidates = p.sources[0].assets.filter((a: any) =>
  [
    "pdf_image_p4_20.png",
    "pdf_image_p4_21.png",
    "pdf_image_p4_24.png",
    "pdf_image_p4_22.png",
  ].includes(a.name),
);
const global = JSON.parse(
  await readFile("/Users/chenpuli/.config/opencode/opencode.json", "utf8"),
);
const provider = global.providers.api_cz_qwen.settings;
const model = "qwen3.5-plus";
const metadata = candidates.map((a: any) => ({
  assetId: a.id,
  name: a.name,
  width: a.width,
  height: a.height,
}));
const question =
  "为企业产品宣传页中的 DH-RF54 产品区，从候选素材中分别选出产品实物图和性能曲线图。无法确定就返回 null，不要猜。附近文字只是关联线索，不保证图片主体。";
const selection = {
  type: "function",
  function: {
    name: "submit_selection",
    description: "选择素材",
    parameters: {
      type: "object",
      properties: {
        productPhotoId: { type: ["string", "null"] },
        performanceChartId: { type: ["string", "null"] },
        reason: { type: "string" },
      },
      required: ["productPhotoId", "performanceChartId", "reason"],
    },
  },
};
async function call(body: any) {
  const t = performance.now();
  const r = await fetch(provider.baseURL + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + provider.apiKey,
    },
    signal: AbortSignal.timeout(180000),
    body: JSON.stringify({ model, temperature: 0, max_tokens: 1200, ...body }),
  });
  const data: any = await r.json();
  if (!r.ok) throw Error(`API ${r.status}`);
  return {
    ms: performance.now() - t,
    usage: data.usage,
    message: data.choices?.[0]?.message,
  };
}
const results = [];
for (const arm of ["A-activated-vision", "B-text-context"]) {
  const start = performance.now();
  const messages: any[] = [
    { role: "system", content: "只完成素材选择，不生成网页，不审查事实。" },
    {
      role: "user",
      content: question + "\n候选素材：" + JSON.stringify(metadata),
    },
  ];
  const requests = [];
  let processingMs = 0,
    imageBytes = 0;
  if (arm.startsWith("A")) {
    const first = await call({
      messages,
      tools: [
        {
          type: "function",
          function: {
            name: "asset_view",
            description:
              "查看所有指定候选图；仅本选图探针强制此调用，以确保激活视觉路径",
            parameters: {
              type: "object",
              properties: {
                assetIds: { type: "array", items: { type: "string" } },
              },
              required: ["assetIds"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "asset_view" } },
    });
    requests.push({
      phase: "request_view",
      elapsedMs: first.ms,
      usage: first.usage,
    });
    messages.push(first.message);
    const t = performance.now();
    const images = [];
    for (const a of candidates) {
      const data = await imagePreview(
        path.join(root, "projects", p.id, "assets", path.basename(a.url)),
        path.join(root, "probe-image-cache"),
      );
      imageBytes += data.length;
      images.push(
        { type: "text", text: "assetId=" + a.id },
        {
          type: "image_url",
          image_url: {
            url: "data:image/jpeg;base64," + data.toString("base64"),
          },
        },
      );
    }
    processingMs = performance.now() - t;
    for (const tc of first.message.tool_calls || [])
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: "图片按 assetId 在下一条消息提供（实验工具结果桥接）。",
      });
    messages.push({ role: "user", content: images });
  } else
    messages[1].content +=
      "\n程序提取的文图关联：" +
      JSON.stringify(
        context.filter((c: any) =>
          candidates.some((a: any) => a.id === c.assetId),
        ),
      );
  const last = await call({
    messages,
    tools: [selection],
    tool_choice: { type: "function", function: { name: "submit_selection" } },
  });
  requests.push({ phase: "select", elapsedMs: last.ms, usage: last.usage });
  const result = {
    arm,
    elapsedMs: performance.now() - start,
    processingMs,
    imageBytes,
    requests,
    selection: last.message.tool_calls?.[0]?.function?.arguments,
    candidateIds: metadata,
    limitation:
      "强制激活视觉的选图探针，非正常整页pipeline耗时；A有额外工具往返，B只一次调用；每组仅一次",
  };
  results.push(result);
  await writeFile(
    path.join(root, "selection-probe.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(result));
}
