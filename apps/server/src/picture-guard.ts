import * as cheerio from "cheerio";

/** Kinds that keep their size even when flagged graphic: their content is the lettering or data. */
export const SIZED_KINDS = ["screenshot", "chart", "poster", "drawing"];
const GRAPHIC_MARK = "graphics";

/**
 * Harness rule: flat low-detail artwork flagged `graphic` at import (a logo, emblem or badge)
 * is shown at icon size, unless the Designer marked it as a screenshot, chart, poster or
 * drawing. A logo enlarged to fill a frame is the failure this prevents. Idempotent.
 */
export function guardGraphics(html: string, urls: string[]) {
  if (!urls.length || html.includes(`data-host="${GRAPHIC_MARK}"`)) return html;
  const present = urls.filter((url) => html.includes(url));
  if (!present.length) return html;
  const $ = cheerio.load(html);
  const not = SIZED_KINDS.map((k) => `[data-kind="${k}"]`).join(",");
  const selector = present
    .map((url) => `img[src="${url.replaceAll('"', "")}"]:not(${not})`)
    .join(",");
  if (!$(selector).length) return html;
  const css = `:is(${selector}){width:auto!important;height:auto!important;max-width:min(160px,100%)!important;max-height:96px!important;object-fit:contain!important;position:static!important;inset:auto!important;margin:auto!important}`;
  const style = $("<style>").attr("data-host", GRAPHIC_MARK).text(css);
  if ($("head").length) $("head").append(style);
  else $.root().prepend(style);
  return $.html();
}
