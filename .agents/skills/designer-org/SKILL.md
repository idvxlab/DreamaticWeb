---
name: designer-org
description: Page blocks for an institution, school, studio, agency or service introduction — an intro with key facts, brands side by side, a milestone timeline, offers (services, courses, features), a photo gallery and a logo wall. Supplied by the host when the Designer's plan names org blocks; used with the designer-taste page system in place of its product blocks.
---

# Institution and service page blocks

`designer-taste` is the page system (grid, type, buttons, nav, hero, moments, closing); these blocks replace its product range for a page about an organisation and what it offers. Include `<link rel="stylesheet" href="skill://designer-org/assets/org.css">` after the kit's stylesheet.

1. **Every row is filled.** Words alone go in a `.lede` with their key facts beside them; a picture sits beside its words; a long list becomes `.offers` or a `.timeline` across the full width. Never a half-filled row with empty space beside it.
2. **One block per kind of content**, as [blocks](references/blocks.md) maps them: brands → `.brands`, history → `.timeline`, services, courses or features → `.offers`, events and places → `.gallery`, partners and certifications → `.logos`, figures → the kit's counter-rolls.
3. **Pictures do their own job.** Photographs fill the gallery and timeline frames; logos and icons stay small (the blocks size them); a poster or banner is shown whole beside its words, never cropped into a tile.
4. Do not restyle the blocks' frames or pictures: the host stylesheet sizes them.

## Required references

Apply these core methods before implementing this Skill: [blocks](references/blocks.md).
