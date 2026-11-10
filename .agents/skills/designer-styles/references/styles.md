# Styles

`ACCENT`: from the client's product, logo or lead pictures.

## precision — 精密极简 (default)
Choose for: a product shot on a white or warm studio ground; any industry. It is the kit's own default `:root` (kit markup) with `--p-bg` matched to the pictures' white and one accent from the product. Source: taste-skill.

## showroom — 产品陈列 (from a DJI site analysis)
Choose for: several products on light grey or white; drones, devices, hardware ranges.
`<html data-radius="sharp" data-buttons="pill">`
```css
:root{--p-bg:#ffffff;--p-surface:#f5f5f5;--p-ink:#262626;--p-muted:#595959;--p-accent:#be4e04;--p-accent-ink:#fff;--p-action:ACCENT;--p-action-ink:#fff;--p-inv-bg:#272727;--p-inv-surface:#383838;--p-inv-ink:#ffffff;--p-inv-muted:#b3b3b3;--p-inv-accent:#fa8c16;--p-inv-accent-ink:#111;--p-inv-action:#ffffff;--p-inv-action-ink:#262626;--display-weight:600;--display-tracking:-0.03em;--range-bg:#f5f5f5}
```
`ACCENT` is one engineering blue (#0070d5) unless the brand has its own; it fills primary pills only. Pictures fill square-cornered frames (`.range` with `--range-bg`, no visible card border needed); section heads centred; a product's name set large and light; the secondary action is a 1px ink outline pill; `--p-accent` (burnt orange) only for a small rank label such as "旗舰". Close with a charcoal `ground-inverse` footer. Never: rounded picture frames, shadows on tiles, orange fills, headings heavier than 600.

## night — 暗场影像 (from a SpaceX site analysis)
Choose for: scenes and renders shot on dark or sky (aircraft, launches, night cities); aerospace, energy. Not for pages led by white drawings.
`<html data-tone="dark" data-radius="sharp" data-buttons="pill">`
```css
:root{--p-bg:#000000;--p-surface:#0a0a0a;--p-ink:#ffffff;--p-muted:#a9a9b3;--p-accent:#ffffff;--p-accent-ink:#000;--p-action:#ffffff;--p-action-ink:#000;--p-inv-bg:#f0f0fa;--p-inv-surface:#ffffff;--p-inv-ink:#000000;--p-inv-muted:#5a5a5f;--p-inv-accent:#000;--p-inv-accent-ink:#fff;--p-inv-action:#000;--p-inv-action-ink:#fff;--font-display:"DIN Alternate","DIN Condensed",Bahnschrift,"Arial Narrow","PingFang SC",sans-serif;--display-weight:700;--display-tracking:0.02em;--panel-bg:#f0f0fa}
```
No accent colour: photography supplies every hue. Hero: one photograph or scene over the whole screen (`hero--photo data-tone="dark" data-box="none"`), words straight on its calm part, no scrim. Latin words, numbers and small labels in uppercase with positive tracking; one CTA per band. Drawings and charts sit as light plates (`.figure-panel`). Never: coloured buttons, cards on cards, gradients.

## swiss — 瑞士理性 (from ui-ux-pro-max: Swiss Modernism 2.0)
Choose for: engineering, industrial, B2B components, professional services; drawings and data lead.
`<html data-radius="sharp" data-buttons="block">`
```css
:root{--p-bg:#ffffff;--p-surface:#f5f5f5;--p-ink:#000000;--p-muted:#555555;--p-accent:ACCENT;--p-accent-ink:#fff;--p-action:#000000;--p-action-ink:#fff;--p-inv-bg:#000000;--p-inv-surface:#111111;--p-inv-ink:#ffffff;--p-inv-muted:#aaaaaa;--p-inv-accent:ACCENT;--p-inv-accent-ink:#fff;--p-inv-action:#ffffff;--p-inv-action-ink:#000;--font-display:"Helvetica Neue",Helvetica,Arial,"PingFang SC",sans-serif;--display-weight:700;--display-tracking:-0.02em}
```
`ACCENT` is one vivid signal (signal red #e2231a, or the product's colour) used on one detail per screen: a rule, a number, a label. Strict 12 columns, asymmetric: headings on columns 1–5, content from 7; everything left-aligned; hairline rules between blocks; large numerals in `.t-stat`. Never: decoration, shadows, gradients, centred text blocks.

## gallery — 极简留白 (from ui-ux-pro-max: Exaggerated Minimalism)
Choose for: one or a few hero-worthy products with strong photographs; premium, design-led brands. Not for catalogue-heavy pages.
`<html data-radius="sharp" data-buttons="arrow">`
```css
:root{--p-bg:#ffffff;--p-surface:#f4f4f4;--p-ink:#000000;--p-muted:#6b6b6b;--p-accent:ACCENT;--p-accent-ink:#fff;--p-action:#000000;--p-action-ink:#fff;--p-inv-bg:#000000;--p-inv-surface:#111111;--p-inv-ink:#ffffff;--p-inv-muted:#9a9a9a;--p-inv-accent:ACCENT;--p-inv-accent-ink:#fff;--p-inv-action:#ffffff;--p-inv-action-ink:#000;--display-weight:800;--display-tracking:-0.04em}
```
Oversized statements: the hero `h1` and one line per section at `font-size: clamp(3.5rem, 7vw, 7rem)` (page CSS on those headings only); sections padded with `--s-10`; one statement and one picture per screen; products as `.feature`, the rest of the range in one `.range`. Specifications stay at reading size. Never: more than one accent, dense card walls, decoration.
