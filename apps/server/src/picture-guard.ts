import * as cheerio from "cheerio";

/** Kinds of pictures whose content is lines, labels or data: shown whole, never cropped. */
export const WHOLE_PICTURE_KINDS = ["drawing", "chart", "diagram", "screenshot"];
const MARK = "pictures";

/**
 * Harness rule: the Designer marks line drawings, charts, diagrams and screenshots with
 * data-kind on their <img>; the host adds one small style so such a picture is shown whole
 * wherever it sits, whatever the page's own CSS asks for (object-fit: cover in a frame of
 * another proportion is the common failure). Photographs stay free to be cropped. Idempotent.
 */
export function guardPictures(html: string) {
  if (!/data-kind\s*=/.test(html) || html.includes(`data-host="${MARK}"`))
    return html;
  const $ = cheerio.load(html);
  const kinds = WHOLE_PICTURE_KINDS.map((k) => `img[data-kind="${k}"]`).join(",");
  if (!$(kinds).length) return html;
  const css = `:is(${kinds}){object-fit:contain!important;object-position:50% 50%!important}`;
  const style = $("<style>").attr("data-host", MARK).text(css);
  if ($("head").length) $("head").append(style);
  else $.root().prepend(style);
  return $.html();
}

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
