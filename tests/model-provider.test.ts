import test from "node:test";
import assert from "node:assert/strict";
import { create, save, removeProject } from "../apps/server/src/store.js";
import { runProject } from "../apps/server/src/generation/runtime.js";
import { requestSchema } from "../packages/shared/generation.js";
import { modelServer } from "./model-server.js";

test("published Pi 1.3.0 provider APIs run all three stages over real Chat Completions and Responses SSE", async () => {
  for (const mode of ["openai-compatible", "openai"] as const) {
    const server = await modelServer((tools) =>
      tools.includes("submit_intent")
        ? {
            name: "submit_intent",
            args: {
              goal: "Website",
              audience: "Visitors",
              content: [],
              features: [],
              design: [],
              constraints: [],
            },
          }
        : tools.includes("submit_facts")
          ? {
              name: "submit_facts",
              args: { summary: "No sources", facts: [], limitations: [] },
            }
          : {
              name: "submit_page",
              args: {
                html: "<html><body><h1>Provider test page</h1></body></html>",
              },
            },
    );
    const p = await create();
    try {
      await runProject(
        p,
        requestSchema.parse({ text: "Build a website" }),
        save,
        () => {},
        {
          config: {
            mode: "live",
            workspace: process.env.DREAMATIC_WORKSPACE!,
            language: "en",
            models: {
              reasoning: {
                mode,
                baseUrl: server.baseUrl,
                model: "test-model",
                apiKey: "test-only",
                vision: false,
              },
              analyst: null,
              designer: null,
            },
          },
        },
      );
      assert.equal(p.status, "complete", mode + ": " + p.error);
      assert.equal(server.requests.length, 3, mode);
      assert.equal(p.generation!.metrics!.modelCalls, 3);
      assert.match(p.versions[0].html, /Provider test page/);
      assert.equal(
        JSON.stringify(server.requests).includes("test-only"),
        false,
      );
    } finally {
      await server.close();
      await removeProject(p.id);
    }
  }
});

test("stateless reasoning tool continuation reproduces legacy 400 and preserves encrypted reasoning with catalog metadata", async () => {
  const { ingest } = await import("../apps/server/src/ingest.js");
  const { modelRuntime } =
    await import("../apps/server/src/generation/model.js");
  for (const legacy of [true, false]) {
    const p = await create();
    const source = await ingest(
      Buffer.from("Synthetic source paragraph.\n".repeat(6000)),
      "synthetic.txt",
      p.id,
    );
    p.sources.push(source);
    const server = await modelServer(
      (tools, payload) => {
        if (tools.includes("submit_intent"))
          return {
            name: "submit_intent",
            args: {
              goal: "Website",
              audience: "Visitors",
              content: [],
              features: [],
              design: [],
              constraints: [],
            },
          };
        if (tools.includes("submit_facts")) {
          if (
            !payload.input.some(
              (item: any) => item.type === "function_call_output",
            )
          )
            return {
              name: "source_read",
              args: { sourceId: source.id, offset: 120000, limit: 1000 },
            };
          return {
            name: "submit_facts",
            args: { summary: "Synthetic facts", facts: [], limitations: [] },
          };
        }
        return {
          name: "submit_page",
          args: {
            html: "<html><body><h1>Synthetic regression page</h1></body></html>",
          },
        };
      },
      { statelessReasoning: true },
    );
    const profile = {
      mode: "openai" as const,
      baseUrl: server.baseUrl,
      model: "gpt-6.1-sol",
      apiKey: "synthetic-test-only",
      vision: false,
    };
    const runtime = modelRuntime(profile);
    try {
      assert.equal(runtime.model.reasoning, true);
      assert.equal(runtime.thinkingLevel, "low");
      await runProject(
        p,
        requestSchema.parse({ text: "Build from synthetic source" }),
        save,
        () => {},
        {
          config: {
            mode: "live",
            workspace: process.env.DREAMATIC_WORKSPACE!,
            language: "en",
            models: { reasoning: profile, analyst: null, designer: null },
          },
          ...(legacy
            ? {
                streamFn: (model: any, context: any, opts: any) =>
                  runtime.streamFn(
                    { ...model, reasoning: false },
                    context,
                    opts,
                  ),
              }
            : {}),
        },
      );
      const continuation = server.requests.find((payload) =>
        payload.input?.some(
          (item: any) => item.type === "function_call_output",
        ),
      );
      assert.ok(
        continuation,
        "Analyst must exercise a second provider request",
      );
      if (legacy) {
        assert.equal(p.status, "error");
        assert.match(p.error!, /400/);
        assert.equal(p.events.at(-1)!.details?.requestNumber, 2);
        assert.equal(p.events.at(-1)!.details?.lastTool, "source_read");
        assert.equal(p.events.at(-1)!.details?.api, "openai-responses");
      } else {
        assert.equal(p.status, "complete", p.error);
        assert.equal(server.requests.length, 4);
        assert.ok(continuation.include.includes("reasoning.encrypted_content"));
        assert.ok(
          continuation.input.some(
            (item: any) =>
              item.type === "reasoning" &&
              item.encrypted_content === "opaque-synthetic-reasoning",
          ),
        );
        assert.equal(continuation.reasoning.effort, "low");
      }
    } finally {
      await server.close();
      await removeProject(p.id);
    }
  }
});
