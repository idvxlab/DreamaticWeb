import { usableAsset } from "./media-layout.js";
import path from "node:path";
import { access } from "node:fs/promises";
import * as cheerio from "cheerio";
import { projectDir } from "./store.js";
import { sanitizeHtml } from "./html.js";
import type { Project, PageIssue } from "../../../packages/shared/project.js";
export async function validatePage(
  project: Project,
  raw: string,
  /** Generated pages must not present layout fragments as content; manual saves only warn. */
  options: { rejectUnusableMedia?: boolean } = {},
) {
  const issues: PageIssue[] = [];
  if (raw.length > 2500000) throw new Error("HTML exceeds 2.5M characters");
  if (!/<html[\s>]/i.test(raw) || !/<body[\s>]/i.test(raw))
    issues.push({
      severity: "error",
      code: "document",
      message: "Return a full HTML document with html and body",
    });
  const html = sanitizeHtml(raw),
    $ = cheerio.load(html),
    before = cheerio.load(raw);
  // A damaged style replacement becomes a direct body text node. Code samples
  // inside pre/code and ordinary prose are not part of this structural check.
  if (
    $("body")
      .contents()
      .toArray()
      .some((node) => {
        if (node.type !== "text") return false;
        const text = node.data.trim();
        return (
          /^(?:```(?:css|html)\b|<\/?(?:html|head|body)\b)/i.test(text) ||
          /^(?:[.#:[*][^{}<>]*|[a-z][\w-]*(?:[.#:[\s>+~][^{}<>]*)?)\s*\{\s*(?:--[\w-]+|[a-z-]+)\s*:[^{}]*\}/i.test(
            text,
          )
        );
      })
  )
    issues.push({
      severity: "error",
      code: "visible_source",
      message:
        "CSS/HTML source is visible directly in body; keep CSS in style and code examples in pre/code",
    });
  if (!$("body").text().trim() && !$("body img,body video,body audio").length)
    issues.push({
      severity: "error",
      code: "empty",
      message: "The page has no visible content",
    });
  if (before("script[src],iframe,object,embed,link").length)
    issues.push({
      severity: "warning",
      code: "removed_content",
      message:
        "Active content/external dependencies will be removed by preview policy",
    });
  if (
    JSON.stringify(
      before("svg")
        .toArray()
        .map((node) => before(node).toString()),
    ) !==
    JSON.stringify(
      $("svg")
        .toArray()
        .map((node) => $(node).toString()),
    )
  )
    issues.push({
      severity: "warning",
      code: "svg_policy",
      message:
        "Unsupported SVG content or non-local references were removed; use inline graphics with page CSS/JavaScript",
    });
  const originalRoots = before("svg").filter(
    (_, node) => !before(node).parents("svg").length,
  );
  const savedRoots = $("svg").filter(
    (_, node) => !$(node).parents("svg").length,
  );
  originalRoots.each((index, node) => {
    // Do not accept an icon/scene reduced to an empty shell. Definitions-only
    // SVGs and empty containers intended for page JavaScript remain valid.
    if (
      before(node)
        .find("*")
        .toArray()
        .some((child) =>
          ["foreignobject", "image"].includes(child.tagName.toLowerCase()),
        ) &&
      !savedRoots
        .eq(index)
        .find("path,circle,ellipse,rect,line,polygon,polyline,text,use").length
    )
      issues.push({
        severity: "error",
        code: "svg_empty",
        message:
          "SVG lost its only visual content during filtering; use supported SVG geometry or an HTML image",
      });
  });
  if (before.html() !== cheerio.load(html).html())
    issues.push({
      severity: "warning",
      code: "policy",
      message:
        "Preview policy normalized the document; validate and preview use the sanitized candidate",
    });
  const ids = new Set<string>();
  $("[id]").each((_i, e) => {
    const id = $(e).attr("id")!;
    if (ids.has(id))
      issues.push({
        severity: "error",
        code: "duplicate_id",
        selector: `[id=${JSON.stringify(id)}]`,
        message: `Duplicate ID: ${id}`,
      });
    ids.add(id);
  });
  $('a[href^="#"]').each((_i, e) => {
    let target = $(e).attr("href")!.slice(1);
    try {
      target = decodeURIComponent(target);
    } catch {}
    if (target && !ids.has(target))
      issues.push({
        severity: "error",
        code: "anchor",
        selector: "a[href=" + JSON.stringify("#" + target) + "]",
        message: `Missing anchor target: ${target}`,
      });
  });
  $("img").each((_i, e) => {
    if (!$(e).attr("src"))
      issues.push({
        severity: "error",
        code: "image_src",
        message: "Image has no permitted src",
      });
    if ($(e).attr("alt") === undefined)
      issues.push({
        severity: "warning",
        code: "image_alt",
        message: "Image is missing alt text",
      });
  });
  if (!$("h1").length)
    issues.push({
      severity: "warning",
      code: "heading",
      message: "Consider a descriptive h1",
    });
  const references = [...new Set(raw.match(/\/assets\/[a-z\d/_.-]+/gi) || [])];
  for (const url of references) {
    const owned = project.sources.some((s) =>
      s.assets.some((a) => a.url === url),
    );
    if (!url.startsWith(`/assets/${project.id}/`) || !owned)
      issues.push({
        severity: "error",
        code: "asset_scope",
        message: `Asset is not in this project's source catalog: ${url}`,
      });
    else if (
      project.sources.some((s) =>
        s.assets.some((a) => a.url === url && !usableAsset(a)),
      )
    )
      issues.push({
        severity: options.rejectUnusableMedia ? "error" : "warning",
        code: "asset_unusable",
        message: `Asset is a flat colour tile or an empty frame from the document layout, not standalone content; choose another asset or omit it: ${url}`,
      });
    else {
      try {
        await access(
          path.join(projectDir(project.id), "assets", path.basename(url)),
        );
      } catch {
        issues.push({
          severity: "error",
          code: "asset_missing",
          message: `Missing asset file: ${url}`,
        });
      }
    }
  }
  const beforeImgs = before("img[src]")
    .toArray()
    .map((e) => before(e).attr("src")!);
  if (beforeImgs.some((src) => /^https?:/i.test(src)))
    issues.push({
      severity: "warning",
      code: "external_image",
      message: "Remote images are blocked; use imported project assets",
    });
  if (/@import|url\(\s*['"]?https?:/i.test(raw))
    issues.push({
      severity: "warning",
      code: "external_css",
      message: "External CSS/font/image requests are blocked by preview CSP",
    });
  return {
    valid: !issues.some((i) => i.severity === "error"),
    issues: issues.slice(0, 100),
    html,
  };
}
