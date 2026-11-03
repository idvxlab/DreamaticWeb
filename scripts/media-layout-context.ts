import type { Source } from "../packages/shared/project.js";

/** Geometry-only experiment: infer section membership, never image semantics. */
export function mediaLayoutContext(
  pages: any[],
  source: Source,
  options: { compact?: boolean; aliases?: Record<string, string> } = {},
) {
  const entries: any[] = [];
  for (const page of pages.filter((p) => p.type === "page")) {
    const leaves: any[] = [];
    const visit = (nodes: any[]) => {
      for (const n of nodes) {
        if ((n.type === "image" || n.type === "text") && n.bounds)
          leaves.push(n);
        if (n.children) visit(n.children);
      }
    };
    visit(page.children || []);
    const w = page.metadata.pageWidth;
    const headings = leaves.filter(
      (n) =>
        n.type === "text" &&
        n.bounds.y < page.metadata.pageHeight * 0.25 &&
        ((/PERFORMANCE INDEX|标准件货架产品——|STANDARD PARTS SHELF PRODUCTS/.test(
          n.text || "",
        ) &&
          [...(n.text || "").matchAll(/[A-Z]{1,6}-[A-Z]+\d+[A-Z]?/g)].length ===
            1) ||
          /^案例[一二三四五六七八九十\d]+[：:]/.test(n.text?.trim() || "")),
    );
    const anchors = headings.filter(
      (n, i) =>
        !headings
          .slice(0, i)
          .some((p) => Math.abs(p.bounds.x - n.bounds.x) < 30),
    );
    for (const image of leaves.filter((n) => n.type === "image")) {
      const a = source.assets.find(
        (a) => a.name === image.metadata?.attachmentName,
      );
      if (!a) continue;
      const b = image.bounds,
        cx = b.x + b.width / 2;
      const anchor = anchors
        .filter(
          (a) =>
            Math.floor((a.bounds.x + 10) / (w / 2)) ===
            Math.floor(cx / (w / 2)),
        )
        .sort(
          (a, b) =>
            Math.abs(a.bounds.x + w / 4 - cx) -
            Math.abs(b.bounds.x + w / 4 - cx),
        )[0];
      const region = anchor
        ? leaves.filter(
            (n) =>
              n.type === "text" &&
              Math.floor((n.bounds.x + n.bounds.width / 2) / (w / 2)) ===
                Math.floor((anchor.bounds.x + 10) / (w / 2)),
          )
        : [];
      const labels = region.filter(
        (n) =>
          /^(性能曲线|应用场景)$/.test(n.text?.trim()) &&
          n.bounds.y + n.bounds.height <= b.y + 8,
      );
      // Captions on the same baseline may belong to different subcolumns.
      const score = (n: any) =>
        Math.max(0, b.y - n.bounds.y - n.bounds.height) +
        Math.abs(cx - (n.bounds.x + n.bounds.width / 2)) * 0.4;
      const label = labels.sort((a, b) => score(a) - score(b))[0];
      const product = anchor?.text.match(/[A-Z]{1,6}-[A-Z]+\d+[A-Z]?/)?.[0];
      const section = product || anchor?.text.trim() || null;
      const placement = label
        ? label.text.trim()
        : product
          ? "产品资料图"
          : section
            ? "案例资料图"
            : "页内配图";
      entries.push({
        assetId: a.id,
        url: a.url,
        name: a.name,
        page: page.metadata.pageNumber,
        section,
        placement,
        displayLabel: options.compact
          ? section
            ? `${section.match(/^案例[一二三四五六七八九十\d]+/)?.[0] || section} ${placement}`
            : "资料配图"
          : `${section || "资料"} ${placement}`,
        visualKind: label ? "caption-associated" : "unknown",
        basis: section ? "同页同栏标题与二维几何位置" : "页码和几何位置",
        bounds: b,
      });
    }
  }
  for (const a of source.assets)
    if (!entries.some((e) => e.assetId === a.id))
      entries.push({
        assetId: a.id,
        url: a.url,
        name: a.name,
        page: null,
        section: null,
        placement: "未定位",
        displayLabel: "资料配图",
        visualKind: "unknown",
        basis: "仅素材目录",
      });
  const groups = new Map<string, any[]>();
  for (const e of entries) {
    const key = `第${e.page ?? "?"}页${e.section ? " / " + e.section : ""}`;
    groups.set(key, [...(groups.get(key) || []), e]);
  }
  if (options.compact) {
    for (const items of groups.values())
      items.sort((a, b) => {
        const rank = (e: any) =>
          /^(产品资料图|案例资料图)$/.test(e.placement)
            ? 0
            : e.placement === "性能曲线"
              ? 1
              : 2;
        return (
          rank(a) - rank(b) ||
          (a.visualKind === "unknown" && b.visualKind === "unknown"
            ? (b.bounds?.width || 0) * (b.bounds?.height || 0) -
              (a.bounds?.width || 0) * (a.bounds?.height || 0)
            : 0)
        );
      });
  }
  const markdown =
    "\n\n## Media layout associations (program-extracted)\n\n" +
    "以下为程序从页码、同栏标题及二维坐标确定的关联。可以直接按型号/章节选择并引用原图，无需为了配图逐张看图。链接文字为程序给出的建议图注和alt：未通过asset_view视觉确认时原样沿用，不得把“产品资料图”自行改成“尺寸图”“实物照片”等类别，也不要按目录顺序猜类别；同一产品可使用多张原图。需要明确区分照片与尺寸图、且有asset_view可用时，可按需查看必要素材；未知类型不妨碍配图。未分区的图只作为未确定用途的候选，不强行当成产品图。\n" +
    (options.compact
      ? "同组未知类别的候选按原资料版面展示面积降序排列，可优先采用靠前候选作为宣传页主图；这是排序启发式，不识别图像类别。未确定用途的页内图只可用作通用装饰，不得认作团队、办公场所或特定产品的照片。\n"
      : "") +
    (options.aliases
      ? "素材编号使用短 ID（例如 S1-I001）。submit_facts.assetIds 请原样填写这些短 ID，程序会映射为原素材 UUID，勿从 URL 中抄写长 UUID。\n"
      : "") +
    [...groups]
      .map(
        ([key, items]) =>
          `### ${key}\n` +
          items
            .map((e) => {
              const a = source.assets.find((a) => a.id === e.assetId);
              return (
                `- [${e.displayLabel}](${e.url}) · id:${options.aliases?.[e.assetId] || e.assetId}` +
                (options.compact && a
                  ? ` · ${a.mime} · ${a.width || "?"}×${a.height || "?"}`
                  : "")
              );
            })
            .join("\n"),
      )
      .join("\n\n") +
    "\n";
  return { entries, markdown };
}
