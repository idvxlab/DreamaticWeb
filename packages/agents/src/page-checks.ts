import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { Project } from "./contracts.js";
import type { PageIssue } from "./pages.js";
import { handoffBriefSchema } from "./brief.js";
import { usedImages } from "./design-result.js";

export const htmlHash = (html: string) =>
  createHash("sha256").update(html).digest("hex");
export interface PageCheck {
  hash: string;
  status: "not-previewed" | "previewed" | "warnings";
  viewports: { width: number; height: number }[];
  issues: PageIssue[];
}
/** Independent of structural validation so all entry points share the same policy. */
export function mediaIssues(project: Project, html: string): PageIssue[] {
  const brief = handoffBriefSchema.safeParse(project.brief);
  if (!brief.success) return [];
  const $ = cheerio.load(html);
  const css =
    $("style").text() +
    $("[style]")
      .map((_, e) => $(e).attr("style"))
      .get()
      .join("\n");
  if (brief.data.mediaPolicy === "text-only") {
    const urls = [
      ...css
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi),
    ].map((m) => m[1]);
    const imageUrls = new Set(
      project.sources
        .flatMap((s) => s.assets)
        .filter((a) => a.type === "image")
        .map((a) => a.url),
    );
    if (
      $("img,picture,svg,video,audio,input[type=image]").length ||
      /(?:image-set|cross-fade)\s*\(/i.test(css) ||
      urls.some(
        (url) =>
          imageUrls.has(url) ||
          /^data:image\//i.test(url) ||
          /\.(png|jpe?g|webp|gif|svg)(?:[?#]|$)/i.test(url),
      )
    )
      return [
        {
          severity: "error",
          code: "media_policy",
          message:
            "The brief requires a text-only page; remove images and image backgrounds.",
        },
      ];
    return [];
  }
  const analysis = project.analysis as
    { assets?: { url: string }[] } | undefined;
  const imageUrls = new Set(
    project.sources
      .flatMap((s) => s.assets)
      .filter((a) => a.type === "image")
      .map((a) => a.url),
  );
  const recommended =
    analysis?.assets?.filter((a) => imageUrls.has(a.url)) || [];
  if (
    recommended.length &&
    !usedImages(project, html).some((a) =>
      recommended.some((r) => r.url === a.url),
    )
  )
    return [
      {
        severity: "error",
        code: "recommended_image",
        message:
          "The page omitted all recommended document images. Include a relevant recommended image in img src or CSS background; preserve the user request.",
      },
    ];
  return [];
}
export function pageChecks(
  project: Project,
  html: string,
  issues: PageIssue[],
): PageCheck {
  const hash = htmlHash(html);
  const previews = (project.pagePreviews || []).filter((p) => p.hash === hash);
  const warnings: PageIssue[] = previews.flatMap((p) => [
    ...(p.overflow
      ? [
          {
            severity: "warning" as const,
            code: "overflow",
            message: `Horizontal overflow at ${p.width}px`,
          },
        ]
      : []),
    ...p.missingImages.map((src) => ({
      severity: "warning" as const,
      code: "preview_image",
      message: `Missing image: ${src}`,
    })),
    ...p.contrast.map((c) => ({
      severity: "warning" as const,
      code: "contrast",
      selector: c.selector,
      message: `Text contrast ${c.ratio}:1; requires ${c.required}:1 at ${p.width}px`,
    })),
  ]);
  return {
    hash,
    status: warnings.length
      ? "warnings"
      : previews.length
        ? "previewed"
        : "not-previewed",
    viewports: previews.map(({ width, height }) => ({ width, height })),
    issues: [
      ...issues,
      ...warnings.filter(
        (w) =>
          !issues.some(
            (i) =>
              i.code === w.code &&
              i.selector === w.selector &&
              i.message === w.message,
          ),
      ),
    ],
  };
}
export function generatedPageIssues(check: PageCheck): PageIssue[] {
  // Known failures must be corrected. Browser absence never becomes a false pass.
  return check.issues
    .filter(
      (i) =>
        i.code === "contrast" ||
        i.code === "preview_image" ||
        i.code === "overflow",
    )
    .map((i) => ({ ...i, severity: "error" }));
}
