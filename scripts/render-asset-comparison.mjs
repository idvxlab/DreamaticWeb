import express from "express";
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
const root = process.env.DREAMATIC_WORKSPACE;
const report = JSON.parse(
  await readFile(
    path.join(
      root,
      process.env.DREAMATIC_COMPARISON_REPORT || "comparison.json",
    ),
    "utf8",
  ),
);
const ctx = JSON.parse(
  await readFile(path.join(root, "image-context.json"), "utf8"),
);
const app = express();
app.use("/assets", express.static(path.join(root, "projects")));
app.get("/assets/:id/:file", (req, res) =>
  res.sendFile(
    path.join(root, "projects", req.params.id, "assets", req.params.file),
  ),
);
app.get("/:arm", async (req, res) => {
  try {
    res
      .type("html")
      .send(await readFile(path.join(root, req.params.arm + ".html"), "utf8"));
  } catch {
    res.status(404).end();
  }
});
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({
  executablePath: process.env.DREAMATIC_BROWSER_PATH,
  headless: true,
  args: ["--no-proxy-server"],
});
const visual = [];
try {
  for (const r of report.reports) {
    if (r.status !== "complete") continue;
    const html = await readFile(path.join(root, r.arm + ".html"), "utf8");
    const $ = cheerio.load(html);
    const images = $("img")
      .toArray()
      .map((e) => ({
        src: $(e).attr("src"),
        alt: $(e).attr("alt"),
        nearby: $(e)
          .closest("section,figure,article,header,div")
          .text()
          .trim()
          .slice(0, 500),
        source: ctx.find((c) => c.url === $(e).attr("src")),
      }));
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base + "/" + r.arm, { waitUntil: "networkidle" });
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 700) {
          scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 30));
        }
        scrollTo(0, 0);
      });
      await page.screenshot({
        path: path.join(root, r.arm + "-" + width + ".png"),
        fullPage: true,
      });
      const check = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        brokenImages: [...document.images]
          .filter((i) => !i.complete || i.naturalWidth === 0)
          .map((i) => i.getAttribute("src")),
        bodyCharacters: document.body.innerText.length,
        sameColorText: [
          ...document.querySelectorAll("p,li,td,th,span,h1,h2,h3,h4,a"),
        ]
          .filter(
            (el) =>
              el.textContent?.trim() &&
              el.getClientRects().length &&
              !el.querySelector("p,li,td,th,span,h1,h2,h3,h4,a"),
          )
          .map((el) => {
            const foreground = getComputedStyle(el).color;
            let background = "";
            for (
              let ancestor = el;
              ancestor;
              ancestor = ancestor.parentElement
            ) {
              const style = getComputedStyle(ancestor);
              if (style.backgroundImage !== "none") break;
              const value = style.backgroundColor;
              if (
                value.startsWith("rgb(") ||
                /^rgba\([^)]*,\s*1\)$/.test(value)
              ) {
                background = value;
                break;
              }
            }
            return {
              text: el.textContent.trim().slice(0, 160),
              foreground,
              background,
            };
          })
          .filter((v) => v.foreground === v.background)
          .slice(0, 20),
        coverCroppedImages: [...document.images]
          .filter(
            (el) =>
              getComputedStyle(el).objectFit === "cover" &&
              el.naturalWidth &&
              el.clientHeight &&
              Math.abs(
                el.naturalWidth / el.naturalHeight -
                  el.clientWidth / el.clientHeight,
              ) > 0.15,
          )
          .map((el) => ({
            src: el.getAttribute("src"),
            natural: [el.naturalWidth, el.naturalHeight],
            displayed: [el.clientWidth, el.clientHeight],
          })),
      }));
      visual.push({ arm: r.arm, width, ...check, errors, images });
      await page.close();
    }
  }
  await writeFile(
    path.join(root, "visual-checks.json"),
    JSON.stringify(visual, null, 2),
  );
  console.log(
    JSON.stringify(
      visual.map(({ images, ...v }) => ({ ...v, imageCount: images.length })),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  server.close();
}
