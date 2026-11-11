---
name: designer-style-showroom
description: A complete product showroom style for a page kit such as designer-taste — white canvas, studio pictures in square grey tiles with white gutters, one engineering blue for every action pill, outline secondary pills, tight grotesk at stepped ink opacities and a small orange rank label. Supplied by the host when the Designer's plan names it; for several products shown as renders or studio shots.
---

# Showroom style

The kit supplies the blocks; this style decides how every one of them looks. One complete mode: a brightly lit product showroom. Never mix it with another style.

## Include it

After the kit's stylesheet: `<link rel="stylesheet" href="skill://designer-style-showroom/assets/showroom.css">`. Set `<html data-style="showroom" data-radius="sharp" data-buttons="pill">` and this `:root` in full (`ACCENT` is the brand's own blue if it has one, else #0070d5):

```css
:root{--p-bg:#ffffff;--p-surface:#f5f5f5;--p-ink:#262626;--p-muted:#595959;--p-accent:#be4e04;--p-accent-ink:#fff;--p-action:ACCENT;--p-action-ink:#ffffff;--p-inv-bg:#272727;--p-inv-surface:#383838;--p-inv-ink:#ffffff;--p-inv-muted:#b3b3b3;--p-inv-accent:#fa8c16;--p-inv-accent-ink:#111;--p-inv-action:#ffffff;--p-inv-action-ink:#262626;--range-bg:#f5f5f5;--feature-bg:#f5f5f5;--panel-bg:#ffffff}
```

## Required references

Apply these core methods before implementing this Skill: [the look](references/look.md).

Adapted from the DJI site analysis in VoltAgent awesome-design-md (MIT); see `upstream.json`. Only the style is borrowed: never another company's name, logo or copy.
