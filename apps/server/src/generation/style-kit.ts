import * as cheerio from "cheerio";

/**
 * A style kit chosen in the Designer's plan always reaches the page: its stylesheet
 * is linked after the page kit's own and <html data-style> names it, even when the
 * written page forgot either. The link is inlined later like any skill:// asset.
 */
export function withStyle(html: string, skill: string) {
  const id = skill.replace(/^designer-style-/, "");
  const href = `skill://${skill}/assets/${id}.css`;
  const $ = cheerio.load(html);
  if (!$(`link[href^="skill://${skill}/"]`).length) {
    const link = $("<link>").attr({ rel: "stylesheet", href });
    const kit = $('link[href^="skill://designer-taste/"]').last();
    if (kit.length) kit.after(link);
    else if ($("head").length) $("head").append(link);
    else return html;
  }
  if (!$("html").attr("data-style")) $("html").attr("data-style", id);
  return $.html();
}

/**
 * A page that uses designer-compose compositions (cx-*) always gets their stylesheet, after any
 * kit's, and their script before </body>, so a composition never renders unstyled because the
 * page forgot a link. The references are inlined later like any skill:// asset.
 */
export function withCompose(html: string) {
  if (!/class\s*=\s*["'][^"']*\bcx-/.test(html)) return html;
  const $ = cheerio.load(html);
  if (!$('link[href^="skill://designer-compose/"]').length) {
    const link = $("<link>").attr({ rel: "stylesheet", href: "skill://designer-compose/assets/compose.css" });
    const last = $('link[href^="skill://"]').last();
    if (last.length) last.after(link);
    else if ($("head").length) $("head").append(link);
    else return html;
  }
  if (!$('script[src^="skill://designer-compose/"]').length && $("body").length)
    $("body").append($("<script>").attr("src", "skill://designer-compose/assets/compose.js"));
  return $.html();
}

type Inventory = { id: string; words: number; pictures: { id: string; orient: string }[] };

/**
 * What each planned section holds, counted by the harness (no model call): the length of its
 * planned content and the catalog pictures it names (full ids or their first four characters),
 * with each picture's orientation, and the composition that fits that inventory.
 */
export function sectionInventory(
  outline: { id: string; content: string }[],
  assets: { id: string; type: string; width?: number; height?: number }[],
): (Inventory & { fits: string })[] {
  const images = assets.filter((a) => a.type === "image");
  return outline.map((section) => {
    const text = section.content || "";
    const named = images.filter(
      (a) => text.includes(a.id) || new RegExp(`(^|[^0-9a-f])${a.id.slice(0, 4)}([^0-9a-f-]|$)`).test(text),
    );
    const pictures = named.map((a) => ({
      id: a.id.slice(0, 4),
      orient: !a.width || !a.height ? "?" : a.width / a.height > 1.6 ? "wide" : a.width / a.height < 0.8 ? "tall" : "even",
    }));
    const words = text.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "").length;
    const fits =
      pictures.length === 0
        ? words > 400 ? "cx-split (words alone, one column) or cx-cards" : "cx-cards or cx-facts"
        : pictures.length === 1
          ? pictures[0].orient === "wide" ? "cx-figure or cx-band" : "cx-split"
          : pictures.length === 2
            ? "cx-split (two pictures) or cx-gallery"
            : "cx-gallery";
    return { id: section.id, words, pictures, fits };
  });
}
