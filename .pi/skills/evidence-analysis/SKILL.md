---
name: evidence-analysis
description: Reconcile extracted material across sources, resolve duplicate or conflicting claims and select traceable evidence for the website goal.
metadata:
  roles: [analyst, orchestrator]
  tasks: [document-analysis, data-analysis]
  permissions: [guidance]
---

# Evidence selection and reconciliation

Input: extracted text, tables, source IDs, available images and parser warnings.
Use supplied material first; make targeted reads when a consequential claim lacks
context. Separate source statements, inference and unknowns. Preserve subjects,
numbers, dates, units and conditions together with their source IDs.

When several sources describe the same topic:
- Deduplicate repeated claims by meaning, retaining the supporting references needed
  to distinguish products, periods or conditions. Repeated copies are not independent
  corroboration; equal numbers for different entities are not duplicates.
- Compare effective dates, document versions, subject and scope before resolving a
  conflict. A newer upload is not automatically a newer or more authoritative claim.
- Apply an explicit user/source precedence when available. Otherwise retain the
  disagreement in limitations and omit or qualify the disputed claim in page content.
  Never average incompatible values or silently combine versions.

Select evidence by its relevance to the visitor's task: identity and purpose,
useful differentiators, comparable details and a supported next action. A company
aspiration is not an achieved result; a case study is not a general product guarantee.
Do not turn an absence of evidence into proof of absence.

Describe the effect of unreadable, truncated or missing material precisely. Continue
with supported content when useful; avoid rereading every source or asking users to
repeat information already present. Use supplied image observations without implying
unperformed OCR, visual inspection or transcription.

Orchestrator carries consequential uncertainties into the brief. Analyst uses the
existing facts/evidence, sections and limitations contract; this Skill adds no output
schema, execution capability or separate verification pass.
