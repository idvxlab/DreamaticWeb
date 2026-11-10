---
name: designer-taste
description: Build a company, product or hardware website the way a good studio ships it, on a proven page system (layout, heroes, type, buttons, motion layer and scroll moments) that the host inlines. Use for marketing and showcase pages that must look designed rather than templated, with real photographs leading.
---

# Ship the page a good company would ship

Say plainly what is sold, show the real thing on every screen and look made for this client, not from a template and not like an art piece. Build on the kit in `assets/`: it supplies the grid, spacing, type scale, buttons, nav, cards, rows, hero layouts, the hover and entrance layer and five scroll moments. Write markup and a short page stylesheet for this client; never rewrite what the kit already provides, and never add a second grid, spacing scale, button, card or radius style.

## House rules

1. **No caption or description under any image.** The image carries its alt text only.
2. **Every visual renders**, never an empty ground or a box where a picture should be.
3. **One section per screen** at 1440×900: the hero alone on the first screen; every section one or two screens tall; no next heading peeking in.
4. **Equal left and right content edges** (`.wrap` everywhere).
5. **One entrance and one or two moments per page.** The hero enters once (`data-enter`); one moment, two on a long page, each in its own section. No tilt, carousels, timed tabs, or effects on cards.
6. **Real material leads.** The client's own photographs and renders, large; prefer each image's `transparent` variant when the subject should stand on the page's ground.
7. **Colour from the subject.** The interface stays 90–95% neutral; one accent at most, taken from the product or brand; dark pages and dark heroes only when the subject is technical hardware or software.
8. **Words people read are 16px or more**; sentence case; labels 13px at 500, never tracked capitals; no text baked into pictures.

## Decide the kind first

Hardware and technical products (propellers, drones, devices) are **tech/product**: the product's own photographs lead at true size; a dark page is allowed but not required; one effect at most (a moment counts as the page's motion, not a decoration). A service or company page without a product is **service**: people, work and rooms in photographs; flat grounds. Write the kind as `<html data-type="product">` (or `service`, `software`).

## Every product page

- The product **big** where it stands whole: most of its frame, never mid-size in a grey rounded panel on a grey ground.
- **A different picture each section**, never one view twice; **every headline promise pictured**; **no fact twice**.
- **One object never carries the page**: the product leads the hero and two more sections at most; its use, its parts close up, a drawing or a chart carry the rest.
- Specifications in `.rows` (name and value, a rule under each), not in a wall of cards.
- Each section deals a different composition: split text/picture, full-width picture, rows beside a picture, a pinned or photo moment, the closing band.

## Building with the kit

Follow [kit markup](references/kit.md): include the kit, set the palette on `:root`, then compose from its blocks. Keep the page's own CSS short: palette tokens, picture crops and one or two client-specific details.

## Required references

Apply these core methods before implementing this Skill: [kit markup](references/kit.md).

Adapted from taste-skill (MIT, Leonxlnx); see `upstream.json` for the pinned source and changes.
