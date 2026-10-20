import { z } from "zod";
import { limitSetting } from "./watchdog.js";
import { pageChecks } from "./page-checks.js";
import { readSourceMarkdown } from "../../../apps/server/src/source-content.js";
import { sourceSnapshots, textEvidence } from "./evidence.js";
import { imageSize } from "image-size";
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import type { Project, Role, Source } from "./contracts.js";
import { projectDir } from "../../../apps/server/src/store.js";
import { readSourceTable } from "../../../apps/server/src/source-content.js";
import { previewPage } from "../../../apps/server/src/page-preview.js";
import {
  patchSchema,
  patchPage,
  readCandidate,
  saveCandidate,
  validatePage,
} from "./pages.js";
const integer = (max: number, fallback: number) =>
  z.number().int().min(0).max(max).default(fallback);
const sourceId = z.string().uuid();
const locator = z
  .object({
    html: z.string().min(20).max(2500000).optional(),
    candidateId: z.string().uuid().optional(),
    versionId: z.string().uuid().optional(),
  })
  .refine(
    (v) =>
      [v.html, v.candidateId, v.versionId].filter((x) => x !== undefined)
        .length <= 1,
    "Choose only html, candidateId or versionId",
  );
export function projectTools(
  project: Project,
  role: Role,
  options: {
    vision: boolean;
    signal?: AbortSignal;
    onUse?: (name: string) => void;
  },
): AgentTool[] {
  let remaining = 180000,
    calls = 0,
    previews = 0;
  const maxCalls = limitSetting("DREAMATIC_AGENT_MAX_TOOL_CALLS", 0);
  const snapshotFor = sourceSnapshots(project.id);
  const output = (data: unknown, image?: ImageContent) => {
    const text = JSON.stringify(data);
    if (text.length > remaining)
      throw new Error(
        "Tool response exceeds remaining context budget. Request a smaller range or fewer fields.",
      );
    remaining -= text.length;
    const content: (TextContent | ImageContent)[] = [{ type: "text", text }];
    if (image) content.push(image);
    return { content, details: {} };
  };
  const define = <T extends z.ZodType>(
    name: string,
    description: string,
    schema: T,
    handler: (
      input: z.infer<T>,
      signal?: AbortSignal,
    ) => Promise<ReturnType<typeof output>>,
  ): AgentTool => ({
    name,
    label: name,
    description,
    parameters: z.toJSONSchema(schema, {
      target: "draft-7",
      io: "input",
    }) as AgentTool["parameters"],
    execute: async (_id, input, signal) => {
      options.signal?.throwIfAborted();
      signal?.throwIfAborted();
      if (++calls > maxCalls && maxCalls > 0)
        throw new Error("Project tool call budget exhausted for this stage");
      options.onUse?.(name);
      const combined =
        options.signal && signal
          ? AbortSignal.any([options.signal, signal])
          : options.signal || signal;
      const result = await handler(schema.parse(input), combined);
      options.signal?.throwIfAborted();
      signal?.throwIfAborted();
      return result;
    },
  });
  const findSource = (id: string): Source => {
    const source = project.sources.find((s) => s.id === id);
    if (!source) throw new Error("Unknown sourceId in the current project");
    return source;
  };
  async function pageContent(input: z.infer<typeof locator>) {
    if (input.html) return input.html;
    if (input.candidateId)
      return (await readCandidate(project, input.candidateId)).html;
    const version = input.versionId
      ? project.versions.find((v) => v.id === input.versionId)
      : project.versions.at(-1);
    if (!version)
      throw new Error(
        "No saved version; supply a complete html candidate first",
      );
    return version.html;
  }
  const tools: AgentTool[] = [
    define(
      "project_context_read",
      "Read this project only. Select brief/analysis/answers/source catalog/version catalog or paginate the complete conversation. Designer can read page HTML by candidateId or versionId (mutually exclusive); candidateId reads unsaved drafts. Returns current version identity for safe revisions.",
      z.object({
        section: z.enum([
          "summary",
          "brief",
          "analysis",
          "answers",
          "sources",
          "versions",
          "conversation",
          "page",
        ]),
        versionId: sourceId.optional(),
        candidateId: sourceId.optional(),
        offset: integer(10000000, 0),
        limit: z.number().int().min(1).max(20000).default(8000),
      }),
      async (input) => {
        if (input.candidateId && (input.section !== "page" || input.versionId))
          throw new Error(
            "candidateId requires section:page and cannot be combined with versionId",
          );
        const base = {
          projectId: project.id,
          title: project.title,
          currentVersionId: project.versions.at(-1)?.id || "",
          status: project.status,
        };
        if (input.section === "summary")
          return output({
            ...base,
            sourceCount: project.sources.length,
            versionCount: project.versions.length,
            messageCount: project.messages.length,
          });
        if (input.section === "sources")
          return output({
            ...base,
            offset: input.offset,
            total: project.sources.length,
            nextOffset: Math.min(
              project.sources.length,
              input.offset + Math.min(20, input.limit),
            ),
            sources: project.sources
              .slice(input.offset, input.offset + Math.min(20, input.limit))
              .map((s) => ({
                id: s.id,
                name: s.name,
                format: s.format,
                provenance: s.provenance,
                markdownLength: s.content?.markdownLength,
                tables: s.content?.tables || [],
                requiresReimport: s.content?.readingFormat !== "markdown-v2",
                assets: s.assets,
                warnings: s.warnings,
              })),
          });
        if (input.section === "versions")
          return output({
            ...base,
            offset: input.offset,
            total: project.versions.length,
            nextOffset: Math.min(
              project.versions.length,
              input.offset + Math.min(50, input.limit),
            ),
            versions: project.versions
              .slice(input.offset, input.offset + Math.min(50, input.limit))
              .map(({ id, label, createdAt }) => ({
                id,
                label,
                createdAt,
              })),
          });
        if (input.section === "page") {
          if (role !== "designer")
            throw new Error("Only Designer can read page HTML");
          const draft = input.candidateId
            ? await readCandidate(project, input.candidateId)
            : undefined;
          const version = input.versionId
            ? project.versions.find((v) => v.id === input.versionId)
            : project.versions.at(-1);
          if (!draft && !version)
            throw new Error(
              input.versionId
                ? "Unknown saved versionId: read the versions catalog; candidates must be read using candidateId"
                : "No saved version: read an unsaved page with section:page and candidateId returned by page_validate",
            );
          const html = draft?.html ?? version!.html;
          return output({
            ...base,
            ...(draft
              ? {
                  candidateId: input.candidateId,
                  baseVersionId: draft.baseVersionId,
                }
              : { versionId: version!.id }),
            offset: input.offset,
            total: html.length,
            html: html.slice(input.offset, input.offset + input.limit),
            nextOffset: Math.min(html.length, input.offset + input.limit),
          });
        }
        if (input.section === "conversation") {
          const count = Math.min(20, input.limit);
          return output({
            ...base,
            offset: input.offset,
            total: project.messages.length,
            messages: project.messages.slice(
              input.offset,
              input.offset + count,
            ),
            nextOffset: Math.min(project.messages.length, input.offset + count),
          });
        }
        const data =
          input.section === "brief"
            ? project.brief
            : input.section === "analysis"
              ? project.analysis
              : project.questions;
        const serialized = JSON.stringify(data ?? null);
        return output({
          ...base,
          section: input.section,
          offset: input.offset,
          total: serialized.length,
          json: serialized.slice(input.offset, input.offset + input.limit),
          nextOffset: Math.min(serialized.length, input.offset + input.limit),
        });
      },
    ),
    define(
      "source_read",
      "Read the sole canonical Markdown document. All ranges and sourceHash use Markdown UTF-16 offsets, zero-based and end exclusive. Copy returned evidence unchanged into facts[].evidence; excerpts are at most 4000 units. compact:true omits duplicate content. kind:text is a compatibility alias for the same Markdown, never raw extraction. kind:table decodes typed cells from the same Markdown, with zero-based table/row/column indices. Missing, invalid or old documents require reimport.",
      z.object({
        sourceId,
        kind: z.enum(["text", "table", "markdown"]).default("markdown"),
        tableIndex: integer(99, 0),
        offset: integer(10000000, 0),
        limit: z.number().int().min(1).max(16000).default(8000),
        compact: z.boolean().default(false),
      }),
      async (input) => {
        const source = findSource(input.sourceId);
        if (input.kind !== "table") {
          const reading = await readSourceMarkdown(
            project.id,
            source,
            input.offset,
            input.limit,
          );
          const result = { text: reading.markdown, total: reading.total };
          const snapshot = {
            text: reading.markdown,
            hash: reading.sourceHash,
            complete: true,
          };
          const evidence = [];
          for (let at = input.offset; at < input.offset + result.text.length;) {
            let end = Math.min(input.offset + result.text.length, at + 4000);
            // Never split a surrogate pair between ready-to-submit excerpts.
            const code = result.text.charCodeAt(end - input.offset - 1);
            if (
              end < input.offset + result.text.length &&
              code >= 0xd800 &&
              code <= 0xdbff
            )
              end--;
            evidence.push({
              ...textEvidence(snapshot, at - input.offset, end - input.offset),
              start: at,
              end,
            });
            at = end;
          }
          return output({
            sourceId: source.id,
            provenance: source.provenance,
            start: input.offset,
            end: input.offset + result.text.length,
            nextOffset: input.offset + result.text.length,
            ...result,
            ...(input.kind === "markdown"
              ? {
                  text: undefined,
                  markdown: input.compact ? undefined : result.text,
                }
              : input.compact
                ? { text: undefined }
                : {}),
            format: "markdown-v2",
            evidence,
            verificationScope:
              "Canonical Markdown location only; confirm the excerpt supports the claim and includes needed context",
            warnings: source.warnings,
          });
        }
        const table = await readSourceTable(
            project.id,
            source,
            input.tableIndex,
          ),
          count = Math.min(input.limit, 100);
        return output({
          sourceId: source.id,
          tableIndex: input.tableIndex,
          name: table.name,
          total: table.rows.length,
          rows: table.rows
            .slice(input.offset, input.offset + count)
            .map((cells, i) => ({ row: input.offset + i, cells })),
          nextOffset: Math.min(table.rows.length, input.offset + count),
        });
      },
    ),
    define(
      "source_search",
      "Literal keyword search across canonical Markdown. Prefer compact:true to omit duplicated legacy context. Copy hit.evidence unchanged for citations: legacy start/end locate the keyword, while legacy quote/quoteStart contain wider context. evidence contains aligned quote/range and sourceHash. Check the context supports the fact; follow source_read for more. Follow cursors for incomplete results.",
      z.object({
        sourceId: sourceId.optional(),
        query: z.string().trim().min(1).max(200),
        compact: z.boolean().default(false),
        offset: integer(10000000, 0),
        limit: z.number().int().min(1).max(20).default(10),
      }),
      async (input) => {
        const sources = input.sourceId
          ? [findSource(input.sourceId)]
          : project.sources;
        const hits: unknown[] = [];
        let scanned = 0;
        for (const source of sources) {
          const snapshot = await snapshotFor(source);
          const total = snapshot.text.length;
          for (let offset = input.offset; offset < total; offset += 16000) {
            options.signal?.throwIfAborted();
            const text = snapshot.text.slice(
              offset,
              offset + 16000 + input.query.length - 1,
            );
            scanned += text.length;
            if (scanned > 8000000)
              return output({
                hits,
                scanLimitReached: true,
                resume: { sourceId: source.id, offset },
                instruction:
                  "Continue with this sourceId and offset; other sources may be unsearched",
              });
            // Escape the literal query; Unicode-aware matching preserves original offsets.
            const literal = input.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const matches = text.matchAll(new RegExp(literal, "giu"));
            for (const match of matches) {
              const at = match.index!;
              if (at >= 16000) break;
              const start = offset + at;
              const quoteStart = offset + Math.max(0, at - 100);
              const quoteEnd =
                offset + Math.min(text.length, at + input.query.length + 200);
              hits.push({
                sourceId: source.id,
                name: source.name,
                start,
                end: start + input.query.length,
                quote: text.slice(
                  Math.max(0, at - 100),
                  at + input.query.length + 200,
                ),
                quoteStart,
                ...(input.compact ? { quote: undefined } : {}),
                evidence: textEvidence(snapshot, quoteStart, quoteEnd),
                verificationScope:
                  "Location only; keyword/context may not support the fact",
              });
              if (hits.length >= input.limit)
                return output({
                  hits,
                  scanLimitReached: false,
                  resume: {
                    sourceId: source.id,
                    offset: start + input.query.length,
                  },
                  instruction:
                    "Continue this source with the cursor, then search remaining sources individually",
                });
            }
          }
        }
        return output({ hits, complete: true });
      },
    ),
    define(
      "asset_inspect",
      "Inspect an asset by its catalog ID within this project. Returns provenance and bounded image bytes when the current model supports vision. Media files are not transcribed or executed.",
      z.object({ assetId: sourceId }),
      async (input) => {
        const source = project.sources.find((s) =>
            s.assets.some((a) => a.id === input.assetId),
          ),
          asset = source?.assets.find((a) => a.id === input.assetId);
        if (
          !source ||
          !asset ||
          !asset.url.startsWith(`/assets/${project.id}/`)
        )
          throw new Error("Unknown assetId in this project");
        const bytes = await readFile(
          path.join(projectDir(project.id), "assets", path.basename(asset.url)),
        );
        let dimensions: unknown = null;
        if (asset.type === "image") {
          try {
            const size = imageSize(bytes);
            dimensions = {
              width: size.width,
              height: size.height,
              format: size.type,
            };
          } catch {}
        }
        const visual =
          options.vision &&
          asset.type === "image" &&
          ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
            asset.mime,
          ) &&
          bytes.length <= 4 * 1024 * 1024;
        return output(
          {
            asset,
            sourceId: source.id,
            provenance: source.provenance,
            byteLength: bytes.length,
            dimensions,
            visualInputIncluded: visual,
            limitation: visual
              ? null
              : asset.type === "image"
                ? "No visual content included: model is text-only, image is too large, or format is unsupported"
                : "Metadata only: no transcription or timeline analysis",
          },
          visual
            ? {
                type: "image",
                mimeType: asset.mime,
                data: bytes.toString("base64"),
              }
            : undefined,
        );
      },
    ),
  ];
  if (role === "analyst")
    tools.push(
      define(
        "table_query",
        "Filter, sort and aggregate a stored table without executing code. Row/column indices are zero-based; default startRow=1 skips header. Numeric operations never evaluate formulas; cached result values may be used. Preserve units and periods yourself; output includes original row/cell locations.",
        z.object({
          sourceId,
          tableIndex: integer(99, 0),
          startRow: integer(100000, 1),
          filters: z
            .array(
              z.object({
                column: integer(199, 0),
                op: z.enum(["eq", "contains", "gt", "gte", "lt", "lte"]),
                value: z.union([z.string().max(500), z.number()]),
              }),
            )
            .max(10)
            .default([]),
          sort: z
            .object({
              column: integer(199, 0),
              direction: z.enum(["asc", "desc"]),
              numeric: z.boolean().default(false),
            })
            .optional(),
          aggregate: z
            .object({
              operation: z.enum(["count", "sum", "average", "min", "max"]),
              column: integer(199, 0),
            })
            .optional(),
          offset: integer(100000, 0),
          limit: z.number().int().min(1).max(100).default(30),
        }),
        async (input) => {
          const source = findSource(input.sourceId),
            table = await readSourceTable(project.id, source, input.tableIndex);
          const scalar = (v: unknown): unknown => {
            if (v && typeof v === "object" && "result" in v)
              return (v as { result: unknown }).result;
            if (typeof v === "string" && v.startsWith("{")) {
              try {
                const parsed = JSON.parse(v);
                if ("result" in parsed) return parsed.result;
              } catch {}
            }
            return v;
          };
          const numeric = (v: unknown): number | undefined => {
            v = scalar(v);
            if (typeof v === "number" && Number.isFinite(v)) return v;
            if (
              typeof v === "string" &&
              /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(v.trim())
            ) {
              const n = Number(v);
              if (Number.isFinite(n)) return n;
            }
            return undefined;
          };
          let rows = table.rows
            .map((cells, row) => ({ row, cells }))
            .slice(input.startRow)
            .filter((r) =>
              input.filters.every((f) => {
                const v = scalar(r.cells[f.column]);
                if (f.op === "eq") return String(v ?? "") === String(f.value);
                if (f.op === "contains")
                  return String(v ?? "").includes(String(f.value));
                const a = numeric(v),
                  b = numeric(f.value);
                if (a === undefined || b === undefined) return false;
                return f.op === "gt"
                  ? a > b
                  : f.op === "gte"
                    ? a >= b
                    : f.op === "lt"
                      ? a < b
                      : a <= b;
              }),
            );
          if (input.sort) {
            const s = input.sort;
            rows.sort((a, b) => {
              const av = s.numeric
                  ? numeric(a.cells[s.column])
                  : String(scalar(a.cells[s.column]) ?? ""),
                bv = s.numeric
                  ? numeric(b.cells[s.column])
                  : String(scalar(b.cells[s.column]) ?? "");
              if (av === undefined) return bv === undefined ? 0 : 1;
              if (bv === undefined) return -1;
              return (
                (av < bv ? -1 : av > bv ? 1 : 0) *
                (s.direction === "asc" ? 1 : -1)
              );
            });
          }
          let aggregate: unknown;
          if (input.aggregate) {
            const a = input.aggregate,
              values = rows
                .map((r) => numeric(r.cells[a.column]))
                .filter((v): v is number => v !== undefined);
            let value: number | null = null;
            if (a.operation === "count") value = rows.length;
            else if (values.length) {
              value =
                a.operation === "sum"
                  ? values.reduce((a, b) => a + b, 0)
                  : a.operation === "average"
                    ? values.reduce((a, b) => a + b, 0) / values.length
                    : a.operation === "min"
                      ? values.reduce((a, b) => Math.min(a, b))
                      : values.reduce((a, b) => Math.max(a, b));
            }
            aggregate = {
              ...a,
              value,
              numericCells: values.length,
              excludedNonNumeric: rows.length - values.length,
              scope:
                "all matched rows before pagination; row/column locations refer to stored table",
              sourceRows: rows.slice(0, 100).map((r) => r.row),
              sourceRowsTruncated: rows.length > 100,
            };
          }
          return output({
            sourceId: source.id,
            tableIndex: input.tableIndex,
            name: table.name,
            matchedRows: rows.length,
            rows: rows.slice(input.offset, input.offset + input.limit),
            aggregate,

            warnings: source.warnings,
          });
        },
      ),
    );
  if (role === "designer") {
    tools.push(
      define(
        "page_validate",
        "Validate a complete HTML candidate or saved version. Checks policy removals, duplicate IDs, anchors and owned assets. Returns a sanitized candidateId and concrete issues, never commits a version.",
        locator,
        async (input) => {
          const report = await validatePage(project, await pageContent(input));
          const candidateId = await saveCandidate(project, report.html);
          return output({
            candidateId,
            baseVersionId: project.versions.at(-1)?.id || "",
            valid: report.valid,
            issues: report.issues,
            checks: pageChecks(project, report.html, report.issues),
            instruction:
              "Repair errors, preview candidate, then return JSON {candidateId} to submit this exact candidate.",
          });
        },
      ),
    );
    tools.push(
      define(
        "page_patch",
        "Patch an unsaved candidate using candidateId alone, including newly generated pages with no saved version. To patch a saved page directly, supply its exact baseVersionId. If both IDs are supplied their bases must agree. Each selector must match exactly one element. Returns a new candidateId; never saves or overwrites a version.",
        patchSchema,
        async (input) => output(await patchPage(project, input)),
      ),
    );
    tools.push(
      define(
        "page_preview",
        "Render the policy-sanitized candidate at a bounded viewport, with scripts disabled and external network blocked. Returns screenshot, overflow/missing-image diagnostics and textContrast issues with selectors and ratios. Repair low-contrast text before submission; unchecked complex backgrounds require visual review. Requires installed Chrome/Chromium.",
        z
          .object({
            html: z.string().max(2500000).optional(),
            candidateId: sourceId.optional(),
            versionId: sourceId.optional(),
            width: z.number().int().min(320).max(1920).default(1440),
            height: z.number().int().min(320).max(1200).default(900),
          })
          .refine(
            (v) =>
              [v.html, v.candidateId, v.versionId].filter(
                (x) => x !== undefined,
              ).length <= 1,
          ),
        async (input, signal) => {
          if (++previews > 3)
            throw new Error(
              "Preview budget exhausted (3 per stage). Use the diagnostics to finish or report limitations.",
            );
          const result = await previewPage(
            project,
            await pageContent(input),
            { width: input.width, height: input.height },
            signal,
          );
          return output(
            {
              ...result.report,
              visualInputIncluded:
                options.vision && result.png.length <= 4 * 1024 * 1024,
              limitation:
                result.png.length > 4 * 1024 * 1024
                  ? "Screenshot exceeds 4 MB; diagnostics and saved image only"
                  : !options.vision
                    ? "Text-only model: screenshot not supplied as image input"
                    : null,
            },
            options.vision && result.png.length <= 4 * 1024 * 1024
              ? {
                  type: "image",
                  mimeType: "image/png",
                  data: result.png.toString("base64"),
                }
              : undefined,
          );
        },
      ),
    );
  }
  return tools;
}
