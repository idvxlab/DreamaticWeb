# Dreamatic · Web development rules

Pi is an upstream dependency. Use the public Pi Agent, provider, tool and Skill contracts; never copy Pi runtime internals.

- `apps/web`: React workspace and GrapesJS canvas.
- `apps/server`: HTTP API, ingestion, public website fetching, storage and HTML policy.
- `packages/agents`: exactly three roles, model adapter, workflow and Skill tools.
- `.pi/agents`: individual Markdown role prompts.
- `.pi/skills`: trusted local knowledge loaded on demand.
- `workspace`: ignored runtime data, never commit user material or credentials.

Preserve Dreamatic's warm gray, dark ink, orange and lime design language. Run type checking, relevant tests and a production build after meaningful changes. Demo output must always identify itself. Do not read credentials from the adjacent Dreamatic project.
