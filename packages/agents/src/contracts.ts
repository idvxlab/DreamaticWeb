import type { Clarification } from "./questions.js";
export type Role = "orchestrator" | "analyst" | "designer";
export interface Asset {
  id: string;
  name: string;
  type: "image" | "video" | "audio" | "file";
  url: string;
  mime: string;
  width?: number;
  height?: number;
}
export interface Source {
  id: string;
  name: string;
  format: string;
  /** Legacy data only. New imports never persist this field. */
  text?: string;
  markdown?: string;
  assets: Asset[];
  tables: { name: string; rows: unknown[][] }[];
  warnings: string[];
  provenance: string;
  originalFile?: string;
  content?: {
    readingFormat?: "markdown-v1" | "markdown-v2";
    readingHash?: string;
    readingComplete?: boolean;
    markdownLength?: number;
    tables: { index: number; name: string; rows: number }[];
  };
}
export interface Message {
  role: "user" | "assistant";
  text: string;
  time: string;
}
export interface RunEvent {
  id: string;
  role: Role | "system";
  kind: "status" | "delta" | "skill" | "error";
  text: string;
  time: string;
  details?: Record<string, string | number | boolean>;
}
export interface Version {
  id: string;
  html: string;
  label: string;
  createdAt: string;
  runId?: string;
  checks?: import("./page-checks.js").PageCheck;
}
export interface Project {
  id: string;
  title: string;
  titleEdited?: boolean;
  messages: Message[];
  sources: Source[];
  versions: Version[];
  events: RunEvent[];
  status:
    "idle" | "running" | "needs_input" | "complete" | "error" | "cancelled";
  questions?: Clarification[];
  brief?: unknown;
  analysis?: unknown;
  error?: string;
  pagePreviews?: {
    hash: string;
    width: number;
    height: number;
    overflow: boolean;
    missingImages: string[];
    contrast: { selector: string; ratio: number; required: number }[];
  }[];
  run?: {
    id: string;
    inputHash: string;
    activeRole?: Role;
    completedVersionId?: string;
    completedInputHash?: string;
    checkpoints: Partial<
      Record<Role, { key: string; result: unknown; completedAt: string }>
    >;
  };
}

/** Browser responses expose progress, while full checkpoint artifacts stay local. */
export type ProjectResponse = Omit<Project, "run" | "pagePreviews"> & {
  run?: Omit<NonNullable<Project["run"]>, "checkpoints"> & {
    checkpoints: Partial<Record<Role, { completedAt: string }>>;
  };
};
