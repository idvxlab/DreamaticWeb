import AdmZip from "adm-zip";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { projectDir } from "./store.js";

const ASSET_URL = /\/assets\/[a-f\d-]{36}\/[a-f\d-]{36}\.[a-z\d]+/g;

/** The project's own asset files a page references, read once each. */
async function pageAssets(projectId: string, html: string) {
  const { fileTypeFromBuffer } = await import("file-type");
  const assets: { url: string; file: string; mime: string; data: Buffer }[] =
    [];
  for (const url of new Set(html.match(ASSET_URL) || [])) {
    const file = path.basename(url);
    try {
      const data = await readFile(path.join(projectDir(projectId), "assets", file));
      const type = await fileTypeFromBuffer(data);
      if (type) assets.push({ url, file, mime: type.mime, data });
    } catch {}
  }
  return assets;
}

/** One self-contained HTML file: every project asset embedded as a data URI. */
export async function inlinePageAssets(projectId: string, html: string) {
  for (const asset of await pageAssets(projectId, html))
    html = html
      .split(asset.url)
      .join(`data:${asset.mime};base64,${asset.data.toString("base64")}`);
  return html;
}

/** A folder as a zip: index.html with its pictures under assets/, linked relatively. */
export async function zipPage(projectId: string, html: string) {
  const zip = new AdmZip();
  const folder = "dreamatic-page/";
  for (const asset of await pageAssets(projectId, html)) {
    html = html.split(asset.url).join("assets/" + asset.file);
    zip.addFile(folder + "assets/" + asset.file, asset.data);
  }
  zip.addFile(folder + "index.html", Buffer.from(html, "utf8"));
  return zip.toBuffer();
}
