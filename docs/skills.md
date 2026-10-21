# Professional Skills integration and evaluation

Implemented 2026-10-21. Frontend application code and design are unchanged. The existing three-role workflow, canonical Markdown, fact contract, patches and result reuse remain authoritative.

## Library and responsibilities

Canonical source: `.agents/skills/`. `.claude/skills` is a relative symlink to that source, not a second maintained copy.

```text
.agents/skills/
├── analyst-information-extraction/
│   ├── SKILL.md
│   └── references/tables-and-coverage.md
├── designer-web-architecture/SKILL.md
├── designer-visual-design/SKILL.md
├── designer-interaction-design/SKILL.md
├── designer-landing-page/SKILL.md
├── designer-saas-website/SKILL.md
├── designer-ecommerce/SKILL.md
├── designer-dashboard/SKILL.md
├── designer-portfolio/SKILL.md
└── designer-editorial/SKILL.md
```

| Skill                          | Responsibility and use                                                                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| analyst-information-extraction | Atomic useful facts; preserve numbers, qualifiers, table relationships, claims versus evidence, ordered steps and explicit media relationships. Load for extraction; table reference only when necessary. |
| designer-web-architecture      | Content hierarchy, navigation and component responsibilities; single versus multiple pages within actual host capabilities. Use for generic sites, complex structure and restructuring.                   |
| designer-visual-design         | Content-led composition, tokens, type hierarchy, media, responsive reflow and compact implementation. Initial designs and visual edits.                                                                   |
| designer-interaction-design    | Implement real accessible controls and honest state transitions. Explicit interaction requirements and control edits.                                                                                     |
| designer-landing-page          | Audience, proposition, evidence and meaningful conversion path for marketing pages.                                                                                                                       |
| designer-saas-website          | Product capabilities, use cases, plan distinctions and coherent product navigation.                                                                                                                       |
| designer-ecommerce             | Product media, price, specifications, variants and purchase capability boundaries.                                                                                                                        |
| designer-dashboard             | Exact values/units, zero-baseline charts, missing values and readable comparison tables.                                                                                                                  |
| designer-portfolio             | Project narrative, process, outcome and work-led media composition.                                                                                                                                       |
| designer-editorial             | Long-form reading, indexes, sections, captions and substantive article structure.                                                                                                                         |

Each entry has only portable `name` and `description` frontmatter and harness-independent Markdown. Host-specific output tool instructions stay in `config/agents/`. New role-prefixed Skill directories are discovered without a registry edit; `/skill:designer-custom` explicitly selects a custom Skill. Automatic category selection is deliberately deterministic and can be extended in `skills.ts`.

## Native Pi integration

Verified installed Pi 1.3.0 exports and upstream sources before implementation. `pi-agent-core` provides agents, not Skill discovery. Added the same-version `@earendil-works/pi-coding-agent` dependency solely for its public `loadSkillsFromDir`, `formatSkillsForPrompt`, and `createReadTool` exports. No runtime internals copied; no CLI, shell or additional agents activated.

- `apps/server/src/generation/skills.ts`: native discovery, diagnostics, deterministic selection, cached scoped native reads and signatures. Startup discovers the project library; filesystem changes invalidate discovery.
- Discovery uses Pi's YAML/metadata parser. The native discovery implementation reads entry files to obtain metadata; it is not claimed to perform zero body I/O. Only selected bodies enter model context. Reference bodies are deferred.
- Analyst gets its extraction Skill. New designs get one type (or generic architecture), visual design, and additional complementary architecture/interaction only when warranted; maximum four. Basic navigation alone no longer adds interaction expertise. Text-only edits get none, color edits visual only; type semantics are loaded only for relevant data/product edits.
- Selected instructions are preloaded through native `read` before the existing call, with a notice not to reread. Metadata is formatted using Pi's native formatter. Roles can use the same scoped reader for genuinely needed references.
- Reader operations allow only current-role Skill entry/reference Markdown under real project paths, maximum 48 KB/file. Original materials, cross-role files, scripts and escaped symlinks are denied. No new write/shell tool.
- Combined selected bodies are bounded to 18,000 characters. Cached bytes avoid warm rereads; stat fingerprints invalidate only dependent results. Reference signatures use stat metadata without loading their bodies.
- `runtime.ts`: selected Skill signatures join existing stage dependencies, Skill events/metrics use existing events, token usage comes from existing assistant responses. No new planning/review call.
- `index.ts`: initialization and real `/api/skills` and `/api/skills/diagnostics` endpoints. Shared metrics/completed-plan fields are optional, preserving existing clients.

The runtime remains Orchestrator → Analyst → Designer. References requested by a model can require tool continuation, just like existing optional tools; this is optional and is not a default extra stage. Output remains one HTML document under current host policy. Skills do not claim to add a multi-page router, executable filtering or checkout backend.

## Compatibility actually checked

| Environment                 | Evidence                                                                                                                                                                    | Limit                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Pi 1.3.0                    | Published loader discovers all 10 with zero diagnostics; native reader/preload/reference/cache/security tests pass.                                                         | No copied private implementation.                                                                     |
| Codex installed on this Mac | Real `codex app-server` JSON-RPC `skills/list` for this project discovers all 10, zero errors. Standard schema/resource tests and all 10 skill-creator validators pass.     | Discovery verified; no additional paid model session per Skill.                                       |
| Claude Code                 | `.claude/skills` resolves to the canonical library; all entries and referenced resources are identical and readable through that path. Portable fields/content checks pass. | Claude CLI is absent. Actual Claude-client discovery/execution is **unverified**, not a claimed pass. |

Primary specifications checked: [Pi 1.3.0 Skills](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/docs/skills.md), [Pi public implementation](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/src/core/skills.ts), [Agent Skills specification](https://agentskills.io/specification), [Codex Skills](https://developers.openai.com/codex/skills/), [Claude Code Skills](https://code.claude.com/docs/en/skills).

## Regression evidence

Type checking, all **45 tests**, production build and existing browser UI regression passed. Existing optional Python document engine was unavailable; existing fallback test passed. Vite retains the pre-existing large editor chunk advisory.

| Request                      | Existing baseline model calls | With Skills |
| ---------------------------- | ----------------------------: | ----------: |
| Initial generation           |                             3 |           3 |
| Local edit                   |                             1 |           1 |
| Exact duplicate              |                             0 |           0 |
| Add source                   |                             2 |           2 |
| Redesign reusing brief/facts |                             1 |           1 |

Tests use real Pi Agents with deterministic model streams. They also verify original Markdown/page mtimes unchanged for local patch edits, no extra parse/full-page write, warm body-cache reuse, selected Skill/reference invalidation, unrelated Skill edits preserving reuse, six site-category routes and narrow edit routing. These establish workflow regression, not live provider latency or subjective design quality.

## Exploratory live quality comparison

Reproduce explicitly with `node --import tsx scripts/evaluate-skills.ts --live`. Optional `--role analyst|designer`, `--condition baseline|skills`, `--output PATH`. This opt-in offline evaluator never runs in production. It uses synthetic source Markdown only, the current project's saved provider configuration, one call per condition, no provider retries or model review, 8,000 output Token setting and 120-second cap. This constrained output cap is lower than production's Designer allowance. Actual outputs and every failed attempt are retained in `docs/skill-evaluation/`; raw provider usage is reported without correction.

| Successful sample                | Calls | Seconds | Provider input / output Tokens | Selected body characters |
| -------------------------------- | ----: | ------: | -----------------------------: | -----------------------: |
| Analyst baseline, manual retry   |     1 |  20.857 |                   27,689 / 805 |                        0 |
| Analyst Skills                   |     1 |  82.252 |                    1,121 / 826 |                    2,619 |
| Designer baseline                |     1 | 109.248 |                  4,770 / 5,960 |                        0 |
| Designer Skills, refined routing |     1 |  36.802 |                  3,807 / 6,571 |                    3,877 |

Failures are not quality scores: initial Analyst baseline failed with provider `server_error: service busy` (2.384s). Initial Designer Skills loaded three entries (5,393 characters), reported 8,521 output Tokens and returned no final tool submission (41.835s). That first attempt did not capture stop reason, so exact truncation cause cannot be proven. We removed basic navigation as an interaction-Skill trigger and added a compact-implementation rule, then explicitly reran once with the same fixture/cap. The refined two-Skill attempt completed with `toolUse`. No automatic retry was added to production.

Analyst: both successful outputs cover all 12 reference predicates, preserve conditional numbers/table values, have zero exact duplicate facts and one correct media association. Baseline has 13 facts, Skills 12. Manual inspection found the baseline included website intent as a source fact and merged separately purchased batteries into battery-life information; Skills omits that unrelated intent, separates the purchase condition and attaches the video directly to deployment steps. This supports a narrow granularity/relevance improvement, **not higher measured coverage** or a general accuracy claim.

Designer: both actual pages preserve the annual values, USD units, comparison table, zero-baseline charts, synthetic label, working anchors and native disclosure, with no scripts or placeholder links. Browser checks at 1440px and 390px pass no page-level horizontal overflow and native disclosure clicks with JavaScript disabled and all network requests blocked. Visual inspection shows Skills uses a deliberate serif/ink/teal editorial hierarchy with annual comparison, regional composition and scope sections; baseline uses a competent sidebar dashboard and gives regional values in its exact table. Both are usable, different designs. Section counts (4 versus 9) are **not** quality scores; superiority is not established by counting sections. Review both HTML artifacts directly.

**Limits and unresolved acceptance evidence:** this is one dense extraction fixture and one dashboard fixture, not a representative multi-type/document corpus or a controlled latency benchmark. Analyst latency increased in the successful sample, Designer latency fell, output Tokens grew slightly, and gateway input counts vary unusually. Therefore these runs do not establish unchanged end-to-end latency or broad quality improvement. More repeated paired production-provider samples across site types/long documents are needed before claiming those acceptance criteria. No extra normal model calls, parsing or full rebuilds were introduced; that narrower performance guarantee is covered by regression tests. Claude runtime verification remains pending availability of that client.
