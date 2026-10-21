import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  stat,
  link,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { projectDir } from "../store.js";
import {
  analysisSchema,
  intentSchema,
  type Intent,
  type Analysis,
  type ArtifactRef,
} from "../../../../packages/shared/generation.js";
export const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
// Stable Markdown headings, JSON-escaped list entries: readable, unambiguous, parsed only on a cold load.
export function intentMarkdown(value: Intent) {
  return (
    "# User Intent Brief\n\n" +
    Object.entries(value)
      .map(
        ([key, val]) =>
          `## ${key}\n${(Array.isArray(val) ? val : [val]).map((item) => "- " + JSON.stringify(item)).join("\n")}`,
      )
      .join("\n\n") +
    "\n"
  );
}
export function factsMarkdown(value: Analysis) {
  return `# Information Facts\n\n## summary\n- ${JSON.stringify(value.summary)}\n\n## facts\n${value.facts.map((f) => "- " + JSON.stringify(f)).join("\n")}\n\n## limitations\n${value.limitations.map((s) => "- " + JSON.stringify(s)).join("\n")}\n`;
}
function sections(markdown: string) {
  const out: Record<string, unknown[]> = {};
  let section = "";
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) {
      section = line.slice(3);
      out[section] = [];
    } else if (line.startsWith("- ") && section)
      out[section].push(JSON.parse(line.slice(2)));
  }
  return out;
}
const cache = new Map<
  string,
  { hash: string; stamp: string; markdown: string; data: Intent | Analysis }
>();
export async function loadArtifact(
  projectId: string,
  kind: "intent" | "facts",
  ref?: ArtifactRef,
) {
  if (!ref) return;
  if (!/^[a-f\d]{64}$/.test(ref.hash)) throw new Error("结果指纹无效");
  const dir = path.join(projectDir(projectId), "results");
  let filename = path.join(dir, kind + "-" + ref.hash + ".md");
  try {
    await stat(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    filename = path.join(dir, kind + ".md");
  }
  try {
    const file = await stat(filename, { bigint: true });
    if (file.size > 8_000_000n) throw new Error("结果文件过大");
    const stamp = [file.ino, file.size, file.mtimeNs, file.ctimeNs].join(":");
    const hit = cache.get(filename);
    if (hit?.hash === ref.hash && hit.stamp === stamp) return hit;
    const markdown = await readFile(filename, "utf8");
    if (hash(markdown) !== ref.hash)
      throw new Error("结果文件校验失败：" + kind);
    const s = sections(markdown);
    const data =
      kind === "intent"
        ? intentSchema.parse({
            ...s,
            goal: s.goal?.[0],
            audience: s.audience?.[0],
          })
        : analysisSchema.parse({ ...s, summary: s.summary?.[0] });
    const value = { hash: ref.hash, stamp, markdown, data };
    cache.set(filename, value);
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}
export async function persistArtifact(
  projectId: string,
  kind: "intent" | "facts",
  key: string,
  data: Intent | Analysis,
) {
  const dir = path.join(projectDir(projectId), "results");
  const filename = path.join(dir, kind + ".md");
  const markdown =
    kind === "intent"
      ? intentMarkdown(data as Intent)
      : factsMarkdown(data as Analysis);
  const digest = hash(markdown);
  const canonical = path.join(dir, kind + "-" + digest + ".md");
  // Immutable content versions keep the previous metadata reference valid across a crash.
  // The friendly filename is a hard link, not a second copy of the Markdown.
  const prior = cache.get(canonical);
  if (prior?.hash === digest) {
    try {
      const file = await stat(canonical, { bigint: true });
      if (
        [file.ino, file.size, file.mtimeNs, file.ctimeNs].join(":") ===
        prior.stamp
      )
        return { ref: { key, hash: digest }, ...prior, written: false };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  await mkdir(dir, { recursive: true });
  const temp = filename + "." + crypto.randomUUID() + ".tmp";
  await writeFile(temp, markdown, { mode: 0o600 });
  try {
    await link(temp, canonical);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      await rm(temp, { force: true });
      throw error;
    }
    if ((await readFile(canonical, "utf8")) !== markdown) {
      await rm(temp, { force: true });
      throw new Error("已有结果文件损坏");
    }
    await rm(temp, { force: true });
    await link(canonical, temp);
  }
  await rename(temp, filename);
  const file = await stat(canonical, { bigint: true });
  const value = {
    hash: digest,
    stamp: [file.ino, file.size, file.mtimeNs, file.ctimeNs].join(":"),
    markdown,
    data,
  };
  cache.set(canonical, value);
  return { ref: { key, hash: digest }, ...value, written: true };
}
