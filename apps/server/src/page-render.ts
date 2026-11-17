import sharp from "sharp";
import { inlinePageAssets } from "./page-export.js";

/** Desktop width the page is looked at, and the height of one screenshot handed to the model. */
const WIDTH = 1440;
const SLICE = 1800;
const MAX_SLICES = 8;

/** One measured blank: a row where pictures and words sit side by side, or a wrapped picture. */
export type PageGap = {
  /** data-dn of the row (or of the block a picture floats in) in the tagged page. */
  dn: number;
  heading: string;
  kind: "row" | "wrapped" | "alone";
  sides: { what: string; height: number }[];
  /** Height of the empty area beside the shorter side, in px at 1440 wide. */
  gap: number;
  /** Where the unit starts on the page, in px. */
  top: number;
};

/**
 * Measures, in the rendered page, where pictures and words sit side by side and one side's
 * content (its text lines and pictures, not its box) ends clearly before the other's, and where
 * a floated picture runs below the end of the words wrapped around it. Each found blank is
 * outlined and labelled on the page before the screenshot. Elements carry data-dn indices.
 */
const GAP_SCRIPT = `(() => {
  const MEDIA = "img,video,canvas,svg";
  const shown = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity !== 0; };
  const extent = (el, skip) => {
    let top = Infinity, bottom = -Infinity, media = 0, chars = 0;
    const add = (r) => { if (r.width > 0 && r.height > 0) { top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom); } };
    const ms = el.matches(MEDIA) ? [el] : [...el.querySelectorAll(MEDIA)];
    for (const m of ms) { if (m.parentElement && m.parentElement.closest("svg")) continue; if (skip && skip.contains(m)) continue; if (!shown(m)) continue; const r = m.getBoundingClientRect(); if (r.width < 40 || r.height < 40) continue; media++; add(r); }
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.textContent.trim() && !n.parentElement.closest("svg,script,style,noscript") && !(skip && skip.contains(n)) ? 1 : 2 });
    const range = document.createRange();
    for (let n; (n = w.nextNode()); ) { if (!shown(n.parentElement)) continue; chars += n.textContent.trim().length; range.selectNodeContents(n); for (const r of range.getClientRects()) add(r); }
    return { top: top + scrollY, bottom: bottom + scrollY, h: bottom > top ? bottom - top : 0, media, chars };
  };
  const what = (x) => x.media > 1 ? x.media + " pictures" + (x.chars > 40 ? " and words" : "") : x.media ? (x.chars > 120 ? "picture and words" : "picture") : "words";
  const heads = [...document.querySelectorAll("h1,h2,h3,h4")];
  const heading = (el) => { let h = ""; for (const x of heads) { if (el.contains(x) || (x.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) h = x.textContent.trim().slice(0, 60); } return h; };
  const found = [];
  for (const box of document.querySelectorAll("body [data-dn]")) {
    const d = getComputedStyle(box).display;
    if (!/grid|flex/.test(d) || !shown(box)) continue;
    const kids = [...box.children].filter((c) => shown(c) && !/absolute|fixed/.test(getComputedStyle(c).position));
    if (kids.length < 2) continue;
    const rect = (c) => c.getBoundingClientRect();
    // Side-by-side groups: children that overlap vertically and not horizontally.
    const used = new Set();
    for (const a of kids) {
      if (used.has(a)) continue;
      const ra = rect(a);
      const row = kids.filter((b) => { const rb = rect(b); return Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) > 0.5 * Math.min(ra.height, rb.height); });
      if (row.length < 2) continue;
      row.forEach((c) => used.add(c));
      const xs = row.map((c) => extent(c));
      if (!xs.some((x) => x.media) ) continue;
      if (xs.every((x) => x.media && x.chars > 40)) continue; // a grid of cards, each picture with its words
      // The empty space beside the shorter side: below it when aligned to the top, split above
      // and below when centred, so a centred opening is measured by its larger part.
      const tall = xs.reduce((a, b) => (b.h > a.h ? b : a));
      const blank = Math.max(...xs.filter((x) => x !== tall).map((x) => Math.max(x.top - tall.top, tall.bottom - x.bottom, 0)));
      if (blank > 160 && blank > 0.25 * tall.h)
        found.push({ el: box, kind: "row", sides: xs.map((x) => ({ what: what(x), height: Math.round(x.h) })), gap: Math.round(blank) });
    }
  }
  for (const f of document.querySelectorAll("body [data-dn]")) {
    const cs = getComputedStyle(f);
    if (cs.float !== "left" && cs.float !== "right") continue;
    if (!shown(f) || !(f.matches(MEDIA) || f.querySelector(MEDIA))) continue;
    const host = f.parentElement && f.parentElement.closest("[data-dn]");
    if (!host) continue;
    const fr = f.getBoundingClientRect();
    if (fr.width < 120 || fr.height < 120) continue;
    const words = extent(host, f);
    const end = fr.bottom + scrollY;
    if (words.chars > 0 && end - words.bottom > 160)
      found.push({ el: host, kind: "wrapped", sides: [{ what: "floated picture", height: Math.round(fr.height) }, { what: "words", height: Math.round(Math.max(0, words.bottom - (fr.top + scrollY))) }], gap: Math.round(end - words.bottom) });
  }
  // A picture alone at one side of the content width, with nothing beside it.
  const lines = [];
  { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.textContent.trim() && !n.parentElement.closest("svg,script,style,noscript") ? 1 : 2 });
    const range = document.createRange();
    for (let n; (n = w.nextNode()); ) { if (!shown(n.parentElement)) continue; range.selectNodeContents(n); for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) lines.push({ node: n.parentElement, r }); } }
  const medias = [...document.querySelectorAll(MEDIA)].filter((m) => !(m.parentElement && m.parentElement.closest("svg")) && shown(m));
  for (const m of medias) {
    const mr = m.getBoundingClientRect();
    if (mr.width < 160 || mr.height < 160) continue;
    const fig = (m.closest("figure") || m).closest("[data-dn]");
    if (!fig || found.some((g) => g.el.contains(fig) || fig.contains(g.el))) continue;
    const fr = fig.getBoundingClientRect();
    let cont = fig.parentElement;
    while (cont && cont !== document.body && cont.getBoundingClientRect().width < 0.6 * innerWidth) cont = cont.parentElement;
    if (!cont) continue;
    const cr = cont.getBoundingClientRect(), cs = getComputedStyle(cont);
    const left = cr.left + parseFloat(cs.paddingLeft), right = cr.right - parseFloat(cs.paddingRight);
    const freeL = fr.left - left, freeR = right - fr.right, free = Math.max(freeL, freeR);
    if (free < Math.max(320, 0.3 * (right - left)) || Math.min(freeL, freeR) > free / 2) continue;
    const overlaps = (r) => Math.min(r.bottom, fr.bottom) - Math.max(r.top, fr.top) > Math.min(24, 0.5 * r.height) && r.right > left && r.left < right && (r.right <= fr.left || r.left >= fr.right);
    if (lines.some((l) => !fig.contains(l.node) && overlaps(l.r))) continue;
    if (medias.some((o) => !fig.contains(o) && overlaps(o.getBoundingClientRect()))) continue;
    found.push({ el: fig, kind: "alone", sides: [{ what: "picture " + Math.round(fr.width) + "px wide", height: Math.round(fr.height) }, { what: "nothing", height: 0 }], gap: Math.round(free) });
  }
  // One entry per element; inner rows before the outer ones that contain them.
  const seen = new Set(), out = [];
  for (const g of found) { if (seen.has(g.el)) continue; seen.add(g.el); out.push(g); }
  out.sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top);
  const list = out.slice(0, 12);
  list.forEach((g, i) => {
    g.el.setAttribute("data-gapmark", String(i + 1));
    g.el.style.outline = "4px dashed #ff5a00"; g.el.style.outlineOffset = "6px";
    const r = g.el.getBoundingClientRect(), tag = document.createElement("div");
    tag.textContent = "BLANK " + (i + 1);
    tag.style.cssText = "position:absolute;z-index:2147483647;background:#ff5a00;color:#fff;font:700 20px/1 system-ui;padding:6px 10px;border-radius:4px;left:" + Math.max(0, r.left + scrollX - 6) + "px;top:" + Math.max(0, r.top + scrollY - 34) + "px";
    document.body.appendChild(tag);
  });
  return list.map((g) => ({ dn: +g.el.getAttribute("data-dn"), heading: heading(g.el), kind: g.kind, sides: g.sides, gap: g.gap, top: Math.round(g.el.getBoundingClientRect().top + scrollY) }));
})()`;

/**
 * The page as a desktop visitor sees it: a headless browser renders the single HTML file (its
 * project pictures inlined, nothing fetched) and the full page is cut into a few screenshots,
 * halved in size. System Chrome is used when present, else Playwright's headless Chromium.
 * Returns no screenshots when no browser can start, so generation never depends on it.
 */
export async function pageScreenshots(
  projectId: string,
  html: string,
  /** Instead of the whole page: the bands of the page holding these elements (outermost only, at most six). */
  units?: string,
  /** Measure blanks (the page's elements carry data-dn), mark them, and report them here. With units, their bands are shown too. */
  gaps?: (found: PageGap[]) => void,
) {
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
    if (gaps) {
      const found = (await page.evaluate(GAP_SCRIPT)) as PageGap[];
      gaps(found);
      if (units && found.length) units += ", [data-gapmark]";
    }
    const bands = units
      ? await page.evaluate((selector) => {
          const all = [...document.querySelectorAll(selector)];
          return all
            .filter((e) => !all.some((o) => o !== e && o.contains(e)))
            .map((e) => {
              const r = e.getBoundingClientRect();
              return { top: r.top + window.scrollY, height: r.height };
            })
            .filter((b) => b.height > 4)
            .slice(0, 8);
        }, units)
      : [];
    if (units && !bands.length) return [];
    const full = await page.screenshot({ fullPage: true, type: "png" });
    const meta = await sharp(full).metadata();
    if (units) {
      const width = meta.width || WIDTH,
        total = meta.height || 0,
        out: Buffer[] = [];
      for (const b of bands) {
        const top = Math.max(0, Math.floor(b.top - 32));
        const height = Math.min(SLICE, total - top, Math.ceil(b.height + 64));
        if (height <= 0) continue;
        out.push(
          await sharp(full)
            .extract({ left: 0, top, width, height })
            .resize({ width: Math.round(width / 2) })
            .jpeg({ quality: 78 })
            .toBuffer(),
        );
      }
      return out;
    }
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
