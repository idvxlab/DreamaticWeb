import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { createProvider } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { normalizeEndpoint } from "../../shared/config.js";
import type { Role } from "./contracts.js";
export function modelSettingsForRole(role: Role) {
  const own = "DREAMATIC_" + role.toUpperCase();
  const prefix =
    role !== "orchestrator" && process.env[own + "_MODEL"] ? own : "DREAMATIC";
  const id = process.env[prefix + "_MODEL"] || "";
  const mode =
    process.env[prefix + "_MODEL_MODE"] ||
    (process.env[prefix + "_BASE_URL"] ? "openai-compatible" : "openai");
  const baseUrl = normalizeEndpoint(
    process.env[prefix + "_BASE_URL"] ||
      (mode === "openai" ? "https://api.openai.com/v1" : ""),
  );
  const apiKey =
    process.env[prefix + "_API_KEY"] ||
    (mode === "openai" ? process.env.OPENAI_API_KEY : "") ||
    "";
  return {
    id,
    mode,
    baseUrl,
    apiKey,
    vision: process.env[prefix + "_VISION"] !== "false",
  };
}
export function resolveModel(role: Role) {
  const { id, mode, baseUrl, apiKey, vision } = modelSettingsForRole(role);
  if (!id || !baseUrl)
    throw new Error("请在模型与设置中填写系统推理模型的调用 URL 和模型名称");
  const models = builtinModels();
  const provider = "dreamatic-" + role;
  const api = mode === "openai" ? "openai-responses" : "openai-completions";
  models.setProvider(
    createProvider({
      id: provider,
      name: "Dreamatic",
      baseUrl,
      auth: {
        apiKey: {
          name: "Dreamatic API key",
          resolve: async () => ({
            auth: { apiKey: apiKey || "local-endpoint" },
          }),
        },
      },
      models: [
        {
          id,
          name: id,
          api,
          provider,
          baseUrl,
          reasoning: false,
          input: vision ? ["text", "image"] : ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 16000,
        },
      ],
      api: mode === "openai" ? openAIResponsesApi() : openAICompletionsApi(),
    }),
  );
  return { models, model: models.getModel(provider, id)! };
}
