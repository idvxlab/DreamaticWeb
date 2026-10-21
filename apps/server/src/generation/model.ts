import {
  createModels,
  createProvider,
  getSupportedThinkingLevels,
  type Model,
  type Api,
} from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import type { ModelProfile } from "../../../../packages/shared/config.js";
const openaiCatalog = new Map(
  openaiProvider()
    .getModels()
    .map((model) => [model.id, model]),
);

export function modelRuntime(profile: ModelProfile) {
  if (!profile.model || !profile.baseUrl)
    throw new Error("请先在模型与设置中填写模型名称和调用 URL");
  const api =
    profile.mode === "openai" ? "openai-responses" : "openai-completions";
  // Public, local Pi catalog: do not mislabel known reasoning models as text-only.
  // This also lets Pi preserve encrypted reasoning across stateless Responses tool turns.
  const known =
    api === "openai-responses" ? openaiCatalog.get(profile.model) : undefined;
  const model: Model<Api> = {
    id: profile.model,
    name: profile.model,
    provider: "dreamatic",
    api,
    baseUrl: profile.baseUrl,
    reasoning: known?.reasoning ?? false,
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
          },
        }
      : {}),
  };
  const models = createModels();
  models.setProvider(
    createProvider({
      id: "dreamatic",
      models: [model],
      auth: {
        apiKey: {
          name: "Project model",
          resolve: async () => ({
            auth: profile.apiKey ? { apiKey: profile.apiKey } : {},
          }),
        },
      },
      api:
        api === "openai-responses"
          ? openAIResponsesApi()
          : openAICompletionsApi(),
    }),
  );
  return {
    model,
    thinkingLevel: getSupportedThinkingLevels(model)[0] || "off",
    streamFn: models.streamSimple.bind(models),
  };
}
