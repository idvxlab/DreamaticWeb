import * as cheerio from "cheerio";
import { PREVIEW_CSP } from "../../../packages/shared/html-policy.js";
const tags = new Set(
  "html head body title meta style main header footer nav section article aside div span p h1 h2 h3 h4 h5 h6 a img picture figure figcaption ul ol li dl dt dd table thead tbody tfoot tr th td caption col colgroup button input select option optgroup textarea label fieldset legend form datalist output progress meter details summary dialog video audio source track br hr strong em b i u s small sub sup blockquote q cite abbr time address pre code kbd samp mark ins del wbr noscript".split(
    " ",
  ),
);
const attributes = new Set(
  "id class style title lang dir role hidden tabindex href src poster alt width height loading decoding target rel download type name value placeholder checked selected disabled readonly multiple required min max step pattern maxlength minlength autocomplete for rows cols colspan rowspan scope headers controls autoplay loop muted preload kind srclang label open datetime cite start reversed span size content charset draggable contenteditable".split(
    " ",
  ),
);
export function sanitizeHtml(html: string) {
  const $ = cheerio.load(html);
  $(
    "script,iframe,object,embed,base,link,svg,math,template,noscript,meta[http-equiv]",
  ).remove();
  $("*").each((_i, e) => {
    if (e.type !== "tag" && e.type !== "style") return;
    if (!tags.has(e.tagName)) {
      $(e).remove();
      return;
    }
    for (const [key, value] of Object.entries(e.attribs)) {
      if (!attributes.has(key) && !/^aria-[a-z-]+$/.test(key)) {
        $(e).removeAttr(key);
        continue;
      }
      if (["href", "src", "poster", "cite"].includes(key)) {
        const local =
          /^\/assets\/(?:[a-f\d-]{36}\/)?[a-f\d-]{36}\.[a-z\d]+$/i.test(value);
        const imageData =
          /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(
            value,
          );
        const mediaData =
          /^data:(?:video\/(?:mp4|webm)|audio\/(?:mpeg|wav|ogg));base64,[a-z\d+/=\s]+$/i.test(
            value,
          );
        const link =
          key === "href" &&
          /^(?:https?:\/\/|#[^\s]*$|mailto:|tel:)/i.test(value);
        if (!local && !imageData && !mediaData && !link) $(e).removeAttr(key);
      }
      if (key === "style") $(e).attr(key, cleanCss(value));
    }
    if (e.tagName === "a") $(e).attr("rel", "noopener noreferrer");
    // Forms can be styled and edited, but cannot submit requests in a preview/export.
    if (e.tagName === "button") $(e).attr("type", "button");
  });
  $("style").each((_i, e) => {
    $(e).text(cleanCss($(e).text()));
  });
  $("meta").each((_i, e) => {
    if (
      !$(e).attr("charset") &&
      !["viewport", "description"].includes($(e).attr("name") || "")
    )
      $(e).remove();
  });
  // First policy wins and remains effective in downloaded HTML too.
  $("head").prepend(
    `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`,
  );
  // Serialize the document element once: $.html() can retain an existing
  // doctype, making repeated validation change otherwise identical candidates.
  return "<!doctype html>\n" + $("html").toString();
}
function cleanCss(css: string) {
  return css
    .replace(/@import[^;]+;?/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/(?:-moz-binding|behavior)\s*:[^;}]*/gi, "");
}
