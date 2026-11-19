import {
  createModels,
  createProvider,
  getSupportedThinkingLevels,
  type Model,
  type Api,
  type AssistantMessage,
  type Context,
  type SimpleStreamOptions,
  createAssistantMessageEventStream,
} from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import type { ModelProfile } from "../../../../packages/shared/config.js";
import { modelCapacity } from "./model-capacity.js";
import { checkModelEndpoint, multiUser } from "../users.js";
const openaiCatalog = new Map(
  openaiProvider()
    .getModels()
    .map((model) => [model.id, model]),
);

export function modelRuntime(profile: ModelProfile) {
  checkModelEndpoint(profile.baseUrl);
  if (!profile.model || !profile.baseUrl)
    throw new Error("请先在模型与设置中填写模型名称和调用 URL");
  const api =
    profile.mode === "openai" ? "openai-responses" : "openai-completions";
  // Public, local Pi catalog: do not mislabel known reasoning models as text-only.
  // This also lets Pi preserve encrypted reasoning across stateless Responses tool turns.
  const known =
    api === "openai-responses" ? openaiCatalog.get(profile.model) : undefined;
  const thinking = api === "openai-completions" ? profile.thinking : undefined;
  const model: Model<Api> = {
    id: profile.model,
    name: profile.model,
    provider: "dreamatic",
    api,
    baseUrl: profile.baseUrl,
    reasoning: known?.reasoning ?? Boolean(thinking),
    thinkingLevelMap: known?.thinkingLevelMap,
    input: profile.vision ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: known?.contextWindow ?? 128000,
    maxTokens: Math.min(24000, known?.maxTokens ?? 24000),
    ...(api === "openai-completions"
      ? {
          compat: {
            supportsStore: false,
            supportsDeveloperRole: false,
            supportsReasoningEffort: false,
            supportsStrictMode: false,
            // Public Pi compat: enable_thinking plus a top-level thinking_budget cap.
            ...(thinking
              ? {
                  thinkingFormat: thinking.format,
                  thinkingTokenBudgetField: "thinking_budget" as const,
                }
              : {}),
          },
        }
      : {}),
  };
  function streamFor(key: string) {
    const models = createModels();
    models.setProvider(
      createProvider({
        id: "dreamatic",
        models: [model],
        auth: {
          apiKey: {
            name: "Project model",
            resolve: async () => ({
              auth: key ? { apiKey: key } : {},
            }),
          },
        },
        api:
          api === "openai-responses"
            ? openAIResponsesApi()
            : openAICompletionsApi(),
      }),
    );
    const stream = models.streamSimple.bind(models);
    return stream;
  }
  const keys = profile.apiKeys?.length
    ? profile.apiKeys
    : [profile.apiKey || ""];
  const streams = new Map<string, ReturnType<typeof streamFor>>();
  function streamFn(
    m: Model<Api>,
    context: Context,
    options?: SimpleStreamOptions,
  ) {
    const output = createAssistantMessageEventStream();
    void (async () => {
      let lease: Awaited<ReturnType<typeof modelCapacity.acquire>> | undefined;
      try {
        lease = await modelCapacity.acquire(
          profile.baseUrl,
          keys,
          options?.signal,
        );
        let stream = streams.get(lease.key);
        if (!stream) {
          stream = streamFor(lease.key);
          streams.set(lease.key, stream);
        }
        const input = stream(m, context, {
          ...options,
          apiKey: lease.key,
          // Count/limit actual requests. Never replay an already-started stream on another key.
          maxRetries: 0,
          // The SDK may reject a non-2xx response before Pi's onResponse hook runs.
          // Its public fetch option observes both successful and failed HTTP responses.
          fetch: async (input, init) => {
            const response = await (options?.fetch || globalThis.fetch)(input, {
              ...init,
              ...(multiUser ? { redirect: "error" } : {}),
            });
            lease!.response(response.status);
            return response;
          },
          ...(thinking
            ? {
                thinkingBudgets: {
                  ...options?.thinkingBudgets,
                  low: Math.min(
                    thinking.budget,
                    options?.thinkingBudgets?.low ?? thinking.budget,
                  ),
                },
              }
            : {}),
        });
        for await (const event of input) output.push(event);
        output.end(await input.result());
      } catch (error) {
        const reason = options?.signal?.aborted ? "aborted" : "error";
        const message: AssistantMessage = {
          role: "assistant",
          content: [],
          api: m.api,
          provider: m.provider,
          model: m.id,
          stopReason: reason,
          errorMessage: error instanceof Error ? error.message : "模型请求失败",
          timestamp: Date.now(),
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          },
        };
        output.push({ type: "error", reason, error: message });
        output.end(message);
      } finally {
        lease?.release();
      }
    })();
    return output;
  }
  return {
    model,
    // A configured cap uses the "low" level with its budget set to the profile's value.
    thinkingLevel: thinking
      ? ("low" as const)
      : getSupportedThinkingLevels(model)[0] || "off",
    streamFn,
  };
}
