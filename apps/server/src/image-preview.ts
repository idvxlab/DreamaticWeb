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
