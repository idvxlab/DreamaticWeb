---
name: designer-style-night
description: A complete night style for a page kit such as designer-taste — pure black canvas, full-bleed photographs and scenes as the only decoration, uppercase condensed display type with wide tracking, no accent colour, white ghost pill actions and drawings on cool-white plates. Supplied by the host when the Designer's plan names it; for aerospace, aircraft or energy pages led by dark or sky scenes.
---

# Night style

The kit supplies the blocks; this style decides how every one of them looks. One complete mode: photography on a black canvas. Never mix it with another style or a light section.

## Include it

After the kit's stylesheet: `<link rel="stylesheet" href="skill://designer-style-night/assets/night.css">`. Set `<html data-style="night" data-tone="dark" data-radius="sharp" data-buttons="pill">` and this `:root` in full:

```css
:root{--p-bg:#000000;--p-surface:#0a0a0a;--p-ink:#ffffff;--p-muted:#a9a9b3;--p-accent:#ffffff;--p-accent-ink:#000;--p-action:#ffffff;--p-action-ink:#000;--p-inv-bg:#0a0a0a;--p-inv-surface:#141414;--p-inv-ink:#ffffff;--p-inv-muted:#a9a9b3;--p-inv-accent:#ffffff;--p-inv-accent-ink:#000;--p-inv-action:#ffffff;--p-inv-action-ink:#000;--range-bg:#f0f0fa;--feature-bg:#f0f0fa;--panel-bg:#f0f0fa}
```

## Required references

Apply these core methods before implementing this Skill: [the look](references/look.md).

Adapted from the SpaceX site analysis in VoltAgent awesome-design-md (MIT); see `upstream.json`. Only the style is borrowed: never another company's name, logo or copy.
