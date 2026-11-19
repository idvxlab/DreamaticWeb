// Administrator utility: issue/rotate one personal access token; never calls a model.
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, rename, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const [file, userId, ...extra] = process.argv.slice(2);
if (!file || !userId || extra.length || !/^[a-zA-Z0-9_-]{1,64}$/.test(userId)) {
  console.error(
    "用法: node scripts/user-access.mjs <用户令牌文件路径> <用户ID，仅字母数字_-，最多64字符>",
  );
  process.exit(1);
}
let users = {};
try {
  users = JSON.parse(await readFile(file, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw new Error("无法读取用户令牌文件");
}
if (
  !users ||
  typeof users !== "object" ||
  Array.isArray(users) ||
  Object.entries(users).some(
    ([id, value]) =>
      !/^[a-zA-Z0-9_-]{1,64}$/.test(id) ||
      typeof value !== "string" ||
      !/^[a-f0-9]{64}$/.test(value),
  )
)
  throw new Error("用户令牌文件格式无效");
const token = randomBytes(32).toString("base64url");
const next = {
  ...users,
  [userId]: createHash("sha256").update(token).digest("hex"),
};
const target = path.resolve(file),
  temporary = target + "." + randomUUID() + ".tmp";
await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
try {
  await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  await rename(temporary, target);
} finally {
  await rm(temporary, { force: true });
}
console.log(
  `用户 ${userId} 的个人访问令牌（请单独交给本人；服务重启后生效）：\n${token}`,
);
