---
name: designer-taste
description: Build a company, product or hardware website the way a good studio ships it, on a proven page system (layout, heroes, type, buttons, motion layer and scroll moments) that the host inlines. Use for marketing and showcase pages that must look designed rather than templated, with real photographs leading.
---

# Ship the page a good company would ship

Say plainly what is sold, show the real thing on every screen and look made for this client, not from a template. Build on the kit in `assets/` (grid, spacing, type, buttons, nav, cards, rows, heroes, hover and entrance layer, scroll moments). Write markup and a short page stylesheet; never rewrite what the kit provides or add a second grid, button, card or radius style.

## House rules

1. **No caption or description under any image.** The image carries its alt text only.
2. **Every visual renders**, never an empty ground or a box where a picture should be.
3. **Sections sized by their content** at 1440: the hero alone on the first screen; every other section as tall as its content with generous spacing; never a fixed height that content can overflow.
4. **Equal left and right content edges** (`.wrap` everywhere).
5. **One entrance and one or two moments per page.** The hero enters once (`data-enter`); one moment, two on a long page, each in its own section. No tilt, carousels, timed tabs, or effects on cards.
6. **Real material leads.** The client's own photographs, renders and drawings, large, as supplied. A brochure's own scene (an aircraft over a city) may fill the hero (`hero--photo`) or one band; it never stands in for the product.
7. **Colour from the subject.** The interface stays 90–95% neutral; one accent at most, taken from the product or brand; dark pages and dark heroes only when the subject is technical hardware or software.
8. **Words people read are 16px or more**; sentence case; labels 13px at 500, never tracked capitals; no text baked into pictures.

## Let the pictures set the page

Inspect the candidate images first, then let them decide the page: their backdrop (a white studio, a dark render, a lit scene) sets the ground so each picture sits in the page without a box or a seam; their dominant colours give the one accent; the strongest close-up or whole-product view becomes the hero. A product shot on white wants a light page or a light band; never place an opaque white picture on a dark ground or fake a cut-out with filters. Drawings and charts go on a light `.figure-panel` at half width beside their text, never filling a screen.

In `imagePlan`, record for every image you use what it shows, why it belongs where it goes and its role (hero subject, detail, proof, use, process). In `designPlan`, record the kind, the ground and accent and the picture that decided them, the hero layout, the type voice and the one or two signature moments from the kit, each with its reason. Choose from the kit's menu in [kit markup](references/kit.md); the plan is a decision for this client, not a list of options.

## A signature moment

One moment should make the page memorable, built from the real material: a product close-up that moves in on its finest detail, the whole range changing on a pinned stage, a giant statement with the product photograph inside the letters, or a wide picture seen through a window. Put it where the reader most needs to be convinced, not only in the hero.

## Decide the kind first

Hardware and technical products (propellers, drones, devices) are **tech/product**: the product's own photographs lead at true size; a dark page is allowed but not required; one effect at most (a moment counts as the page's motion, not a decoration). A service or company page without a product is **service**: people, work and rooms in photographs; flat grounds. Write the kind as `<html data-type="product">` (or `service`, `software`).

## Every product page

- The product **big** where it stands whole: most of its frame, never mid-size in a grey rounded panel on a grey ground.
- **Vary the pictures**: avoid one view twice (a close-up of it is a new view); **every headline promise pictured**; **no fact twice**.
- **One object never carries the page**: the product leads the hero and two more sections at most; its use, its parts close up, a drawing or a chart carry the rest.
- Several products: a `.range` and one `.spec-table` (kit markup); one product's specs in `.rows`.
- Each section deals a different composition: split text/picture, full-width picture, rows beside a picture, a pinned or photo moment, the closing band.

## Building with the kit

Follow [kit markup](references/kit.md): include the kit, set the palette on `:root`, then compose from its blocks. Keep the page's own CSS short.

## Required references

Apply these core methods before implementing this Skill: [kit markup](references/kit.md).

Adapted from taste-skill (MIT, Leonxlnx); see `upstream.json` for the pinned source and changes.
