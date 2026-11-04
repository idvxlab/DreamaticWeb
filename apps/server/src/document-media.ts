import type { OfficeContentNode } from "officeparser";
import type { Asset } from "../../../packages/shared/project.js";

const START = "<!-- dreamatic:media-associations:v1 -->";
const END = "<!-- /dreamatic:media-associations:v1 -->";
export const MEDIA_HEADING = "## Media layout associations (program-extracted)";
const escaped = (text: string) => text.replace(/[<>\[\]\r\n]/g, " ");
type Entry = {
  assetId: string;
  url: string;
  page?: number;
  section?: string;
  placement: string;
  caption?: string;
};

/** A3: page/column associations, not image classification. The two-column
 * product/case heuristic is scoped to landscape pages with explicit headings. */
export function documentMediaAssociations(
  nodes: OfficeContentNode[],
  assets: Asset[],
  names: ReadonlyMap<string, Asset> = new Map(assets.map((a) => [a.name, a])),
) {
  const entries: Entry[] = [];
  const handled = new Set<OfficeContentNode>();
  const add = (
    node: OfficeContentNode,
    page?: number,
    section?: string,
    label?: string,
  ) => {
    if (node.type !== "image") return;
    const asset = names.get(node.metadata?.attachmentName || "");
    if (!asset) return;
    handled.add(node);
    entries.push({
      assetId: asset.id,
      url: asset.url,
      page,
      section,
      placement: label || (section ? "章节资料图" : "页内配图"),
      caption: (node.metadata?.altText || node.metadata?.title)?.slice(0, 800),
    });
  };
  const walk = (items: OfficeContentNode[], page?: number) => {
    for (const node of items) {
      if (node.type === "page" || node.type === "slide") {
        const number =
          node.type === "page"
            ? node.metadata?.pageNumber
            : node.metadata?.slideNumber;
        const leaves: OfficeContentNode[] = [];
        const collect = (children: OfficeContentNode[]) => {
          for (const child of children) {
            if (child.type === "image" || child.type === "text")
              leaves.push(child);
            collect(child.children || []);
          }
        };
        collect(node.children || []);
        const w = node.type === "page" ? node.metadata?.pageWidth : undefined;
        const h = node.type === "page" ? node.metadata?.pageHeight : undefined;
        const columns =
          w && h && Number.isFinite(w) && Number.isFinite(h) && w > h;
        const headings = columns
          ? leaves.filter(
              (n) =>
                n.type === "text" &&
                n.bounds &&
                n.bounds.y < h * 0.25 &&
                ((/PERFORMANCE INDEX|标准件货架产品——|STANDARD PARTS SHELF PRODUCTS/.test(
                  n.text || "",
                ) &&
                  [...(n.text || "").matchAll(/[A-Z]{1,6}-[A-Z]+\d+[A-Z]?/g)]
                    .length === 1) ||
                  /^案例[一二三四五六七八九十\d]+[：:]/.test(
                    n.text?.trim() || "",
                  )),
            )
          : [];
        const anchors = headings.filter(
          (n, i) =>
            !headings
              .slice(0, i)
              .some(
                (previous) => Math.abs(previous.bounds!.x - n.bounds!.x) < 30,
              ),
        );
        for (const image of leaves.filter((n) => n.type === "image")) {
          const b = image.bounds;
          const cx = b ? b.x + b.width / 2 : 0;
          const anchor =
            columns && b
              ? anchors
                  .filter(
                    (a) =>
                      Math.floor((a.bounds!.x + 10) / (w / 2)) ===
                      Math.floor(cx / (w / 2)),
                  )
                  .sort(
                    (a, b) =>
                      Math.abs(a.bounds!.x + w / 4 - cx) -
                      Math.abs(b.bounds!.x + w / 4 - cx),
                  )[0]
              : undefined;
          const labels =
            anchor && b && w
              ? leaves.filter(
                  (n) =>
                    n.type === "text" &&
                    n.bounds &&
                    Math.floor((n.bounds.x + n.bounds.width / 2) / (w / 2)) ===
                      Math.floor((anchor.bounds!.x + 10) / (w / 2)) &&
                    /^(性能曲线|应用场景)$/.test(n.text?.trim() || "") &&
                    n.bounds.y + n.bounds.height <= b.y + 8,
                )
              : [];
          const score = (n: OfficeContentNode) =>
            Math.max(0, b!.y - n.bounds!.y - n.bounds!.height) +
            Math.abs(cx - (n.bounds!.x + n.bounds!.width / 2)) * 0.4;
          const label = labels
            .sort((a, b) => score(a) - score(b))[0]
            ?.text?.trim();
          const product = anchor?.text?.match(
            /[A-Z]{1,6}-[A-Z]+\d+[A-Z]?/,
          )?.[0];
          add(
            image,
            number,
            product || anchor?.text?.trim().slice(0, 160),
            label,
          );
        }
        walk(node.children || [], number);
      } else {
        if (node.type === "image" && !handled.has(node)) add(node, page);
        walk(node.children || [], page);
      }
    }
  };
  walk(nodes);
  if (!entries.length) return { entries, markdown: "" };
  const located = new Set(entries.map((e) => e.assetId));
  for (const asset of assets)
    if (!located.has(asset.id))
      entries.push({ assetId: asset.id, url: asset.url, placement: "未定位" });
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = `第${entry.page ?? "?"}页${entry.section ? " / " + escaped(entry.section) : ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }
  const markdown =
    `${START}\n${MEDIA_HEADING}\n\n` +
    "程序记录页码、原文图注和版面关联。型号/章节关联采用横向双栏版面的标题与坐标启发式，不代表图片内容已经被视觉识别；未定位条目没有确定用途。\n\n" +
    [...groups]
      .map(
        ([key, items]) =>
          `### ${key}\n` +
          items
            .map(
              (e) =>
                `- [${escaped(e.caption || `${e.section || "资料"} ${e.placement}`)}](${e.url}) · id:${e.assetId}` +
                (e.caption ? " · 原文图注/alt" : " · 版面候选，类别未识别"),
            )
            .join("\n"),
      )
      .join("\n\n") +
    `\n${END}\n`;
  return { entries, markdown };
}

/** Read only the generated section of the already loaded canonical Markdown. */
export function canonicalMediaAssociations(markdown: string) {
  const start = markdown.lastIndexOf(START);
  const end = start < 0 ? -1 : markdown.indexOf(END, start + START.length);
  return end < 0 ? "" : markdown.slice(start + START.length, end).trim();
}
