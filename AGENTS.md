# Dreamatic · Web development rules

The application is being prepared for a system redesign. The previous agent runtime, role prompts and Skills have been removed. Do not restore the previous architecture implicitly.

- `apps/web`: preserved React workspace and GrapesJS canvas. Keep all existing frontend design, layout, styles and interactions unless explicitly requested otherwise.
- `apps/server`: HTTP API, ingestion, public website fetching, storage, browser preview and HTML policy.
- `packages/shared`: shared configuration and interface data shapes. Historical activity fields support rendering existing projects only; they do not define an executable workflow.
- `workspace`: ignored runtime data, never commit user material or credentials.

Generation endpoints must explicitly report that generation is unavailable until a replacement is implemented. Settings fields are retained for the existing interface and do not initiate model calls.

Preserve Dreamatic's warm gray, dark ink, orange and lime design language. Run type checking, relevant tests and a production build after meaningful changes. Demo output must always identify itself. Do not read credentials from the adjacent Dreamatic project.
