import { DATA } from "./store.js";
import {
  configSchema,
  normalizeEndpoint,
  type RuntimeConfig,
  type ModelProfile,
  type PublicConfig,
} from "../../../packages/shared/config.js";
export {
  configSchema,
  type RuntimeConfig,
} from "../../../packages/shared/config.js";
let current: RuntimeConfig | undefined;
function envProfile(prefix: string): ModelProfile {
  return {
    mode:
      process.env[prefix + "_MODEL_MODE"] === "openai"
        ? "openai"
        : process.env[prefix + "_BASE_URL"]
          ? "openai-compatible"
          : "openai",
    baseUrl: process.env[prefix + "_BASE_URL"] || "",
    model: process.env[prefix + "_MODEL"] || "",
    apiKey:
      process.env[prefix + "_API_KEY"] ||
      (prefix === "DREAMATIC" ? process.env.OPENAI_API_KEY : "") ||
      "",
    vision: process.env[prefix + "_VISION"] !== "false",
  };
}
function initial(): RuntimeConfig {
  return {
    workspace: DATA,
    mode: process.env.DREAMATIC_MODE === "demo" ? "demo" : "live",
    language: process.env.DREAMATIC_LANGUAGE === "en" ? "en" : "zh",
    models: {
      reasoning: envProfile("DREAMATIC"),
      analyst: process.env.DREAMATIC_ANALYST_MODEL
        ? envProfile("DREAMATIC_ANALYST")
        : null,
      designer: process.env.DREAMATIC_DESIGNER_MODEL
        ? envProfile("DREAMATIC_DESIGNER")
        : null,
    },
  };
}
export function readConfig(): PublicConfig {
  const c = current || initial();
  const redact = (p: ModelProfile) => ({
    mode: p.mode,
    baseUrl: p.baseUrl,
    model: p.model,
    vision: p.vision,
    hasApiKey: Boolean(p.apiKey),
  });
  return {
    workspace: c.workspace || DATA,
    mode: c.mode,
    language: c.language,
    models: {
      reasoning: redact(c.models.reasoning),
      analyst: c.models.analyst ? redact(c.models.analyst) : null,
      designer: c.models.designer ? redact(c.models.designer) : null,
    },
  };
}
/**
 * The configuration is read from the server's environment (.env) at start and only there: the
 * browser shows it and never changes it. Restart the server after changing .env.
 */
export async function initConfig() {
  const c = initial();
  for (const key of ["reasoning", "analyst", "designer"] as const) {
    const profile = c.models[key];
    if (profile) profile.baseUrl = normalizeEndpoint(profile.baseUrl);
  }
  current = configSchema.parse(c);
  current.workspace = DATA;
}

/** Request-local snapshot. Never expose this through an HTTP response. */
export function runtimeConfig(): RuntimeConfig {
  return structuredClone(current || initial());
}
