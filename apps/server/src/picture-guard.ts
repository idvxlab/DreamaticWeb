import * as cheerio from "cheerio";

/** Kinds of pictures whose content is lines, labels or data: shown whole, never cropped. */
export const WHOLE_PICTURE_KINDS = [
  "drawing",
  "chart",
  "diagram",
  "screenshot",
  "poster",
  "illustration",
] as const;
const MARK = "pictures";

/**
 * Harness rule, independent of any Skill: the Designer marks drawings, charts and
 * diagrams with data-kind on their <img>; the host adds one small style so such a
 * picture is shown whole wherever it sits, whatever the page's own CSS asks for
 * (object-fit: cover in a frame of another proportion is the common failure).
 * Photographs stay free to be cropped. Idempotent.
 */
export function guardPictures(html: string) {
  if (!/data-kind\s*=/.test(html) || html.includes(`data-host="${MARK}"`))
    return html;
  const $ = cheerio.load(html);
  const kinds = WHOLE_PICTURE_KINDS.map((k) => `img[data-kind="${k}"]`).join(
    ",",
  );
  if (!$(kinds).length) return html;
  // An opaque plate too, so a picture shown whole never lets a layer below show through its margins.
  const css = `:is(${kinds}){object-fit:contain!important;object-position:50% 50%!important;background-color:var(--panel-bg,#fff)}`;
  const style = $("<style>").attr("data-host", MARK).text(css);
  if ($("head").length) $("head").append(style);
  else $.root().prepend(style);
  return $.html();
}
