/** Explicit, offline-from-production quality comparison. Uses synthetic fixtures only. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import * as cheerio from "cheerio";
import { configSchema } from "../packages/shared/config.js";
import { analysisSchema } from "../packages/shared/generation.js";
import { modelRuntime } from "../apps/server/src/generation/model.js";
import {
  SkillLibrary,
  selectSkills,
} from "../apps/server/src/generation/skills.js";
import { sanitizeHtml } from "../apps/server/src/html.js";

if (!process.argv.includes("--live"))
  throw new Error(
    "Run with --live to authorize four synthetic-fixture model requests; this is never part of production generation.",
  );
const output = path.resolve(
  (process.argv.includes("--output")
    ? process.argv[process.argv.indexOf("--output") + 1]
    : undefined) || "/private/tmp/dreamatic-skill-evaluation",
);
const cfg = configSchema.parse(
  JSON.parse(
    await readFile(
      path.resolve(
        process.env.DREAMATIC_WORKSPACE || "workspace",
        "settings.json",
      ),
      "utf8",
    ),
  ),
);
const library = new SkillLibrary();
await mkdir(output, { recursive: true });
const sourceId = "11111111-1111-4111-8111-111111111111",
  assetId = "22222222-2222-4222-8222-222222222222";
const fixture = `# SYNTHETIC evaluation source — not a real company
## Lumen sensor
Lumen Labs launched the S2 sensor in March 2025 for indoor logistics. Range is 0–50 °C; stated accuracy ±0.3 °C only at 10–35 °C. Sampling interval is 30 seconds. The replaceable battery lasts up to 18 months at 20 °C, not at all temperatures. No outdoor certification is provided.
## Trial
A non-randomized May 2025 pilot at 24 sites reported median processing time 18% lower; excludes installation/setup time. The vendor claims simpler maintenance; no independent maintenance study is supplied.
## Pricing
| Plan | Annual price USD | Seats | Export |
| Basic | 240 | Up to 10 | CSV |
| Team | 480 | Up to 30 | CSV and JSON |
Prices exclude tax; the first year only. Setup is not included.
## Deployment
Calibrate before attaching the sensor; pair over Bluetooth; then confirm a timestamped sample. Replacement batteries are sold separately.
## Media
[Assembly demonstration](/assets/${sourceId}/33333333-3333-4333-8333-333333333333.mp4) assetId:${assetId}. Caption explicitly shows calibration and pairing. No product photograph is supplied.
## Note
The 18% result applies to this pilot, not a guaranteed customer outcome.`;
const textOf = (result: unknown) => JSON.stringify(result);
function extractionScore(value: unknown) {
  const a = analysisSchema.parse(value),
    text = a.facts.map((f) => f.text).join("\n");
  const required: [string, RegExp][] = [
    ["identity/time", /S2[\s\S]*(?:March|2025)/i],
    ["operating range", /0\s*[–—-]\s*50/],
    ["conditional accuracy", /[±+]\s*0\.3[\s\S]*10\s*[–—-]\s*35/],
    ["sampling", /30\s*(?:seconds|秒)/i],
    ["conditional battery", /18\s*(?:months|个月)[\s\S]*20\s*°?\s*C/i],
    [
      "pilot scope",
      /24\s*(?:sites|站点|个)[\s\S]*18\s*%|18\s*%[\s\S]*24\s*(?:sites|站点|个)/i,
    ],
    ["pilot limitation", /non.randomized|非随机/i],
    ["setup exclusion", /exclud|不含|排除/i],
    ["basic table values", /Basic[\s\S]*240[\s\S]*10[\s\S]*CSV/i],
    ["team table values", /Team[\s\S]*480[\s\S]*30[\s\S]*JSON/i],
    [
      "price conditions",
      /(tax|税)[\s\S]*(first.year|第一年|首年)|(first.year|首年)[\s\S]*(tax|税)/i,
    ],
    ["ordered deployment", /calibrat[\s\S]*pair[\s\S]*(sample|timestamp)/i],
  ];
  const covered = required
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
  const linked = a.facts.filter((f) => f.assetIds.includes(assetId));
  const mediaAccurate = linked.every((f) =>
    /calibrat|pair|部署|配对|校准/i.test(f.text),
  );
  return {
    required: required.length,
    covered: covered.length,
    missing: required
      .filter(([name]) => !covered.includes(name))
      .map(([name]) => name),
    facts: a.facts.length,
    exactDuplicateFacts:
      a.facts.length -
      new Set(a.facts.map((f) => f.text.trim().toLowerCase())).size,
    mediaLinks: linked.length,
    mediaAccurate,
    contractValid: true,
  };
}
function designScore(html: string) {
  const $ = cheerio.load(html);
  return {
    sections: $("main section,main article").length,
    landmarks: $("main").length === 1 && $("nav").length > 0,
    hasExactTable:
      $("table").text().includes("100") && $("table").text().includes("150"),
    preservesUnits: /USD|美元/.test($("body").text()),
    hasWorkingAnchors: $("a[href^='#']")
      .toArray()
      .every((e) => {
        const id = $(e).attr("href")!.slice(1);
        return (
          !!id &&
          $("[id]")
            .toArray()
            .some((n) => $(n).attr("id") === id)
        );
      }),
    nativeDisclosure: $("details>summary").length > 0,
    responsiveCSS: /@media|clamp\(/.test($("style").text()),
    scripts: $("script").length,
    placeholderLinks: $("a[href='#']").length,
    htmlCharacters: html.length,
  };
}
const reports: unknown[] = [];
try {
  for (const role of ["analyst", "designer"] as const) {
    if (
      process.argv.includes("--role") &&
      process.argv[process.argv.indexOf("--role") + 1] !== role
    )
      continue;
    for (const enabled of [false, true]) {
      if (
        process.argv.includes("--condition") &&
        process.argv[process.argv.indexOf("--condition") + 1] !==
          (enabled ? "skills" : "baseline")
      )
        continue;
      const request =
        role === "analyst"
          ? "Extract useful product, comparison and deployment facts for a website. Return English facts."
          : "Build a distinctive English KPI dashboard/report for the synthetic data below. Use a helpful navigation, readable exact comparison table, content-led CSS charts, real native disclosure and responsive layout. Mark it as synthetic demo data. Do not invent filters or business facts.";
      const input =
        role === "analyst"
          ? `# Intent\nProduct and pricing website\n# Canonical source Markdown: ${sourceId}\nCoverage complete.\n${fixture}`
          : `# Mode\ncreate\n# Intent\nOperational report for executives\n# Information facts\nAnnual revenue: 2024 USD 100 million; 2025 USD 150 million. Both exclude tax.\n2025 regions: North USD 90 million, South USD 60 million. No 2024 regional values available.\nPilot results are not audited. Visitor tasks: compare periods, understand regional totals, inspect method limitations.\n# Request\n${request}`;
      const names = enabled
        ? selectSkills(
            role,
            {
              text: role === "designer" ? request : "extract facts",
              editing: false,
            },
            (await library.catalog()).skills,
          )
        : [];
      const prepared = enabled
        ? await library.prepare(role, names)
        : { prompt: "", characters: 0 };
      const base = await readFile(`config/agents/${role}.md`, "utf8");
      const profile =
        role === "analyst"
          ? cfg.models.analyst || cfg.models.reasoning
          : cfg.models.designer || cfg.models.reasoning;
      const runtime = modelRuntime(profile);
      let value: unknown,
        calls = 0,
        inputTokens = 0,
        outputTokens = 0,
        cacheTokens = 0;
      const parameters =
        role === "analyst"
          ? Type.Object({
              summary: Type.String(),
              facts: Type.Array(
                Type.Object({
                  id: Type.String(),
                  text: Type.String(),
                  sourceId: Type.String(),
                  assetIds: Type.Optional(Type.Array(Type.String())),
                }),
              ),
              limitations: Type.Array(Type.String()),
            })
          : Type.Object({ html: Type.String() });
      const tool: AgentTool = {
        name: role === "analyst" ? "submit_facts" : "submit_page",
        label: "Submit",
        description: "Submit final result once",
        parameters,
        execute: async (_id, args) => {
          if (role === "analyst") value = analysisSchema.parse(args);
          else value = (args as { html: string }).html;
          return {
            content: [{ type: "text", text: "Accepted" }],
            details: {},
            terminate: true,
          };
        },
      };
      const agent = new Agent({
        initialState: {
          systemPrompt: base + "\n" + prepared.prompt,
          model: runtime.model,
          thinkingLevel: runtime.thinkingLevel,
          tools: [tool],
        },
        streamFn: (m, c, o) => {
          calls++;
          return runtime.streamFn(m, c, {
            ...o,
            maxTokens: 8000,
            maxRetries: 0,
          });
        },
        finishTurn: () => ({ action: "end" }),
      });
      agent.subscribe((e) => {
        if (e.type === "message_end" && e.message.role === "assistant") {
          inputTokens += e.message.usage.input;
          outputTokens += e.message.usage.output;
          cacheTokens += e.message.usage.cacheRead;
        }
      });
      const start = performance.now(),
        timer = setTimeout(() => agent.abort(), 120000);
      let error: string | undefined;
      try {
        await agent.prompt(input);
        if (!value)
          throw new Error(
            agent.state.errorMessage || "No final tool submission",
          );
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      } finally {
        clearTimeout(timer);
      }
      const report = {
        role,
        skillsEnabled: enabled,
        skills: names,
        elapsedMs: Math.round(performance.now() - start),
        modelCalls: calls,
        inputTokens,
        outputTokens,
        cacheTokens,
        skillCharacters: prepared.characters,
        stopReasons: agent.state.messages
          .filter((m) => m.role === "assistant")
          .map((m) => (m.role === "assistant" ? m.stopReason : undefined)),
        ...(error
          ? { error }
          : {
              score:
                role === "analyst"
                  ? extractionScore(value)
                  : designScore(sanitizeHtml(value as string)),
            }),
      };
      reports.push(report);
      if (value)
        await writeFile(
          path.join(
            output,
            `${role}-${enabled ? "skills" : "baseline"}.${role === "designer" ? "html" : "json"}`,
          ),
          role === "designer"
            ? sanitizeHtml(value as string)
            : JSON.stringify(value, null, 2),
        );
      await writeFile(
        path.join(output, "report.json"),
        JSON.stringify(
          {
            note: "Single synthetic sample per role/condition; not a production benchmark. No original user material used.",
            reports,
          },
          null,
          2,
        ),
      );
      console.log(JSON.stringify(report));
    }
  }
} finally {
  library.close();
}
