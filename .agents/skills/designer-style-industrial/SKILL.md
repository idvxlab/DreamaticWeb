---
name: designer-style-industrial
description: A complete industrial print style for a page kit such as designer-taste — matte paper, carbon ink, one aviation red, giant uppercase grotesk, monospaced labels, visible hairline grids and square corners. Use with the kit when the user asks for this style or the subject is engineering, components or industrial hardware led by drawings and data.
---

# Industrial print style

The kit supplies the blocks; this style decides how every one of them looks. It is one complete mode: Swiss industrial print on paper. Never mix it with another style, a dark terminal look or soft shadows.

## Include it

After the kit's stylesheet: `<link rel="stylesheet" href="skill://designer-style-industrial/assets/industrial.css">`. Set `<html data-style="industrial" data-radius="sharp" data-buttons="block">` and this `:root` in full (the red may become the brand's own signal colour):

```css
:root{--p-bg:#f4f4f0;--p-surface:#eae8e3;--p-ink:#0b0b0b;--p-muted:#4a4a46;--p-accent:#e61919;--p-accent-ink:#fff;--p-action:#0b0b0b;--p-action-ink:#f4f4f0;--p-inv-bg:#0b0b0b;--p-inv-surface:#1a1a1a;--p-inv-ink:#f4f4f0;--p-inv-muted:#a5a5a0;--p-inv-accent:#ff2a2a;--p-inv-accent-ink:#fff;--p-inv-action:#f4f4f0;--p-inv-action-ink:#0b0b0b;--range-bg:#ffffff;--feature-bg:#ffffff;--panel-bg:#ffffff}
```

## Required references

Apply these core methods before implementing this Skill: [the look](references/look.md).

Adapted from the classic industrial-brutalist style skill of taste-skill-classics (MIT, Leonxlnx); see `upstream.json`.
