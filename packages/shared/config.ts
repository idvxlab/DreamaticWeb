import { z } from "zod";
export const modelProfileSchema = z.object({
  mode: z.enum(["openai", "openai-compatible"]),
  baseUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => {
      if (!value) return true;
      try {
        const u = new URL(value);
        return (
          ["http:", "https:"].includes(u.protocol) &&
          !u.username &&
          !u.password &&
          !u.hash &&
          !u.search
        );
      } catch {
        return false;
      }
    }, "模型调用 URL 必须是不包含凭据的 HTTP/HTTPS 地址"),
  model: z.string().trim().max(200),
  vision: z.boolean().default(true),
  /**
   * Explicit reasoning control for an OpenAI-compatible endpoint that serves a
   * hybrid-thinking model. Reasoning and the answer share the output limit, so
   * an uncapped reasoning phase can consume the whole response. Off when unset;
   * the host never guesses it from the model name.
   */
  thinking: z
    .object({
      format: z.enum(["qwen"]),
      budget: z.number().int().min(256).max(16000),
    })
    .optional(),
  apiKey: z.string().max(4096).optional(),
  clearApiKey: z.boolean().optional(),
});
export const configSchema = z.object({
  mode: z.enum(["live", "demo"]),
  workspace: z.string().trim().max(4096).default(""),
  language: z.enum(["zh", "en"]).default("zh"),
  models: z.object({
    reasoning: modelProfileSchema,
    analyst: modelProfileSchema.nullable(),
    designer: modelProfileSchema.nullable(),
  }),
});
export type ModelProfile = z.infer<typeof modelProfileSchema>;
export type RuntimeConfig = z.infer<typeof configSchema>;
export type PublicProfile = Omit<ModelProfile, "apiKey" | "clearApiKey"> & {
  hasApiKey: boolean;
};
export type PublicConfig = Omit<RuntimeConfig, "models"> & {
  models: {
    reasoning: PublicProfile;
    analyst: PublicProfile | null;
    designer: PublicProfile | null;
  };
};
export function normalizeEndpoint(value: string) {
  return value
    .trim()
    .replace(/\/(?:chat\/completions|responses)\/?$/i, "")
    .replace(/\/+$/, "");
}
