# The look

1. **Breathing room.** Sections are very tall in padding; few elements per screen; big gaps between cards. The stylesheet sets the spacing; do not tighten it.
2. **Massive, calm type.** Headlines bold, tight and large; body in a quiet grey. Each section head is preceded by a small pill eyebrow: `<p class="eyebrow">产品系列</p>`.
3. **Double bezel.** Every card, picture frame, panel and table sits in a soft outer shell with a hairline and a diffused shadow, like glass in an aluminium tray (the stylesheet draws it on `.range__item`, `.feature__media`, `.case__media > figure`, `.figure-panel`, `.spec-table-wrap`). Never flat cards with grey 1px borders, never dark heavy shadows.
4. **Pill actions.** Buttons are full pills; the primary one carries its arrow in its own small circle (drawn by the stylesheet). The navigation floats as a pill below the top edge.
5. **Spring motion.** Hover lifts and entrances ease with a soft spring; nothing linear, nothing abrupt. One signature moment from the kit, not more.
6. **One accent**, used on eyebrows, one figure and the active state. Pictures on white inside their shells; never filtered.
