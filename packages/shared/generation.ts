import { z } from "zod";
export const intentSchema = z.object({
  goal: z.string().min(1).max(4000),
  audience: z.string().min(1).max(2000),
  content: z.array(z.string().max(4000)).max(60),
  features: z.array(z.string().max(2000)).max(40),
  design: z.array(z.string().max(2000)).max(40),
  constraints: z.array(z.string().max(2000)).max(40),
});
export type Intent = z.infer<typeof intentSchema>;
export const analysisSchema = z.object({
  summary: z.string().max(6000),
  facts: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        text: z.string().min(1).max(8000),
        sourceId: z.string().max(80).default("user"),
        assetIds: z.array(z.string().uuid()).max(20).default([]),
      }),
    )
    .max(500),
  limitations: z.array(z.string().max(2000)).max(30),
});
export type Analysis = z.infer<typeof analysisSchema>;
export const requestSchema = z.object({
  text: z.string().trim().min(1).max(20000),
  mode: z.enum(["auto", "edit", "redesign", "intent"]).default("auto"),
  selectedFactIds: z.array(z.string().max(80)).max(500).optional(),
  refreshFacts: z.boolean().default(false),
});
export type GenerationRequest = z.infer<typeof requestSchema>;
export const patchSchema = z.object({
  baseVersionId: z.string().uuid(),
  operations: z
    .array(
      z.object({
        selector: z.string().min(1).max(300),
        action: z.enum([
          "set_text",
          "set_attribute",
          "set_style",
          "replace_html",
          "append_html",
          "remove",
        ]),
        name: z.string().max(100).optional(),
        value: z.string().max(200000).optional(),
      }),
    )
    .min(1)
    .max(50),
});
export type PagePatch = z.infer<typeof patchSchema>;
export interface ArtifactRef {
  key: string;
  hash: string;
}
export interface GenerationState {
  intent?: ArtifactRef;
  intentPolicy?: string;
  facts?: ArtifactRef;
  factsRefreshRequest?: string;
  pending?: GenerationRequest;
  completed?: {
    requestHash: string;
    versionId: string;
    dependenciesKey: string;
    skills?: { analyst: string[]; designer: string[] };
  };
  metrics?: {
    inputTokens?: number;
    outputTokens?: number;
    skillCharacters?: number;
    skillLoads?: number;
    skillReads?: number;
    elapsedMs: number;
    modelCalls: number;
    sourceReads: number;
    artifactWrites: number;
    patchOperations: number;
    fullPageWrites: number;
    stages: {
      role: string;
      skills?: string[];
      skillCharacters?: number;
      skillMs?: number;
      reused: boolean;
      elapsedMs: number;
      modelCalls: number;
    }[];
  };
}
