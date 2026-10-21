import * as cheerio from "cheerio";
import type { Project } from "../../../../packages/shared/project.js";
import { patchSchema } from "../../../../packages/shared/generation.js";
export function applyPagePatch(project: Project, value: unknown) {
  const input = patchSchema.parse(value);
  const current = project.versions.at(-1);
  if (!current || current.id !== input.baseVersionId)
    throw new Error("页面已更新，请使用当前 baseVersionId");
  const $ = cheerio.load(current.html);
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
