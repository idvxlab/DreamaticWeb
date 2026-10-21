import path from "node:path";
import { access } from "node:fs/promises";
import * as cheerio from "cheerio";
import { projectDir } from "./store.js";
import { sanitizeHtml } from "./html.js";
import type { Project, PageIssue } from "../../../packages/shared/project.js";
export async function validatePage(project: Project, raw: string) {
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
  if (!$("body").text().trim() && !$("body img,body video,body audio").length)
    issues.push({
      severity: "error",
      code: "empty",
      message: "The page has no visible content",
    });
  if (before("script,iframe,object,embed,link,svg").length)
    issues.push({
      severity: "warning",
      code: "removed_content",
      message:
        "Active content/external dependencies/SVG will be removed by preview policy",
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
