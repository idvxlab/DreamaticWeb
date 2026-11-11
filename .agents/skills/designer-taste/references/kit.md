# Kit markup

## Include it

```html
<html lang="zh" data-type="product" data-radius="soft" data-buttons="pill">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="skill://designer-taste/assets/taste.css">
<script>document.documentElement.classList.add('m-enter');setTimeout(()=>document.documentElement.classList.add('m-enter-done'),700)</script>
<style>
:root {
  --p-bg:#f4f4f2; --p-surface:#e9e9e6; --p-ink:#1b1a18; --p-muted:#5f5a52;
  --p-accent:#8b5a3a; --p-accent-ink:#fff; --p-action:#1b1a18; --p-action-ink:#f4f4f2;
  --p-inv-bg:#1b1a18; --p-inv-surface:#262421; --p-inv-ink:#f4f4f2; --p-inv-muted:#b0a99e;
  --p-inv-accent:#d39a74; --p-inv-accent-ink:#1b1a18; --p-inv-action:#f4f4f2; --p-inv-action-ink:#1b1a18;
  --font-display:"PingFang SC","Noto Sans SC",system-ui,sans-serif; --font-text:"PingFang SC","Noto Sans SC",system-ui,sans-serif;
  --display-weight:600; --display-tracking:-0.01em;
}
/* the page's own few rules */
</style>
</head>
<body> … <script src="skill://designer-taste/assets/taste.js"></script></body>
```

The host replaces both `skill://` references with the kit's text. Choose all 16 palette tokens from the subject (`--p-inv-*` is the inverse ground for one band or the footer). A dark page sets `data-tone="dark"` on `<html>` and dark `--p-bg/--p-surface` with light `--p-ink`. `data-radius`: sharp | soft | round. `data-buttons`: solid | pill | tonal | arrow | block. No remote fonts load; use system stacks.

## Menu for designPlan

- Blocks (decide first, in `designPlan.blocks`): `product` (this kit's range, feature and case blocks) for a product or hardware page, or `org` for an institution, school, studio, agency or service page (intro with facts, brands, timeline, offers, gallery, logos); the host supplies the org blocks for the writing turn.
- Look (decide it first, in `designPlan.style`): the kit's own look (`kit`), or one of these styles when it serves the pictures and the client better; the host then supplies that style's rules and stylesheet for the writing turn. `industrial`: drawings and data lead (engineering, components). `showroom`: several products as renders or studio shots. `night`: dark or sky scenes lead (aerospace, energy, games). `soft`: a premium consumer product with clean renders. A style the user names wins.
- Ground: light (`--p-bg` near the pictures' white or warm studio tone) or dark (`data-tone="dark"`), chosen from the pictures' backdrops; one inverse band may contrast.
- Hero: `hero--product` (product whole, words above), `hero--split` (words left, picture right), `hero--photo` (one photograph or the brochure's own scene over the whole first screen, words on its calm side), `hero--film` (a film poster in a framed screen), `hero--statement` (type-led, picture below), `hero--editorial`.
- Radius `data-radius`: sharp | soft | round. Buttons `data-buttons`: solid | pill | tonal | arrow | block.
- Type voice: tight grotesk (system sans, weight 600–700), or a light large display (weight 300–400, wide tracking off); numbers set large in `.t-stat`.
- Moments (one or two): `product-close-up`, `pinned-chapters`, `photo-chapters`, `giant-type-pass`, `window-parallax`, `picture-develops`, `counter-rolls`, `headline-arrives`.

## Nav

```html
<header class="nav"><div class="wrap nav__bar">
  <a class="nav__logo" href="#top"><img src="LOGO_URL" alt="Brand" height="28"></a>
  <nav class="nav__links" aria-label="主导航"><div class="nav__item"><a class="nav__link" href="#products">产品</a></div>…</nav>
  <div class="nav__actions"><a class="btn btn--primary" href="#contact">联系我们</a></div>
</div></header>
<main id="top"> …sections… </main>
```

Four to six one-word nav items, one primary button. The logo is the client's logo image exactly as supplied (no filter, no recolouring); without a usable one, the company name as a text wordmark. Never draw a logo or use emoji as icons; an icon is a simple inline SVG line glyph, or none.

## Hero (product)

```html
<section class="hero hero--product" data-enter aria-labelledby="hero-h">
  <div class="wrap"><div class="hero-text hero__in">
    <div class="hero__head">
      <div><h1 id="hero-h">What is sold, plainly</h1><p class="hero__lead">One or two lines with the real numbers.</p></div>
      <div class="btn-row"><a class="btn btn--primary" href="#products">Main action</a><a class="btn btn--secondary" href="#cases">Second</a></div>
    </div>
    <div class="hero__stage"><img src="TRANSPARENT_OR_PHOTO_URL" alt="…" style="--ly-pos:50% 50%"></div>
  </div></div>
</section>
```

Hero over a whole photograph or scene, with the words on a part whose tone contrasts with them and never over the picture's own lettering (`data-calm` names that side: left, right or top; `data-tone` says whether that side is dark or light; `--ly-pos` crops to the subject; nothing is laid over the picture):

```html
<section class="hero hero--photo" data-calm="left" data-box="none" data-tone="dark" data-enter aria-labelledby="hero-h">
  <img class="hero__bg" src="SCENE_URL" alt="…" style="--ly-pos:60% 40%">
  <div class="wrap"><div class="hero-text"><div class="hero__text">
    <h1 id="hero-h">…</h1><p class="hero__lead">…</p>
    <div class="btn-row"><a class="btn btn--primary" href="#products">…</a></div>
  </div></div></div>
</section>
```

Other heroes in the kit: `hero--split` (words left, picture right), `hero--film` (a film poster in a framed screen), `hero--statement` (type-led), `hero--editorial`. Optional proof under the stage, as the last child of `.hero__in`: `<dl class="hero__facts"><div><dt>额定拉力</dt><dd>110 kg</dd></div>…</dl>` (three or four).

## Sections

```html
<section class="section" id="products" aria-labelledby="p-h">
  <div class="wrap grid grid--middle">
    <div class="span-5">
      <div class="section-head"><h2 id="p-h">Claim. <span class="muted">Its proof in one run-on.</span></h2></div>
      <ul class="rows">
        <li><span class="rows__name">直径<small>Diameter</small></span><span class="rows__value">54 in</span></li>
      </ul>
    </div>
    <div class="span-6 start-7"><img src="…" alt="…" style="width:100%;height:auto"></div>
  </div>
</section>
```

`.grid` has 12 columns: `span-N` sets width, `start-N` the first column. `.section-head` heads every section; `.muted` greys a heading's second half. `.btn-row` holds at most two buttons; `.btn--xl` once, in the closing band. `.card` for linked items; `.rows` for specs, prices and lists.

## Product page blocks

Choose per content, and vary them: a page is not one block repeated.

- Several comparable models → `.range` then one `.spec-table`.
- A flagship, or two or three products that each deserve a look → one `.feature` per product (alternate with `.feature--flip`); its specs in its own `.rows`.
- A flagship as `.feature` and the rest as `.range` is often the best mix.
- Cases → one `.case` each, all the same shape. The steps of a process → `<ul class="range range--steps">`, one `.range__item` per step with its name in the `h3` and one line; the kit numbers them, and a step without its own picture has no figure (the kit shows its number in the same frame). Services with pictures → `.range` with a name and one line.

All these blocks sit inside their section's `.wrap` (`<section class="section" id="…"><div class="wrap">…</div></section>`).

```html
<div class="range-group"><h3>旋翼桨</h3><ul class="range">
  <li class="range__item"><figure class="range__media"><img src="…" alt="…"></figure>
    <div class="range__body"><h3>DH-RF54</h3><p>54 in · 2 blades</p>
      <dl class="range__figures"><div><dt>额定拉力</dt><dd>50 kg</dd></div>…three…</dl></div></li>…
</ul></div>
<div class="spec-table-wrap"><table class="spec-table"><thead><tr><th>参数</th><th>DH-RF54</th>…</tr></thead><tbody><tr><th>直径</th><td>54 in</td>…</tr>…</tbody></table></div>
<p class="spec-common">Shared by every model: …</p>

<article class="feature"><figure class="feature__media"><img src="…" alt="…"></figure>
  <div class="feature__body"><h3>DH-Y800A</h3><p>One line on what it is for.</p>
    <dl class="figures"><div><dt>额定推力</dt><dd>63 kgf</dd></div>…three…</dl><ul class="rows">…</ul></div></article>

<article class="case"><div class="case__body"><p class="case__tag">案例 01 · 分布式电推进</p><h3>…</h3><p>Need, then solution, in two or three lines.</p>
    <dl class="figures">…three…</dl></div>
  <div class="case__media"><figure><img src="DRAWING" alt="…"></figure><figure><img src="CHART" alt="…"></figure></div></article>
```

- A range or a case uses one kind of picture per frame row; a product's odd photograph goes to the hero or a `.feature` (`data-fit="cover"` on its `.feature__media` for an edge-to-edge photograph).
- The same three figures in the same order in every card or case; complete specifications once in `.spec-table`; values all models share once in `.spec-common`.
- Group by product family; a family of one is a `.feature`, never a lone card. Nothing but products, or the steps of one process in `.range--steps`, in a `.range`. Do not restyle the frames or their pictures: the host sizes them. Set `--range-bg`, `--feature-bg` and `--panel-bg` to the pictures' own backdrop (white drawings: #fff) so no picture shows as a box in a box.

A drawing or a chart: `<figure class="figure-panel"><img src="…" alt="…"></figure>` beside its text (`span-6` next to the words' `span-5`), never alone on a row and never full width; the panel is light and caps its height.

Write these blocks, not cards, image boxes, step grids or chart frames of your own; a section these blocks do not cover uses a designer-compose composition (split, gallery, cards, timeline, facts, figure, band). Your own CSS sets the kit's variables and styles only blocks the kit does not have; it never changes the layout (display, grid, columns, width, max-width, position) of a kit block or hero.

A dark band or a dark closing on a light page: add `ground-inverse` to the section or footer (`<footer class="footer closing ground-inverse">`). It switches ground, text, lines and buttons together; never paint a band's background yourself, or its buttons keep the light page's colours and vanish.

## Moments (one or two per page, each its own section)

Copy a moment's markup exactly: the section is a direct child of `<main>` and its block (`.container mo-pc__grid`, `.container mo-ph`) is the section's direct child, with no `.wrap` or extra wrapper between them and no classes added to the moment's own elements. A moment whose structure differs is shown static. Scroll moments are for photographs and renders with real content; a drawing goes on a light panel.

Pinned chapters — one section holds while 2–4 steps change one shared visual (product to product, design to test). One photograph or render per step, in the step's own figure; the `.mo-pc__visuals` frame stays empty (the kit fills it). A case with a drawing and a chart is a `.case`, not a chapter:

```html
<section class="section" data-moment="pinned-chapters">
  <div class="container mo-pc__grid">
    <div class="mo-pc__text"><h2>…</h2>
      <ol class="mo-pc__steps">
        <li class="mo-pc__step"><h3>Step</h3><p>Two lines.</p><figure class="mo-pc__visual"><img src="…" alt="…"></figure></li>
        …
      </ol>
    </div>
    <div class="mo-pc__visuals frame"></div>
  </div>
</section>
```

Photo chapters — 3–5 large photographs uncovered one by one with their chapter text:

```html
<section class="section" data-moment="photo-chapters">
  <div class="container mo-ph">
    <div class="mo-ph__head"><h2>…</h2><p>One line.</p></div>
    <ol class="mo-ph__list"><li class="mo-ph__ch"><figure class="mo-ph__pic"><img src="…" alt="…"></figure><h3>…</h3><p>Two lines.</p></li>…</ol>
  </div>
</section>
```

Counter rolls — real figures roll once: `<div class="grid" data-moment="counter-rolls"><div class="span-3"><p class="t-stat">110 kg</p><p class="t-small muted">最大拉力</p></div>…</div>`.
Picture develops — one large photograph develops once: `<figure class="frame frame--photo" data-moment="picture-develops" style="aspect-ratio:3/2"><img src="…" alt="…"></figure>`.
Headline arrives — hero words rise once: put `data-moment="headline-arrives"` on the hero's text block instead of using `data-enter`.

Product close-up — one product photograph holds while the view moves in on its finest detail (`focus` is that detail's x, y as 0–1 of the picture; `zoom` 1.6–3); two or three notes about what comes into view arrive at their `data-at` progress:

```html
<section class="section" data-moment="product-close-up" data-moment-opts='{"focus":[0.62,0.48],"zoom":2.4}'>
  <div class="container mo-cu__stage">
    <figure class="mo-cu__pic"><img src="…" alt="…"></figure>
    <ol class="mo-cu__notes"><li data-at="0.3"><h3>…</h3><p>…</p></li><li data-at="0.6"><h3>…</h3><p>…</p></li></ol>
  </div>
</section>
```

Giant type pass — two to four words set very large with a photograph passing through the letters: `<section class="section" data-moment="giant-type-pass" data-moment-opts='{"image":"PHOTO_URL"}'><div class="container"><h2 class="mo-gt__type">两到四个<br>字</h2><div class="mo-gt__row"><p>One line.</p></div></div></section>`.
Window parallax — one wide photograph moves slower than the page inside a band frame: `<figure class="frame frame--photo mo-wp" data-moment="window-parallax" style="aspect-ratio:16/7"><img src="…" alt="…"></figure>`.

Write each moment's final state in HTML; the kit animates it and shows the finished state without script or under reduced motion. Never script a moment's elements yourself (no second counter, reveal or parallax on them).

## Closing

```html
<footer class="footer closing" id="contact" aria-labelledby="close-h"><div class="wrap">
  <div class="closing__cta close--type"><div class="section-head"><h2 id="close-h">One line ask</h2></div><a class="btn btn--primary btn--xl" href="mailto:…">Main action</a></div>
  <div class="closing__links"><div class="grid"><div class="span-6"><p class="footer__lede">Address, phone, email</p></div></div>
  <div class="footer__legal"><span>© 2026 Company</span></div></div>
</div></footer>
```

Contact details (address, phone, email, a small logo) go in `.closing__links`; without a photograph or the name across, the kit sets the ask and these details as two balanced columns on a desktop. Do not position or size them yourself.
