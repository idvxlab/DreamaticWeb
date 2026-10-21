---
name: designer-interaction-design
description: Implement honest, accessible navigation and content interactions with clear state and feedback. Use when menus, disclosure, navigation states, forms or user actions are part of the requested change.
---

# Make each control fulfill its promise

Map each proposed control to a concrete visitor action. Use links for destinations, buttons for supported actions, native disclosure for optional detail and labels for inputs. Omit an interaction if static organization already solves the problem.

Work within the host's execution policy. In script-free HTML, use real anchors, details/summary, native inputs and media controls. Do not paint fake filters, tabs, search, carts or submit actions. If a requested feature requires unavailable scripting or a backend, provide a clear static alternative or explicitly label the unavailable action; do not present a dead control as functional. CSS state mechanisms are acceptable only when their semantics and keyboard behavior remain understandable.

Ensure keyboard traversal follows content order; use visible focus, descriptive labels, meaningful link text and accessible target sizes. Native controls should retain their expected behavior. For actual dynamic applications, design selected, expanded, loading, empty, error and disabled states only where those states really exist.

Keep mobile navigation reachable without hover, prevent fixed UI from covering anchors and respect reduced motion. Avoid gratuitous animation and redundant interactions. On existing pages, preserve working focus order, anchor targets and controls outside the requested component. Implement the behavior and its feedback in the same pass, without an extra interaction-review model.
