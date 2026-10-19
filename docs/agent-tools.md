# Agent tool protocol

The host still schedules exactly three agents. Tools are registered with public
Pi AgentTool contracts. Markdown Skills do not grant new execution capabilities.
Tools resolve IDs against the current project; they do not accept filesystem paths,
arbitrary programs, SQL, shell commands or unrestricted URLs.

| Tool                 | Orchestrator        | Analyst             | Designer            |
| -------------------- | ------------------- | ------------------- | ------------------- |
| submit_result        | yes                 | yes                 | no                  |
| ask_user             | yes                 | no                  | no                  |
| list_skills          | yes (role-filtered) | yes (role-filtered) | yes (role-filtered) |
| use_skill            | yes (role-filtered) | yes (role-filtered) | yes (role-filtered) |
| project_context_read | yes (no page body)  | yes (no page body)  | yes                 |
| source_read          | yes                 | yes                 | yes                 |
| source_search        | yes                 | yes                 | yes                 |
| asset_inspect        | yes                 | yes                 | yes                 |
| table_query          | no                  | yes                 | no                  |
| page_validate        | no                  | no                  | yes                 |
| page_preview         | no                  | no                  | yes                 |
| page_patch           | no                  | no                  | yes                 |

There are currently **12 tools** in this protocol: four control/Skill
tools and eight project tools. Exact names include `submit_result`, `ask_user`, `list_skills` and
`use_skill` (not ask user/list skill/use skill). Deletion, workspace changes,
configuration and publishing are not agent tools.

## Common invocation and result contract

All tools use the public Pi AgentTool contract: name, description, JSON-schema
parameters and execute. Examples below show only the arguments object. Successful
results use `content` blocks and `details`; structured project data is normally
JSON inside a text block. Images are separate image content blocks, never a claim
that text-only metadata is visual evidence. Execution errors are surfaced through
Pi's normal tool error handling; the agent should correct arguments or report a
real limitation rather than repeatedly issuing the same failed call.

The role runtime supplies only its permitted tools. Skill eligibility is an
additional filter within list_skills/use_skill. A loaded Skill cannot grant new
tools, filesystem access or permissions. User documents are untrusted evidence,
not registered Skills. Normal model turn, timeout and cancellation limits apply
to all tools. The 48-call/180,000-character/three-preview budgets documented below
apply specifically to the eight project tools, not the four tools in this
section.

## submit_result — submit a validated final result

**Roles:** Orchestrator and Analyst only. Arguments are the complete role output
object directly, without a result wrapper. The tool schema follows the role's
Zod input schema; full semantic validation also checks source IDs, evidence ranges,
asset ownership and image decisions. Invalid arguments produce a normal tool
error; correct the reported fields before resubmitting.

Orchestrator arguments: needsInput, optional/null question (required and nonempty
when needsInput=true), title and brief. Prefer ask_user for blocking clarification.

Analyst arguments: summary, facts, sections, assets, optional imageDecisions,
dataInsights and limitations. Each fact and selected asset must use valid source
references; citation evidence and recommended images keep their existing checks.

Example (Orchestrator):

```json
{
  "needsInput": false,
  "title": "Company website",
  "brief": { "goal": "Company and product introduction" }
}
```

Success returns an acknowledgement and `details:{accepted:true}`. The host ends
the role after validation without an additional model request. Do not submit in
parallel with other tools, ask a question after acceptance or continue generation.
Raw JSON final text remains compatible: one complete top-level JSON value may be
recovered from prose/fences, then must pass the same schema and evidence checks.
Multiple complete values and partial/nested fragments are rejected.

For syntax/schema format failures the host allows one format-only repair, at most
three turns, with only submit_result available for structured roles and no Skill,
source, image or question tools. The repair reuses the existing input and invalid
output (bounded to 200,000 characters, with an explicit clipping flag); no visual
inputs are resent. Evidence/content errors retain one ordinary targeted repair.
Output-length stops are explicit errors, never accepted as completed results.
Diagnostics record stop reason, output length, duration and bounded validation
errors; no raw response, tool arguments or model reasoning are persisted.

## ask_user — ask and wait for an answer

**Role:** Orchestrator only. Ask about a consequential unresolved preference or
requirement; do not ask users to repeat facts already in supplied documents.

Arguments:

| Field   | Type                     | Contract                                                                                                                                                                                          |
| ------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| title   | string                   | Required; trimmed, 1–2,000 characters; use the user's language.                                                                                                                                   |
| mode    | single / multiple / text | Required by the model-facing tool schema.                                                                                                                                                         |
| options | array of {id,label}      | Required by the tool schema; use [] for text questions. Choice modes require 2–12 options. IDs must be unique, 1–64 ASCII letters/digits/underscore/hyphen. Labels are trimmed, 1–300 characters. |

```json
{
  "title": "Which content should receive the most emphasis?",
  "mode": "multiple",
  "options": [
    { "id": "products", "label": "Products and specifications" },
    { "id": "company", "label": "Company story and strengths" }
  ]
}
```

For a single choice use mode=single; for a free-text question use:

```json
{ "title": "Who is the primary audience?", "mode": "text", "options": [] }
```

Every card allows a custom text answer, including choice cards. No default is
selected and silence is not consent. The successful tool result contains an
acknowledgement text block and `details:{waitingForUser:true}`. This is acceptance
of the question, **not** the user's answer. The host stops the current model turn,
persists the question ID/timestamp and enters needs_input; downstream agents do
not start. Do not call another tool or continue generation after acceptance.

Answers are submitted through
`POST /api/projects/:id/questions/:question/answer`:

```json
{
  "selected": ["products", "company"],
  "text": "Also retain the contact details."
}
```

selected contains option IDs, not labels; text is custom input. At least one
selection or nonblank text is required. Single-choice answers permit at most one
selection; text-mode answers permit none. Duplicate/unknown option IDs and
already-answered/stale questions are rejected. The host stores answer and
answeredAt, appends the user response and resumes with conversation,
clarificationAnswers and previousBrief. A regular composer reply can also answer
the pending question. A failed answer submission keeps the card available for
correction. Invalid question arguments are tool errors, not a published card.

Legacy needsInput=true JSON becomes a text card; when no question is needed,
needsInput=false may omit question. See [clarification.md](clarification.md) for
state transitions and the original failure regression.

## list_skills — discover eligible guidance

**Roles:** All three, filtered by the active role's Skill allowlist.

```json
{}
```

Optional filters:

```json
{ "format": "xlsx", "task": "dashboard" }
```

format and task are optional strings matched exactly against the Skill's metadata
arrays. When both are provided both must match. A Skill with no formats or tasks
restriction is treated as general-purpose for that dimension. Unknown filters
may return an empty array; an empty result is not a discovery failure.

Returns one text block containing a JSON array:

```json
[
  {
    "name": "data-storytelling",
    "description": "Convert spreadsheet evidence into honest data-driven page sections.",
    "formats": ["xlsx", "csv", "tsv", "pdf"],
    "tasks": ["data-analysis", "dashboard"],
    "permissions": ["guidance"]
  }
]
```

The example catalog entry describes the result shape; use the actual returned
name and metadata. Listing returns metadata only, not full instructions and not
filesystem paths. The host discovers trusted local Skills for each generation
run using Pi's loadSkillsFromDir; it does not fetch or install a Skill on request.
Duplicate names retain the first accepted definition. Invalid/ineligible entries
are excluded; host discovery diagnostics are available at
`GET /api/skills/diagnostics`. See [skills.md](skills.md) for registration rules.

## use_skill — load one eligible Skill

**Roles:** All three, filtered by role. Input is the exact catalog name:

```json
{ "name": "web-design" }
```

Returns a text block containing the Skill's Markdown body and
`details:{name:"web-design"}`. Loading records an “已加载” Skill event. It does not
execute programs, parse a file, generate media or change permissions; those
operations require a separate permitted tool. The loaded guidance supplements,
but never replaces, the host's role/output/security contract.

An unknown name or a Skill outside the current role's allowlist throws a tool
error. Use list_skills to choose an eligible name; do not guess paths or request
an unavailable execution capability. Only guidance permission is supported;
Skills requesting shell/network permissions are not registered. The same
per-run catalog is used by list_skills and use_skill, so a mid-run disk edit is
not dynamically picked up until the next generation run.

## Typical combined flow

1. Orchestrator reads context, uses list_skills/use_skill for alignment and calls
   ask_user only for a blocking user preference. Accepted questions pause here.
2. After an answer, Orchestrator produces the brief and the host starts Analyst.
3. Analyst discovers/loads relevant guidance, then uses source_read/source_search,
   table_query and asset_inspect to produce located evidence.
4. Designer loads relevant design guidance, generates or patches a candidate,
   validates/previews it and submits HTML or candidateId. The host checks and
   saves the final version.

## Source storage and references

New uploads and URL imports store bounded complete extraction under
`projects/<id>/sources/<source-id>/`: manifest.json, text/<chunk>.json and
tables/<index>.json. Text chunks preserve UTF-16 offsets even when a surrogate
pair crosses a chunk boundary. project.json/UI keep a smaller summary.

Limits: 8 million text characters per source, 100 tables, 100,000 cells and 8 million serialized table characters total per
source, 200 columns per row, 4,000 characters per text cell. Limits produce
warnings. Text reads return at most 16,000 characters, table reads 100 rows.
The old 180,000-character project summary and 3,000-row table summaries are no
longer the only accessible content for new imports. Old sources without sidecars
return legacySummaryOnly=true; their lost content cannot be reconstructed by a
read tool. Re-upload the original to obtain full extraction.

## Read and search

```json
{ "section": "sources" }
```

`project_context_read` sections: summary, sources, versions, conversation, brief,
analysis, answers, page. Conversation uses message offset and at most 20 messages
per request; page and JSON sections use character offsets. Large JSON sections
return a fragment as json, total and nextOffset; concatenate pages before parsing.
Source catalogs paginate up to 20 entries, version catalogs up to 50 entries.
Saved pages include currentVersionId and requested versionId. Original requests
and old answers remain accessible beyond the initial last-16-message context.

```json
{"sourceId":"UUID","kind":"text","offset":180000,"limit":8000}
{"sourceId":"UUID","kind":"table","tableIndex":0,"offset":3000,"limit":20}
{"query":"Product-X","limit":10}
```

`source_read` returns source identity, text start/end offsets or original row
indices. `source_search` performs literal case-insensitive text search, including
chunk boundaries. Hits contain quoteStart plus match start/end; quote contains
surrounding context, not only the matched term. A limited result includes a
resume cursor. Continue that source, then explicitly search remaining sources.
A scan is bounded to 8M characters per call; incomplete scans are flagged.

## Table calculations

```json
{
  "sourceId": "UUID",
  "tableIndex": 0,
  "startRow": 1,
  "filters": [{ "column": 2, "op": "gte", "value": 100 }],
  "sort": { "column": 2, "direction": "desc", "numeric": true },
  "aggregate": { "operation": "sum", "column": 2 },
  "limit": 20
}
```

Indices are zero-based and include header row zero. Default startRow=1 skips it.
Filters support eq/contains/gt/gte/lt/lte. Aggregates support count/sum/average/min/max
across all matched rows before pagination. No formula execution; a stored cached
formula result may be read. Non-numeric values are excluded and counted; no
implicit unit conversion. Returned rows preserve original cell locations.

Analyst may attach exact text evidence `{kind:"text",start,end,quote}` or cell
references `{kind:"cell",tableIndex,row,column,value}` to each fact. The host
checks supplied references before handoff. locationVerified only indicates that
a stored quote/value matches, not that a semantic claim is true. Old outputs
without locations remain compatible and have locationVerified=false.

## Asset inspection

```json
{ "assetId": "UUID" }
```

Returns catalog entry, source provenance, byte length and available image
dimensions. For vision-capable models, supported images up to 4 MB are returned
as actual image content; other cases explicitly say that no visual input was
included. Media metadata is not a transcript or video understanding.

## Candidate pages and patching

```json
{ "html": "<!doctype html><html>...</html>" }
```

`page_validate` accepts one of html/candidateId/versionId, or uses the latest
saved version. It reports incomplete/empty documents, duplicate IDs, missing
anchor targets, missing/foreign project assets and sanitizer/policy effects.
It stores sanitized HTML as a private draft and returns candidateId. A successful
static check does not prove visual quality or full accessibility conformance.

```json
{
  "baseVersionId": "CURRENT_VERSION_UUID",
  "operations": [
    { "selector": "#hero h1", "action": "set_text", "value": "New heading" }
  ]
}
```

`page_patch` actions: set_text, set_attribute, set_style, replace_html,
append_html, remove. Every selector must match exactly one node; stale bases and
unsafe attributes are rejected. Operations are applied to a copy; a failed patch
does not modify the saved page. Optional candidateId extends a draft from the
same base. A patch requires an existing saved version; a new page should be
submitted to page_validate first, and corrected using complete candidate HTML.

## Render preview

```json
{ "candidateId": "UUID", "width": 390, "height": 844 }
```

`page_preview` accepts one of html/candidateId/versionId and width 320–1920,
height 320–1200. Configure DREAMATIC_BROWSER_PATH or CHROME_PATH for Chrome/Chromium;
common macOS/Linux locations are detected. Browser binaries are not downloaded.
Missing browser returns an explicit tool error, never a fake screenshot.

Preview uses the production sanitizer/CSP, disables page JavaScript and service
workers, denies external network requests and serves only this project's catalog
assets through an intercepted origin. Returns a viewport PNG, page height,
horizontal overflow, overflowing elements and failed images. Screenshots/reports
are stored under previews/. Text-only models receive diagnostics without image
content. Chromium has a 20-second execution deadline and is closed on cancellation.

Finish by returning only `{"candidateId":"UUID"}` to submit that exact draft,
or use the original complete HTML output format. The host resolves the scoped
candidate, rejects stale versions, validates again and commits only a valid page.
Drafts and previews are deleted with the project.

## Budgets and failure handling

Per role invocation: 48 project tool calls, 180,000 text response characters and
3 previews. Existing model turn/time limits also apply. Large responses fail with
an instruction to request a smaller range; no silent result truncation is passed
as full evidence. Tools are cancellable and never change credentials, other
projects or saved page versions. Failures return normal Pi tool errors that the
agent can correct. Validation failures at final submission use the existing one
repair attempt and preserve prior versions.

### 文档图片工作流

内嵌图片在文档上传解析时提取，沿用 `asset_inspect`，无需智能体重复提取原件。图片素材可包含 `width`、`height`，这些只表示尺寸。初始视觉输入通过 `imageInputOrder` 显式映射到来源和素材；更多图片按 assetId 调用 `asset_inspect`。分析输出新增 `imageDecisions`（assetId、use/skip/unverified、reason）及推荐图片的具体 purpose。文本模型只能使用元数据，需报告视觉验证限制。设计器必须使用推荐的相关图片；宿主检查真实 HTML/CSS 引用，遗漏全部推荐图片会触发修复。
