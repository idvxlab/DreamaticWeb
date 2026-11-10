// Builds the designer-taste Skill's single-document kit from a pinned taste-skill checkout (MIT).
// Usage: node scripts/build-taste-kit.mjs <upstream>/skills/taste-skill
// Output: .agents/skills/designer-taste/assets/taste.css and taste.js. No network.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const up = path.resolve(process.argv[2] || "");
const out = path.resolve(".agents/skills/designer-taste/assets");
const MOMENTS = [
  "pinned-chapters",
  "photo-chapters",
  "picture-develops",
  "counter-rolls",
  "headline-arrives",
  "window-parallax",
  "giant-type-pass",
];
// Local additions with the same contract, kept beside this script and marked as not upstream.
const LOCAL = ["product-close-up"];
const local = (id, ext) => readFile(path.resolve("scripts/taste-kit", `${id}.${ext}`), "utf8");
const read = (p) => readFile(path.join(up, p), "utf8");
const sha = (s) => createHash("sha256").update(s).digest("hex");

// Styles: the system, cards, hero layouts, the motion layer and the bundled moments.
const cssParts = [
  "assets/system.css",
  "assets/ui/cards.css",
  "assets/layout/layout.css",
  "assets/motion/motion.css",
  ...MOMENTS.map((m) => `assets/moments/${m}/moment.css`),
];
let css = "/* designer-taste kit: adapted from taste-skill (MIT, Leonxlnx). Inlined by the host. */\n";
for (const p of cssParts) css += `\n/* ${p} */\n` + (await read(p));
for (const id of LOCAL) css += `\n/* local: ${id} */\n` + (await local(id, "css"));
// Remote fonts are blocked by the page policy; the kit's own system font stacks remain.
css = css.replace(/@import[^;]+;/g, "");

// Scripts: motion.js is a plain script; moments are ES modules, bundled without dynamic import().
// motion.js starts itself on DOMContentLoaded; its exports are only for the upstream module API.
const motion = (await read("assets/motion/motion.js"))
  .replace(/^export function init/m, "function init")
  .replace(/^export const refresh = init;?$/m, "")
  .replace(/^export default \{ init, refresh \};?$/m, "");
if (/^\s*(import|export)\b/m.test(motion)) throw new Error("motion.js changed its module shape");
const lib = (await read("assets/moments/lib.js"))
  .replace(/^export (const|function|let)/gm, "$1")
  .replace(/^export default .*$/gm, "");
let moments = "";
for (const id of [...MOMENTS, ...LOCAL]) {
  let src = LOCAL.includes(id)
    ? await local(id, "js")
    : await read(`assets/moments/${id}/moment.js`);
  if (/^\s*import\b/m.test(src)) throw new Error(`${id} imports a module`);
  const phone = /^export const phone\s*=\s*true/m.test(src);
  src = src
    .replace(/^export const phone\s*=\s*true;?/m, "")
    .replace(/^export default function/m, "return function");
  moments += `\nM[${JSON.stringify(id)}] = { phone: ${phone}, mount: (function () {\n${src}\n})() };\n`;
}
const loader = `
// Static loader adapted from moments/moments.js: same mount(root, opts, lib) contract, no import().
const html = document.documentElement;
const STRUCTURE = { "pinned-chapters": ".mo-pc__grid", "photo-chapters": ".mo-ph", "product-close-up": ".mo-cu__stage" };
const libApi = { reduced, phone, still, stillWhy, inCard, coarse, clamp, lerp, ease, scrub, once, split, lines, fontsReady };
function mount(el) {
  if (el.__momentMounted) return;
  el.__momentMounted = true;
  const id = el.dataset.moment, mod = M[id];
  if (!mod) { el.dataset.momentFailed = "not in kit"; el.classList.add("mo-safe", "is-done"); return; }
  // The scroll moments' CSS needs main > section > block. With any other structure the
  // stage would collapse to nothing, so the section stays in its readable static state.
  const block = STRUCTURE[id];
  if (block && !(el.parentElement && el.parentElement.tagName === "MAIN" && [...el.children].some((c) => c.matches(block)))) {
    el.dataset.momentFailed = "structure: main > [data-moment] > " + block;
    el.classList.add("mo-safe", "is-done");
    console.warn("designer-taste: " + id + " needs main > section > " + block + "; shown static");
    return;
  }
  let opts = {};
  try { opts = JSON.parse(el.dataset.momentOpts || "{}"); } catch {}
  const card = inCard(el);
  const why = mod.phone ? (reduced() ? "reduced" : "") : stillWhy();
  if (card) el.dataset.momentStill = "card"; else if (why) el.dataset.momentStill = why;
  try {
    el.__moment = mod.mount(el, opts, { ...libApi, reduced: () => card || (mod.phone ? reduced() : still()) }) || {};
    el.dataset.momentMounted = "1";
  } catch (e) {
    el.dataset.momentFailed = String(e && e.message || e);
    el.classList.add("mo-safe", "is-done");
    el.classList.remove("is-live");
  }
}
html.classList.add("mo-js");
setTimeout(() => html.classList.add("mo-safe"), 2500);
const start = () => {
  const els = [...document.querySelectorAll("[data-moment]")].filter((el) => !el.parentElement?.closest("[data-moment]"));
  els.forEach(mount);
  html.dataset.momentsReady = String(els.length);
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
`;
const js = `/* designer-taste kit: adapted from taste-skill (MIT, Leonxlnx). Inlined by the host. */
(function () {
${motion}
})();
(function () {
const M = {};
${lib}
${moments}
${loader}
})();
`;
await mkdir(out, { recursive: true });
await writeFile(path.join(out, "taste.css"), css);
// An inline <script> ends at the first "</script": keep upstream comments from closing it.
await writeFile(path.join(out, "taste.js"), js.replace(/<\/(script)/gi, "<\\/$1"));
console.log(JSON.stringify({ css: css.length, js: js.length, cssSha: sha(css), jsSha: sha(js), moments: [...MOMENTS, ...LOCAL] }));
