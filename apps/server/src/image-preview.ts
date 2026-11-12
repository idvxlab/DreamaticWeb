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

/** Six large tiles per sheet: big enough that a picture is read from its pixels, not its caption. */
export const CONTACT_SHEET_LIMIT = 6;
/** One asset_view call may name four sheets' worth of candidates; the host splits them. */
export const ASSET_VIEW_LIMIT = CONTACT_SHEET_LIMIT * 4;
const CELL = 384,
  COLUMNS = 3,
  LABEL = 28;

/**
 * One labelled grid for up to six images. Each tile's label carries its number (continuous
 * across sheets through `firstNumber`) and a short tag (the asset id's first characters), so
 * the model reads which asset a tile is from the picture itself.
 */
export async function contactSheet(
  filenames: string[],
  options: { firstNumber?: number; tags?: string[] } = {},
) {
  const cell = CELL;
  const firstNumber = options.firstNumber ?? 1,
    tags = options.tags || [];
  if (!filenames.length || filenames.length > CONTACT_SHEET_LIMIT)
    throw new Error("批量查看数量无效");
  const columns = Math.min(COLUMNS, filenames.length);
  const rows = Math.ceil(filenames.length / columns);
  const fontSize = 18;
  const unreadable: number[] = [];
  const tiles = await Promise.all(
    filenames.map(async (file, index) => {
      // An undecodable picture leaves its tile blank instead of failing the whole sheet.
      const image = await sharp(await readFile(file), {
        limitInputPixels: 100_000_000,
      })
        .rotate()
        .resize(cell - 8, cell - LABEL - 8, {
          fit: "contain",
          background: "#fff",
        })
        .flatten({ background: "#fff" })
        .png()
        .toBuffer()
        .catch(() => {
          unreadable.push(index + firstNumber);
          return sharp({
            create: {
              width: cell - 8,
              height: cell - LABEL - 8,
              channels: 3,
              background: "#f2f2f2",
            },
          })
            .png()
            .toBuffer();
        });
      const left = (index % columns) * cell,
        top = Math.floor(index / columns) * cell;
      const tag = (tags[index] || "").replace(/[^a-z0-9]/gi, "");
      const label = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${LABEL}"><rect width="100%" height="100%" fill="#111"/><text x="8" y="20" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff">${index + firstNumber}${tag ? " · " + tag : ""}</text></svg>`,
      );
      return [
        { input: label, left, top },
        { input: image, left: left + 4, top: top + LABEL + 4 },
      ];
    }),
  );
  const canvas = () =>
    sharp({
      create: {
        width: columns * cell,
        height: rows * cell,
        channels: 3,
        background: "#d9d9d9",
      },
    }).composite(tiles.flat());
  let buffer = await canvas().jpeg({ quality: 72 }).toBuffer();
  if (buffer.length > 1024 * 1024)
    buffer = await canvas().jpeg({ quality: 55 }).toBuffer();
  if (buffer.length > 1024 * 1024) throw new Error("拼版预览超过 1 MiB");
  return Object.assign(buffer, { unreadable: unreadable.sort((a, b) => a - b) });
}
