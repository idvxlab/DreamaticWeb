# Blocks

Intro with its facts (never words alone on half a row):

```html
<div class="lede"><p class="lede__text">Two or three sentences on who they are and for whom.</p>
  <dl class="lede__facts"><div><dt>成立</dt><dd>2014</dd></div><div><dt>学员</dt><dd>25 万+</dd></div>…</dl></div>
```

Brands side by side (two or three, equal):

```html
<div class="brands">
  <article class="brand"><img class="brand__logo" src="LOGO" alt="…"><h3>VipSkill</h3><p>One line.</p>
    <dl class="brand__rows"><div><dt>愿景</dt><dd>…</dd></div><div><dt>使命</dt><dd>…</dd></div></dl>
    <img class="brand__art" src="MASCOT" alt="…" data-kind="illustration"></article>…
</div>
```

Milestones across the width, alternating sides of the axis (a picture is optional, a photograph in a fixed frame):

```html
<ol class="timeline">
  <li class="timeline__item"><p class="timeline__year">2014</p><h3>…</h3><p>…</p>
    <figure class="timeline__pic"><img src="…" alt="…" data-kind="photo"></figure></li>…
</ol>
```

Offers — services, courses, features (rows fill evenly, the last row centred; a small icon or a number, never an enlarged graphic):

```html
<ul class="offers">
  <li class="offer"><img class="offer__icon" src="ICON" alt=""><h3>研发交流</h3><p>Two lines.</p></li>
  <li class="offer"><p class="offer__n">02</p><h3>…</h3><p>…</p></li>…
</ul>
```

Gallery — events, places, people (photographs only, one frame for all):

```html
<ul class="gallery"><li><figure><img src="…" alt="…" data-kind="photo"></figure><p>Open Day · 2023</p></li>…</ul>
```

Logo wall — partners, certifications, platforms:

```html
<ul class="logos"><li><img src="…" alt="Partner"></li>…</ul>
```
