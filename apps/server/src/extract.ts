import { structureHtml } from "./html-structure.js";
import {
  structureDocument,
  type StructuredExtraction,
} from "./document-structure.js";
import { enhancePdf } from "./pdf-structure.js";
import { imageSize } from "image-size";
import path from "node:path";
import { writeFile, mkdir, link, access } from "node:fs/promises";
import { parseOffice } from "officeparser";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import AdmZip from "adm-zip";
import * as cheerio from "cheerio";
import { fileTypeFromBuffer } from "file-type";
import { createHash } from "node:crypto";
import { persistExtraction, readCanonicalSource } from "./source-content.js";
import { DATA, projectDir } from "./store.js";
import { fetchPublic } from "./network.js";
import type { Source, Asset } from "../../../packages/shared/project.js";
export const PARSER_VERSION = "markdown-media-v3";
export const sourceFingerprint = (buffer: Buffer) =>
  createHash("sha256").update(buffer).digest("hex");
export const parserVersion = () =>
  `${PARSER_VERSION}:${process.env.DREAMATIC_PDF_ENHANCE || "false"}:${process.env.DREAMATIC_DOCUMENT_PYTHON || "default"}`;
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
  const digest = sourceFingerprint(buffer);
  const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  const file = id + "." + type.ext;
  const dir = projectId
    ? path.join(projectDir(projectId), "assets")
    : path.join(DATA, "test-assets");
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(path.join(dir, file), buffer, { mode: 0o600, flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
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
    fingerprint: sourceFingerprint(buffer),
    parserVersion: parserVersion(),
    name,
    format: ext,
    text: "",
    assets: [],
    tables: [],
    warnings: [],
    provenance: "upload:" + name,
  };
  let structured: StructuredExtraction | undefined;
  if (TEXT.has(ext)) s.text = buffer.toString("utf8");
  else if (["csv", "tsv"].includes(ext)) {
    const rows = parse(buffer, {
      delimiter: ext === "tsv" ? "\t" : ",",
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
    });
    s.tables.push({ name, rows });

    if (rows.length > 3000)
      s.warnings.push("表格摘要仅显示前 3000 行，完整存储可按需读取");
  } else if (["html", "htm"].includes(ext)) {
    const $ = cheerio.load(buffer.toString("utf8"));
    const html = structureHtml($);
    structured = html.structured;
    s.text = structured.text;
    s.tables = structured.tables;
    s.warnings.push(
      ...html.warnings,
      "HTML 已转换为结构化 Markdown；外部素材请使用网站 URL。",
    );
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
      structured = structureDocument(parsed.content);
      s.tables = structured.tables;
      if (ext === "pdf" && process.env.DREAMATIC_PDF_ENHANCE === "true") {
        try {
          const enhanced = await enhancePdf(buffer);
          const next = structureDocument(enhanced.nodes, "pdfplumber");
          if (
            !enhanced.nodes.some((n) =>
              n.children?.some((c) => c.type !== "table" && c.text?.trim()),
            )
          )
            throw new Error("No PDF text layer");
          // The PDF enhancer owns typed cell values; its nodes share this traversal's order.
          if (next.tables.length !== enhanced.tables.length)
            throw new Error("PDF table mapping mismatch");
          next.tables = enhanced.tables;
          structured = next;
          s.tables = next.tables;
        } catch {
          s.warnings.push(
            "本地 PDF 增强不可用或超出限额，已保留 officeparser 结构结果",
          );
        }
      }
      s.text = structured.text;
      if (structured.truncated)
        s.warnings.push("结构化阅读文本达到存储上限，请拆分材料");
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
          "PDF 提取文本与可用附件；扫描页如无文字层，需要另外接入 OCR 工具。",
        );
    }
  }
  s.assets = [...new Map(s.assets.map((a) => [a.id, a])).values()];
  if (projectId) {
    const dir = path.join(projectDir(projectId), "uploads");
    await mkdir(dir, { recursive: true });
    s.originalFile = "uploads/" + s.id + "." + ext;
    const target = path.join(projectDir(projectId), s.originalFile);
    // A standalone medium has two logical locations backed by one physical file.
    if (s.assets.length === 1 && s.text?.startsWith("用户提供的"))
      await link(
        path.join(
          projectDir(projectId),
          "assets",
          path.basename(s.assets[0].url),
        ),
        target,
      );
    else await writeFile(target, buffer, { mode: 0o600 });
  }
  return persistExtraction(s, projectId, structured);
}
export async function extractUrl(
  url: string,
  projectId?: string,
  previous: Source[] = [],
) {
  const r = await fetchPublic(url);
  if (!/text\/html|text\/plain|application\/json/.test(r.type))
    throw new Error("此 URL 不是 HTML/文本网页，请下载后上传文档");
  const fingerprint = sourceFingerprint(r.body);
  const cached = previous.find(
    (s) =>
      s.format === "website" &&
      s.provenance === r.url &&
      s.fingerprint === fingerprint &&
      s.parserVersion === parserVersion(),
  );
  const downloads = new Map<string, Awaited<ReturnType<typeof fetchPublic>>>();
  if (cached && projectId) {
    let reusable = true;
    await Promise.all(
      (cached.dependencies || []).map(async (dep) => {
        try {
          const response = await fetchPublic(dep.url);
          downloads.set(dep.url, response);
          if (sourceFingerprint(response.body) !== dep.hash) reusable = false;
        } catch {
          reusable = false;
        }
      }),
    );
    try {
      await readCanonicalSource(projectId, cached);
      await Promise.all(
        [
          cached.originalFile,
          ...cached.assets.map((a) => "assets/" + path.basename(a.url)),
        ]
          .filter(Boolean)
          .map((file) => access(path.join(projectDir(projectId), file!))),
      );
      if (reusable) return cached;
    } catch {
      /* Repair missing artifacts by reparsing only this source. */
    }
  }
  const $ = cheerio.load(r.body.toString("utf8"));

  const html = /text\/html/.test(r.type) ? structureHtml($, true) : undefined;
  const title = (html ? $("title").text() : "") || new URL(r.url).hostname;
  const s: Source = {
    id: crypto.randomUUID(),
    name: title,
    fingerprint,
    parserVersion: parserVersion(),
    dependencies: [],
    format: "website",
    text: "",
    tables: [],
    assets: [],
    warnings: ["静态 HTML 抓取；登录内容、客户端渲染与站外链接未自动遍历。"],
    provenance: r.url,
  };
  // Plain text/JSON responses are data, not HTML: preserve literal angle brackets.
  s.text = html ? html.structured.text : r.body.toString("utf8");
  s.tables = html?.structured.tables || [];
  s.warnings.push(...(html?.warnings || []));
  const urls = new Set<string>();
  if (html)
    $("img[src],video[src],video source[src]").each((_i, e) => {
      try {
        const u = new URL($(e).attr("src")!, r.url).href;
        if (urls.size < 12) urls.add(u);
      } catch {}
    });
  for (const u of urls) {
    try {
      const media = downloads.get(u) || (await fetchPublic(u));
      s.dependencies!.push({ url: u, hash: sourceFingerprint(media.body) });
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
  s.assets = [...new Map(s.assets.map((a) => [a.id, a])).values()];
  if (projectId) {
    const dir = path.join(projectDir(projectId), "uploads");
    await mkdir(dir, { recursive: true });
    s.originalFile = `uploads/${s.id}.${html ? "html" : "txt"}`;
    await writeFile(path.join(projectDir(projectId), s.originalFile), r.body, {
      mode: 0o600,
    });
  }
  return persistExtraction(s, projectId, html?.structured);
}
