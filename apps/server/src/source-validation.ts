import type { Source } from "../../../packages/shared/project.js";
export function validSource(value: unknown): value is Source {
  if (!value || typeof value !== "object") return false;
  const s = value as Source;
  return (
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    typeof s.format === "string" &&
    Array.isArray(s.assets) &&
    s.assets.every(
      (a) => a && typeof a.id === "string" && typeof a.url === "string",
    ) &&
    Array.isArray(s.tables) &&
    Array.isArray(s.warnings)
  );
}
