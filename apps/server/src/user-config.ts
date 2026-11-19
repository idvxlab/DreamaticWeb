import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA } from "./store.js";
import {
  configSchema,
  type RuntimeConfig,
  type PublicConfig,
} from "../../../packages/shared/config.js";
import { resolveModelProfiles, publicConfig } from "./config.js";
import { checkModelEndpoint, HttpError } from "./users.js";

const configs = new Map<string, RuntimeConfig>();
const updating = new Set<string>();
const directory = (id: string) => {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error("无效用户");
  return path.join(DATA, "users", id);
};
function blank(): RuntimeConfig {
  // Never inherit a server API key, another user's profile or global saved settings.
  return {
    workspace: DATA,
    mode: "live",
    language: "zh",
    models: {
      reasoning: {
        mode: "openai-compatible",
        baseUrl: "",
        model: "",
        apiKey: "",
        vision: true,
      },
      analyst: null,
      designer: null,
    },
  };
}
export async function userRuntimeConfig(id: string): Promise<RuntimeConfig> {
  let value = configs.get(id);
  if (!value) {
    try {
      value = configSchema.parse(
        JSON.parse(
          await readFile(path.join(directory(id), "settings.json"), "utf8"),
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error("用户配置无法读取，请联系管理员");
      value = blank();
    }
    value.workspace = DATA;
    // A slow read must not overwrite a newer completed write for the same user.
    if (!configs.has(id)) configs.set(id, value);
  }
  return structuredClone(configs.get(id)!);
}
export async function readUserConfig(id: string): Promise<PublicConfig> {
  return {
    ...publicConfig(await userRuntimeConfig(id)),
    workspace: "",
    userId: id,
    workspaceLocked: true,
  };
}
export async function writeUserConfig(id: string, input: unknown) {
  if (updating.has(id)) throw new HttpError(409, "配置正在保存，请稍后重试");
  updating.add(id);
  let temporary: string | undefined;
  try {
    const next = configSchema.parse(input);
    if (next.workspace)
      throw new HttpError(403, "工作目录由服务器管理，用户不能修改");
    const old = await userRuntimeConfig(id);
    resolveModelProfiles(next, old);
    for (const profile of Object.values(next.models))
      if (profile) checkModelEndpoint(profile.baseUrl);
    next.workspace = DATA;
    const folder = directory(id);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    temporary = path.join(folder, crypto.randomUUID() + ".tmp");
    await writeFile(temporary, JSON.stringify(next, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, path.join(folder, "settings.json"));
    configs.set(id, next);
    return readUserConfig(id);
  } finally {
    try {
      if (temporary) await rm(temporary, { force: true });
    } finally {
      updating.delete(id);
    }
  }
}

export function requireUserModel(config: RuntimeConfig) {
  for (const profile of Object.values(config.models)) {
    if (!profile) continue;
    if (
      !profile.model ||
      !profile.baseUrl ||
      !(profile.apiKey || profile.apiKeys?.length)
    )
      throw new HttpError(400, "请先保存你自己的模型地址、模型名称和 API 密钥");
    checkModelEndpoint(profile.baseUrl);
  }
}
