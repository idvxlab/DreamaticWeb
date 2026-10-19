# Clarification interaction and recovery

## Incident diagnosis

The recorded PDF run successfully extracted 21,904 characters. The coordinator
asked the user which document content to include. After the user answered that
all content should be used and the agent should determine emphasis, the run
failed validation twice: the coordinator output omitted `question`, while the
host required a string even when no question remained. The run stopped before
Analyst. This was an output contract bug, not a PDF parsing failure.

The brief contract now accepts omitted/null/empty question when needsInput is
false. needsInput=true still requires a nonempty question. A regression test runs
the complete question → answer → brief-without-question → analysis → HTML flow.

## Reusable protocol

Only Orchestrator receives `ask_user` in addition to the shared Skill tools.

```json
{
  "title": "Which areas should the page emphasize?",
  "mode": "multiple",
  "options": [
    { "id": "products", "label": "Products" },
    { "id": "company", "label": "Company story" }
  ]
}
```

Modes are single/multiple/text. Choice modes require 2–12 unique IDs. The tool
validates the request, returns acknowledgement, aborts further model processing,
and the host persists a question ID and timestamp with needs_input state. This
is an intentional pause, not a failed run. Analyst and Designer do not start.
The host does not hold an HTTP request or model call open while waiting.

QuestionCard renders radio buttons, checkboxes and a custom text answer for any
mode. No option is selected by default. Refresh preserves the saved question.
Answer drafts are local until explicitly submitted. The endpoint
`POST /api/projects/:id/questions/:question/answer` validates nonempty text or
valid choices, rejects stale/duplicate answers, records the answer and starts
the next run. The host provides prior brief, original conversation, source
references and structured clarificationAnswers to the coordinator. Free-text
replies through the regular composer remain compatible and answer the pending
question. Existing legacy needsInput JSON becomes a text card.

User preferences are clarification targets. Facts already present in uploaded
material belong to Analyst, not a request for the user to manually
summarize the document. Explicit delegation to choose emphasis should continue
with analysis rather than repeat the same question.

## Validation

Real Pi Agent + a local simulated endpoint verifies all three modes, deliberate
pause, lock release, structured answer continuation and the omitted-field
regression. Unit tests reject invalid selections, empty answers and duplicates.
Browser tests verify radio exclusivity, multiple checkboxes, custom text, reload,
answer persistence and generation continuation. No external paid model is used.
