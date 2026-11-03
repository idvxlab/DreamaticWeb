import * as cheerio from "cheerio";

/** Bind source-provided neutral names; never infer what an image depicts. */
export function bindMediaLabels(html: string, labels: Record<string, string>) {
  const start = performance.now();
  const $ = cheerio.load(html);
  const updates: { src: string; original: string; assigned: string }[] = [];
  $("img[src]").each((_i, image) => {
    const src = $(image).attr("src")!;
    if (!Object.hasOwn(labels, src)) return;
    const original = $(image).attr("alt") || "";
    const assigned = labels[src];
    if (original === assigned) return;
    $(image).attr("alt", assigned);
    updates.push({ src, original, assigned });
  });
  return {
    html: updates.length ? $.html() : html,
    updates,
    elapsedMs: performance.now() - start,
  };
}
