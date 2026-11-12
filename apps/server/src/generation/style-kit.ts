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
