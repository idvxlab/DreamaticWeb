import * as cheerio from "cheerio";
import type { Project } from "../../../../packages/shared/project.js";
import { patchSchema } from "../../../../packages/shared/generation.js";
export function applyPagePatch(project: Project, value: unknown) {
  const input = patchSchema.parse(value);
  const current = project.versions.at(-1);
  if (!current || current.id !== input.baseVersionId)
    throw new Error("页面已更新，请使用当前 baseVersionId");
  return patchHtml(current.html, input.operations);
}

/** The same selector operations applied to a page's HTML (used by the one visual review). */
export function patchHtml(
  html: string,
  operations: ReturnType<typeof patchSchema.parse>["operations"],
) {
  const input = { operations };
  const $ = cheerio.load(html);
  for (const op of input.operations) {
    const node = $(op.selector);
    if (node.length !== 1)
      throw new Error("选择器必须精确匹配一个元素：" + op.selector);
    const tag = node.prop("tagName")?.toLowerCase();
    if (
      ["html", "head", "body", "main"].includes(tag || "") &&
      ["replace_html", "remove", "set_text"].includes(op.action)
    )
      throw new Error("局部编辑不得替换页面根结构，请定位具体章节或组件");
    if (tag === "style" || tag === "script") {
      if (op.action === "append_html")
        throw new Error(`${tag} 内容请使用 set_text 修改，不要追加 HTML`);
      if (op.action === "replace_html") {
        const fragment = cheerio.load(op.value || "", null, false);
        const children = fragment
          .root()
          .contents()
          .filter((_i, e) => e.type !== "text" || !!e.data.trim());
        if (
          children.length !== 1 ||
          children.first().prop("tagName")?.toLowerCase() !== tag
        )
          throw new Error(
            `${tag} 替换必须保留单个 <${tag}> 标签；仅修改内容请使用 set_text`,
          );
      }
    }
    if (op.action === "remove") node.remove();
    else if (op.action === "set_text") node.text(op.value || "");
    else if (op.action === "replace_html") node.replaceWith(op.value || "");
    else if (op.action === "append_html") node.append(op.value || "");
    else if (op.action === "set_attribute") {
      if (
        !op.name ||
        !/^(?:id|class|title|alt|href|src|poster|lang|aria-[a-z-]+)$/.test(
          op.name,
        )
      )
        throw new Error("属性不允许修改");
      node.attr(op.name, op.value || "");
    } else {
      if (!op.name || !/^(?:--[a-z][a-z0-9-]*|[a-z][a-z-]*)$/.test(op.name))
        throw new Error("CSS 属性无效");
      node.css(op.name, op.value || "");
    }
  }
  return {
    html: "<!doctype html>\n" + $("html").toString(),
    operations: input.operations.length,
  };
}

/** What the one visual review may do: rearrange and resize, never take anything away. */
export type ReviewOperation = {
  action: "arrange" | "set_style" | "set_class" | "add_css" | "move" | "set_marker";
  selector?: string;
  name?: string;
  value?: string;
  target?: string;
  position?: "before" | "after" | "prepend" | "append";
  /** arrange: the picture inside the row, how the row is arranged, the picture's width and side. */
  picture?: string;
  as?: "stacked" | "wrapped" | "beside" | "sticky";
  width?: string;
  side?: "left" | "right" | "above" | "below";
};

const LENGTH = /^\d+(?:\.\d+)?(?:px|%|rem|em|ch|vw)$/;

const HIDING =
  /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0*)?\s*(?:;|$|!)|(?:^|[\s;{])(?:max-)?(?:height|width)\s*:\s*0(?:px)?\s*(?:;|$|!)|clip-path|content-visibility/i;

/** The visible words and pictures of a page, to check that a review kept all of them. */
function pageContent($: cheerio.CheerioAPI) {
  const body = $("body").clone();
  body.find("style,script,noscript,template").remove();
  const text = body.text().replace(/\s+/g, "");
  const media = $("img[src],video[src],source[src]")
    .map((_i, e) => $(e).attr("src"))
    .get()
    .sort();
  return { text, media };
}

/**
 * The review's corrections applied to a page. Only arrangement changes exist (inline style,
 * class, added CSS rules, moving an element); a marker of at most three characters (such as an
 * emoji standing for an icon) may be rewritten. The page must keep every word and picture.
 */
export function reviewPatchHtml(html: string, operations: ReviewOperation[]) {
  const $ = cheerio.load(html);
  const before = pageContent($);
  let markerChars = 0,
    arranged = 0;
  const css: string[] = [];
  // A selector that matches one element of several, written so the review can use it as given:
  // from the nearest element with an id or a blank mark, down by :nth-of-type.
  const pathOf = (el: unknown): string => {
    const steps: string[] = [];
    let node = $(el as never) as ReturnType<typeof $>;
    while (node.length && !["body", "html"].includes(node.prop("tagName")?.toLowerCase() || "")) {
      const id = node.attr("id"), gap = node.attr("data-gap");
      if (id && /^[A-Za-z][\w-]*$/.test(id)) return ["#" + id, ...steps].join(" > ");
      if (gap) return [`[data-gap="${gap}"]`, ...steps].join(" > ");
      const tag = node.prop("tagName")!.toLowerCase();
      const same = node.parent().children(tag);
      steps.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.index(node) + 1})` : tag);
      node = node.parent() as ReturnType<typeof $>;
    }
    return ["body", ...steps].join(" > ");
  };
  const options = (nodes: ReturnType<typeof $>) =>
    nodes.toArray().slice(0, 4).map((e) => pathOf(e)).join("、");
  const one = (selector: string | undefined) => {
    if (!selector) throw new Error("缺少 selector");
    const node = $(selector);
    if (node.length === 0)
      throw new Error("选择器没有匹配到元素：" + selector);
    if (node.length > 1)
      throw new Error(`选择器必须精确匹配一个元素，${selector} 匹配到 ${node.length} 个；可改用其中之一：${options(node)}`);
    const tag = node.prop("tagName")?.toLowerCase() || "";
    if (["html", "head", "style", "script"].includes(tag))
      throw new Error("审查不改这个元素：" + selector);
    return node;
  };
  // The operations are one correction: if any cannot apply, none is applied and every refusal is
  // reported, so the review can send the whole correction again with those fixed.
  const skipped: string[] = [];
  for (const op of operations) {
   try {
    const value = op.value || "";
    if (op.action === "arrange") {
      // One row of a picture and its words, rearranged as one of the Skill's arrangements.
      const row = one(op.selector);
      if (["body", "main"].includes(row.prop("tagName")?.toLowerCase() || ""))
        throw new Error("arrange 的 selector 是包含图片和文字的那一行，不是整页");
      // The picture is read inside the row (such as "figure img"), then page-wide; without one,
      // the row's pictures are taken when they sit in one of its columns.
      const rowMedia = row.find("img, video, canvas, picture").filter((_i, e) => !$(e).parent().is("picture"));
      const columnOf = (nodes: ReturnType<typeof $>) => {
        const cols = row.children().filter((_i, c) => nodes.toArray().some((n) => c === n || $(c).find(n as never).length > 0));
        return cols.length === 1 ? cols : undefined;
      };
      let pic: ReturnType<typeof $>;
      const inside = op.picture ? row.find(op.picture) : rowMedia;
      if (!inside.length && !op.picture) throw new Error("这一行里没有图片，arrange 只用于图片和文字的一行");
      if (inside.length > 1) {
        // Several pictures in one column are that column's set; elsewhere one must be named.
        const set = columnOf(inside);
        if (!set)
          throw new Error(`picture ${op.picture || "（未写）"} 在这一行的不同列里匹配到 ${inside.length} 张图；写明其中一张：${options(inside)}`);
        pic = set;
      } else pic = inside.length ? inside : one(op.picture);
      const col = row.children().filter((_i, c) => c === pic[0] || $(c).find(pic as never).length > 0);
      if (col.length !== 1)
        throw new Error(`picture 必须在 selector 指定的那一行里面；这一行里的图片：${options(rowMedia) || "没有"}`);
      if (!(pic.is("img, video, picture, svg, canvas") || pic.find("img, video, picture, svg, canvas").length))
        throw new Error("arrange 的 picture 必须是图片或包含图片；没有图片的卡片、列表不是 picture");
      const as = op.as || "";
      if (!["stacked", "wrapped", "beside", "sticky"].includes(as))
        throw new Error("as 只能是 stacked、wrapped、beside、sticky");
      // Without a width: a stacked picture at the reading width, a wrapped one at 42%, a beside or sticky one at 45%.
      const width = (op.width || (as === "stacked" ? "760px" : as === "wrapped" ? "42%" : "45%")).trim();
      if (!LENGTH.test(width)) throw new Error("width 需要一个长度，如 720px 或 45%");
      const others = row.children().not(col);
      if ((as === "beside" || as === "sticky") && others.length !== 1)
        throw new Error("beside、sticky 需要这一行只有图片和一个文字块；先用 move 整理");
      const pictures = col.is("img, video, picture, svg, canvas")
        ? 1
        : col.find("img, video, picture, canvas").length || col.find("svg").length;
      // Several pictures in a beside, sticky or wrapped column are set side by side as one set,
      // never stacked in a narrow column beside the words.
      const asSet = as !== "stacked" && pictures > 1;
      let id = `review-${++arranged}`;
      while ($(`[data-arrange="${id}"]`).length) id = `review-${++arranged}`;
      row.attr("data-arrange", id);
      col.attr("data-arrange-picture", "");
      const r = `[data-arrange="${id}"]`,
        c = `${r} > [data-arrange-picture]`,
        side = op.side || (as === "stacked" ? "above" : "right");
      const media =
        `${c} img, ${c} video { width: 100%; height: auto; max-width: 100%; }` +
        (asSet ? ` ${c} { display: flex !important; gap: 12px; align-items: flex-start; } ${c} > * { flex: 1 1 0; min-width: 0; }` : "");
      if (as === "stacked") {
        if (side === "below") row.append(col);
        else row.prepend(col);
        css.push(
          `${r} { display: block !important; }`,
          `${c} { display: block !important; float: none !important; position: static !important; width: ${width} !important; max-width: 100% !important; margin: ${side === "below" ? "1.5rem auto 0" : "0 auto 1.5rem"} !important; }`,
          media,
        );
      } else if (as === "wrapped") {
        // The picture floats inside the words' own block, so the words' measure (a max-width
        // such as a reading width) is the width it wraps in, and the words beside it keep at
        // least about 18em; narrower than that, the picture takes the block's width above them.
        const words = others.first();
        if (!words.length) throw new Error("wrapped 需要这一行里有文字块");
        words.prepend(col);
        const left = side === "left";
        const w = `${r} [data-arrange-picture]`;
        css.push(
          `${r} { display: block !important; }`,
          `${r} > :not([data-arrange-picture]) { display: flow-root !important; overflow: visible !important; }`,
          // A reading width set on each paragraph would leave only a strip beside the float;
          // the words' block keeps the measure, so lines run beside the picture and then below it.
          `${r} > :not([data-arrange-picture]) > :not([data-arrange-picture]) { max-width: none !important; }`,
          `${r} > :not([data-arrange-picture]) { max-width: ${width.endsWith("%") ? "min(100%, 70em)" : `min(100%, calc(40em + ${width} + 2rem))`} !important; }`,
          `${w} { float: ${left ? "left" : "right"} !important; width: min(${width}, 55%) !important; max-width: none !important; margin: ${left ? "0.3rem 2rem 1rem 0" : "0.3rem 0 1rem 2rem"} !important; position: static !important; }`,
          `${w} img, ${w} video { width: 100%; height: auto; max-width: 100%; }` +
            (asSet ? ` ${w} { display: flex !important; gap: 12px; align-items: flex-start; } ${w} > * { flex: 1 1 0; min-width: 0; }` : ""),
          `@container (max-width: 30em) { ${w} { float: none !important; width: auto !important; margin: 0 0 1rem !important; } }`,
          `${r} > :not([data-arrange-picture]) { container-type: inline-size; }`,
          `@media (max-width: 720px) { ${w} { float: none !important; width: auto !important; max-width: 100% !important; margin: 0 0 1rem !important; } }`,
        );
      } else {
        const left = side === "left";
        css.push(
          `${r} { display: grid !important; grid-template-columns: ${left ? `${width} minmax(0, 1fr)` : `minmax(0, 1fr) ${width}`} !important; align-items: start !important; column-gap: clamp(1.5rem, 3vw, 3rem) !important; }`,
          `${c} { order: ${left ? -1 : 1} !important; width: auto !important; max-width: none !important; margin: 0 !important; float: none !important; ${as === "sticky" ? "position: sticky !important; top: 6rem !important; align-self: start !important;" : "position: static !important;"} }`,
          `${r} > :not([data-arrange-picture]) { order: 0 !important; min-width: 0; }`,
          media,
          `@media (max-width: 720px) { ${r} { grid-template-columns: 1fr !important; } ${c} { position: static !important; } }`,
        );
      }
    } else if (op.action === "set_style") {
      const node = one(op.selector);
      if (!op.name || !/^(?:--[a-z][a-z0-9-]*|[a-z][a-z-]*)$/.test(op.name))
        throw new Error("CSS 属性无效");
      if (HIDING.test(`${op.name}:${value}`))
        throw new Error("审查不能隐藏内容：" + op.name);
      node.css(op.name, value);
      node.attr("data-reviewed", "");
    } else if (op.action === "set_class") {
      one(op.selector).attr("class", value).attr("data-reviewed", "");
    } else if (op.action === "add_css") {
      if (!value.trim()) throw new Error("add_css 需要 CSS 规则");
      if (/<\/?style|<script/i.test(value)) throw new Error("add_css 只写 CSS 规则");
      if (/data-gap/.test(value))
        throw new Error("data-gap 只是这次审查的临时标记，保存前会去掉；add_css 里用页面自己的类名、id 或 [data-arrange] 选择元素");
      if (HIDING.test(value)) throw new Error("审查不能隐藏内容");
      let style = $("style[data-review]");
      if (!style.length) {
        $("head").append("<style data-review></style>");
        style = $("style[data-review]");
      }
      style.text(style.text() + "\n" + value);
    } else if (op.action === "move") {
      const node = one(op.selector);
      const target = one(op.target);
      if (node.find(target as never).length || node.is(target as never))
        throw new Error("不能把元素移进它自己");
      const position = op.position || "after";
      const moved = node.remove().attr("data-reviewed", "");
      if (position === "before") target.before(moved);
      else if (position === "prepend") target.prepend(moved);
      else if (position === "append") target.append(moved);
      else target.after(moved);
    } else if (op.action === "set_marker") {
      // A marker selector may match each of a set's markers; all get the same value unless the
      // value lists one per marker separated by "|" (such as "01|02|03").
      if (!op.selector) throw new Error("缺少 selector");
      const nodes = $(op.selector);
      if (!nodes.length) throw new Error("选择器没有匹配元素：" + op.selector);
      const values = value.includes("|") ? value.split("|") : [];
      if (values.length && values.length !== nodes.length)
        throw new Error(`set_marker 的值个数（${values.length}）与匹配元素个数（${nodes.length}）不同`);
      nodes.each((i, e) => {
        const node = $(e);
        const old = node.text().trim();
        const v = values.length ? values[i] : value;
        if (node.children().length || [...old].length > 3 || [...v].length > 3)
          throw new Error("set_marker 只改三个字符以内的标记（如表情图标）");
        markerChars += [...old].length + [...v].length;
        node.text(v);
      });
    } else throw new Error("审查不支持这个操作：" + op.action);
   } catch (e) {
    skipped.push(`${op.action} ${op.selector || ""}: ${(e as Error).message}`);
   }
  }
  if (skipped.length)
    throw new Error(
      `这次修改没有应用（${skipped.length}/${operations.length} 项被拒）。改正这些项后把整组修改重新发一次：` +
        skipped.join("；"),
    );
  if (css.length) {
    let style = $("style[data-review]");
    if (!style.length) {
      $("head").append("<style data-review></style>");
      style = $("style[data-review]");
    }
    style.text(style.text() + "\n" + css.join("\n"));
  }
  const after = pageContent($);
  if (after.media.join("\n") !== before.media.join("\n"))
    throw new Error("审查不能增删或替换图片，只能调整它们的排列和大小");
  const sorted = (s: string) => [...s].sort().join("");
  if (
    Math.abs(after.text.length - before.text.length) > markerChars ||
    (!markerChars && sorted(after.text) !== sorted(before.text))
  )
    throw new Error("审查不能增删文字，只能调整排列");
  return {
    html: "<!doctype html>\n" + $("html").toString(),
    operations: operations.length,
  };
}

/** Every element in the body numbered (data-dn) in document order, for measuring the rendered page. */
export function tagElements(html: string) {
  const $ = cheerio.load(html);
  $("body *").each((i, e) => {
    $(e).attr("data-dn", String(i));
  });
  return "<!doctype html>\n" + $("html").toString();
}

/** The measured blanks written into the page as [data-gap="N"], by their data-dn index in the same page. */
export function markGaps(html: string, dns: number[]) {
  const $ = cheerio.load(html);
  $("[data-gap]").removeAttr("data-gap");
  const all = $("body *").toArray();
  dns.forEach((d, k) => {
    if (all[d]) $(all[d]).attr("data-gap", String(k + 1));
  });
  return "<!doctype html>\n" + $("html").toString();
}

export const stripGaps = (html: string) => html.replace(/ data-gap="\d+"/g, "");
