---
name: designer-style-soft
description: A complete soft structural style for a page kit such as designer-taste — silver-white ground, massive bold grotesk, airy floating double-bezel cards with diffused shadows, pill buttons with a nested icon, a floating pill navigation and spring motion. Supplied by the host when the Designer's plan names it; for a premium consumer or lifestyle product with clean renders.
---

# Soft structural style

The kit supplies the blocks; this style decides how every one of them looks. It is one complete mode: soft structuralism on a silver-white ground. Never mix it with another style, hard rules or a dark page.

## Include it

After the kit's stylesheet: `<link rel="stylesheet" href="skill://designer-style-soft/assets/soft.css">`. Set `<html data-style="soft" data-radius="round" data-buttons="pill">` and this `:root` in full, with `ACCENT` from the product or the brand:

```css
:root{--p-bg:#f6f6f4;--p-surface:#ffffff;--p-ink:#111111;--p-muted:#6b6b6b;--p-accent:ACCENT;--p-accent-ink:#fff;--p-action:#111111;--p-action-ink:#ffffff;--p-inv-bg:#111111;--p-inv-surface:#1c1c1c;--p-inv-ink:#f6f6f4;--p-inv-muted:#a3a3a3;--p-inv-accent:ACCENT;--p-inv-accent-ink:#111;--p-inv-action:#ffffff;--p-inv-action-ink:#111111;--range-bg:#ffffff;--feature-bg:#ffffff;--panel-bg:#ffffff}
```

## Required references

Apply these core methods before implementing this Skill: [the look](references/look.md).

Adapted from the classic soft high-end visual design skill of taste-skill-classics (MIT, Leonxlnx); see `upstream.json`.
