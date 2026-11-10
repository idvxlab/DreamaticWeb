# Page narrative: one subject across sections

Compose the still frames first: one dominant element per viewport, an asymmetric grid, a display-to-body type ratio of at least 3:1 and at most two accents. Motion then connects those frames. Choose ONE subject from the real material (a product photo, its silhouette, a measured curve) and change its state as the visitor moves: enter → reveal detail → compare or apply → resolve. Ambient particles, slow rotation and identical fade-ups on every section are support, never the main event.

All recipes below are native HTML/CSS/JS for a single document: no library, `addEventListener` only, transform/opacity/clip-path only, and content stays readable if the script never runs. Replace class names and copy with your own.

## 1. Sticky stage driven by the active step

```html
<section id="story" class="story" data-state="0">
  <div class="stage"><img id="subject" src="ORIGINAL_ASSET_URL" alt="…"></div>
  <div class="steps">
    <article class="step" data-state="0">…</article>
    <article class="step" data-state="1">…</article>
    <article class="step" data-state="2">…</article>
  </div>
</section>
```

```css
.story{display:grid;grid-template-columns:1.1fr 1fr;gap:4rem;overflow:clip}
.stage{position:sticky;top:12vh;height:76vh;display:grid;place-items:center}
#subject{width:min(42vw,640px);transition:transform .9s cubic-bezier(.2,.7,.1,1),filter .9s}
.story[data-state="1"] #subject{transform:rotate(-18deg) scale(1.15)}
.story[data-state="2"] #subject{transform:translateX(-8%) scale(.85);filter:drop-shadow(0 40px 60px #0006)}
.step{min-height:80vh;display:flex;flex-direction:column;justify-content:center;opacity:.35;transition:opacity .4s}
.step.on{opacity:1}
@media (max-width:760px){.story{grid-template-columns:1fr}.stage{top:0;height:44vh}.step{min-height:64vh}#subject{width:72vw}}
@media (prefers-reduced-motion:reduce){#subject,.step{transition:none}}
```

```js
const story = document.getElementById("story");
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) {
    story.dataset.state = e.target.dataset.state;
    story.querySelectorAll(".step").forEach((s) => s.classList.toggle("on", s === e.target));
  }
}, { rootMargin: "-45% 0px -45% 0px" });
story.querySelectorAll(".step").forEach((s) => io.observe(s));
```

Each `data-state` is a designed frame, not a decoration: different scale, angle, crop or companion data.

## 2. Continuous progress for section handoffs

```js
const scenes = [...document.querySelectorAll("[data-scene]")];
let queued = false;
function update() {
  queued = false;
  for (const s of scenes) {
    const r = s.getBoundingClientRect();
    s.style.setProperty("--p", Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight + r.height))).toFixed(3));
  }
}
addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
addEventListener("resize", update);
update();
```

```css
.hero-title{transform:translateY(calc(var(--p,0) * -30%));opacity:calc(1 - var(--p,0) * 1.4)}
.hero-media{transform:scale(calc(1 + var(--p,0) * .25))}
[data-scene]{overflow:clip}
```

Use `--p` so the outgoing section's subject hands its position, colour or scale to the next one, instead of each section starting from nothing.

## 3. Masked reveal for real evidence

```css
.reveal>*{clip-path:inset(0 0 100% 0);transition:clip-path 1.1s cubic-bezier(.7,0,.2,1)}
.reveal.in>*{clip-path:inset(0)}
@media (prefers-reduced-motion:reduce){.reveal>*{clip-path:none;transition:none}}
```

```js
const once = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); once.unobserve(e.target); }
}, { threshold: .25 });
document.querySelectorAll(".reveal").forEach((el) => once.observe(el));
```

Observe the unclipped wrapper (`<figure class="reveal"><img …></figure>`): a fully clipped element is never reported as visible. Clip any layer you scale (`overflow:clip` keeps sticky working) so the page never scrolls sideways. Reveal photos, drawings and charts at full legibility; never crop a chart or label for effect.

## Check before delivering

The hero frame alone reads as a deliberate composition. The subject is visibly different in at least three states. Mobile keeps the subject on screen above the text. Reduced motion shows every final state.
