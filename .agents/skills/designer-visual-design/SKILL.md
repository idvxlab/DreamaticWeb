---
name: designer-visual-design
description: Create a deliberate visual system, typographic hierarchy and varied content-led composition. Use for initial visual design, explicit rebranding or targeted layout/style changes; preserve established design in local edits.
---

# Choose a visual direction and build it

Let audience and content choose the mood and density: a technical comparison calls for precision; an editorial feature needs reading rhythm; a portfolio should give work room. Commit to one coherent direction instead of mixing ornamental treatments. Use existing brand constraints and assets before inventing decoration.

Establish a compact token set for surface, ink, muted text, accent, spacing, type scale, radius and borders. Use system/local fonts when external dependencies are unavailable. Set a readable body measure, distinct heading hierarchy and responsive sizing. Use accent color selectively to express priority, not on every component.

Compose sections differently when their content differs: strong opening with an asymmetric or editorial arrangement; dense specifications in aligned rows; large media for visual evidence; grouped prose for explanation. Avoid automatic centered heroes, three equal cards, decorative gradients and repeated rounded panels. Build contrast through scale, alignment, spacing and content density before adding shadows.

Lay out pictures and words together, as an editorial designer does: a picture and the words it illustrates are composed as one unit, and both sides can be shaped. On the words' side you choose which paragraph sits beside the picture and which continue after it, where paragraphs break, and the column proportions; on the picture's side, its width and side. Aim for a unit whose two sides end near each other, with a rhythm that varies across the page.

- Beside: picture and words in two columns, both aligned to the top. Give the picture the width its detail needs and let the words beside it be the paragraph or two it illustrates; later paragraphs continue below at the full width. Suits most moderately wide, square and tall pictures.
- Wrapped: the picture floats to one side (about 40–50% width, with a margin) and the words run beside it and continue beneath it, so no gap can open whatever their length (the block contains the float, e.g. `display: flow-root`). Suits a picture beside a longer passage.
- Sticky: one picture that explains a long section stays in view in a side column (`position: sticky; top: …`) while the words scroll beside it.
- Stacked: the picture sits above or below its words, at the full content width for a very wide or finely detailed figure, or about the reading width, centred, for a simpler one; never larger than its own pixels. Suits pictures that need width to be read.
- Set: pictures of one figure, or of parallel items, share one grid and one frame proportion.

Fit a unit's two sides as a typesetter does, at 1440px wide: a picture's height is its column width divided by its width-to-height ratio; Chinese body text at 16–17px in a 600px column holds about 36 characters a line at about 30px a line, so 100 characters take about 85px. Beside a picture set the paragraphs that reach about its height; the rest continue below the unit; when the words are much longer, wrap them or make the picture sticky; when the picture is much taller, stack it or narrow it. A picture column holds one picture: two pictures of one figure sit side by side as a set. A picture never stands alone at one side of the content width with empty space beside it: it is centred, or has its words or its partner picture beside it. The first screen holds the title and thesis with the key picture or key numbers.

A picture's shape (band, landscape, square, portrait in the media catalog) informs the choice: a very wide band usually reads best stacked, while landscape, square and portrait pictures often sit well beside or wrapped in words. Mix arrangements across the page, keep one content width, give each picture a short caption, and on narrow screens let beside, wrapped and sticky units become stacked.

Choose image aspect ratio and crop from subject and meaning. Do not crop a chart, product specification or meaningful label as decoration. Supply useful alternatives and retain native video controls. Keep absent assets honest instead of substituting unrelated imagery.

Make mobile a deliberate reflow: readable gutters, useful stacking order, scroll containers for wide data and comfortable controls. Preserve focus visibility and readable contrast. In local edits, reuse the current type, spacing, color and component system and change only requested rules. Deliver implemented HTML/CSS, not a design rationale in place of a page.

Implement richness with reusable tokens and content-driven CSS, not repetitive markup. Reuse selectors, avoid unnecessary wrappers and one-off rules, and keep the implementation compact enough to finish within the available output budget.
