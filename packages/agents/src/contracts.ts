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
  text: string;
  assets: Asset[];
  tables: { name: string; rows: unknown[][] }[];
  warnings: string[];
  provenance: string;
  originalFile?: string;
  content?: {
    textLength: number;
    chunkSize: number;
    chunks: number;
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
}
