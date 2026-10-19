import { imageSize } from "image-size";
import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { parseOffice, type OfficeContentNode } from "officeparser";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import AdmZip from "adm-zip";
import * as cheerio from "cheerio";
import { fileTypeFromBuffer } from "file-type";
import { persistExtraction } from "./source-content.js";
import { DATA, projectDir } from "./store.js";
import { fetchPublic } from "./network.js";
import type { Source, Asset } from "../../../packages/agents/src/contracts.js";
export const FORMATS = [
  "pdf",
  "docx",
  "pptx",
  "xlsx",
  "xlsm",
  "csv",
  "tsv",
  "txt",
  "md",
  "markdown",
  "json",
  "html",
  "htm",
  "xml",
  "yaml",
  "yml",
  "log",
  "rtf",
  "epub",
  "odt",
  "odp",
  "ods",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "mp4",
  "webm",
  "mp3",
  "wav",
  "ogg",
];
const TEXT = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "xml",
  "yaml",
  "yml",
  "log",
]);
async function asset(
  buffer: Buffer,
  name: string,
  projectId?: string,
): Promise<Asset> {
  const type = await fileTypeFromBuffer(buffer);
  if (!type) throw new Error("无法识别素材格式");
  const id = crypto.randomUUID();
  const file = id + "." + type.ext;
  const dir = projectId
    ? path.join(projectDir(projectId), "assets")
    : path.join(DATA, "test-assets");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, file), buffer);
  let dimensions: { width?: number; height?: number } = {};
  if (type.mime.startsWith("image/")) {
    try {
      const size = imageSize(buffer);
      dimensions = { width: size.width, height: size.height };
    } catch {}
  }
  return {
    ...dimensions,
    id,
    name,
    type: type.mime.startsWith("image/")
      ? "image"
      : type.mime.startsWith("video/")
        ? "video"
        : type.mime.startsWith("audio/")
          ? "audio"
          : "file",
    url: "/assets/" + (projectId ? projectId + "/" : "") + file,
    mime: type.mime,
  };
}
export async function extract(
  buffer: Buffer,
  name: string,
  projectId?: string,
): Promise<Source> {
  if (buffer.length > 30 * 1024 * 1024) throw new Error("单文件超过 30 MB");
  const ext = path.extname(name).slice(1).toLowerCase();
  if (!FORMATS.includes(ext))
    throw new Error(
      "暂不支持 " + ext + "；旧版 DOC/PPT/XLS 请先转换为 Office Open XML",
    );
  const s: Source = {
    id: crypto.randomUUID(),
    name,
    format: ext,
    text: "",
    assets: [],
    tables: [],
    warnings: [],
    provenance: "upload:" + name,
  };
  if (TEXT.has(ext)) s.text = buffer.toString("utf8");
  else if (["csv", "tsv"].includes(ext)) {
    const rows = parse(buffer, {
      delimiter: ext === "tsv" ? "\t" : ",",
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
    });
    s.tables.push({ name, rows });
    s.text = rows.map((r: unknown[]) => r.join(" | ")).join("\n");
    if (rows.length > 3000)
      s.warnings.push("表格摘要仅显示前 3000 行，完整存储可按需读取");
  } else if (["html", "htm"].includes(ext)) {
    const $ = cheerio.load(buffer.toString("utf8"));
    $("script,style,noscript").remove();
    s.text = $("body").text();
    s.warnings.push("HTML 上传只提取文本；外部素材请使用网站 URL。");
  } else if (
    [
      "png",
      "jpg",
      "jpeg",
      "webp",
      "gif",
      "mp4",
      "webm",
      "mp3",
      "wav",
      "ogg",
    ].includes(ext)
  ) {
    s.assets.push(await asset(buffer, name, projectId));
    s.text = "用户提供的" + s.assets[0].type + "素材：" + name;
    if (s.assets[0].type !== "image")
      s.warnings.push("已保留原始媒体；未配置转录服务，未自动转录音视频。");
  } else {
    if (["docx", "pptx", "xlsx", "xlsm", "odt", "odp", "ods"].includes(ext)) {
      const zip = new AdmZip(buffer);
      if (zip.getEntries().length > 4000)
        throw new Error("压缩文档条目超过 4000");
      let total = 0;
      for (const e of zip.getEntries()) {
        total += e.header.size;
        if (total > 160 * 1024 * 1024 || e.header.size > 40 * 1024 * 1024)
          throw new Error("压缩文档解压大小超限");
      }
      for (const e of zip
        .getEntries()
        .filter((e) => /(?:word|ppt|xl)\/media\/|^Pictures\//.test(e.entryName))
        .slice(0, 40)) {
        try {
          s.assets.push(
            await asset(e.getData(), path.basename(e.entryName), projectId),
          );
        } catch {
          s.warnings.push("未提取素材：" + path.basename(e.entryName));
        }
      }
    }
    if (["xlsx", "xlsm"].includes(ext)) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as never);
      wb.eachSheet((ws) => {
        const rows: unknown[][] = [];
        ws.eachRow((row) =>
          rows.push(
            (row.values as unknown[])
              .slice(1)
              .map((v) =>
                typeof v === "object" && v !== null ? JSON.stringify(v) : v,
              ),
          ),
        );
        s.tables.push({ name: ws.name, rows });
        if (rows.length > 3000)
          s.warnings.push(
            ws.name + " 表格摘要仅显示前 3000 行，完整存储可按需读取",
          );
      });
      s.text = s.tables
        .map((t) => t.name + "\n" + t.rows.map((r) => r.join(" | ")).join("\n"))
        .join("\n");
    } else {
      const parsed = await parseOffice(buffer, {
        extractAttachments: true,
        decompressionLimits: {
          maxUncompressedBytes: 160 * 1024 * 1024,
          maxZipEntries: 4000,
          maxTableCells: 100000,
        },
        pdfParserConfig: { maxTimeMs: 30000 },
      });
      s.text = String((await parsed.to("text")).value);
      const collect = (nodes: OfficeContentNode[]) => {
        for (const n of nodes) {
          if (n.type === "table") {
            const rows = (n.children || [])
              .filter((r) => r.type === "row")
              .map((r) =>
                (r.children || []).map(
                  (c) =>
                    c.text ||
                    (c.children || []).map((x) => x.text || "").join(" "),
                ),
              );
            s.tables.push({
              name: "Table " + (s.tables.length + 1),
              rows,
            });
            if (rows.length > 3000)
              s.warnings.push("表格摘要仅显示前 3000 行，完整存储可按需读取");
          } else if (n.children) collect(n.children);
        }
      };
      collect(parsed.content);
      s.warnings.push(...parsed.warnings.map((w) => w.message));
      for (const a of parsed.attachments.slice(0, 40)) {
        if (
          a.type === "image" &&
          !s.assets.some((existing) => existing.name === a.name)
        ) {
          try {
            s.assets.push(
              await asset(Buffer.from(a.data, "base64"), a.name, projectId),
            );
          } catch {
            s.warnings.push("暂无法复用附件：" + a.name);
          }
        }
        if (a.chartData)
          s.text += "\n图表 " + a.name + ": " + JSON.stringify(a.chartData);
      }
      if (ext === "pdf")
        s.warnings.push(
          "PDF 提取文本与可用附件；扫描页如无文字层，需要额外 OCR Skill。",
        );
    }
  }
  return persistExtraction(s, projectId);
}
export async function extractUrl(url: string, projectId?: string) {
  const r = await fetchPublic(url);
  if (!/text\/html|text\/plain|application\/json/.test(r.type))
    throw new Error("此 URL 不是 HTML/文本网页，请下载后上传文档");
  const $ = cheerio.load(r.body.toString("utf8"));
  $("script,style,noscript,nav,footer").remove();
  const title = $("title").text() || new URL(r.url).hostname;
  const s: Source = {
    id: crypto.randomUUID(),
    name: title,
    format: "website",
    text: ($("main,article").first().text() || $("body").text()).replace(
      /\s+/g,
      " ",
    ),
    tables: [],
    assets: [],
    warnings: ["静态 HTML 抓取；登录内容、客户端渲染与站外链接未自动遍历。"],
    provenance: r.url,
  };
  $("table").each((i, t) => {
    const rows: unknown[][] = [];
    $(t)
      .find("tr")
      .each((_j, tr) => {
        rows.push(
          $(tr)
            .find("th,td")
            .map((_k, c) => $(c).text())
            .get(),
        );
      });
    s.tables.push({ name: "Table " + (i + 1), rows });
  });
  const urls = new Set<string>();
  $("img[src],video[src],video source[src]").each((_i, e) => {
    try {
      const u = new URL($(e).attr("src")!, r.url).href;
      if (urls.size < 12) urls.add(u);
    } catch {}
  });
  for (const u of urls) {
    try {
      const media = await fetchPublic(u);
      s.assets.push(
        await asset(
          media.body,
          new URL(u).pathname.split("/").pop() || "网页素材",
          projectId,
        ),
      );
    } catch {
      s.warnings.push("无法导入网站素材：" + u);
    }
  }
  return persistExtraction(s, projectId);
}
