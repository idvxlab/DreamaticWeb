import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { DATA, SETTINGS_ROOT, switchWorkspace } from "./store.js";
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
const ROOT_PATH = process.cwd();
const file = path.join(SETTINGS_ROOT, "settings.json");
let current: RuntimeConfig | undefined;
function envProfile(prefix: string): ModelProfile {
  let apiKeys: string[] | undefined;
  if (process.env[prefix + "_API_KEYS"]) {
    try {
      const value = JSON.parse(process.env[prefix + "_API_KEYS"]!);
      if (
        !Array.isArray(value) ||
        !value.length ||
        value.length > 16 ||
        value.some((k) => typeof k !== "string" || !k.trim() || k.length > 4096)
      )
        throw new Error();
      apiKeys = [...new Set<string>(value.map((k) => k.trim()))];
    } catch {
      throw new Error(prefix + "_API_KEYS 必须是包含 1–16 把密钥的 JSON 数组");
    }
  }
  return {
    ...(apiKeys ? { apiKeys } : {}),
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
    ...(process.env[prefix + "_THINKING_FORMAT"] === "qwen" &&
    Number(process.env[prefix + "_THINKING_BUDGET"]) >= 256
      ? {
          thinking: {
            format: "qwen" as const,
            budget: Math.min(
              16000,
              Math.floor(Number(process.env[prefix + "_THINKING_BUDGET"])),
            ),
          },
        }
      : {}),
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
export function publicConfig(c: RuntimeConfig): PublicConfig {
  const redact = (p: ModelProfile) => ({
    mode: p.mode,
    baseUrl: p.baseUrl,
    model: p.model,
    vision: p.vision,
    ...(p.thinking ? { thinking: p.thinking } : {}),
    hasApiKey: Boolean(p.apiKey || p.apiKeys?.length),
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
export function readConfig(): PublicConfig {
  return publicConfig(current || initial());
}

export async function initConfig() {
  try {
    current = configSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    current = initial();
  }
  if (current.workspace) await switchWorkspace(current.workspace);
  current.workspace = DATA;
}
export function resolveModelProfiles(next: RuntimeConfig, old: RuntimeConfig) {
  for (const key of ["reasoning", "analyst", "designer"] as const) {
    const profile = next.models[key];
    if (!profile) continue;
    // Public config never contains the pool. Preserve it for ordinary settings updates.
    if (
      profile.apiKeys === undefined &&
      normalizeEndpoint(profile.baseUrl) ===
        normalizeEndpoint(old.models[key]?.baseUrl || "") &&
      profile.mode === old.models[key]?.mode &&
      profile.model === old.models[key]?.model &&
      (!profile.apiKey || profile.apiKey === old.models[key]?.apiKey)
    )
      profile.apiKeys = old.models[key]?.apiKeys;
    if (profile.clearApiKey) delete profile.apiKeys;
    if (
      (profile.model && !profile.baseUrl) ||
      (!profile.model && profile.baseUrl) ||
      (key !== "reasoning" && !profile.model)
    )
      throw new Error("请同时填写模型调用 URL 和模型名称");
    profile.baseUrl = normalizeEndpoint(profile.baseUrl);
    const sameEndpoint =
      profile.mode === old.models[key]?.mode &&
      profile.baseUrl === normalizeEndpoint(old.models[key]?.baseUrl || "");
    profile.apiKey = profile.clearApiKey
      ? ""
      : profile.apiKey?.trim() ||
        (sameEndpoint ? old.models[key]?.apiKey : "") ||
        "";
    delete profile.clearApiKey;
  }
}

export let configUpdating = false;
export async function writeConfig(input: unknown) {
  if (configUpdating) throw new Error("配置正在保存，请稍后重试");
  configUpdating = true;
  try {
    const c = configSchema.parse(input);
    c.workspace = c.workspace || DATA;
    if (!path.isAbsolute(c.workspace))
      throw new Error("Workspace 路径必须是绝对路径");
    c.workspace = path.resolve(c.workspace);
    if (
      c.workspace === path.parse(c.workspace).root ||
      c.workspace === ROOT_PATH
    )
      throw new Error("请选择独立的 Workspace 目录");
    const old = current || initial();
    resolveModelProfiles(c, old);
    const temp = file + "." + crypto.randomUUID() + ".tmp";
    await writeFile(temp, JSON.stringify(c, null, 2), { mode: 0o600 });
    const previousWorkspace = DATA;
    try {
      await switchWorkspace(c.workspace);
      await rename(temp, file);
    } catch (error) {
      await switchWorkspace(previousWorkspace);
      throw error;
    }
    current = c;
    return readConfig();
  } finally {
    configUpdating = false;
  }
}

/** Request-local snapshot. Never expose this through an HTTP response. */
export function runtimeConfig(): RuntimeConfig {
  return structuredClone(current || initial());
}
