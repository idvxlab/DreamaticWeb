import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Request, Response } from "express";
import { z } from "zod";
import { get } from "./store.js";
import {
  normalizeEndpoint,
  modelProfileSchema,
} from "../../../packages/shared/config.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const cookieName = "dreamatic-user";
const userFile = process.env.DREAMATIC_USERS_FILE;
export const multiUser = Boolean(userFile);
const identities = new Map<string, string>();
const allowedEndpoints = new Set<string>();
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export async function initUsers() {
  if (!userFile) return;
  // Administrator-managed identity map. Only token hashes are stored in this file.
  const parsed = z
    .record(
      z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
      z.string().regex(/^[a-f0-9]{64}$/),
    )
    .safeParse(JSON.parse(await readFile(userFile, "utf8")));
  if (!parsed.success || !Object.keys(parsed.data).length)
    throw new Error("用户令牌文件格式无效");
  for (const [id, digest] of Object.entries(parsed.data)) {
    if (identities.has(digest)) throw new Error("不同用户不可使用同一访问令牌");
    identities.set(digest, id);
  }
  let endpoints: string[];
  try {
    endpoints = z
      .array(modelProfileSchema.shape.baseUrl)
      .min(1)
      .parse(JSON.parse(process.env.DREAMATIC_ALLOWED_MODEL_URLS || "[]"));
    if (endpoints.some((url) => !url)) throw new Error();
  } catch {
    throw new Error(
      "多用户模式必须配置 DREAMATIC_ALLOWED_MODEL_URLS 模型地址白名单",
    );
  }
  for (const url of endpoints) allowedEndpoints.add(normalizeEndpoint(url));
}

export function checkModelEndpoint(baseUrl: string) {
  if (multiUser && baseUrl && !allowedEndpoints.has(normalizeEndpoint(baseUrl)))
    throw new HttpError(400, "模型地址未获服务器允许，请联系管理员添加");
}

// API requests require a bearer token. A short-lived HttpOnly cookie is accepted
// only for read-only image/media and browser-preview navigation.
export function authenticate(req: Request, res: Response, allowCookie = false) {
  if (!multiUser) return;
  const authorization = req.headers.authorization;
  const cookie = req.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  const credential =
    authorization !== undefined
      ? authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : ""
      : allowCookie
        ? cookie || ""
        : "";
  const id =
    credential.length >= 32 && credential.length <= 512
      ? identities.get(hash(credential))
      : undefined;
  if (!id) {
    if (!allowCookie)
      res.clearCookie(cookieName, {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
      });
    throw new HttpError(401, "请输入有效的个人访问令牌");
  }
  res.locals.userId = id;
  res.setHeader("Cache-Control", "private, no-store");
  if (authorization && !allowCookie)
    res.cookie(cookieName, credential, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 60 * 60 * 1000,
      secure: req.secure || process.env.DREAMATIC_COOKIE_SECURE === "true",
    });
}

export async function checkProjectOwner(id: string, userId?: string) {
  if (!multiUser) return;
  let project;
  try {
    project = await get(id);
  } catch {
    throw new HttpError(404, "项目不存在");
  }
  if (!userId || project.ownerId !== userId)
    throw new HttpError(404, "项目不存在");
}
