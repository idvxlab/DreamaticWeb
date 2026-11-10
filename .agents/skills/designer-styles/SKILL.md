---
name: designer-styles
description: A compact library of visual styles (palette, type, radius, buttons and composition) that plug into a page kit such as designer-taste. Use together with a kit when the user names a style or the page needs a deliberate visual direction; the kit keeps its blocks, the style sets how they look.
---

# Visual styles for a page kit

A style changes how the kit's blocks look, never which blocks the page uses. Load it beside a kit (for product pages, `designer-taste`).

1. **One style per page.** Choose it in `designPlan.style` with the reason: the lead pictures (their backdrop and colour) and the client's kind. A style the user names wins. Never mix two.
2. **Apply it whole.** Set its `<html>` attributes and its complete `:root` tokens in place of the kit's defaults; fill an `ACCENT` from the product, the logo or the lead pictures. Its type and composition rules replace the kit's defaults; the kit's markup, blocks and house rules for structure stay.
3. **The pictures still decide.** A style whose ground fights the lead pictures (white drawings on a black page) is the wrong choice unless the user named it; then the pictures sit on the style's light panels, never filtered or cut out.
4. **Keep one ground** across the page; only the closing or one band uses the inverse ground (`ground-inverse`).

## Required references

Apply these core methods before implementing this Skill: [styles](references/styles.md).

Adapted for this host from public style analyses (VoltAgent awesome-design-md, MIT; ui-ux-pro-max, MIT; taste-skill, MIT); see `upstream.json`. Only the style is borrowed: never another company's name, logo or copy.
