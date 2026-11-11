import sharp from "sharp";
import type { OfficeContentNode } from "officeparser";
import type { Asset, AssetFlag } from "../../../packages/shared/project.js";

/** Flags that mean an extracted image cannot stand alone as page content. */
export const UNUSABLE_FLAGS: readonly AssetFlag[] = ["flat", "frame-only"];
export const usableAsset = (a: Asset) =>
  !a.flags?.some((f) => UNUSABLE_FLAGS.includes(f));
/** Slices of composites stay stored but are not offered as page media. Page backdrops are
 * offered with their flag: the brochure's own scenes carry its visual style and can serve as
 * atmosphere; only meaningless media (flat tiles, empty frames, fragments) stay out. */
export const OFFERED_EXCLUDED_FLAGS: readonly AssetFlag[] = [
  ...UNUSABLE_FLAGS,
  "fragment",
];
export const offeredAsset = (a: Asset) =>
  !a.flags?.some((f) => OFFERED_EXCLUDED_FLAGS.includes(f));

type Box = { x: number; y: number; width: number; height: number };
export type MediaLayout = {
  page?: number;
  context?: string;
  fragment?: boolean;
  pageBackground?: boolean;
};

/**
 * Deterministic pixel signals, no model call. Only two unambiguous cases are
 * flagged: an (almost) single-colour tile and a border whose interior is empty.
 * Line drawings have low variance but a wide tonal range, so both conditions
 * are required for "flat".
 */
export async function imageSignals(buffer: Buffer): Promise<AssetFlag[]> {
  const { data } = await sharp(buffer, { limitInputPixels: 100_000_000 })
    .flatten({ background: "#fff" })
    .greyscale()
    .resize(64, 64, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const region = (x0: number, y0: number, x1: number, y1: number) => {
    const values: number[] = [];
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) values.push(data[y * 64 + x]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
    );
    values.sort((a, b) => a - b);
    const range =
      values[Math.floor(values.length * 0.99)] -
      values[Math.floor(values.length * 0.01)];
    return { mean, sd, range };
  };
  const all = region(0, 0, 64, 64);
  if (all.sd < 6 && all.range < 48) return ["flat"];
  const center = region(13, 13, 51, 51);
  if (center.sd < 1.5 && center.range < 6 && all.sd >= 6) return ["frame-only"];
  return [];
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim();
// Undecodable PDF fonts surface as Hangul/symbol/private-use runs; omit them instead of quoting noise.
// Hangul interleaved with Han characters is a mis-decoded font, not Korean prose.
const garbled = (text: string) =>
  /[\uE000-\uF8FF\uFFFD]/.test(text) ||
  (/[\uAC00-\uD7AF]/.test(text) && /[\u4E00-\u9FFF]/.test(text)) ||
  (text.match(/[\uAC00-\uD7AF\u2600-\u27BF]/g)?.length || 0) >
    text.length * 0.15;

/** Page, nearby text and tiling from parser bounds; layout proximity, not image content. */
export function mediaLayout(nodes: OfficeContentNode[]) {
  const result = new Map<string, MediaLayout>();
  const visit = (items: OfficeContentNode[]) => {
    for (const node of items) {
      if (node.type === "page" || node.type === "slide") {
        const page =
          node.type === "page"
            ? node.metadata?.pageNumber
            : node.metadata?.slideNumber;
        const pageWidth =
          node.type === "page" ? node.metadata?.pageWidth : undefined;
        const pageHeight =
          node.type === "page" ? node.metadata?.pageHeight : undefined;
        const images: { name: string; box?: Box }[] = [];
        const texts: { text: string; box: Box }[] = [];
        const collect = (children: OfficeContentNode[]) => {
          for (const child of children) {
            if (child.type === "image" && child.metadata?.attachmentName)
              images.push({
                name: child.metadata.attachmentName,
                box: child.bounds,
              });
            else if (child.type === "text" && child.bounds && child.text)
              texts.push({ text: clean(child.text), box: child.bounds });
            collect(child.children || []);
          }
        };
        collect(node.children || []);
        for (const image of images) {
          const entry: MediaLayout = { page };
          const b = image.box;
          if (b) {
            const overlapX = (t: Box) =>
              Math.min(b.x + b.width, t.x + t.width) - Math.max(b.x, t.x);
            const scored = texts
              .filter((t) => t.text.length > 1 && !garbled(t.text))
              .map((t) => {
                const above = b.y - (t.box.y + t.box.height);
                const below = t.box.y - (b.y + b.height);
                const cx = t.box.x + t.box.width / 2,
                  cy = t.box.y + t.box.height / 2;
                const inside =
                  cx >= b.x &&
                  cx <= b.x + b.width &&
                  cy >= b.y &&
                  cy <= b.y + b.height;
                const gap = inside
                  ? 0
                  : Math.min(...[above, below].filter((g) => g >= -2));
                const aligned =
                  overlapX(t.box) >= 0.3 * Math.min(b.width, t.box.width);
                return { t, gap, ok: inside || (aligned && gap <= 36) };
              })
              .filter((s) => s.ok && Number.isFinite(s.gap))
              .sort((x, y) => x.gap - y.gap)
              .slice(0, 2);
            const context = clean(scored.map((s) => s.t.text).join(" / "));
            if (context) entry.context = context.slice(0, 48);
            // Slices of one composite (edge to edge), or layers of one icon or badge: a small
            // picture stacked over another (a glyph on a coloured disc). Either layer alone shows
            // nothing the reader can use; a photograph carrying a small logo is too large to count.
            const pageArea =
              pageWidth && pageHeight ? pageWidth * pageHeight : 0;
            const small = (box: Box) =>
              pageArea > 0 &&
              (box.width * box.height) / pageArea < ICON_LAYER_PAGE_SHARE;
            entry.fragment = images.some(
              (other) =>
                other !== image &&
                other.box &&
                (touching(b, other.box) ||
                  (stacked(other.box, b) && small(b)) ||
                  (stacked(b, other.box) && small(other.box))),
            );
            if (pageWidth && pageHeight)
              entry.pageBackground =
                (b.width * b.height) / (pageWidth * pageHeight) > 0.5;
          }
          result.set(image.name, entry);
        }
      } else visit(node.children || []);
    }
  };
  visit(nodes);
  return result;
}

/** An icon-scale picture covers at most this share of its page. */
const ICON_LAYER_PAGE_SHARE = 0.06;
/** `inner` lies (almost) wholly within `outer`: one layer stacked over another. */
function stacked(inner: Box, outer: Box) {
  const w =
    Math.min(inner.x + inner.width, outer.x + outer.width) -
    Math.max(inner.x, outer.x);
  const h =
    Math.min(inner.y + inner.height, outer.y + outer.height) -
    Math.max(inner.y, outer.y);
  return w > 0 && h > 0 && (w * h) / (inner.width * inner.height) >= 0.8;
}

/** Edge-to-edge neighbours sharing most of a side: slices of one composite picture. */
function touching(a: Box, b: Box) {
  const eps = 2;
  const spanY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const spanX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const horizontal =
    (Math.abs(a.x + a.width - b.x) < eps ||
      Math.abs(b.x + b.width - a.x) < eps) &&
    spanY > 0.5 * Math.min(a.height, b.height);
  const vertical =
    (Math.abs(a.y + a.height - b.y) < eps ||
      Math.abs(b.y + b.height - a.y) < eps) &&
    spanX > 0.5 * Math.min(a.width, b.width);
  return horizontal || vertical;
}

/** Applies layout to document-extracted media; standalone uploads are untouched. */
export function annotate(asset: Asset, layout?: MediaLayout) {
  if (!layout) return;
  if (layout.page) asset.page = layout.page;
  if (layout.context) asset.context = layout.context;
  const flags = new Set(asset.flags || []);
  if (layout.fragment) flags.add("fragment");
  if (layout.pageBackground) flags.add("page-background");
  if (flags.size) asset.flags = [...flags];
}

const compact = (text: string) => text.replace(/\s+/g, "").toLowerCase();

/**
 * Deterministic candidate recall after Analyst, no model call: an image whose
 * printed nearby label (one context segment of at least 8 characters) appears in
 * exactly one fact of the same source is added to that fact's candidates. Generic
 * headings shared by several facts, short labels such as "性能曲线", flagged
 * non-content, page-sized backdrops and other sources are never matched;
 * existing choices are kept.
 */
export function recallFactAssets(
  facts: { text: string; sourceId: string; assetIds: string[] }[],
  sources: { id: string; assets: Asset[] }[],
  limit = 20,
) {
  let added = 0;
  for (const source of sources) {
    const own = facts.filter((f) => f.sourceId === source.id);
    if (!own.length) continue;
    const texts = own.map((f) => compact(f.text));
    for (const asset of source.assets) {
      if (
        asset.type !== "image" ||
        !asset.context ||
        !usableAsset(asset) ||
        // Text printed over a page-sized backdrop is a page title, not a caption.
        asset.flags?.includes("page-background")
      )
        continue;
      for (const segment of asset.context.split(" / ").map(compact)) {
        if (segment.length < 8) continue;
        const matches = own.filter((_f, i) => texts[i].includes(segment));
        if (matches.length !== 1) continue;
        const fact = matches[0];
        if (!fact.assetIds.includes(asset.id) && fact.assetIds.length < limit) {
          fact.assetIds.push(asset.id);
          added++;
        }
        break;
      }
    }
  }
  return added;
}
