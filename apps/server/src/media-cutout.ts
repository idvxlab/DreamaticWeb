import sharp from "sharp";

/**
 * Deterministic background removal for document images on a light, even
 * backdrop (product renders, line drawings, charts). No model call. The edge
 * colour is sampled from the border; the backdrop grows inward from every edge
 * through pixels that stay close both to their neighbour (so gradients and
 * vignettes are followed) and to the edge colour (so the subject is not eaten).
 * Interior light areas that do not touch the backdrop are kept. Returns null
 * when the image does not have such a backdrop.
 */
export async function transparentVariant(buffer: Buffer) {
  const MAX = 2000;
  const { data, info } = await sharp(buffer, { limitInputPixels: 100_000_000 })
    .rotate()
    .resize(MAX, MAX, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  if (w < 48 || h < 48) return null;
  const at = (x: number, y: number) => (y * w + x) * 4;
  // Edge colour: per-channel median of a 2-pixel border.
  const border: number[] = [];
  for (let x = 0; x < w; x++)
    for (const y of [0, 1, h - 2, h - 1]) border.push(at(x, y));
  for (let y = 2; y < h - 2; y++)
    for (const x of [0, 1, w - 2, w - 1]) border.push(at(x, y));
  const median = [0, 1, 2].map((c) => {
    const values = border.map((i) => data[i + c]).sort((a, b) => a - b);
    return values[values.length >> 1];
  });
  const distance = (i: number, ref: number[]) =>
    Math.max(
      Math.abs(data[i] - ref[0]),
      Math.abs(data[i + 1] - ref[1]),
      Math.abs(data[i + 2] - ref[2]),
    );
  const lum = 0.2126 * median[0] + 0.7152 * median[1] + 0.0722 * median[2];
  const even = border.filter((i) => distance(i, median) <= 24).length;
  // Only light, even backdrops; photos that bleed to the edge are left alone.
  if (lum < 200 || even < border.length * 0.9) return null;
  const background = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0,
    tail = 0;
  const seed = (p: number) => {
    if (!background[p] && distance(p * 4, median) <= 24) {
      background[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < w; x++) (seed(x), seed((h - 1) * w + x));
  for (let y = 0; y < h; y++) (seed(y * w), seed(y * w + w - 1));
  while (head < tail) {
    const p = queue[head++];
    const x = p % w,
      y = (p / w) | 0,
      i = p * 4;
    for (const q of [
      x > 0 ? p - 1 : -1,
      x < w - 1 ? p + 1 : -1,
      y > 0 ? p - w : -1,
      y < h - 1 ? p + w : -1,
    ]) {
      if (q < 0 || background[q]) continue;
      const j = q * 4;
      if (
        Math.max(
          Math.abs(data[j] - data[i]),
          Math.abs(data[j + 1] - data[i + 1]),
          Math.abs(data[j + 2] - data[i + 2]),
        ) <= 6 &&
        distance(j, median) <= 48
      ) {
        background[q] = 1;
        queue[tail++] = q;
      }
    }
  }
  const share = tail / (w * h);
  // Nothing to remove, or the "subject" would be a few specks.
  if (share < 0.12 || share > 0.97) return null;
  const out = Buffer.from(data);
  for (let p = 0; p < w * h; p++) {
    if (background[p]) {
      out[p * 4 + 3] = 0;
      continue;
    }
    // Soften the one-pixel rim next to the backdrop so edges do not halo.
    const x = p % w,
      y = (p / w) | 0;
    const touches =
      (x > 0 && background[p - 1]) ||
      (x < w - 1 && background[p + 1]) ||
      (y > 0 && background[p - w]) ||
      (y < h - 1 && background[p + w]);
    if (touches) {
      const d = distance(p * 4, median);
      out[p * 4 + 3] = Math.min(255, Math.round((d / 48) * 255));
    }
  }
  return {
    buffer: await sharp(out, { raw: { width: w, height: h, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toBuffer(),
    width: w,
    height: h,
    removed: Number(share.toFixed(3)),
  };
}
