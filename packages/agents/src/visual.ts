import { z } from "zod";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ImageContent } from "@earendil-works/pi-ai";
import type { Project, Source } from "./contracts.js";
import { projectDir } from "../../../apps/server/src/store.js";

const notes = z.array(z.string().max(400)).max(8);
export const visualConstraintsSchema = z.object({
  requested: notes,
  avoid: notes,
  preserve: notes,
});
export const visualEvidenceSchema = z
  .array(
    z.object({
      sourceId: z.string().optional(),
      assetId: z.string().optional(),
      role: z.enum(["brand", "reference"]),
      basis: z.enum(["specified", "observed", "inferred", "unverified"]),
      cues: z.string().max(600),
      colors: z.array(z.string().max(80)).max(6),
    }),
  )
  .max(8);

type Candidate = { source: Source; asset: Source["assets"][number] };
export type ImageEntry = {
  position: number;
  sourceId: string;
  assetId: string;
  url: string;
  name: string;
};
/** Per-run cache reuses initial images. Each stage retains the existing 8/4MB/12MB budgets. */
export function imageHandoff(project: Project) {
  const cache = new Map<string, { image: ImageContent; size: number }>();
  return async (candidates: Candidate[], enabled: boolean) => {
    const images: ImageContent[] = [],
      imageInputOrder: ImageEntry[] = [];
    const unavailable: { assetId: string; reason: string }[] = [];
    let bytes = 0,
      omitted = 0;
    for (const { source, asset } of candidates) {
      let reason = "";
      if (!enabled) reason = "model has no image input";
      else if (images.length >= 8) reason = "image count budget";
      else if (
        !asset.url.startsWith(`/assets/${project.id}/`) ||
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          asset.mime,
        )
      )
        reason = "unsupported or out-of-scope image";
      else {
        try {
          const file = path.join(
            projectDir(project.id),
            "assets",
            path.basename(asset.url),
          );
          let item = cache.get(asset.id);
          const size = item?.size ?? (await stat(file)).size;
          if (size > 4 * 1024 * 1024 || bytes + size > 12 * 1024 * 1024)
            reason = "image byte budget";
          else {
            if (!item) {
              const data = await readFile(file);
              if (
                data.length > 4 * 1024 * 1024 ||
                bytes + data.length > 12 * 1024 * 1024
              )
                throw new Error("image changed size");
              item = {
                image: {
                  type: "image",
                  data: data.toString("base64"),
                  mimeType: asset.mime,
                },
                size: data.length,
              };
              cache.set(asset.id, item);
            }
            bytes += item.size;
            images.push(item.image);
            imageInputOrder.push({
              position: images.length,
              sourceId: source.id,
              assetId: asset.id,
              url: asset.url,
              name: asset.name,
            });
          }
        } catch {
          reason = "image unavailable";
        }
      }
      if (reason) {
        omitted++;
        if (unavailable.length < 16)
          unavailable.push({ assetId: asset.id, reason });
      }
    }
    return { images, imageInputOrder, unavailable, omitted };
  };
}

/** Explicit brand references first, then Analyst's final recommendation order. */
export function recommendedImages(
  project: Project,
  analysis: {
    assets: { url: string; sourceId: string }[];
    visualEvidence?: z.infer<typeof visualEvidenceSchema>;
  },
) {
  const catalog = project.sources.flatMap((source) =>
    source.assets
      .filter((asset) => asset.type === "image")
      .map((asset) => ({ source, asset })),
  );
  const selected = analysis.assets.flatMap((a) => {
    const match = catalog.find(
      (c) => c.source.id === a.sourceId && c.asset.url === a.url,
    );
    return match ? [match] : [];
  });
  const brandIds = new Set(
    analysis.visualEvidence
      ?.filter((e) => e.role === "brand")
      .map((e) => e.assetId),
  );
  return [...new Map(selected.map((c) => [c.asset.id, c])).values()].sort(
    (a, b) =>
      Number(brandIds.has(b.asset.id)) - Number(brandIds.has(a.asset.id)),
  );
}
