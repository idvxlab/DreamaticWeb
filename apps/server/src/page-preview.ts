import { chromium } from "playwright-core";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { projectDir } from "./store.js";
import { sanitizeHtml } from "./html.js";
import type { Project } from "../../../packages/agents/src/contracts.js";
export async function previewPage(
  project: Project,
  html: string,
  viewport: { width: number; height: number },
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const candidates = [
    process.env.DREAMATIC_BROWSER_PATH,
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter(Boolean) as string[];
  let executablePath: string | undefined;
  for (const candidate of candidates) {
    try {
      await access(candidate);
      executablePath = candidate;
      break;
    } catch {}
  }
  if (!executablePath)
    throw new Error(
      "Browser unavailable. Install Chrome/Chromium and set DREAMATIC_BROWSER_PATH. No preview was performed.",
    );
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    timeout: 10000,
  });
  const abort = () => {
    void browser.close();
  };
  signal?.addEventListener("abort", abort, { once: true });
  const deadline = setTimeout(abort, 20000);
  try {
    signal?.throwIfAborted();
    const context = await browser.newContext({
      viewport,
      javaScriptEnabled: false,
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    const page = await context.newPage(),
      blocked: string[] = [];
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (
        route.request().isNavigationRequest() &&
        url.href === "http://dreamatic-preview.invalid/"
      )
        return route.fulfill({
          contentType: "text/html",
          body: sanitizeHtml(html),
        });
      const asset = project.sources
        .flatMap((s) => s.assets)
        .find((a) => a.url === url.pathname);
      if (
        url.origin === "http://dreamatic-preview.invalid" &&
        asset &&
        asset.url.startsWith(`/assets/${project.id}/`)
      ) {
        try {
          const body = await readFile(
            path.join(
              projectDir(project.id),
              "assets",
              path.basename(asset.url),
            ),
          );
          return route.fulfill({
            body,
            contentType:
              (await fileTypeFromBuffer(body))?.mime ||
              "application/octet-stream",
          });
        } catch {}
      }
      blocked.push(url.href.slice(0, 300));
      await route.abort();
    });
    await page.goto("http://dreamatic-preview.invalid/", {
      waitUntil: "load",
      timeout: 10000,
    });
    const metrics = await page.evaluate(() => ({
      title: document.title,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      pageHeight: document.documentElement.scrollHeight,
      missingImages: [...document.images]
        .filter((i) => !i.complete || !i.naturalWidth)
        .slice(0, 30)
        .map((i) => i.getAttribute("src")),
      overflowElements: [...document.body.querySelectorAll("*")]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
        })
        .slice(0, 30)
        .map((e) => ({
          tag: e.tagName,
          id: e.id,
          class: e.getAttribute("class"),
        })),
    }));
    const png = await page.screenshot({ type: "png", timeout: 5000 });
    signal?.throwIfAborted();
    const id = crypto.randomUUID(),
      dir = path.join(projectDir(project.id), "previews");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, id + ".png"), png, { mode: 0o600 });
    const report = {
      viewport,
      ...metrics,
      blockedRequests: blocked.slice(0, 30),
      screenshot: `previews/${id}.png`,
      screenshotScope: "viewport",
      policy:
        "Sanitized HTML, JavaScript disabled, external network blocked; project assets only",
    };
    await writeFile(path.join(dir, id + ".json"), JSON.stringify(report), {
      mode: 0o600,
    });
    return { report, png };
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", abort);
    await browser.close();
  }
}
