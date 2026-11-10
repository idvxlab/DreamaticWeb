/*
  product-close-up (local addition to the taste-skill moments; same mount(root, opts, lib) contract).
  One product photograph holds on screen while the page scrolls: it starts whole, then the camera
  moves in on one detail (opts.focus, 0-1 of the picture) up to opts.zoom, and two or three short
  notes about what is now in view arrive beside it at their data-at progress. The page scrolls
  natively (sticky stage); reduced motion, no script or a phone: the whole photograph with every
  note shown.

    <section class="section" data-moment="product-close-up" data-moment-opts='{"focus":[0.6,0.45],"zoom":2.2}'>
      <div class="container mo-cu__stage">
        <figure class="mo-cu__pic"><img src="…" alt="…"></figure>
        <ol class="mo-cu__notes"><li data-at="0.35"><h3>…</h3><p>…</p></li>…</ol>
      </div>
    </section>
*/
export default function (root, opts, lib) {
  const pic = root.querySelector(".mo-cu__pic");
  const img = pic && pic.querySelector("img");
  const notes = [...root.querySelectorAll(".mo-cu__notes > li")];
  if (!img) return {};
  const [fx, fy] = Array.isArray(opts.focus) ? opts.focus : [0.5, 0.5];
  const zoom = lib.clamp(Number(opts.zoom) || 2.2, 1.2, 3.5);
  img.style.transformOrigin = `${(fx * 100).toFixed(1)}% ${(fy * 100).toFixed(1)}%`;
  if (lib.reduced()) {
    root.classList.add("is-done");
    notes.forEach((n) => n.classList.add("is-on"));
    return {};
  }
  root.classList.add("is-live");
  const at = notes.map((n, i) => Number(n.dataset.at) || 0.3 + i * 0.25);
  const s = lib.scrub(root, (p) => {
    const e = lib.ease.inOut ? lib.ease.inOut(lib.clamp(p / 0.7)) : lib.clamp(p / 0.7);
    img.style.transform = `scale(${(1 + (zoom - 1) * e).toFixed(4)})`;
    notes.forEach((n, i) => n.classList.toggle("is-on", p >= at[i]));
  });
  return { destroy: () => s.destroy() };
}
