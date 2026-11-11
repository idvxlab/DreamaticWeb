---
name: designer-compose
description: Balanced compositions of words and pictures for any page — a split (words beside a picture), a gallery, cards, a timeline, key figures, a single figure and a wide band — each adapting to how much it holds, so no row is half empty and the two sides of a split stay comparable. Use whenever a section combines text and images; works alone or on top of a page kit.
---

# Balanced compositions

Include once, after any kit stylesheet:
`<link rel="stylesheet" href="skill://designer-compose/assets/compose.css">` and, before `</body>`, `<script src="skill://designer-compose/assets/compose.js"></script>`.

A loaded kit's own blocks come first for what they cover (a product range, a case, a feature, an org block). For every other section, choose one composition from what the section holds, counted from the facts and the media catalog (words, number of pictures, their width×height):

| The section holds | Composition |
|---|---|
| a paragraph or a list with one or two pictures | `.cx-split` (picture right; `.cx-split--flip` to alternate; `.cx-split--even` for two equal halves) |
| words only | `.cx-split` with its words alone (it folds into one column), or `.cx-cards` for 3+ short items |
| three or more pictures of the same kind | `.cx-gallery` |
| one drawing, chart, diagram or table picture | `.cx-figure` with its caption, under or beside its words |
| dated steps or milestones | `.cx-timeline` |
| two to six key numbers | `.cx-facts` |
| one wide photograph | `.cx-band` |

```html
<div class="cx-split"><div class="cx-text"><h2>…</h2><p>…</p></div>
  <figure class="cx-media"><img src="…" alt="…" data-kind="photo"><figcaption>…</figcaption></figure></div>
<ul class="cx-gallery"><li><img src="…" alt="…" data-kind="photo"><p>caption</p></li>…</ul>
<ul class="cx-cards"><li><h3>…</h3><p>…</p></li>…</ul>
<ol class="cx-timeline"><li><time>2014</time><h3>…</h3><p>…</p></li>…</ol>
<dl class="cx-facts"><div><dt>label</dt><dd>25 万+</dd></div>…</dl>
<figure class="cx-figure"><img src="…" alt="…" data-kind="chart"><figcaption>Figure 2. …</figcaption></figure>
<figure class="cx-band"><img src="…" alt="…" data-kind="photo"></figure>
```

Rules:
1. Each composition sits inside the section's content container (a kit's `.wrap`, or the page's own).
2. Do not set widths, columns, heights or positions on these blocks or their pictures: they size themselves from what they hold. Colours, type and spacing tokens are yours.
3. Never invent a picture to fill a frame: a split without a picture becomes one column, a gallery of two is two wide frames.
