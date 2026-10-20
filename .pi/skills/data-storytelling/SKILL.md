---
name: data-storytelling
description: Choose comparable metrics and honest tables or static charts from numerical evidence, including reports and product data rather than only spreadsheets.
metadata:
  roles: [analyst, designer]
  tasks: [data-analysis, dashboard]
  permissions: [guidance]
---

# From numbers to a readable comparison

Input: numerical evidence with headers, source IDs, units, periods and conditions.
Choose metrics that answer the visitor's question; do not promote a large number
merely because it is available. Distinguish measured values, targets and estimates.
For rates and percentages retain the denominator; a percentage-point change is
not a relative percentage change. Distinguish missing, zero and not applicable.

Before comparing or aggregating, align entity, period, unit, test conditions and
population. Do not add cumulative totals to their components or mix currencies,
rated/peak performance or unlike operating conditions. Analyst uses table_query for
needed calculations and checks excluded values and cached-formula warnings; include
the operation, source/table, filters, units and conditions with the result in the
existing dataInsights/sections contract. Designer has no table_query: present the
supplied supported results without requesting that tool or inventing a missing
aggregate. If essential results are absent, use available raw values/a table or
narrow the claim. Unsupported assumptions are not grounds for an invented comparison.

Choose the display by the question:
- Exact lookup or a few heterogeneous values: labeled values or a compact table.
- Category comparison: bars with a consistent scale and textual values; begin bar
  length at zero. Keep sorting meaningful and show any top-N or filtered selection.
- Change over time: order dates and distinguish gaps from zero; do not claim a
  trend from incomparable periods or imply unsupplied intermediate measurements.
- Part-to-whole: show shares only when categories and a meaningful total are known;
  otherwise use a table. Do not imply incomplete categories sum to the whole.

Designer orders the display as question/key finding, comparison, then source and
necessary qualifications. A chart should add understanding beyond the same small
table. Use available HTML/CSS techniques, retain accessible textual values and adapt
wide tables without hiding units or row/column relationships. Avoid decorative
axes, unsupported precision and claims of live or interactive data.

Analyst supplies supported facts/dataInsights and limitations; Designer uses the
normal page submission contract. No additional analysis stage is required.
