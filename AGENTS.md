# Dreamatic · Web development rules

Performance first: reuse canonical Markdown, intent briefs, facts and page components. Do not add blanket review passes, source tracing or repeated model calls.

- `apps/web`: React workspace and GrapesJS canvas. Preserve the existing warm gray, dark ink, orange and lime design. Add required functionality using existing components and styles.
- `apps/server`: API, ingestion, public website fetching, storage, HTML policy and generation.
- `apps/server/src/generation`: exactly three roles through public Pi Agent/provider/tool contracts. Never copy Pi runtime internals. Verify the latest stable Pi version before changing dependencies.
- `config/agents`: separate runtime-loaded Markdown role definitions. No duplicate role instructions in business code.
- `packages/shared`: shared interface and configuration types.
- `workspace`: ignored runtime data; never commit user material or credentials. Never read credentials from the adjacent Dreamatic project.

First generation: Orchestrator → Analyst → Designer. Editing: reuse valid upstream results and prefer selector-based patches; full replacement requires explicit redesign. Canonical source Markdown is the sole agent source for imported information. Persist intent/facts separately under each project's results directory. Validate structure, ownership and file integrity; do not introduce independent per-fact verification.

Use Pi's terminal tool results to end a stage without a follow-up confirmation request. Demo mode must explicitly identify itself and never silently call a model. Run type checking, relevant tests and a production build after meaningful changes.
