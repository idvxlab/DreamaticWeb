import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const tags = new Set(
  "svg g defs path circle ellipse rect line polygon polyline lineargradient radialgradient stop clippath mask pattern marker symbol use text tspan textpath title desc".split(
    " ",
  ),
);
const attributes = new Set(
  "id class style title lang role width height viewbox preserveaspectratio x y x1 y1 x2 y2 cx cy r rx ry d points dx dy rotate transform transform-origin opacity fill fill-opacity fill-rule clip-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset pathlength vector-effect paint-order color visibility overflow offset stop-color stop-opacity gradientunits gradienttransform spreadmethod clippathunits maskunits maskcontentunits mask-type patternunits patterncontentunits patterntransform clip-path mask marker-start marker-mid marker-end markerwidth markerheight markerunits refx refy orient text-anchor dominant-baseline alignment-baseline baseline-shift font-family font-size font-weight font-style letter-spacing word-spacing textlength lengthadjust startoffset focusable href".split(
    " ",
  ),
);
const paints = new Set(
  "fill stroke clip-path mask marker-start marker-mid marker-end".split(" "),
);
const fragment = /^#[^\s<>"'()\\]+$/u;
const localPaint = /^url\(\s*(['"]?)#[^\s<>"'()\\]+\1\s*\)$/iu;

function cleanStyle(value: string) {
  // Escaped identifiers could conceal a URL. SVG styles need no such escape
  // for supported geometry; page-level CSS retains the existing CSS policy.
  if (value.includes("\\")) return "";
  return value
    .replace(/@import[^;]+;?/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/(^|[;{])\s*(?:-moz-binding|behavior)\s*:[^;}]*/gi, "$1")
    .replace(/url\([^)]*\)/gi, (url) => (localPaint.test(url) ? url : "none"));
}

function cleanAttributes(node: Element) {
  for (const [key, value] of Object.entries(node.attribs)) {
    const name = key.toLowerCase();
    const prefix = node["x-attribsPrefix"]?.[key];
    const namespace =
      (name === "xmlns" && !prefix && value === SVG_NAMESPACE) ||
      (name === "xlink" &&
        prefix === "xmlns" &&
        value === "http://www.w3.org/1999/xlink");
    if (namespace) continue;
    if (
      (!attributes.has(name) && !/^(?:aria|data)-[a-z\d-]+$/.test(name)) ||
      (prefix && !(name === "href" && prefix === "xlink")) ||
      (name === "href" && !fragment.test(value)) ||
      (paints.has(name) &&
        (value.includes("\\") ||
          /(?:https?:|data:|javascript:|\/\/)/i.test(value) ||
          (/url\s*\(/i.test(value) && !localPaint.test(value))))
    ) {
      delete node.attribs[key];
    } else if (name === "style") {
      node.attribs[key] = cleanStyle(value);
    }
  }
}

/** Inline graphics only. Page CSS/JS may animate them under the existing sandbox. */
export function sanitizeSvg($: CheerioAPI) {
  const roots = $("svg").filter((_, node) => !$(node).parents("svg").length);
  for (const root of roots.toArray()) {
    const pending = [root];
    while (pending.length) {
      const node = pending.pop()!;
      if (
        node.namespace !== SVG_NAMESPACE ||
        !tags.has(node.tagName.toLowerCase())
      ) {
        $(node).remove();
        continue;
      }
      cleanAttributes(node);
      for (const child of node.children) {
        if ("tagName" in child) pending.push(child as Element);
      }
    }
  }
}
