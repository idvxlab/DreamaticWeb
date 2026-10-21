import { createHash } from "node:crypto";
import type {
  Project,
  PageIssue,
  PageCheck,
} from "../../../packages/shared/project.js";

export const htmlHash = (html: string) =>
  createHash("sha256").update(html).digest("hex");

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
