import sharp from "sharp";
import { inlinePageAssets } from "./page-export.js";

/** Desktop width the page is looked at, and the height of one screenshot handed to the model. */
const WIDTH = 1440;
const SLICE = 1800;
const MAX_SLICES = 8;

/**
 * The page as a desktop visitor sees it: a headless browser renders the single HTML file (its
 * project pictures inlined, nothing fetched) and the full page is cut into a few screenshots,
 * halved in size. System Chrome is used when present, else Playwright's headless Chromium.
 * Returns no screenshots when no browser can start, so generation never depends on it.
 */
export async function pageScreenshots(projectId: string, html: string) {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    return [];
  }
  const launch = async () => {
    try {
      return await chromium.launch({ channel: "chrome", headless: true });
    } catch {
      return await chromium.launch({ headless: true });
    }
  };
  let browser;
  try {
    browser = await launch();
  } catch {
    return [];
  }
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 } });
    await page.route("**/*", (route) =>
      route.request().url().startsWith("data:") ? route.continue() : route.abort(),
    );
    await page.setContent(await inlinePageAssets(projectId, html), {
      waitUntil: "load",
      timeout: 20000,
    });
    // Scroll through once so reveal-on-scroll content is shown, then back to the top.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 800) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(80);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const full = await page.screenshot({ fullPage: true, type: "png" });
    const meta = await sharp(full).metadata();
    const width = meta.width || WIDTH,
      total = meta.height || 0;
    const step = Math.max(SLICE, Math.ceil(total / MAX_SLICES));
    const slices: Buffer[] = [];
    for (let top = 0; top < total; top += step)
      slices.push(
        await sharp(full)
          .extract({ left: 0, top, width, height: Math.min(step, total - top) })
          .resize({ width: Math.round(width / 2) })
          .jpeg({ quality: 78 })
          .toBuffer(),
      );
    return slices;
  } catch {
    return [];
  } finally {
    await browser.close().catch(() => {});
  }
}
