import { z } from "zod";
export const questionSchema = z
  .object({
    title: z.string().trim().min(1).max(2000),
    mode: z.enum(["single", "multiple", "text"]).default("text"),
    options: z
      .array(
        z.object({
          id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
          label: z.string().trim().min(1).max(300),
        }),
      )
      .max(12)
      .default([]),
  })
  .superRefine((q, ctx) => {
    if (q.mode !== "text" && q.options.length < 2)
      ctx.addIssue({
        code: "custom",
        message: "Choice questions require at least two options",
      });
    if (new Set(q.options.map((o) => o.id)).size !== q.options.length)
      ctx.addIssue({ code: "custom", message: "Option IDs must be unique" });
  });
export type QuestionInput = z.infer<typeof questionSchema>;
export interface Clarification extends QuestionInput {
  id: string;
  createdAt: string;
  answeredAt?: string;
  answer?: { selected: string[]; text: string };
}
export class ClarificationRequested extends Error {
  constructor(public question: QuestionInput) {
    super("Clarification requested");
  }
}
export const answerSchema = z.object({
  selected: z.array(z.string()).max(12).default([]),
  text: z.string().trim().max(20000).default(""),
});
export function acceptAnswer(question: Clarification, value: unknown) {
  const answer = answerSchema.parse(value);
  if (question.answeredAt) throw new Error("此问题已经回答，请等待任务继续");
  if (
    new Set(answer.selected).size !== answer.selected.length ||
    answer.selected.some((id) => !question.options.some((o) => o.id === id))
  )
    throw new Error("请选择有效选项");
  if (question.mode === "single" && answer.selected.length > 1)
    throw new Error("此问题只能单选");
  if (question.mode === "text" && answer.selected.length)
    throw new Error("请填写文字答案");
  if (!answer.selected.length && !answer.text)
    throw new Error("请选择选项或填写自己的答案");
  question.answer = answer;
  question.answeredAt = new Date().toISOString();
  return [
    ...question.options
      .filter((o) => answer.selected.includes(o.id))
      .map((o) => o.label),
    answer.text,
  ]
    .filter(Boolean)
    .join("\n");
}
