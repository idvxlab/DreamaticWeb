/** Shared project data for the workspace, generation API and historical records. */
export interface Clarification {
  id: string;
  title: string;
  mode: "single" | "multiple" | "text";
  options: { id: string; label: string }[];
  createdAt: string;
  answeredAt?: string;
  answer?: { selected: string[]; text: string };
}
export interface PageIssue {
  severity: "error" | "warning";
  code: string;
  selector?: string;
  message: string;
}
export interface PageCheck {
  hash: string;
  status: "not-previewed" | "previewed" | "warnings";
  viewports: { width: number; height: number }[];
  issues: PageIssue[];
}
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
  fingerprint?: string;
  parserVersion?: string;
  dependencies?: { url: string; hash: string }[];
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
  /** Facts actually represented by this version; absent on legacy versions. */
  appliedFactIds?: string[];
  id: string;
  html: string;
  label: string;
  createdAt: string;
  runId?: string;
  checks?: PageCheck;
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
  generation?: import("./generation.js").GenerationState;
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
    activeRole?: Role;
    completedVersionId?: string;
    checkpoints: Partial<Record<Role, { completedAt: string }>>;
  };
}

/** Public project view excludes local preview diagnostics. */
export type ProjectResponse = Omit<Project, "pagePreviews" | "generation">;
