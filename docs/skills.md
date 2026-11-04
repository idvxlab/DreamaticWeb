# Professional Skills integration and evaluation

Initial integration: 2026-10-21. ZJT adapters: 2026-11-04. The existing three-role workflow, canonical Markdown, fact contract, patches and result reuse remain authoritative.

## ZJT adapter addition

The library now contains 18 entries: the 10 baseline Skills below plus 8 adapters. These are derived design instructions, not unchanged upstream plugins. Each adapter retains its upstream license and `upstream.json` records archive/source hashes, local instruction hashes, implementation mappings and validation limits. Original archives remain experiment data, not runtime input.

| Entry | Scope |
| --- | --- |
| designer-awwwards | Subject-specific concept, composed frames, one signature and coherent motion driver |
| designer-frontend-design | Distinct visual identity, typography and content-led composition |
| designer-impeccable | Visitor mode, committed visual world and detailed craft |
| designer-impeccable-animate | Focal sequence, continuity, interruption and feedback |
| designer-impeccable-overdrive | Ambitious spatial/procedural effect with usable fallback |
| designer-motion-design | Emotional intent, personality, timing and layered choreography |
| designer-web-animation-design | Natural and interruptible web interaction motion |
| designer-3d-transforms | Perceptible perspective, z layers, spatial transforms and depth tokens |

The ports replace plugin launchers, framework scaffolds, unprovided library globals, automatic critic loops and readiness-only responses with guidance usable in the existing Designer task. Visual goals and native JavaScript remain; no independent review agent is introduced. Reference paths are readable Markdown under each Skill's `references/`; depth tokens are converted to Markdown without changing their values. The current host requires canvas creation from inline JavaScript and blocks external scripts, so an original GSAP/Three.js implementation is not claimed to execute unchanged.

Explicit `/skill:designer-...` selections now define the complete Designer set (up to four unique entries) and restrict the stage's catalog/reader accordingly. This prevents a test of an adapter from silently mixing in the baseline visual/interaction Skills. Requests without explicit selections retain deterministic routing. Analyst behavior is unchanged.

Selected entries and declared core references share a 24,000-character ceiling, up from 18,000; other references remain deferred, 48,000 bytes per file, with realpath/role restrictions and byte-cache reuse. Raising the ceiling changes neither the model's output limit nor the number of stages; actual provider latency and tokens still require live measurement. `scripts/check-skills.ts` checks discovery, exact selection, cold/warm preparation and actual body size without a provider call. The compatibility table later in this document describes the original 10-entry implementation, not new live visual-quality results.

Adapter creation checks (2026-11-04): type checking, all 66 tests, production build and browser UI regression pass. All 8 skill-creator validators pass; Pi discovers all 18 entries without diagnostics and can read every linked adapter reference. Twelve offline selection/preload cases (8 single entries and 4 combinations) use 2,799–9,385 body characters, with no additional warm-cache disk reads. A deterministic pipeline test confirms 3 model calls for initial generation and 1 for a patch edit with an explicit adapter combination; this does not measure live provider latency. The existing editor bundle-size advisory remains.

## First live adapter screen (2026-11-04)

One supplied enterprise PDF was tested with APICZ `qwen3.7-plus`: one full default-routing run, then one independent Designer run per adapter reusing the same brief and facts. No combination was tested. The default generation took 498.8 seconds (17.1 intent, 131.0 facts, 350.6 Designer); adapter Designer stages ranged from 238.7 to 614.7 seconds with 1–3 model requests. Optional image views explain some continuation rounds. One malformed `submit_page` argument set was rejected, then corrected in the same Agent stage; another 228.2 seconds elapsed after that rejection. This is a screening observation, not a repeated latency benchmark or proof of Skill superiority.

All nine runs eventually persisted a page, but the visual goal was not met reliably. Seven available original candidates contained static Canvas that the current policy removed; four delivered pages threw `getContext` errors. Two CSS rotor scenes had zero-size containers, and the initial mobile overflow attribution requires correction: the wide table has an internal scroll wrapper. External diagnostics preserving only Canvas restored some intended effects without a new model request; changing only a collapsed scene's width restored its geometry. These diagnostic artifacts were not counted as production passes, and the production HTML policy was not changed. All adapter entries were loaded, but no optional reference was requested in this fixture. Cached body preparation measured 0–1 ms; discovery and signature work are outside that field, so this is not the complete Skill overhead. The body ceiling was not reached in these runs.

`scripts/experiment-skills.ts` runs this opt-in protocol through the production pipeline and saves projects in the normal Workspace. An optional `RunOptions.onAgentEvent` observer collects public Pi events; no review stage is added. Regression coverage preserves a missing-HTML rejection, an invalid fact-ID rejection and eventual recovery. Type checking, all 67 tests and the production build pass. Live artifacts and user materials stay in ignored Workspace storage. A recorder bug encountered while saving invalid tool arguments was corrected; that condition retains complete production metrics/final page and its prior failure trace, but its final successful raw event/candidate is unavailable. The interrupted earlier `qwen3.5-plus` screen is separate and is not pooled with these results.

All nine CLI projects were visible in the frontend. Two source-application/save/reopen cycles retained body text, heading styles, images and inline script code; external browser renders of saved and exported pages introduced no new script errors. Those cycles also exposed duplicated document metadata: stored title counts grew from 1 to 3 to 5, with 6 in the reopened preview. The Canvas compatibility gap is tracked in [#24](https://github.com/idvxlab/DreamaticWeb/issues/24); metadata accumulation in [#25](https://github.com/idvxlab/DreamaticWeb/issues/25). The subsequent Canvas and metadata repairs are included in this PR; original experiment artifacts retain their original state.

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
- Discovery uses Pi's YAML/metadata parser. The native discovery implementation reads entry files to obtain metadata; it is not claimed to perform zero body I/O. Only selected bodies enter model context. Declared core references are preloaded only for selected Skills; other reference bodies are deferred.
- Analyst gets its extraction Skill. Without explicit selections, new designs get one type (or generic architecture), visual design, and additional complementary architecture/interaction only when warranted; maximum four. Basic navigation alone no longer adds interaction expertise. Text-only edits get none, color edits visual only; type semantics are loaded only for relevant data/product edits. Explicit Designer selections use exactly the requested set.
- Selected instructions are preloaded through native `read` before the existing call, with a notice not to reread. Metadata is formatted using Pi's native formatter. Roles can use the same scoped reader for genuinely needed references.
- Reader operations allow only current-role Skill entry/reference Markdown under real project paths, maximum 48 KB/file. Original materials, cross-role files, scripts and escaped symlinks are denied. No new write/shell tool.
- Combined selected entries and core references are bounded to 24,000 characters. Cached bytes avoid warm rereads; stat fingerprints invalidate only dependent results. Optional reference signatures use stat metadata without loading their bodies.
- `runtime.ts`: selected Skill signatures join existing stage dependencies, Skill events/metrics use existing events, token usage comes from existing assistant responses. No new planning/review call.
- `index.ts`: initialization and real `/api/skills` and `/api/skills/diagnostics` endpoints. Shared metrics/completed-plan fields are optional, preserving existing clients.

The runtime remains Orchestrator → Analyst → Designer. Core methods are declared in a portable `## Required references` Markdown section. Pi native reads preload just those references alongside the selected entry, with the same role/realpath/budget boundaries. `metrics.stages[].skillReferences` and Skill events name the loaded files; a zero `skillReads` counts no model-initiated reads, not missing core guidance. Remaining references requested by a model can require tool continuation, just like existing optional tools; this is optional and is not a default extra stage. Output remains one HTML document under current host policy. Skills do not claim to add a multi-page router, executable filtering or checkout backend.

## Original compatibility checks (2026-10-21)

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

## Refinement after the first live screen

The original enterprise fixture sent about 11,918 fact characters, 17,913 catalog characters and 14,426 program-generated media-association characters to Designer. Facts and the catalog were already in v0.2.2; the last appendix was added by A3. Designer now stops repeating that appendix; new ingestion no longer generates the heuristic association section. All source assets and large-image previews remain available on demand. Existing canonical documents, fact artifacts and original media are not rewritten.

Each adapter declares one or two core references, loaded before the same Designer call using native Pi reads. Optional files stay deferred. The size/ownership/cache limits remain, and no review role or mandatory model continuation is introduced. Scene instructions now require definite responsive dimensions; factual figures retain their product/case/conditions in the existing Designer turn. Visual improvement and latency still require the targeted live samples; a prompt change alone is not a passing visual result.

Targeted post-fix screen (same source/intent/facts, qwen3.7-plus, once per condition): 3D completed in 305.5s, one call, 22,255 input / 18,929 output Tokens; previous 273.6s, one call, 32,078 / 16,929. Awwwards completed in 259.5s, one call, 22,307 / 16,041; previous 382.2s, three calls including six image views. Both new submissions succeeded without rejected tools. Required references are named in the stage metrics. These combined release changes and single samples do not isolate a latency cause or establish visual superiority.

Both pages pass browser checks at 1440px and 390px with images loaded, no horizontal page overflow or exceptions, and working touch menus. Two actual source/apply/save/reopen cycles and export preserve content/resources/scripts, Canvas and a single head title. The new 3D stage has positive desktop/mobile dimensions and keeps the case-specific 87% figure in case one. Its reduced-motion behavior still needs visual refinement; no blanket animation policy was added. Both designs remain conventional rather than meeting the requested premium visual target, so no unmeasured aesthetic rewrite or extra review/retry loop was added. New ingestion retains all 78 original image byte hashes and typed table values while removing only the generated association appendix (49,749 → 35,308 Markdown characters). Type checking, 71 tests, production build, UI regression and all eight Skill validators pass.
