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
    for (const key of ["reasoning", "analyst", "designer"] as const) {
      const profile = c.models[key];
      if (!profile) continue;
      if (
        (profile.model && !profile.baseUrl) ||
        (!profile.model && profile.baseUrl) ||
        (key !== "reasoning" && !profile.model)
      )
        throw new Error("请同时填写模型调用 URL 和模型名称");
      profile.baseUrl = normalizeEndpoint(profile.baseUrl);
      profile.apiKey = profile.clearApiKey
        ? ""
        : profile.apiKey?.trim() || old.models[key]?.apiKey || "";
      delete profile.clearApiKey;
    }
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
