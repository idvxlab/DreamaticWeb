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
to all tools. The configurable call limit and 180,000-character/three-preview budgets documented below
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

New uploads and URL imports store one canonical artifact at
`projects/<id>/sources/<source-id>/reading.md`, plus manifest.json with its
markdown-v2 format, completeness, UTF-16 length, SHA-256 and table catalog.
No plain-text summaries/chunks, raw-text.json, structure.json or independent table
JSON files are generated. Project/UI Markdown and table previews are derived display
caches; searches and validation never read them as authority.

Conversion runs locally without model inference. Maximums are 8 million Markdown
UTF-16 units, 100 tables and 100,000 cells. Limits fail conversion rather than publish
partial evidence. All typed table values round-trip through JSON cell bodies in the
Markdown table; no row is presumed to be a header. Reads return at most 16,000 units
or 100 table rows. Missing, damaged, incomplete or older sources require reimport.

## Read and search

```json
{ "section": "sources" }
```

`project_context_read` sections: summary, sources, versions, conversation, brief,
analysis, answers, page. Conversation uses message offset and at most 20 messages
per request; page and JSON sections use character offsets. Large JSON sections
return a fragment as json, total and nextOffset; concatenate pages before parsing.
Source catalogs paginate up to 20 entries, version catalogs up to 50 entries.
Designer may read unsaved drafts with section:page and candidateId, mutually exclusive
with versionId. Draft HTML uses the same character pagination and includes its
baseVersionId; an empty base means no saved page. Saved pages include currentVersionId and requested versionId. Original requests
and old answers remain accessible beyond the initial last-16-message context.

```json
{"sourceId":"UUID","kind":"text","offset":180000,"limit":8000}
{"sourceId":"UUID","kind":"table","tableIndex":0,"offset":3000,"limit":20}
{"query":"Product-X","limit":10}
```

`source_read` defaults to mandatory Markdown reading. Explicit kind:text is a compatibility alias for the same Markdown; kind:table returns original row
indices. `source_search` performs literal case-insensitive text search, including
chunk boundaries. Hits contain quoteStart plus match start/end; quote contains
surrounding context, not only the matched term. A limited result includes a
resume cursor. Continue that source, then explicitly search remaining sources.
A scan is bounded to 8M characters per call; incomplete scans are flagged.

For text citations, prefer the ready-to-submit `source_read.evidence[]` or
`source_search.hits[].evidence` objects. Each contains `{kind:"text",start,end,
quote,sourceHash}` with aligned UTF-16 offsets and exact stored text. Read excerpts
are at most 4,000 UTF-16 units each. Search evidence covers the returned context;
do not combine legacy match start/end with the wider legacy quote. Choose an
excerpt that includes the claim's subject, qualifiers, dates and units.

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

### Local citation repair

Before requesting any model repair, the host checks every fact and locally fixes
an incorrect text range only when its quotation is uniquely found in the same
complete stored source. Automatic relocation requires at least 12 non-whitespace
Unicode code points and four letters. CRLF/LF line endings are the only normalized
difference; positions are mapped back to the exact canonical Markdown. Overlapping
matches and line-ending-equivalent duplicates count as ambiguity. General space
collapsing, Unicode normalization, fuzzy/semantic matching, nearest-occurrence
selection and cross-source relocation are never used. Missing, damaged, incomplete or older Markdown blocks verification. A supplied
sourceHash must match the current canonical Markdown, even if the quotation still appears in it.

Successful repairs are strictly rechecked, passed to Designer and persisted in
analysis.facts. Host-generated analysis.evidenceRepairs stores the fact index,
source ID, method and before/after evidence. The accepted normalized result is
saved directly, so parsing a model submission again cannot discard repairs.
Location verification does not certify the claim's interpretation. No facts,
numbers or table cells are rewritten to make a citation pass.

Unresolved issues are collected in EvidenceValidationError with zero-based
factIndex, sourceId, code and reason, allowing one correction of all failing facts.
Final-output repair requests also carry the complete evidenceIssues array; the
bounded UI log is only a summary. Cell mismatches and unavailable tables require
explicit correction rather than automatic coordinate/value replacement.

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
does not modify the saved page or original draft. Supply candidateId alone to
modify an unsaved draft, including a new page with no saved version. Its base
is derived and checked against the current saved page. Supply exact baseVersionId
when patching a saved page directly; if both IDs are supplied their bases must agree.
Always use the newly returned candidateId for subsequent previews/submission.

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

The normal preview budget is three attempts per invocation, including failures.
Aim for desktop/mobile checks first and use the remaining attempt for the most
affected viewport after a fix. A changed candidate does not inherit preview coverage
from an older candidate; untested widths remain unverified. Revalidate corrected
HTML even if the preview budget is exhausted; missing coverage alone does not
require another design stage. Known failures remain subject to final validation.

Targeted repair may include candidateDraft and pageIssues when recoverable. These
are optional: without a readable candidate, recover corrected complete HTML from
invalidOutput/originalInput and the reported error, then create a new candidate.

Finish by returning only `{"candidateId":"UUID"}` to submit that exact draft,
or use the original complete HTML output format. The host resolves the scoped
candidate, rejects stale versions, validates again and commits only a valid page.
Drafts and previews are deleted with the project.

## Budgets and failure handling

Per role invocation: 180,000 text response characters and 3 previews. Project
tool calls, normal model turns and total stage duration are unlimited by default.
Set DREAMATIC_AGENT_MAX_TOOL_CALLS, DREAMATIC_AGENT_MAX_TURNS or
DREAMATIC_AGENT_TIMEOUT_MS to a positive integer to enable the corresponding
limit (0 disables it). Role-specific total deadlines override the shared deadline.
First-response, idle-output and individual-tool deadlines remain active; format-only
repair is limited to 3 model turns. Large responses fail with
an instruction to request a smaller range; no silent result truncation is passed
as full evidence. Tools are cancellable and never change credentials, other
projects or saved page versions. Failures return normal Pi tool errors that the
agent can correct. Validation failures at final submission use the existing one
repair attempt and preserve prior versions.

### 文档图片工作流

内嵌图片在文档上传解析时提取，沿用 `asset_inspect`，无需智能体重复提取原件。图片素材可包含 `width`、`height`，这些只表示尺寸。初始视觉输入通过 `imageInputOrder` 显式映射到来源和素材；更多图片按 assetId 调用 `asset_inspect`。分析输出新增 `imageDecisions`（assetId、use/skip/unverified、reason）及推荐图片的具体 purpose。文本模型只能使用元数据，需报告视觉验证限制。设计器必须使用推荐的相关图片；宿主检查真实 HTML/CSS 引用，遗漏全部推荐图片会触发修复。

## Three-role handoff

The host owns scheduling, persistence and completion reporting. Orchestrator submits
an explicit brief: goal, audience, language, scope (create/revise), requirements,
preserve, assumptions, acceptance and mediaPolicy (relevant-images/text-only).
Older briefs are normalized with compatibility defaults; new prompts populate all
fields. Role-file metadata does not grant spawning or tools.

Analyst receives the brief, recent conversation, confirmed answers, existing page
and bounded canonical Markdown with explicit coverage. Initial table catalogs
contain row counts, not cell arrays. Read cells through source_read(kind:"table")
or table_query; both preserve types from the Markdown. Evidence gaps remain in
analysis.limitations, which the host exposes in its evidence panel.

For text-only briefs, the host removes image recommendations and records explicit
skip decisions before handoff, then rejects generated source-image use. This
prevents Analyst recommendations from forcing Designer to violate the brief.
For relevant-images briefs, the existing recommended-image requirement remains.

Role prompts define outputs and workflow; Skills provide methods. Clarification
uses ask_user preferentially, structured roles submit through submit_result, and
Designer prefers a validated candidateId. Format-only repair does not repeat the
ordinary research workflow. Parameter/evidence failures require changed arguments
or evidence rather than identical repeated calls. Operational limitations belong
in host logs, not in public page copy.

## Unified validation and durable recovery

New Orchestrator submissions use a strict brief schema; compatibility defaults are
reserved for existing records. Role names/tool sets live in roles.ts. The host
checks each normal invocation against role Markdown metadata, and Skills cannot
expand that set. Stable instructions live in prompts rather than repeated input
strings. Serialized envelopes are bounded (including marker/metadata overhead),
with explicit coverage notices and source/history tools for omitted material.

Source reads support compact:true to return exact Markdown evidence without a
duplicate body. Search compact mode omits legacy context duplicates. Every read
validates the canonical document's current SHA-256 and length; citation validation
uses that same document. No original-text or table sidecar is consulted.
Designer receives only initially available images recommended for its page, and
receives none in text-only mode. Analyst can inspect source images for evidence.

validatePage is shared by page_validate, final generation, manual-save diagnostics
and browser opening. It includes project media policy (including embedded data
images for text-only) and known preview failures for the exact sanitized HTML.
Sanitization is idempotent. Preview records bind viewport, contrast, missing-image
and overflow diagnostics to an HTML digest; changing HTML invalidates those records.
Checks do not certify complete accessibility. No preview is reported as
not-previewed, rather than silently treated as success. Known failures must be
repaired before generated submission/opening. Manual drafts may be saved with
issues, which are returned and shown; opening still uses the common acceptance.

POST /api/projects/:id/resume retries an interrupted task without adding a user
message. Completed validated stages are persisted before the next stage. Their
fingerprints cover user requests/answers, base version, actual canonical Markdown/
asset content, role prompts, eligible Skills and model configuration (excluding
credentials and execution limits). A changed stage invalidates downstream stages;
changed task inputs conservatively restart the workflow. Local revalidation runs
before reuse. Duplicate resumes of a running/committed task do not create another
run/version. Stop/restart preserves completed checkpoints. Historical tasks without
checkpoints are not automatically treated as resumable. There is no automatic
background retry or persistence of partial model reasoning/tool arguments.

Host image-policy normalization preserves the original recommendations in
mediaPolicyAudit. Tool failures persist only classified, bounded summaries, not
upstream messages containing complete HTML, tool arguments or secrets. Final
completion and the canvas expose saved-version preview/check status.

Project GET responses use ProjectResponse: full checkpoint results and internal
preview history remain in local storage, while browsers receive stage completion
metadata and per-version checks. This avoids resending duplicate model artifacts
on each status poll; the restore endpoint always reads the complete server record.

## Lightweight visual handoff

The existing three stages also carry optional visual guidance; no separate palette
model call is made. brief.visualConstraints contains requested/avoid/preserve
arrays from user requirements. analysis.visualEvidence contains at most eight
clues with sourceId/assetId where available, role (brand/reference), basis
(specified/observed/inferred/unverified), cues and colors. Exact color values must
come from explicit evidence rather than rough visual estimates. Older results
without these optional fields remain valid. Designer resolves the final palette
using current user constraints, brand references, then imagery/content/audience,
and preserves existing colors for local revisions unless a new direction is requested.

Designer image input is rebuilt from Analyst's final recommendations, prioritizing
identified brand references and reusing already loaded images. Each stage keeps
the eight-image, 4 MiB per-image and 12 MiB total limits. Text-only output sends no
Designer images; models without vision receive no encoded image input.
imageAvailability reports omitted references, so metadata is not mistaken for
visual inspection. Missing colors do not require another clarification or research
pass. Palette choices remain in the normal design process, with the existing
contrast checks; no explanation is added to the public page.

## Bounded runtime observations

Progress distinguishes waiting, provider processing without a business result,
response text and tool-argument generation. Per-turn elapsed/first-response times
and UTF-16 text/argument character counts are recorded; these are not token counts
or a provider-compute breakdown. Progress is throttled to 15 seconds, with at most
one immediate notification for each newly encountered response phase per turn.
Thinking deltas keep the stall watchdog alive but their content is never stored.

Completed assistant text and schema-parsed submit_result business payloads are
available under collapsed execution details, separately marked unvalidated,
accepted or rejected. Validation reasons and field paths can be expanded too.
No other raw tool arguments or tool-result bodies are captured. Each business
excerpt is limited to 8,000 UTF-16 units; retained excerpts across project events
are limited to 64,000 units, with older content evicted while metrics remain.
Configured API keys are redacted. This local diagnostic capture adds no model
request and is not sent back into agent context. It does not retroactively recover
older output or expose partial structured arguments before submission.

Facts may include optional assetIds (up to three image UUIDs from that fact's own
source). Analyst supplies only supported associations during the existing analysis;
no extra image-inspection pass is required. The facts panel displays only these
explicitly linked images. Source-level recommendations, filenames and document proximity are not
fallback associations. Legacy facts or facts without valid assetIds remain text-only. Images load lazily and expand inside the card; this metadata does not override page media
policy or require an image in the generated page.

## Canonical Markdown

Parser nodes supply paragraph/title/page/list boundaries. Table data is embedded in
reading.md with zero-based table indices and JSON cell bodies, preserving types,
whitespace and nested formula/cache objects. Source content is escaped, never run.
The generator validates structure ranges and round-trips every table value/name.

source_read(kind:"markdown",sourceId,offset,limit) is the default. It returns
Markdown and ready-to-submit evidence objects. compact:true omits the duplicate
body while retaining exact evidence. kind:"text" is a compatibility alias returning
the same Markdown, never raw extraction. All text evidence, search hits and sourceHash
refer directly to the Markdown UTF-16 coordinate space (zero-based, end exclusive).
Use kind:table for typed cells and table_query for calculations; both decode the
verified canonical Markdown, without an independent cell store.

Runtime, tools and authenticated GET /api/projects/:id/sources/:source/reading
validate format, completeness, length and SHA-256 before use. Missing, damaged,
truncated or markdown-v1 sources block execution, including checkpoint resume;
there is no fallback to legacy text or tables. Reimport the original. Previous
citation coordinates and checkpoints must not be reused across this format change.
No additional model stage or model call is introduced for conversion or validation.

Structural extraction uses one traversal for body text, lists, notes/comments and
table values/indices, including annotations on inline descendants. HTML uploads and
websites use semantic headings/paragraphs/lists/table boundaries, without appending
flattened table text again. Nested tables have their own indices. Merged HTML cells
keep the top-left value and empty covered positions, with a warning.

Verified Markdown and decoded table data share a weakly held per-source cache.
Every access checks the file path/inode/size/mtime/ctime and expected format/hash/
length/completeness. A change invalidates the cached verification and table parse;
unchanged versions reuse both. Consumers receive cloned table values so they cannot
mutate this cache. No additional model call or independent authority is introduced.
