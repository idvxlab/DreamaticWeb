import express from "express";
import type { AddressInfo } from "node:net";
export async function modelServer(
  handler: (tools: string[], payload: any) => { name: string; args: unknown },
  options: { statelessReasoning?: boolean } = {},
) {
  const requests: any[] = [];
  const app = express();
  app.use(express.json({ limit: "4mb" }));
  app.post(["/v1/chat/completions", "/v1/responses"], (req, res) => {
    requests.push(req.body);
    if (
      options.statelessReasoning &&
      req.path.endsWith("/responses") &&
      req.body.input?.some(
        (item: any) => item.type === "function_call_output",
      ) &&
      !req.body.input.some(
        (item: any) => item.type === "reasoning" && item.encrypted_content,
      )
    ) {
      res
        .status(400)
        .json({
          message:
            "The request could not be processed. Please check the request parameters.",
          type: "invalid_request_error",
          param: "",
          code: "invalid_request",
        });
      return;
    }
    const response = handler(
      (req.body.tools || []).map((t: any) => t.function?.name || t.name),
      req.body,
    );
    const args = JSON.stringify(response.args),
      id = "call_" + crypto.randomUUID();
    res.setHeader("Content-Type", "text/event-stream");
    const send = (value: unknown) =>
      res.write("data: " + JSON.stringify(value) + "\n\n");
    if (req.path.endsWith("/chat/completions")) {
      send({
        id: "chat-test",
        object: "chat.completion.chunk",
        model: req.body.model,
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id,
                  type: "function",
                  function: { name: response.name, arguments: args },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      });
      send({
        id: "chat-test",
        object: "chat.completion.chunk",
        model: req.body.model,
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
      });
      res.end("data: [DONE]\n\n");
    } else {
      const item = {
        type: "function_call",
        id: "fc_test",
        call_id: id,
        name: response.name,
        arguments: args,
        status: "completed",
      };
      send({
        type: "response.created",
        response: {
          id: "resp_test",
          status: "in_progress",
          model: req.body.model,
          output: [],
        },
      });
      const reasoning = options.statelessReasoning
        ? {
            type: "reasoning",
            id: "rs_" + crypto.randomUUID(),
            summary: [],
            ...(req.body.include?.includes("reasoning.encrypted_content")
              ? { encrypted_content: "opaque-synthetic-reasoning" }
              : {}),
          }
        : undefined;
      if (reasoning) {
        send({
          type: "response.output_item.added",
          output_index: 0,
          item: { type: "reasoning", id: reasoning.id, summary: [] },
        });
        send({
          type: "response.output_item.done",
          output_index: 0,
          item: reasoning,
        });
      }
      const outputIndex = reasoning ? 1 : 0;
      send({
        type: "response.output_item.added",
        output_index: outputIndex,
        item: { ...item, arguments: "", status: "in_progress" },
      });
      send({
        type: "response.function_call_arguments.delta",
        item_id: "fc_test",
        output_index: outputIndex,
        delta: args,
      });
      send({
        type: "response.function_call_arguments.done",
        item_id: "fc_test",
        output_index: outputIndex,
        arguments: args,
      });
      send({
        type: "response.output_item.done",
        output_index: outputIndex,
        item,
      });
      send({
        type: "response.completed",
        response: {
          id: "resp_test",
          status: "completed",
          model: req.body.model,
          output: reasoning ? [reasoning, item] : [item],
          usage: {
            input_tokens: 20,
            output_tokens: 10,
            total_tokens: 30,
            input_tokens_details: { cached_tokens: 0 },
          },
        },
      });
      res.end();
    }
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
