import { z } from "zod";
import { visualConstraintsSchema } from "./visual.js";

/** Explicit handoff fields; defaults retain compatibility with older saved briefs. */
export const handoffBriefSchema = z
  .object({
    goal: z.string().min(1),
    audience: z.string().default(""),
    language: z.string().default(""),
    scope: z.enum(["create", "revise"]).default("create"),
    requirements: z.array(z.string()).default([]),
    preserve: z.array(z.string()).default([]),
    assumptions: z.array(z.string()).default([]),
    acceptance: z.array(z.string()).default([]),
    visualConstraints: visualConstraintsSchema.optional(),
    mediaPolicy: z
      .enum(["relevant-images", "text-only"])
      .default("relevant-images"),
  })
  .passthrough();

/** New submissions must be explicit; compatibility defaults apply only to old data. */
export const submissionBriefSchema = z
  .object({
    goal: z.string().trim().min(1),
    audience: z.string().trim().min(1),
    language: z.string().trim().min(1),
    scope: z.enum(["create", "revise"]),
    requirements: z.array(z.string()),
    preserve: z.array(z.string()),
    assumptions: z.array(z.string()),
    acceptance: z.array(z.string()),
    visualConstraints: visualConstraintsSchema.optional(),
    mediaPolicy: z.enum(["relevant-images", "text-only"]),
  })
  .strict();
