import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { extract } from "../apps/server/src/extract.js";
import { removeProject } from "../apps/server/src/store.js";
import { acceptAnswer } from "../packages/agents/src/questions.js";
import { runProject, activeRuns } from "../packages/agents/src/runtime.js";
import type { Project } from "../packages/agents/src/contracts.js";
const project = (): Project => ({
  id: crypto.randomUUID(),
  title: "Test",
  messages: [
    {
      role: "user",
      text: "Create a brand website",
      time: new Date().toISOString(),
    },
  ],
  sources: [],
  versions: [],
  events: [],
  status: "idle",
});
test("Actual Pi 1.3 harness runs three agents, calls dynamic Skills, validates outputs and handles clarification", async () => {
  const seen: string[] = [];
  let clarify = false;
  let exerciseTools = false;
  let invalidEvidence = false;
  let toolSourceId = "";
  let toolBaseVersionId = "";
  let questionMode: "single" | "multiple" | "text" | undefined;
  let invalidDesigner = 0;
  let invalidSource = false;
  let delayed = false;
  let editedContextSeen = false;
  let responseStyle:
    "prefaced" | "structured" | "repair" | "bad" | "length" | undefined;
  let repairRequests = 0;
  let submissionCalls = 0;
  let rejectSubmissionOnce = false;
  let rejectEvidenceOnce = false;
  let imageAsset: { id: string; url: string } | undefined;
  let imageSourceId = "";
  let imageDesignerAttempts = 0;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    const input = JSON.parse(body);
    const system = input.messages
      .filter((m: any) => m.role === "system")
      .map((m: any) => m.content)
      .join("\n");
    const role = system.includes("user-facing coordinator")
      ? "orchestrator"
      : system.includes("Analyze supplied source")
        ? "analyst"
        : "designer";
    seen.push(role);
    if (delayed) {
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (
      role === "designer" &&
      JSON.stringify(input.messages).includes("User visual edit")
    )
      editedContextSeen = true;
    const toolResults = input.messages.filter(
      (m: any) => m.role === "tool",
    ).length;
    const output =
      role === "orchestrator"
        ? JSON.stringify({
            needsInput: clarify,
            ...(clarify ? { question: "Who is the audience?" } : {}),
            title: "Brand website",
            brief: { goal: "brand page" },
          })
        : role === "analyst"
          ? JSON.stringify({
              summary: "No external evidence",
              facts: invalidSource
                ? [{ text: "Claim", sourceId: "invented" }]
                : exerciseTools
                  ? [
                      {
                        text: "Supported claim",
                        sourceId: toolSourceId,
                        evidence: {
                          kind: "text",
                          start: 0,
                          end: 8,
                          quote: invalidEvidence ? "Wrong!!!" : "Evidence",
                        },
                      },
                    ]
                  : [],
              sections: [],
              assets: imageAsset
                ? [
                    {
                      url: imageAsset.url,
                      purpose: "Product showcase",
                      sourceId: imageSourceId,
                    },
                  ]
                : [],
              imageDecisions: imageAsset
                ? [
                    {
                      assetId: imageAsset.id,
                      decision: "use",
                      reason: "Relevant product photo",
                    },
                  ]
                : [],
              dataInsights: [],
              limitations: [],
            })
          : "<!doctype html><html><head><style>body{color:green}</style></head><body><h1>Brand website</h1></body></html>";
    let result = output;
    if (role === "designer" && toolResults >= 2 && invalidDesigner > 0) {
      result = "incomplete HTML";
      invalidDesigner--;
    }
    let delta: any, finish: string;
    const formatRepair = system.includes("\nFORMAT REPAIR ONLY:");
    if (formatRepair) {
      repairRequests++;
      assert.deepEqual(
        input.tools.map((tool: any) => tool.function.name),
        ["submit_result"],
      );
      delta = {
        role: "assistant",
        content:
          responseStyle === "bad" ? "Now I have no valid result." : output,
      };
      finish = "stop";
    } else if (questionMode && role === "orchestrator") {
      delta = {
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: "call_question",
            type: "function",
            function: {
              name: "ask_user",
              arguments: JSON.stringify({
                title: "Which content matters?",
                mode: questionMode,
                options:
                  questionMode === "text"
                    ? []
                    : [
                        { id: "products", label: "Products" },
                        { id: "company", label: "Company" },
                      ],
              }),
            },
          },
        ],
      };
      finish = "tool_calls";
    } else if (toolResults === 0) {
      delta = {
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: "call_list",
            type: "function",
            function: { name: "list_skills", arguments: "{}" },
          },
        ],
      };
      finish = "tool_calls";
    } else if (toolResults === 1) {
      delta = {
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: "call_skill",
            type: "function",
            function: {
              name: "use_skill",
              arguments: JSON.stringify({
                name:
                  role === "designer"
                    ? "web-design"
                    : role === "analyst"
                      ? "evidence-analysis"
                      : "intent-alignment",
              }),
            },
          },
        ],
      };
      finish = "tool_calls";
    } else if (imageAsset && role === "analyst" && toolResults === 2) {
      delta = {
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: "call_image",
            type: "function",
            function: {
              name: "asset_inspect",
              arguments: JSON.stringify({ assetId: imageAsset.id }),
            },
          },
        ],
      };
      finish = "tool_calls";
    } else if (exerciseTools && toolResults === 2) {
      const name =
        role === "orchestrator"
          ? "project_context_read"
          : role === "analyst"
            ? "source_search"
            : "page_patch";
      const args =
        role === "orchestrator"
          ? { section: "conversation", offset: 0, limit: 2 }
          : role === "analyst"
            ? { sourceId: toolSourceId, query: "Evidence" }
            : {
                baseVersionId: toolBaseVersionId,
                operations: [
                  {
                    selector: "#hero",
                    action: "set_text",
                    value: "Tool-patched website",
                  },
                ],
              };
      assert.ok(input.tools.some((tool: any) => tool.function.name === name));
      delta = {
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: "call_project_tool",
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      };
      finish = "tool_calls";
    } else {
      if (exerciseTools && role === "designer") {
        const last = input.messages
          .filter((m: any) => m.role === "tool")
          .at(-1);
        const content =
          typeof last.content === "string"
            ? last.content
            : last.content.map((c: any) => c.text || "").join("");
        const toolResult = JSON.parse(content);
        assert.ok(toolResult.candidateId, content);
        result = JSON.stringify({ candidateId: toolResult.candidateId });
      }
      if (imageAsset && role === "designer") {
        if (imageDesignerAttempts++ > 0)
          result = result.replace(
            "</body>",
            `<img src="${imageAsset.url}" alt="Product photo"></body>`,
          );
      }
      if (role !== "designer" && responseStyle === "prefaced")
        result = `Now I have enough evidence.\n\x60\x60\x60json\n${result}\n\x60\x60\x60\nAnalysis finished.`;
      if (
        role === "analyst" &&
        (responseStyle === "repair" || responseStyle === "bad")
      )
        result = "Now I have enough evidence but no JSON.";
      delta = { role: "assistant", content: result };
      finish =
        role === "analyst" && responseStyle === "length" ? "length" : "stop";
      if (role !== "designer" && responseStyle === "structured") {
        submissionCalls++;
        const args = JSON.parse(output);
        if (rejectSubmissionOnce && role === "orchestrator") {
          delete args.title;
          rejectSubmissionOnce = false;
        }
        if (rejectEvidenceOnce && role === "analyst") {
          args.facts = [
            { text: "Unsupported fact", sourceId: "invented-source" },
          ];
          rejectEvidenceOnce = false;
        }
        delta = {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: `submit_${submissionCalls}`,
              type: "function",
              function: {
                name: "submit_result",
                arguments: JSON.stringify(args),
              },
            },
          ],
        };
        finish = "tool_calls";
      }
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const chunk = (d: any, f: string | null) => ({
      id: "test",
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "test-model",
      choices: [{ index: 0, delta: d, finish_reason: f }],
    });
    res.write("data: " + JSON.stringify(chunk(delta, null)) + "\n\n");
    res.write("data: " + JSON.stringify(chunk({}, finish)) + "\n\n");
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  assert.ok(addr && typeof addr !== "string");
  const before = { ...process.env };
  process.env.DREAMATIC_BASE_URL = `http://127.0.0.1:${addr.port}/v1`;
  process.env.DREAMATIC_MODEL = "test-model";
  process.env.DREAMATIC_MODE = "live";
  try {
    const p = project();
    await runProject(
      p,
      async () => {},
      () => {},
    );
    assert.equal(p.status, "complete", p.error);
    assert.match(p.versions[0].html, /Brand website/);
    assert.deepEqual(
      [...new Set(seen)],
      ["orchestrator", "analyst", "designer"],
    );
    assert.equal(p.events.filter((e) => e.kind === "skill").length, 3);
    assert.equal(activeRuns.has(p.id), false);
    clarify = true;
    seen.length = 0;
    const q = project();
    await runProject(
      q,
      async () => {},
      () => {},
    );
    assert.equal(q.status, "needs_input");
    assert.equal(q.versions.length, 0);
    assert.equal(q.messages.at(-1)?.text, "Who is the audience?");
    assert.deepEqual([...new Set(seen)], ["orchestrator"]);
    // Regression: answering a clarification resumes even when question is omitted in the next brief.
    assert.equal(q.questions?.length, 1);
    const answer = acceptAnswer(q.questions![0], {
      text: "Use all PDF content; choose emphasis yourself",
      selected: [],
    });
    q.messages.push({
      role: "user",
      text: answer,
      time: new Date().toISOString(),
    });
    clarify = false;
    await runProject(
      q,
      async () => {},
      () => {},
    );
    assert.equal(q.status, "complete", q.error);
    assert.equal(q.versions.length, 1);
    assert.ok(q.questions![0].answeredAt);
    for (const mode of ["single", "multiple", "text"] as const) {
      questionMode = mode;
      seen.length = 0;
      const interactive = project();
      await runProject(
        interactive,
        async () => {},
        () => {},
      );
      assert.equal(interactive.status, "needs_input", interactive.error);
      assert.equal(interactive.questions?.[0].mode, mode);
      assert.equal(interactive.versions.length, 0);
      assert.deepEqual([...new Set(seen)], ["orchestrator"]);
      const text = acceptAnswer(interactive.questions![0], {
        selected:
          mode === "text"
            ? []
            : mode === "single"
              ? ["products"]
              : ["products", "company"],
        text: "Custom details",
      });
      interactive.messages.push({
        role: "user",
        text,
        time: new Date().toISOString(),
      });
      questionMode = undefined;
      await runProject(
        interactive,
        async () => {},
        () => {},
      );
      assert.equal(interactive.status, "complete", interactive.error);
    }

    clarify = false;
    invalidDesigner = 1;
    const repaired = project();
    repaired.versions.push({
      id: crypto.randomUUID(),
      html: "<html><body>User visual edit</body></html>",
      label: "manual",
      createdAt: new Date().toISOString(),
    });
    await runProject(
      repaired,
      async () => {},
      () => {},
    );
    assert.equal(repaired.status, "complete", repaired.error);
    assert.equal(repaired.versions.length, 2);
    assert.equal(editedContextSeen, true);
    assert.ok(repaired.events.some((e) => e.text.includes("定向修复")));

    exerciseTools = true;
    const toolRun = project();
    toolSourceId = crypto.randomUUID();
    toolBaseVersionId = crypto.randomUUID();
    toolRun.sources = [
      {
        id: toolSourceId,
        name: "Evidence",
        format: "txt",
        text: "Evidence for this website",
        tables: [],
        assets: [],
        warnings: [],
        provenance: "upload:evidence.txt",
      },
    ];
    toolRun.versions.push({
      id: toolBaseVersionId,
      html: '<html><body><h1 id="hero">Manual page</h1></body></html>',
      label: "manual",
      createdAt: "",
    });
    await runProject(
      toolRun,
      async () => {},
      () => {},
    );
    assert.equal(toolRun.status, "complete", toolRun.error);
    assert.match(toolRun.versions.at(-1)!.html, /Tool-patched website/);
    assert.match(toolRun.versions[0].html, /Manual page/);
    assert.ok(toolRun.events.some((e) => e.text.includes("source_search")));
    assert.equal((toolRun.analysis as any).facts[0].locationVerified, true);
    invalidEvidence = true;
    const ungrounded = project();
    ungrounded.sources = toolRun.sources;
    await runProject(
      ungrounded,
      async () => {},
      () => {},
    );
    assert.equal(ungrounded.status, "error");
    assert.match(ungrounded.error || "", /Evidence quote/);
    assert.equal(ungrounded.versions.length, 0);
    invalidEvidence = false;
    exerciseTools = false;

    invalidSource = true;
    const bad = project();
    bad.versions = [...repaired.versions];
    const prior = bad.versions.at(-1)?.html;
    await runProject(
      bad,
      async () => {},
      () => {},
    );
    assert.equal(bad.status, "error");
    assert.match(bad.error || "", /sourceId/);
    assert.equal(bad.versions.at(-1)?.html, prior);
    assert.equal(activeRuns.has(bad.id), false);
    invalidSource = false;

    const illustrated = project();
    try {
      illustrated.sources = [
        await extract(
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9JkAAAAASUVORK5CYII=",
            "base64",
          ),
          "product.png",
          illustrated.id,
        ),
      ];
      imageAsset = illustrated.sources[0].assets[0];
      imageSourceId = illustrated.sources[0].id;
      await runProject(
        illustrated,
        async () => {},
        () => {},
      );
      assert.equal(illustrated.status, "complete", illustrated.error);
      assert.match(illustrated.versions[0].html, new RegExp(imageAsset.url));
      assert.equal(
        imageDesignerAttempts,
        2,
        "omitted image must trigger one repair",
      );
      assert.ok(
        illustrated.events.some((e) =>
          e.text.includes("工具完成：asset_inspect"),
        ),
      );
      assert.match(
        illustrated.messages.at(-1)!.text,
        /设计完成|Design complete/,
      );
      assert.match(
        illustrated.messages.at(-1)!.text,
        /1 张资料图片|1 source images/,
      );
    } finally {
      imageAsset = undefined;
      await removeProject(illustrated.id).catch(() => {});
    }

    responseStyle = "prefaced";
    const prefaced = project();
    await runProject(
      prefaced,
      async () => {},
      () => {},
    );
    assert.equal(prefaced.status, "complete", prefaced.error);
    assert.equal(
      prefaced.events.filter((event) => event.text.includes("格式修复")).length,
      0,
    );

    responseStyle = "structured";
    rejectSubmissionOnce = true;
    rejectEvidenceOnce = true;
    const structured = project();
    await runProject(
      structured,
      async () => {},
      () => {},
    );
    assert.equal(structured.status, "complete", structured.error);
    assert.equal(
      submissionCalls,
      4,
      "invalid submission is rejected before corrected brief and analysis are accepted",
    );
    assert.equal(
      structured.events.filter(
        (event) => event.details?.stopReason === "submitted",
      ).length,
      2,
    );
    assert.equal(
      structured.events.filter(
        (event) => event.text === "结果校验通过，阶段完成",
      ).length,
      3,
    );
    assert.ok(
      structured.events.some((event) =>
        event.text.includes("工具失败：submit_result"),
      ),
    );

    responseStyle = "repair";
    const repairedFormat = project();
    await runProject(
      repairedFormat,
      async () => {},
      () => {},
    );
    assert.equal(repairedFormat.status, "complete", repairedFormat.error);
    assert.equal(
      repairRequests,
      1,
      "one format-only request, no source research restart",
    );
    assert.ok(
      repairedFormat.events.some((event) => event.details?.repairOnly === true),
    );

    responseStyle = "bad";
    const stillBad = project();
    await runProject(
      stillBad,
      async () => {},
      () => {},
    );
    assert.equal(stillBad.status, "error");
    assert.equal(repairRequests, 2, "only one repair per workflow");
    assert.match(stillBad.error || "", /Document Analyst.*自动修复后仍未通过/);
    assert.doesNotMatch(stillBad.error || "", /Unexpected token/);
    assert.equal(
      stillBad.events.filter((event) => event.role === "designer").length,
      0,
    );
    assert.equal(
      stillBad.events.filter(
        (event) =>
          event.role === "analyst" && event.text === "结果校验通过，阶段完成",
      ).length,
      0,
    );
    assert.equal(activeRuns.has(stillBad.id), false);

    responseStyle = "length";
    const limited = project();
    await runProject(
      limited,
      async () => {},
      () => {},
    );
    assert.equal(limited.status, "error");
    assert.match(limited.error || "", /长度上限/);
    assert.ok(
      limited.events.some((event) => event.details?.stopReason === "length"),
    );
    assert.equal(limited.versions.length, 0);
    responseStyle = undefined;

    delayed = true;
    const cancelled = project();
    const pending = runProject(
      cancelled,
      async () => {},
      () => {},
    );
    activeRuns.get(cancelled.id)?.abort();
    await pending;
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.versions.length, 0);
    assert.equal(activeRuns.has(cancelled.id), false);

    process.env.DREAMATIC_AGENT_TIMEOUT_MS = "100";
    const timeout = project();
    await runProject(
      timeout,
      async () => {},
      () => {},
    );
    assert.equal(timeout.status, "error");
    assert.match(timeout.error || "", /超时/);
    assert.equal(activeRuns.has(timeout.id), false);
  } finally {
    for (const name of [
      "DREAMATIC_BASE_URL",
      "DREAMATIC_MODEL",
      "DREAMATIC_MODE",
      "DREAMATIC_AGENT_TIMEOUT_MS",
    ]) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
    await new Promise<void>((r) => server.close(() => r()));
  }
});
