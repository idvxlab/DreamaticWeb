import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Project, Role } from "./contracts.js";
import { projectDir } from "../../../apps/server/src/store.js";
import { modelSettingsForRole } from "./models.js";
import { sourceSnapshots } from "./evidence.js";
import type { Skill } from "./skills.js";
export const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function taskFingerprint(p: Project) {
  const snapshot = sourceSnapshots(p.id);
  const sourceHashes = [];
  for (const source of p.sources) {
    const text = await snapshot(source);
    const files = [];
    for (const asset of source.assets) {
      if (!asset.url.startsWith(`/assets/${p.id}/`)) {
        files.push("out-of-scope");
        continue;
      }
      try {
        files.push(
          createHash("sha256")
            .update(
              await readFile(
                path.join(projectDir(p.id), "assets", path.basename(asset.url)),
              ),
            )
            .digest("hex"),
        );
      } catch {
        files.push("missing");
      }
    }
    sourceHashes.push({
      id: source.id,
      name: source.name,
      format: source.format,
      provenance: source.provenance,
      warnings: source.warnings,
      assets: source.assets,
      markdownHash: text.hash,
      files,
    });
  }
  return fingerprint({
    version: 4,
    mode: process.env.DREAMATIC_MODE || "live",
    messages: p.messages.filter((m) => m.role === "user"),
    answers: p.questions?.filter((q) => q.answeredAt),
    sources: sourceHashes,
    baseVersion: p.versions.at(-1)
      ? {
          id: p.versions.at(-1)!.id,
          html: fingerprint(p.versions.at(-1)!.html),
        }
      : null,
  });
}
export async function stageFingerprint(
  p: Project,
  role: Role,
  skills: Skill[],
) {
  const { apiKey: _, ...model } = modelSettingsForRole(role);
  const prompts = await Promise.all(
    [".pi/APPEND_SYSTEM.md", `.pi/agents/${role}.md`].map((f) =>
      readFile(f, "utf8"),
    ),
  );
  const previous =
    role === "analyst"
      ? p.run?.checkpoints.orchestrator
      : role === "designer"
        ? p.run?.checkpoints.analyst
        : undefined;
  return fingerprint({
    input: p.run?.inputHash,
    role,
    model,
    prompts,
    skills: skills
      .filter((s) => s.roles.includes(role))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ name: s.name, content: s.content })),
    previous,
  });
}
