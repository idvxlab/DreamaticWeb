import { test } from "node:test";
import assert from "node:assert/strict";
import {
  questionSchema,
  acceptAnswer,
  type Clarification,
} from "../packages/agents/src/questions.js";
const question = (
  mode: "single" | "multiple" | "text" = "single",
): Clarification => ({
  id: crypto.randomUUID(),
  title: "Content priority?",
  mode,
  options:
    mode === "text"
      ? []
      : [
          { id: "a", label: "Products" },
          { id: "b", label: "Company" },
        ],
  createdAt: new Date().toISOString(),
});
test("question answers validate selection, custom text and reject duplicate submissions", () => {
  assert.throws(() =>
    questionSchema.parse({
      title: "Answer",
      mode: "text",
      options: [{ id: "a", label: "Choice" }],
    }),
  );
  assert.throws(() =>
    questionSchema.parse({ title: "", mode: "single", options: [] }),
  );
  assert.throws(() => acceptAnswer(question(), { selected: ["a", "b"] }));
  assert.throws(() => acceptAnswer(question(), { selected: ["unknown"] }));
  assert.throws(() => acceptAnswer(question(), { text: " " }));
  const multi = question("multiple");
  assert.equal(
    acceptAnswer(multi, { selected: ["a", "b"], text: "Also contact details" }),
    "Products\nCompany\nAlso contact details",
  );
  assert.throws(() => acceptAnswer(multi, { text: "Again" }));
  assert.equal(
    acceptAnswer(question(), { text: "My own answer" }),
    "My own answer",
  );
  assert.equal(
    acceptAnswer(question("text"), { text: "All PDF content" }),
    "All PDF content",
  );
});
