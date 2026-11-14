---
name: designer-visual-design
description: Create a deliberate visual system, typographic hierarchy and varied content-led composition. Use for initial visual design, explicit rebranding or targeted layout/style changes; preserve established design in local edits.
---

# Choose a visual direction and build it

Let audience and content choose the mood and density: a technical comparison calls for precision; an editorial feature needs reading rhythm; a portfolio should give work room. Commit to one coherent direction instead of mixing ornamental treatments. Use existing brand constraints and assets before inventing decoration.

Establish a compact token set for surface, ink, muted text, accent, spacing, type scale, radius and borders. Use system/local fonts when external dependencies are unavailable. Set a readable body measure, distinct heading hierarchy and responsive sizing. Use accent color selectively to express priority, not on every component.

Compose sections differently when their content differs: strong opening with an asymmetric or editorial arrangement; dense specifications in aligned rows; large media for visual evidence; grouped prose for explanation. Avoid automatic centered heroes, three equal cards, decorative gradients and repeated rounded panels. Build contrast through scale, alignment, spacing and content density before adding shadows.

Place pictures as an editorial designer does: for each picture and the words it illustrates, choose an arrangement that stays tidy however long the words turn out on screen, since rendered text height cannot be known exactly in advance.

- Stacked: the picture sits above or below its words at a width that suits its detail: the full content width for a wide, detailed figure; about the reading width, centred, for a simpler diagram or photo; never larger than its own pixels. Natural for very wide pictures, dense charts whose labels need size, and figures of several panels.
- Wrapped: the picture floats to one side at roughly 40–55% width with a margin, and the words run beside it and continue beneath it (the block contains the float, e.g. `display: flow-root`). Suits a moderately wide or squarish picture beside a paragraph or two; it never leaves an empty gap.
- Beside: a two-column row when words and picture are of similar height. Size the picture column to the picture (a squarer or taller one takes the narrower column, a wider one the wider) and align both to the top. When one side would clearly run longer, wrap or stack instead, or keep only the paragraph the picture illustrates in the row.
- Sticky: in a long section explained by one picture, the picture stays in view in a side column (`position: sticky; top: …`) while the words scroll beside it.
- Set: pictures of one figure, or of parallel items, share one grid and one frame proportion.

A picture's shape (band, landscape, square, portrait in the media catalog) is a starting point, not a rule: a moderately wide picture can sit beside words, and a very wide one usually reads better stacked. Vary arrangements across the page for rhythm, keep one content width, give each picture a short caption, and on narrow screens let wrapped, beside and sticky arrangements become stacked.

Choose image aspect ratio and crop from subject and meaning. Do not crop a chart, product specification or meaningful label as decoration. Supply useful alternatives and retain native video controls. Keep absent assets honest instead of substituting unrelated imagery.

Make mobile a deliberate reflow: readable gutters, useful stacking order, scroll containers for wide data and comfortable controls. Preserve focus visibility and readable contrast. In local edits, reuse the current type, spacing, color and component system and change only requested rules. Deliver implemented HTML/CSS, not a design rationale in place of a page.

Implement richness with reusable tokens and content-driven CSS, not repetitive markup. Reuse selectors, avoid unnecessary wrappers and one-off rules, and keep the implementation compact enough to finish within the available output budget.
