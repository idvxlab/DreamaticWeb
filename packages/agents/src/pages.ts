import path from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import * as cheerio from "cheerio";
import { z } from "zod";
import { projectDir } from "../../../apps/server/src/store.js";
import { sanitizeHtml } from "../../../apps/server/src/html.js";
import type { Project } from "./contracts.js";
const uuid = z.string().uuid();
export interface PageIssue {
  severity: "error" | "warning";
  code: string;
  selector?: string;
  message: string;
}
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
export async function saveCandidate(
  project: Project,
  html: string,
  baseVersionId = project.versions.at(-1)?.id || "",
) {
  const id = crypto.randomUUID(),
    dir = path.join(projectDir(project.id), "drafts");
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, id + ".json"),
    JSON.stringify({ id, html, baseVersionId }),
    { mode: 0o600 },
  );
  return id;
}
export async function readCandidate(project: Project, candidateId: string) {
  uuid.parse(candidateId);
  const draft = JSON.parse(
    await readFile(
      path.join(projectDir(project.id), "drafts", candidateId + ".json"),
      "utf8",
    ),
  ) as { html: string; baseVersionId: string };
  if (draft.baseVersionId !== (project.versions.at(-1)?.id || ""))
    throw new Error(
      "Candidate is stale: the saved page changed; read the current version and regenerate the patch",
    );
  return draft;
}
export const patchSchema = z.object({
  baseVersionId: z.string().uuid(),
  candidateId: z.string().uuid().optional(),
  operations: z
    .array(
      z.object({
        selector: z.string().min(1).max(300),
        action: z.enum([
          "set_text",
          "set_attribute",
          "set_style",
          "replace_html",
          "append_html",
          "remove",
        ]),
        name: z.string().max(100).optional(),
        value: z.string().max(200000).optional(),
      }),
    )
    .min(1)
    .max(30),
});
export async function patchPage(project: Project, input: unknown) {
  const args = patchSchema.parse(input),
    current = project.versions.at(-1);
  if (!current || current.id !== args.baseVersionId)
    throw new Error(
      "Stale baseVersionId: read the latest saved version before patching",
    );
  const base = args.candidateId
    ? (await readCandidate(project, args.candidateId)).html
    : current.html;
  const $ = cheerio.load(base),
    changes: string[] = [];
  for (const op of args.operations) {
    const node = $(op.selector);
    if (node.length !== 1)
      throw new Error(
        `Selector must match exactly one element: ${op.selector} (${node.length} matches)`,
      );
    if (op.action === "remove") {
      if (
        ["html", "head", "body"].includes(
          node.prop("tagName")?.toLowerCase() || "",
        )
      )
        throw new Error("Cannot remove the document root");
      node.remove();
    } else if (op.action === "set_text") node.text(op.value || "");
    else if (op.action === "replace_html") node.replaceWith(op.value || "");
    else if (op.action === "append_html") node.append(op.value || "");
    else if (op.action === "set_attribute") {
      if (
        !op.name ||
        !/^(?:id|class|title|alt|href|src|poster|lang|aria-[a-z-]+)$/.test(
          op.name,
        )
      )
        throw new Error("Attribute is not permitted");
      node.attr(op.name, op.value || "");
    } else {
      if (!op.name || !/^(?:--[a-z][a-z0-9-]*|[a-z][a-z-]*)$/.test(op.name))
        throw new Error("Invalid CSS property");
      node.css(op.name, op.value || "");
    }
    changes.push(`${op.action}: ${op.selector}`);
  }
  const report = await validatePage(project, "<!doctype html>\n" + $.html());
  const candidateId = await saveCandidate(
    project,
    report.html,
    args.baseVersionId,
  );
  return {
    candidateId,
    baseVersionId: args.baseVersionId,
    changes,
    valid: report.valid,
    issues: report.issues,
    instruction:
      "Candidate only; inspect/preview and finish with {candidateId}. The host commits only a valid result.",
  };
}
