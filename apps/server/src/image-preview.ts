import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Only called on demand by asset_view; display assets are never overwritten.
export async function imagePreview(filename: string, cacheDir: string) {
  const original = await readFile(filename);
  const key = createHash("sha256")
    .update(original)
    .update("preview-v1-1600-jpeg")
    .digest("hex");
  const cache = path.join(cacheDir, key + ".jpg");
  try {
    return await readFile(cache);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const buffer = await sharp(original, { limitInputPixels: 100_000_000 })
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#fff" })
    .jpeg({ quality: 75 })
    .toBuffer();
  if (buffer.length > 1024 * 1024) throw new Error("预览图仍超过 1 MiB");
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cache, buffer);
  return buffer;
}

export const CONTACT_SHEET_LIMIT = 12;
const CELL = 384,
  LABEL = 28;

/**
 * One labelled grid for several requested images, so a batched asset_view costs
 * one tool result instead of one model round per image. Display files are unchanged.
 */
export async function contactSheet(filenames: string[]) {
  if (!filenames.length || filenames.length > CONTACT_SHEET_LIMIT)
    throw new Error("批量查看数量无效");
  const columns = filenames.length <= 4 ? 2 : filenames.length <= 9 ? 3 : 4;
  const rows = Math.ceil(filenames.length / columns);
  const tiles = await Promise.all(
    filenames.map(async (file, index) => {
      const image = await sharp(await readFile(file), {
        limitInputPixels: 100_000_000,
      })
        .rotate()
        .resize(CELL - 8, CELL - LABEL - 8, {
          fit: "contain",
          background: "#fff",
        })
        .flatten({ background: "#fff" })
        .png()
        .toBuffer();
      const left = (index % columns) * CELL,
        top = Math.floor(index / columns) * CELL;
      const label = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${LABEL}"><rect width="100%" height="100%" fill="#111"/><text x="10" y="20" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="700" fill="#fff">${index + 1}</text></svg>`,
      );
      return [
        { input: label, left, top },
        { input: image, left: left + 4, top: top + LABEL + 4 },
      ];
    }),
  );
  const buffer = await sharp({
    create: {
      width: columns * CELL,
      height: rows * CELL,
      channels: 3,
      background: "#d9d9d9",
    },
  })
    .composite(tiles.flat())
    .jpeg({ quality: 72 })
    .toBuffer();
  if (buffer.length > 1024 * 1024) throw new Error("拼版预览超过 1 MiB");
  return buffer;
}
