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

## Nav

```html
<header class="nav"><div class="wrap nav__bar">
  <a class="nav__logo" href="#top"><img src="LOGO_URL" alt="Brand" height="28"></a>
  <nav class="nav__links" aria-label="主导航"><div class="nav__item"><a class="nav__link" href="#products">产品</a></div>…</nav>
  <div class="nav__actions"><a class="btn btn--primary" href="#contact">联系我们</a></div>
</div></header>
<main id="top"> …sections… </main>
```

Four to six one-word nav items, one primary button.

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

Other heroes in the kit: `hero--split` (words left, picture right), `hero--film` (one full-bleed photograph), `hero--statement` (type-led), `hero--editorial`. Optional proof under the hero words: `<dl class="hero__facts"><div><dt>额定拉力</dt><dd>110 kg</dd></div>…</dl>` (three or four).

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

## Moments (one or two per page, each its own section)

Copy a moment's markup exactly: the section is a direct child of `<main>` and its block (`.container mo-pc__grid`, `.container mo-ph`) is the section's direct child, with no `.wrap` or extra wrapper between them and no classes added to the moment's own elements. A moment whose structure differs is shown static. Scroll moments are for photographs and renders with real content; a drawing goes on a light panel.

Pinned chapters — one section holds while 2–4 steps change one shared visual (product to product, design to test):

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

Write each moment's final state in HTML; the kit animates it and shows the finished state without script or under reduced motion.

## Closing

```html
<footer class="footer closing" id="contact" aria-labelledby="close-h"><div class="wrap">
  <div class="closing__cta close--type"><div class="section-head"><h2 id="close-h">One line ask</h2></div><a class="btn btn--primary btn--xl" href="mailto:…">Main action</a></div>
  <div class="closing__links"><div class="grid"><div class="span-6"><p class="footer__lede">Address, phone, email</p></div></div>
  <div class="footer__legal"><span>© 2026 Company</span></div></div>
</div></footer>
```
