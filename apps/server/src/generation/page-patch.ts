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
  const one = (selector: string | undefined) => {
    if (!selector) throw new Error("缺少 selector");
    const node = $(selector);
    if (node.length !== 1)
      throw new Error("选择器必须精确匹配一个元素：" + selector);
    const tag = node.prop("tagName")?.toLowerCase() || "";
    if (["html", "head", "style", "script"].includes(tag))
      throw new Error("审查不改这个元素：" + selector);
    return node;
  };
  for (const op of operations) {
    const value = op.value || "";
    if (op.action === "arrange") {
      // One row of a picture and its words, rearranged as one of the Skill's arrangements.
      const row = one(op.selector);
      if (["body", "main"].includes(row.prop("tagName")?.toLowerCase() || ""))
        throw new Error("arrange 的 selector 是包含图片和文字的那一行，不是整页");
      // The picture selector is read inside the row first (such as "figure img"), then page-wide.
      if (!op.picture) throw new Error("arrange 需要 picture");
      const inside = row.find(op.picture);
      if (inside.length > 1)
        throw new Error("picture 在这一行里匹配到多个元素：" + op.picture);
      const pic = inside.length ? inside : one(op.picture);
      const col = row.children().filter((_i, c) => c === pic[0] || $(c).find(pic as never).length > 0);
      if (col.length !== 1) throw new Error("picture 必须在 selector 指定的那一行里面");
      const as = op.as || "";
      if (!["stacked", "wrapped", "beside", "sticky"].includes(as))
        throw new Error("as 只能是 stacked、wrapped、beside、sticky");
      const width = (op.width || "").trim();
      if (!LENGTH.test(width)) throw new Error("width 需要一个长度，如 720px 或 45%");
      const others = row.children().not(col);
      if ((as === "beside" || as === "sticky") && others.length !== 1)
        throw new Error("beside、sticky 需要这一行只有图片和一个文字块；先用 move 整理");
      const id = `review-${++arranged}`;
      row.attr("data-arrange", id);
      col.attr("data-arrange-picture", "");
      const r = `[data-arrange="${id}"]`,
        c = `${r} > [data-arrange-picture]`,
        side = op.side || (as === "stacked" ? "above" : "right");
      const media = `${c} img, ${c} video { width: 100%; height: auto; max-width: 100%; }`;
      if (as === "stacked") {
        if (side === "below") row.append(col);
        else row.prepend(col);
        css.push(
          `${r} { display: block !important; }`,
          `${c} { float: none !important; position: static !important; width: ${width} !important; max-width: 100% !important; margin: ${side === "below" ? "1.5rem auto 0" : "0 auto 1.5rem"} !important; }`,
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
          `${w} { float: ${left ? "left" : "right"} !important; width: min(${width}, 55%) !important; max-width: none !important; margin: ${left ? "0.3rem 2rem 1rem 0" : "0.3rem 0 1rem 2rem"} !important; position: static !important; }`,
          `${w} img, ${w} video { width: 100%; height: auto; max-width: 100%; }`,
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
  }
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
