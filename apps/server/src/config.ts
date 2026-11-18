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
/** The settings the browser may change; the models stay in .env. Unknown keys (models) are dropped. */
const systemSchema = configSchema.pick({ mode: true, workspace: true, language: true });
type SystemSettings = ReturnType<typeof systemSchema.parse>;
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
 * Models come only from the server's environment (.env): the browser shows them and never changes
 * them; restart the server after editing .env. The system settings (workspace, language, mode) start
 * from .env and may be changed in the browser; those changes are saved in settings.json.
 */
export async function initConfig() {
  const c = initial();
  for (const key of ["reasoning", "analyst", "designer"] as const) {
    const profile = c.models[key];
    if (profile) profile.baseUrl = normalizeEndpoint(profile.baseUrl);
  }
  let saved: Partial<SystemSettings> = {};
  try {
    saved = systemSchema.partial().parse(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (saved.workspace) await switchWorkspace(saved.workspace);
  current = configSchema.parse({ ...c, ...saved, models: c.models });
  current.workspace = DATA;
}
export let configUpdating = false;
/** Saves the system settings only; any model fields in the input are ignored. */
export async function writeSystemSettings(input: unknown) {
  if (configUpdating) throw new Error("配置正在保存，请稍后重试");
  configUpdating = true;
  try {
    const s = systemSchema.parse(input);
    s.workspace = s.workspace || DATA;
    if (!path.isAbsolute(s.workspace))
      throw new Error("Workspace 路径必须是绝对路径");
    s.workspace = path.resolve(s.workspace);
    if (s.workspace === path.parse(s.workspace).root || s.workspace === ROOT_PATH)
      throw new Error("请选择独立的 Workspace 目录");
    const temp = file + "." + crypto.randomUUID() + ".tmp";
    await writeFile(temp, JSON.stringify(s, null, 2), { mode: 0o600 });
    const previousWorkspace = DATA;
    try {
      await switchWorkspace(s.workspace);
      await rename(temp, file);
    } catch (error) {
      await switchWorkspace(previousWorkspace);
      throw error;
    }
    current = { ...(current || initial()), ...s };
    return readConfig();
  } finally {
    configUpdating = false;
  }
}

/** Request-local snapshot. Never expose this through an HTTP response. */
export function runtimeConfig(): RuntimeConfig {
  return structuredClone(current || initial());
}
