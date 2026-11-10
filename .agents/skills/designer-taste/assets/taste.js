/* designer-taste kit: adapted from taste-skill (MIT, Leonxlnx). Inlined by the host. */
(function () {
/*
  taste-skill motion.js - the moving half of the micro-interaction layer (motion.css is the rest).
  Load it once, after system.js (motion.css needs no attribute; <html data-motion="off"> turns the layer off, JS too):
    <script type="module" src="assets/motion/motion.js"><\/script>
  It starts by itself. references/motion.md says what moves and how fast.

  - the hero's entrance: .hero[data-enter] enters once on load (the h1 line by line, then the lead,
    the buttons and the facts, the picture settling), about 1.1 s, when the head line set html.m-enter
    before the first paint:
    <script>document.documentElement.classList.add('m-enter');setTimeout(()=>document.documentElement.classList.add('m-enter-done'),700)<\/script>

  - nav: .m-menu-open from the moment a menu starts to show (150ms of intent), so the next word swaps the panel at once
    instead of waiting 150ms again; it stays while the pointer is on the word or its panel.
  - tabs: every .tabs[role=tablist] gets one indicator that slides to the selected tab (system.js
    still selects; this follows aria-selected).
  - numbers: [data-m-count] on a stat ticks from 0 to its own text once, when 60% of it is on
    screen (1.2 s, ease-out); prefix, suffix, decimals and thousands separators are kept. The
    number's width is measured once the web fonts are in and again when it is first seen (a stat
    in a hidden tab), so nothing beside it moves; a stat the observer never reports shows its own
    text after 6 s on screen. A headless screenshot (HeadlessChrome) sees the final number unless
    <html data-motion="live">.
  - loops: [data-m-loop] marks a panel (or any box) whose CSS keyframe loops the page wrote itself;
    they pause off screen, restart when the pointer enters the card around them, and get the
    system's pause button (one per panel, shared with ui.js). ui.js restarts its own fragments.
  - switches: a click on .m-switch flips aria-checked unless a handler before it called
    preventDefault().
  Under prefers-reduced-motion: no entrance, no indicator travel, no tick, no loops, no restart.
*/
const html = document.documentElement;
const reducedQ = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => reducedQ.matches;
const shot = () => /HeadlessChrome/.test(navigator.userAgent) && html.dataset.motion !== 'live';
const jump = (el, on) => { el.classList.toggle('is-jump', on); };

/* ---------------------------------------------------------------- nav */
function nav() {
  const bar = document.querySelector('.nav');
  const links = bar?.querySelector('.nav__links');
  if (!links || bar.dataset.mNav) return;
  bar.dataset.mNav = '1';   // no pill under the words (ST-08, ST-11): system.css draws their underline

  // one menu open: the next word swaps the panel at once (figma.com); leaving the bar closes softly
  let t = 0;
  bar.querySelectorAll('.nav__item').forEach(item => {
    const has = !!item.querySelector('.nav__menu');
    item.addEventListener('pointerenter', () => {
      clearTimeout(t);
      // 150ms: the panel has started to show (motion.css lets it finish its own fade)
      if (has) t = setTimeout(() => bar.classList.add('m-menu-open'), 150);
      else bar.classList.remove('m-menu-open');
    });
  });
  bar.addEventListener('pointerleave', () => { clearTimeout(t); bar.classList.remove('m-menu-open'); });
}

/* ---------------------------------------------------------------- tabs */
function tabs() {
  document.querySelectorAll('.tabs[role="tablist"], [role="tablist"].m-tabs').forEach(list => {
    if (!list.querySelector('[role="tab"]') || list.querySelector(':scope > .m-tab-ind')) return;
    const ind = document.createElement('span');
    ind.className = 'm-tab-ind';
    ind.setAttribute('aria-hidden', 'true');
    list.prepend(ind);
    list.classList.add('m-has-ind');
    let instant = true, at = null;
    const set = (b, sx = 1, sy = 1) => {
      ind.style.setProperty('--x', `${b.x}px`); ind.style.setProperty('--y', `${b.y}px`);
      ind.style.setProperty('--w', `${b.w}px`); ind.style.setProperty('--h', `${b.h}px`);
      ind.style.setProperty('--sx', String(sx)); ind.style.setProperty('--sy', String(sy));
    };
    // the pill travels by transform only: it takes the new tab's size at once, is drawn scaled to the
    // old tab's size at the old place, and settles to scale 1 at the new place (motion.css)
    const place = () => {
      const sel = list.querySelector('[role="tab"][aria-selected="true"]');
      if (!sel) { ind.style.opacity = '0'; return; }
      ind.style.opacity = '';
      const to = { x: sel.offsetLeft, y: sel.offsetTop, w: sel.offsetWidth, h: sel.offsetHeight };
      if (instant || reduced() || !at || !to.w || !to.h) { jump(ind, true); set(to); ind.getBoundingClientRect(); jump(ind, false); }
      else {
        jump(ind, true);
        set({ ...to, x: at.x, y: at.y }, at.w / to.w, at.h / to.h);
        ind.getBoundingClientRect();
        jump(ind, false);
        set(to);
      }
      at = to;
      instant = false;
    };
    place();
    new MutationObserver(place).observe(list, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
    new ResizeObserver(() => { instant = true; place(); }).observe(list);
    document.fonts?.ready.then(() => { instant = true; place(); });
  });
}

/* ---------------------------------------------------------------- numbers */
// the first number in the element's text: "8,402", "4.2", "64%", "EUR 1.200", "12k"
// separators: . , and the no-break spaces (U+00A0, U+202F); a plain space ends the number ("12 4 h" is 12)
const NUM = /\d+(?:[.,\u00A0\u202F]\d+)*/;
function parse(text) {
  const m = text.match(NUM);
  if (!m) return null;
  const raw = m[0];
  const seps = raw.match(/[^\d]/g) || [];
  let dec = '', group = '', decimals = 0;
  const lastSep = raw.search(/[^\d](?=\d+$)/);
  if (lastSep >= 0) {
    const tail = raw.length - lastSep - 1;
    // a last separator before exactly three digits groups thousands; otherwise it is the decimal point
    if (tail === 3 && !(seps.length === 1 && raw[lastSep] === '.' && /^0/.test(raw))) group = raw[lastSep];
    else { dec = raw[lastSep]; decimals = tail; group = seps.length > 1 ? seps[0] : ''; }
  }
  const intPart = dec ? raw.slice(0, lastSep) : raw;
  const value = parseFloat(intPart.replace(/[^\d]/g, '') + (dec ? '.' + raw.slice(lastSep + 1) : ''));
  return { index: m.index, raw, value, dec, group, decimals };
}
function format(v, p) {
  let [i, d] = v.toFixed(p.decimals).split('.');
  if (p.group) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, p.group);
  return d ? i + p.dec + d : i;
}
// the web fonts, or 3 s at most: a number measured in the fallback font comes out narrower
const fontsIn = () => Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise(r => setTimeout(r, 3000))]);
function counts() {
  const els = [...document.querySelectorAll('[data-m-count]')].filter(el => !el.__mCount);
  if (!els.length || reduced() || shot()) return;
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) e.target.__mCount?.hit(); }), { threshold: 0.6 });
  const ro = new ResizeObserver(es => es.forEach(e => e.target.__mCount?.arm()));
  const items = [];
  els.forEach(el => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node, p;
    while ((node = walk.nextNode()) && !(p = parse(node.data))) { /* next */ }
    if (!node || !p) return;
    // the number gets its own span, as wide as the final number and right-aligned, so nothing beside it
    // moves. Until it is measured it shows its own text, never a 0
    const after = node.splitText(p.index);
    after.splitText(p.raw.length);
    const span = document.createElement('span');
    span.className = 'm-count__n';
    span.style.display = 'inline-block';
    span.style.textAlign = 'right';
    span.textContent = p.raw;
    after.replaceWith(span);
    const ms = +el.dataset.mCount || 1200;
    let state = 'wait', timer = 0;          // wait (own text) -> armed (0, width held) -> run -> done
    const stop = () => { clearTimeout(timer); io.unobserve(el); ro.unobserve(el); };
    const onScreen = () => {
      const r = span.getBoundingClientRect();
      return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && document.visibilityState === 'visible';
    };
    // the safety net: a stat on screen for 6 s that the observer never reported shows its own text
    const watch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (state !== 'armed') return;
        if (onScreen()) { state = 'done'; stop(); span.textContent = p.raw; } else watch();
      }, 6000);
    };
    const ctl = {
      /** measure the final number in the page's font and hold its width; false while it has none (hidden) */
      arm() {
        if (state === 'run' || state === 'done') return false;
        span.textContent = p.raw;
        span.style.minWidth = '';
        const w = span.getBoundingClientRect().width;
        if (!w) { state = 'wait'; clearTimeout(timer); return false; }
        span.style.minWidth = `${w}px`;
        span.textContent = format(0, p);
        if (state !== 'armed') { state = 'armed'; watch(); }
        return true;
      },
      /** print: stop waiting and show the written number */
      show() { if (state === 'done') return; state = 'done'; stop(); span.textContent = p.raw; },
      /** first seen: measure again (a font or a tab that changed since), then tick once */
      hit() {
        if (state === 'run' || state === 'done' || !ctl.arm()) return;
        state = 'run';
        stop();
        const t0 = performance.now();
        const step = now => {
          const k = Math.min(1, (now - t0) / ms);
          span.textContent = k < 1 ? format(p.value * (1 - Math.pow(1 - k, 4)), p) : p.raw;
          if (k < 1) requestAnimationFrame(step); else state = 'done';
        };
        requestAnimationFrame(step);
      },
    };
    el.__mCount = ctl;
    items.push(el);
  });
  // measured only once the fonts are in; the resize observer measures again when a hidden stat shows
  fontsIn().then(() => items.forEach(el => { el.__mCount.arm(); ro.observe(el); io.observe(el); }));
  // a printed page never scrolls the stats into view: each prints its own number
  addEventListener('beforeprint', () => items.forEach(el => el.__mCount.show()));
}

/* ---------------------------------------------------------------- loops inside cards */
const ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4.25" y="3.25" width="2.75" height="9.5" rx="0.9"/><rect x="9" y="3.25" width="2.75" height="9.5" rx="0.9"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.25 3.7v8.6c0 .62.68 1 1.2.66l6.5-4.3c.47-.31.47-1 0-1.32l-6.5-4.3c-.52-.34-1.2.04-1.2.66Z"/></svg>';
const boxOf = el => el.closest('[data-ui-pause-host], .panel__screen, .panel, .frame') || el;
const hostOf = el => el.closest('.card, .tile, .menu-card, a') || boxOf(el);

function restart(loop) {
  if (reduced() || loop.classList.contains('is-m-paused')) return;
  // the page's keyframe loops only: a hover transition in the panel (the pause button's) is no cycle.
  // ui.js fragments in the card restart by themselves
  const anims = loop.getAnimations({ subtree: true }).filter(a => typeof CSSAnimation === 'function' && a instanceof CSSAnimation);
  if (!anims.length) return;
  const dur = a => Number(a.effect?.getComputedTiming().duration) || 0;
  const main = anims.reduce((m, a) => (dur(a) > dur(m) ? a : m));
  const d = dur(main), t = Number(main.currentTime) || 0;
  // restart only when the cycle is past its first quarter, so a quick in-and-out never stutters
  if (!d || (t % d) / d > 0.25) anims.forEach(a => { a.currentTime = 0; });
}
function setPaused(box, paused) {
  box.querySelectorAll('[data-m-loop]').forEach(l => l.classList.toggle('is-m-paused', paused));
  if (box.matches('[data-m-loop]')) box.classList.toggle('is-m-paused', paused);
}
function pauseButton(loop) {
  const box = boxOf(loop);
  if (box.querySelector(':scope > .loop-pause')) return;   // ui.js or the page put one there: it is shared
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'loop-pause m-own';
  const show = paused => {
    btn.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
    btn.setAttribute('aria-label', `${paused ? 'Play' : 'Pause'} animation`);
    btn.title = btn.getAttribute('aria-label');
    btn.classList.toggle('is-paused', paused);
  };
  show(false);
  if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
  box.append(btn);
  btn.__show = show;
}
function loops() {
  const els = [...document.querySelectorAll('[data-m-loop]')].filter(el => !el.__mLoop);
  if (!els.length) return;
  if (reduced() || matchMedia('(max-width: 639px)').matches) return;   // motion.css holds them on their finished picture
  const io = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('is-m-off', !e.isIntersecting)), { rootMargin: '48px' });
  els.forEach(el => {
    el.__mLoop = true;
    io.observe(el);
    pauseButton(el);
    hostOf(el).addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') restart(el); });   // a mouse or pen, never a tap
    hostOf(el).addEventListener('focusin', e => { if (!e.target.closest('.loop-pause')) restart(el); });
  });
}
// one listener for every pause button: its own (m-own) toggles; a ui.js one is mirrored after ui.js ran
document.addEventListener('click', e => {
  const btn = e.target.closest('.loop-pause');
  if (!btn) return;
  const box = btn.parentElement;
  if (btn.classList.contains('m-own')) {
    const paused = !btn.classList.contains('is-paused');
    btn.__show(paused);
    setPaused(box, paused);
    box.querySelectorAll('[data-ui]').forEach(r => { try { paused ? r.__ui?.pause() : r.__ui?.resume(); } catch { /* none */ } });
  } else setPaused(box, btn.classList.contains('is-paused'));
});

/* ---------------------------------------------------------------- switches */
document.addEventListener('click', e => {
  const sw = e.target.closest('.m-switch');
  if (!sw || e.defaultPrevented) return;
  sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true'));
});

/* ---------------------------------------------------------------- the hero's entrance */
// Once, on load (motion.md, The hero's entrance): the h1 rises line by line out of its masks, then what
// follows it (the lead, each button, the facts) fades up 60ms apart, while the picture settles from a
// slight scale; about 1.1 s in all, ease-out, transform and opacity only. motion.css hides the words
// (never the picture) only while the head line's html.m-enter is on and its 700ms safety mark
// (m-enter-done) is not; the picture waits at its start scale and settles by a CSS transition, so it
// never blinks however late this file is. Without script, under reduced motion and in print the hero
// simply stands; when this file is later than the mark, the words fade in by CSS and the hero stands.
// The h1 gets its word masks for the length of the entrance and its own nodes back afterwards.
const ENTER_MEDIA = '[data-enter-media], .hero__bg, .hero__media, .hero__stage, .hero__art, .hero__window, .hero-visual, .ly-collage';
const ENTER_TEXT = 'h1 ~ *, :has(> h1) ~ *, :has(~ h1)';
const ENTER_LEAF = 'p, dl, ul, ol, a, button, img, picture, video, figure, blockquote, h2, h3, .pill, .btn';
function maskWords(h1) {
  // an h1 another script reworks (layout.js: a live word, letters, a picture in the line) rises whole
  if (h1.matches('[data-ly-letters], [data-enter-whole]') || h1.querySelector('.ly-word, .ly-pic, .ly-mark, svg, img')) return null;
  const own = document.createDocumentFragment();
  own.append(...h1.childNodes);
  const copy = own.cloneNode(true);
  const words = [];
  const walk = node => [...node.childNodes].forEach(n => {
    if (n.nodeType === 1) return walk(n);
    if (n.nodeType !== 3) return;
    const frag = document.createDocumentFragment();
    n.textContent.split(/(\s+)/).forEach(part => {
      if (!part) return;
      if (/^\s+$/.test(part)) { frag.append(part); return; }
      const w = document.createElement('span'), i = document.createElement('span');
      w.className = 'm-w'; i.className = 'm-w__in'; i.textContent = part;
      w.append(i); frag.append(w); words.push(w);
    });
    n.replaceWith(frag);
  });
  walk(copy);
  const label = h1.hasAttribute('aria-label');
  if (!label) h1.setAttribute('aria-label', own.textContent.replace(/\s+/g, ' ').trim());
  h1.append(copy);
  h1.querySelectorAll('.m-w').forEach(w => w.setAttribute('aria-hidden', 'true'));
  // words grouped into the lines the browser set them on
  const lines = [];
  let top = null;
  words.forEach(w => { const t = w.getBoundingClientRect().top; if (top === null || Math.abs(t - top) > 3) { lines.push([]); top = t; } lines[lines.length - 1].push(w.firstChild); });
  return { lines, restore() { h1.replaceChildren(own); if (!label) h1.removeAttribute('aria-label'); } };
}
function enterSteps(hero, h1, media) {
  // what follows (and precedes) the h1 in its column, as whole blocks in reading order; a box of
  // layout (a div with no words of its own) is opened, a button row gives one step a button.
  // A picture, window or collage (or a box round one) is never opened: it stands as one block and
  // settles by itself (motion.css), even when it carries words of its own (a menu card, a note)
  const out = [];
  const take = el => {
    if (el === h1 || el.contains(h1) || out.includes(el) || el.matches('img, picture, video, canvas, .frame__img')) return;
    if (media.includes(el) || media.some(m => el.contains(m))) return;
    if (el.matches('.btn-row')) { [...el.children].forEach(take); return; }
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (own || !el.children.length || el.matches(ENTER_LEAF)) out.push(el);
    else [...el.children].forEach(take);
  };
  hero.querySelectorAll(ENTER_TEXT).forEach(take);
  return out.filter(el => !el.closest('[aria-hidden="true"]') && !out.some(o => o !== el && o.contains(el)))
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}
function enter() {
  const hero = document.querySelector('.hero[data-enter]:not([data-enter="off"])');
  if (!hero || hero.classList.contains('is-entered') || hero.classList.contains('is-entering')) return;
  // still: the picture takes its place at once (no settle); otherwise the CSS settle and fade run out first
  const done = (still = false) => { if (still) hero.classList.add('is-still'); hero.classList.add('is-entered'); };
  const late = () => setTimeout(done, 1150);
  // the head line did not run, reduced motion, a headless shot (it sees the hero at rest, as it sees the
  // final number, unless data-motion="live") or the visitor is already below the hero (a reload half way
  // down): the hero stands as written. The safety mark has passed: motion.css is fading the words in and
  // settling the picture; the hero is marked done once they are through
  if (!html.classList.contains('m-enter') || reduced() || shot() || hero.getBoundingClientRect().bottom < 0) return done(true);
  if (html.classList.contains('m-enter-done')) return late();
  const h1 = hero.querySelector('h1');
  if (!h1) return done(true);
  const media = [...hero.querySelectorAll(ENTER_MEDIA)].filter((m, i, all) => !all.some(o => o !== m && o.contains(m)));
  const steps = enterSteps(hero, h1, media);
  const EASE = 'cubic-bezier(.22, 1, .36, 1)';
  const anims = [];
  let masks = null, over = false;
  const finish = () => {
    if (over) return;
    over = true;
    anims.forEach(a => { try { a.cancel(); } catch { /* gone */ } });
    masks?.restore();
    hero.classList.remove('is-entering');
    done();
  };
  // the fonts first (a line set in the fallback face breaks elsewhere), 250ms at most: the words are
  // hidden meanwhile, so nothing is seen twice
  Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise(r => setTimeout(r, 250))]).then(() => {
    if (html.classList.contains('m-enter-done') && !hero.classList.contains('is-entering')) { over = true; return late(); }   // the safety mark won: CSS shows it
    masks = maskWords(h1);
    // .is-entering ends the CSS hold: the words are held by their animations from here, and the
    // picture starts its CSS settle in the same frame
    hero.classList.add('is-entering');
    const lines = masks ? masks.lines : [[h1]];
    const lineStep = Math.min(80, 240 / Math.max(1, lines.length - 1));
    // a word starts wholly below its mask, which reaches .12em under the line: no tops show before it rises
    lines.forEach((ws, k) => ws.forEach(w => anims.push(w.animate(masks
      ? [{ transform: 'translateY(calc(100% + .2em))' }, { transform: 'none' }]
      : [{ transform: 'translateY(.35em)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 700, delay: 80 + k * lineStep, easing: EASE, fill: 'both' }))));
    // a line above the h1 (a notice, a pill) comes with its first line; what follows starts as its
    // last line is half way up
    const after = 80 + (lines.length - 1) * lineStep + 220;
    let k = 0;
    steps.forEach(el => {
      const above = !!(el.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING);
      // the rise is added to whatever transform the part has of its own; the fade replaces its opacity
      const t = { duration: 520, delay: above ? 40 : after + Math.min(k++, 6) * 60, easing: EASE, fill: 'both' };
      anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], t), el.animate([{ transform: 'translateY(12px)' }, { transform: 'none' }], { ...t, composite: 'add' }));
    });
    // a panel the words sit on stands from the first paint (it was never hidden, so it never blinks);
    // the pictures settle by CSS over 1.1 s: the hero is done when both are through
    anims.push({ finished: new Promise(r => setTimeout(r, 1150)), cancel() {} });
    Promise.all(anims.map(a => a.finished)).then(finish, finish);
  }).catch(finish);
  setTimeout(finish, 2400);   // whatever stalls (a hidden tab), the hero stands after 2.4 s
}

/* ---------------------------------------------------------------- start */
function init() {
  if (html.dataset.motion === 'off') { html.classList.add('m-enter-done'); return; }
  if (!html.hasAttribute('data-motion')) html.setAttribute('data-motion', '');
  try { enter(); } catch (e) { console.warn('motion.js: enter', e); document.querySelector('.hero[data-enter]')?.classList.add('is-entered'); }
  try { nav(); } catch (e) { console.warn('motion.js: nav', e); }
  try { tabs(); } catch (e) { console.warn('motion.js: tabs', e); }
  try { counts(); } catch (e) { console.warn('motion.js: counts', e); }
  try { loops(); } catch (e) { console.warn('motion.js: loops', e); }
}
/** call again after the page adds markup (a tab list, a stat, a loop) */



if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();

})();
(function () {
const M = {};
/*
  moments/lib.js - the few helpers every moment shares (taste-skill). One ES module, no dependencies.

  reduced()            true under prefers-reduced-motion: a moment then shows its finished state only
  phone()              true on a phone: under 640px wide, or a touch screen in landscape under 500px tall
                       (a phone turned sideways). A moment shows its finished state there too, unless
                       its module says `export const phone = true` (word-highlight, picture-develops,
                       photo-chapters: light enough to run there).
  still()              reduced() || phone(): the one question every moment asks. The loader (moments.js)
                       hands each moment a lib whose reduced() answers still() (only reduced() for a
                       moment that runs on a phone), so a moment written against reduced() is static
                       where it must be, and sets data-moment-still on its host ("reduced" or "phone").
                       The answer is taken once, when the page loads.
  coarse()             true on a touch screen (no hover moments there)
  inCard(el)           true when el is, or sits in, a card, a plan, a result or a bento cell: nothing
                       on a card ever moves on scroll, so the loader leaves such a moment still
  scrub(el, fn, opts)  calls fn(progress, rect) from a requestAnimationFrame while el is near the
                       screen. mode 'hold' (default): 0 when el's top reaches the viewport top, 1 when
                       its bottom reaches the viewport bottom (a pinned stage's run). mode 'view': 0 when
                       el's top enters at the bottom edge, 1 when its bottom leaves at the top.
                       Returns { destroy, update }. Nothing is captured: the page scrolls natively.
  once(el, fn, opts)   fn once: when `threshold` of el is on screen, or el covers that share of the screen (a
                       target taller than the screen can never show it), or part of it has stayed on screen
                       for opts.rescue ms (3000), or the observer has not reported at all after 1.5 s of a
                       visible page. Nothing waits for ever. Returns { destroy }.
  split(el, unit)      wraps the words ('words') or letters ('chars') of el in spans
                       (.mo-w, .mo-c, each with an inner .mo-i that moves) and keeps the text readable:
                       the host gets aria-label, the spans aria-hidden. Returns the inner spans.
  lines(words)         groups word spans into lines by their offsetTop; returns an array of arrays.
  fontsReady(ms)       resolves when the fonts are loaded, or after ms.
  clamp, lerp, ease    the maths.
*/
const rq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const reduced = () => !!(rq && rq.matches);
const pq = typeof matchMedia === 'function' ? [matchMedia('(max-width: 639px)'), matchMedia('(pointer: coarse) and (max-height: 499px) and (max-width: 959px)')] : [];
const phone = () => pq.some(q => q.matches);
const still = () => reduced() || phone();
const stillWhy = () => (reduced() ? 'reduced' : phone() ? 'phone' : '');
const inCard = el => !!(el && el.closest && el.closest('.card, .plan, .result, .knock, [data-card], .bento > *'));
const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = {
  out: t => 1 - Math.pow(1 - t, 3),
  quint: t => 1 - Math.pow(1 - t, 5),
  expo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  smooth: (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); },
};

function scrub(el, fn, { mode = 'hold', margin = '25% 0px' } = {}) {
  // on from the start, with the scroll listener: an observer that never reports (a dead stub, a page it cannot reach) leaves the
  // moment following the scroll instead of frozen at its first state; the observer turns it off when the target is far away
  let on = true, raf = 0, last = -1;
  const tick = () => {
    raf = 0;
    if (!on) return;
    const r = el.getBoundingClientRect(), vh = innerHeight;
    let p = mode === 'view' ? (vh - r.top) / (vh + r.height) : -r.top / Math.max(1, r.height - vh);
    p = clamp(p);
    if (p !== last) { last = p; fn(p, r); }
  };
  const req = () => { if (!raf) raf = requestAnimationFrame(tick); };
  const io = new IntersectionObserver(es => {
    on = es[es.length - 1].isIntersecting;
    removeEventListener('scroll', req); removeEventListener('resize', req);
    if (on) { addEventListener('scroll', req, { passive: true }); addEventListener('resize', req); req(); }
  }, { rootMargin: margin });
  io.observe(el);
  addEventListener('scroll', req, { passive: true }); addEventListener('resize', req); req();
  return {
    update: () => { last = -1; req(); },
    destroy() { io.disconnect(); removeEventListener('scroll', req); removeEventListener('resize', req); if (raf) cancelAnimationFrame(raf); },
  };
}

function once(el, fn, { threshold = 0.35, margin = '0px', rescue = 3000 } = {}) {
  // fn runs once when `threshold` of el is on screen, or el covers that share of the screen (a target taller
  // than the screen can never show `threshold` of itself), or any part of it has stayed on screen for `rescue`
  // ms. An observer that has not reported at all after 1.5 s of a visible page runs fn too: nothing waits for ever
  let timer = 0, starve = 0, done = false;
  const go = () => { if (done) return; done = true; clearTimeout(timer); clearTimeout(starve); io.disconnect(); fn(); };
  const steps = [0];
  for (let t = 0.1; t < threshold - 1e-6; t += 0.1) steps.push(+t.toFixed(2));
  steps.push(threshold);
  const io = new IntersectionObserver(es => {
    clearTimeout(starve);
    const e = es[es.length - 1];
    if (!e.isIntersecting) { clearTimeout(timer); timer = 0; return; }
    const vh = e.rootBounds ? e.rootBounds.height : innerHeight;
    if (e.intersectionRatio >= threshold || e.intersectionRect.height >= vh * threshold) return go();
    if (!timer) timer = setTimeout(go, rescue);
  }, { threshold: steps, rootMargin: margin });
  const wait = () => { starve = setTimeout(() => (document.hidden ? wait() : go()), 1500); };
  wait();
  io.observe(el);
  return { destroy() { done = true; clearTimeout(timer); clearTimeout(starve); io.disconnect(); } };
}

function split(el, unit = 'words') {
  if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
  const inners = [];
  const wrap = (text, cls) => {
    const s = document.createElement('span');
    s.className = cls;
    const i = document.createElement('span');
    i.className = 'mo-i';
    i.textContent = text;
    s.append(i);
    inners.push(i);
    return s;
  };
  const walk = node => {
    [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(' '); return; }
          if (unit === 'chars') {
            const w = document.createElement('span');
            w.className = 'mo-w';
            for (const ch of part) w.append(wrap(ch, 'mo-c'));
            frag.append(w);
          } else frag.append(wrap(part, 'mo-w'));
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && !n.classList.contains('mo-w')) {
        // a link or button inside keeps its name: its words are hidden with the rest, so it is named first
        if (n.matches('a[href], button') && !n.getAttribute('aria-label') && n.textContent.trim()) n.setAttribute('aria-label', n.textContent.replace(/\s+/g, ' ').trim());
        walk(n);
      }
    });
  };
  walk(el);
  el.querySelectorAll('.mo-w').forEach(w => w.setAttribute('aria-hidden', 'true'));
  return inners;
}

function lines(words) {
  const out = [];
  let top = null;
  for (const w of words) {
    const t = w.offsetTop;
    if (top === null || Math.abs(t - top) > 2) { out.push([]); top = t; }
    out[out.length - 1].push(w);
  }
  return out;
}

const fontsReady = (ms = 900) => Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, ms))]);

/*
  blocks(root, skip)   the section's words and pictures as whole blocks, for a moment that uncovers a section with a
                       clip (a disc, a line): a block is a heading, paragraph, list item, button, link, picture, UI
                       window or any element that carries text of its own, outermost first (a frame with its own
                       text is one block). A clip that slices through a block cuts its words mid-move, so such a
                       moment keeps each block invisible until the clip has passed the whole of it, then fades it
                       in whole. Returns { list, measure, set, release }:
    list      [{ el, l, t, r, b }] with the box of each block in root's own coordinates (set by measure)
    measure() reads the boxes again (call when the root's size changes or the fonts arrive)
    set(fn)   fn(block) -> opacity 0-1 for every block; 1 puts the element's own inline opacity back
    release() every block as it was
  skip: elements (the moment's own layers) that are never a block.
*/
const BLOCK = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,figcaption,label,a,button,img,picture,video,canvas,svg,table,figure,.frame,.dw,[data-moment-block]';
function blocks(root, skip = []) {
  const list = [];
  const walk = el => {
    for (const c of el.children) {
      if (skip.includes(c) || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(c.tagName)) continue;
      const own = [...c.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (c.matches(BLOCK) || own) list.push({ el: c, was: c.style.opacity, l: 0, t: 0, r: 0, b: 0 });
      else walk(c);
    }
  };
  walk(root);
  const measure = () => {
    const rr = root.getBoundingClientRect();
    for (const b of list) {
      const r = b.el.getBoundingClientRect();
      b.l = r.left - rr.left; b.t = r.top - rr.top; b.r = r.right - rr.left; b.b = r.bottom - rr.top;
    }
  };
  measure();
  const set = fn => { for (const b of list) { const o = fn(b); b.el.style.opacity = o >= 0.999 ? b.was : (o <= 0 ? '0' : o.toFixed(3)); } };
  const release = () => { for (const b of list) b.el.style.opacity = b.was; };
  return { list, measure, set, release };
}


M["pinned-chapters"] = { phone: false, mount: (function () {
/*
  pinned-chapters - one section holds on screen while the visitor scrolls through its three (2 to 4)
  steps: the step in hand opens its two lines at the left, the one visual at the right changes to that
  step's picture or screen with a short crossfade and settle. The page scrolls natively (the stage is
  position: sticky); nothing else on the page moves. From 1024px on a screen at least 640px tall;
  otherwise, under reduced motion and without script the section is static: from 640px a row per
  step (text left, visual right, at most 30svh tall), below that every step stands with its visual
  under it (16:9).

    <section class="section" data-moment="pinned-chapters">
      <div class="container mo-pc__grid">
        <div class="mo-pc__text">
          <h2>How editors work with it</h2>
          <ol class="mo-pc__steps">
            <li class="mo-pc__step">
              <h3>Step title</h3><p>Two lines.</p>
              <figure class="mo-pc__visual"><img …></figure>          its picture, or a drawn window
            </li>
            …
          </ol>
        </div>
        <div class="mo-pc__visuals frame"></div>                     the shared frame, empty in the HTML
      </div>
    </section>

  The stage holds for one screen of scroll, so the live section is exactly two screens (layout-v4.md);
  with 2 to 4 steps each step gets a quarter to a half of a screen of scroll.
*/
return function (root, opts, lib) {
  const steps = [...root.querySelectorAll('.mo-pc__step')];
  const frame = root.querySelector('.mo-pc__visuals');
  const figures = steps.map(s => s.querySelector('.mo-pc__visual'));
  if (steps.length < 2 || !frame || figures.some(f => !f)) return {};
  const homes = figures.map(f => f.parentElement);
  // the section stays exactly two screens (layout-v4.md: 1H or 2H), so the stage holds for one screen of scroll
  const hold = 1;
  root.style.setProperty('--mo-hold', String(hold));
  // each step's lines in a span of their own, so a closed step can collapse to nothing (moment.css)
  steps.forEach(s => {
    const p = s.querySelector('p');
    if (!p || p.querySelector('.mo-pc__p-in')) return;
    const w = document.createElement('span');
    w.className = 'mo-pc__p-in';
    while (p.firstChild) w.append(p.firstChild);
    p.append(w);
  });
  const grid = root.querySelector('.mo-pc__grid');
  let live = false, scrubber = null, k = -1;
  const wide = () => matchMedia('(min-width: 1024px)').matches;
  const fits = () => !lib.reduced() && wide() && innerHeight >= 640;
  const show = i => {
    if (i === k) return;
    k = i;
    steps.forEach((s, n) => s.classList.toggle('is-on', n === i));
    figures.forEach((f, n) => { f.classList.toggle('is-on', n === i); f.classList.toggle('is-past', n < i); });
  };
  const go = () => {
    if (live) return;
    live = true;
    // the scrub first: if it throws (no IntersectionObserver), nothing has been moved or hidden yet
    scrubber = lib.scrub(root, p => show(Math.min(steps.length - 1, Math.floor(p * steps.length))));
    root.classList.add('is-live');
    grid?.setAttribute('data-edge-free', '');   // live the grid is one screen of a two-screen section: the layout check skips it (the rest rows are checked)
    figures.forEach(f => frame.append(f));
    show(0);   // step 1 open before the first scroll tick: a scrub that never ticks still shows a step and its visual
  };
  const rest = () => {
    if (!live) return;
    live = false;
    root.classList.remove('is-live');
    grid?.removeAttribute('data-edge-free');
    scrubber?.destroy(); scrubber = null;
    figures.forEach((f, n) => { homes[n].append(f); f.classList.remove('is-on', 'is-past'); });
    steps.forEach(s => s.classList.remove('is-on'));
    k = -1;
  };
  const sync = () => { const f = fits(); if (f) go(); else rest(); root.classList.toggle('is-static', !f && wide()); };
  sync();
  let t = 0;
  const onResize = () => { clearTimeout(t); t = setTimeout(sync, 120); };
  addEventListener('resize', onResize);
  const rq = matchMedia('(prefers-reduced-motion: reduce)');
  rq.addEventListener('change', sync);   // a preference changed after load: go static (or live) at once
  return { destroy() { removeEventListener('resize', onResize); rq.removeEventListener('change', sync); rest(); root.classList.remove('is-static'); } };
}

})() };

M["photo-chapters"] = { phone: true, mount: (function () {
/*
  photo-chapters - a short story told in three to five photographs, one large frame at a time. The
  section holds on screen while the page scrolls: its h2 and lead at the top, below them one big
  photograph the width of the page's edges, and on it, at its lower left, a panel in the page's ground
  with the chapter in hand (its number, a title and two lines). As the reader scrolls, each next
  photograph is uncovered over the one before from its foot upward, settling from a slight zoom, and
  the panel changes to its chapter half way through the wipe. The wipe follows the scrollbar (it runs
  back on the way up) and takes under half of a chapter's share of the scroll; the photograph then
  holds for the rest, so there is time to read. Photo-led and calm: for a place, a product or a
  service (the room, the kitchen, the workshop, a day of a tour). No WebGL, no canvas.

    <section class="section" data-moment="photo-chapters">
      <div class="container mo-ph">
        <div class="mo-ph__head"><h2>A night at the harbour house</h2><p>One line.</p></div>
        <ol class="mo-ph__list">
          <li class="mo-ph__ch">
            <figure class="mo-ph__pic"><img src="…" alt="…" width="1800" height="1200"></figure>
            <h3>Arrive by the coast road</h3>
            <p>Two lines.</p>
          </li>
          …three to five chapters, one photograph each
        </ol>
      </div>
    </section>

  Its height is its own: live the section is (hold + 1) screens, the hold growing with the chapters
  (three chapters hold two screens, four or five hold three: about two thirds of a screen each), and
  at rest it is as tall as its chapters, one screen at least. Write no --h and no data-screen on it:
  the checker and the layout check read a live photo-chapters section (.is-live) as whole screens, four
  at most, and still hold it to that.
  At rest (reduced motion, no script, a failed module, a screen under 600px tall such as a phone
  turned sideways) the chapters stand side by side, each photograph over its title and lines (a phone
  stacks them): the same words and pictures, nothing hidden. Live at every width from 600px of
  height, so a phone held upright gets it too (one picture at a time, a clip and a transform).
  Every chapter's words stay in the page for a screen reader; only the one in hand is shown.
  opts: zoom (the settle, 1.06; 1-1.1).
*/


return function (root, opts, lib) {
  const box = root.querySelector('.mo-ph') || root;
  const list = root.querySelector('.mo-ph__list');
  const chapters = [...root.querySelectorAll('.mo-ph__ch')];
  const pics = chapters.map(c => c.querySelector('.mo-ph__pic'));
  if (!list || chapters.length < 2 || pics.some(p => !p)) return {};
  const homes = pics.map(p => p.parentElement);
  const listHome = { parent: list.parentElement, next: list.nextSibling };
  const zoom = lib.clamp(+opts.zoom || 1.06, 1, 1.1);
  const n = chapters.length;
  // about two thirds of a screen of scroll a chapter, in whole screens so the section stays on the grid
  const hold = n <= 3 ? 2 : 3;
  // each chapter's words in a box of their own, so the live panel can stack them in one place
  chapters.forEach(c => {
    if (c.querySelector(':scope > .mo-ph__words')) return;
    const w = document.createElement('div');
    w.className = 'mo-ph__words';
    [...c.children].filter(el => !el.classList.contains('mo-ph__pic')).forEach(el => w.append(el));
    c.append(w);
  });
  const stage = document.createElement('div');
  stage.className = 'mo-ph__stage';
  const panel = document.createElement('div');
  panel.className = 'mo-ph__panel';
  const count = document.createElement('p');
  count.className = 'mo-ph__count';
  count.setAttribute('aria-hidden', 'true');
  panel.append(count);
  const pad = v => String(v).padStart(2, '0');
  let live = false, scrubber = null, on = -1;
  const fits = () => !lib.reduced() && innerHeight >= 600;
  const show = k => {
    if (k === on) return;
    on = k;
    chapters.forEach((c, i) => c.classList.toggle('is-on', i === k));
    count.textContent = `${pad(k + 1)} / ${pad(n)}`;
  };
  // p 0-1 over the held screens: chapter k owns [k/n, (k+1)/n). Its photograph is uncovered over the
  // 45% of a share that straddles that boundary, then holds; the words change half way through the wipe.
  // The last wipe ends at 0.2 of its share, so the last chapter holds to the section's end
  const draw = p => {
    const seg = 1 / n;
    let k = 0;
    pics.forEach((pic, i) => {
      const u = i === 0 ? 1 : lib.clamp((p - (i - 0.25) * seg) / (0.45 * seg));
      const e = lib.ease.out(u);
      pic.style.setProperty('--mo-c', `${((1 - e) * 100).toFixed(2)}%`);
      pic.style.setProperty('--mo-z', (zoom - (zoom - 1) * e).toFixed(4));
      if (u >= 0.5) k = i;
    });
    show(k);
  };
  const go = () => {
    if (live) return;
    live = true;
    root.style.setProperty('--mo-hold', String(hold));
    pics.forEach(p => stage.append(p));
    panel.append(list);
    stage.append(panel);
    box.append(stage);
    root.classList.add('is-live');
    box.setAttribute('data-edge-free', '');   // live the box is one held screen of the section: the layout check skips it
    draw(0);
    scrubber = lib.scrub(root, draw);
  };
  const rest = () => {
    if (!live) return;
    live = false;
    scrubber?.destroy(); scrubber = null;
    root.classList.remove('is-live');
    root.style.removeProperty('--mo-hold');
    box.removeAttribute('data-edge-free');
    listHome.parent.insertBefore(list, listHome.next);
    pics.forEach((p, i) => { homes[i].prepend(p); p.style.removeProperty('--mo-c'); p.style.removeProperty('--mo-z'); });
    chapters.forEach(c => c.classList.remove('is-on'));
    stage.remove();
    on = -1;
  };
  const sync = () => (fits() ? go() : rest());
  sync();
  let t = 0;
  const onResize = () => { clearTimeout(t); t = setTimeout(sync, 120); };
  addEventListener('resize', onResize);
  const rq = matchMedia('(prefers-reduced-motion: reduce)');
  rq.addEventListener('change', sync);
  return { destroy() { removeEventListener('resize', onResize); rq.removeEventListener('change', sync); rest(); } };
}

})() };

M["picture-develops"] = { phone: true, mount: (function () {
/*
  picture-develops - a photograph develops once as its frame comes on screen, in one of two looks.

  look "film" (the default on a place, product or service page, <meta name="site-kind" content="other">
  or <html data-type="place">): the photograph comes up out of the paper the way a print does in the
  developer tray: pale, flat and without colour at first, its darks arriving before its light tones,
  then its colour, while it settles from a slight zoom. About 1.6 s, once; transform and a CSS filter
  on the one picture, no canvas, any origin.

  look "print" (the default on a tech, gaming or software page): first a two-tone
  halftone print, ink dots on paper in the ground's surface tone (so the frame keeps its edges and
  radius while it develops), its darkest cells first, then the print gives way to the photograph,
  which settles from a slight zoom. A picture with a clear subject against a plain field (a rock on
  a beach, a facade) prints best; an all-mid-tone picture is a blur of dots. About 1.8 s, once; timed, not scrubbed. One 2D
  canvas, freed when it is done. Under reduced motion, without script, or when the picture cannot be
  read (another origin without CORS) the photograph stands.

    <figure class="frame frame--photo" data-moment="picture-develops" data-moment-opts='{"cell": 9}'>
      <img src="…" alt="…" width="1800" height="1200" crossorigin="anonymous">
    </figure>

  The host sets the picture's size (an aspect-ratio or a height); the photograph fills it (cover).
  opts: look "film" | "print" (by the page's kind when left out); cell px of the halftone (9, 6-14);
        duration ms (film 1600, print 1800); focus [x, y] 0-1 of the crop (0.5, 0.5).
  Give it a photograph big enough to be the section's subject (half the container or more): a small
  picture developing reads as a loading state, not a moment.
  On a phone the film look runs too (one picture, a filter and a transform, once); the print look
  (a canvas) shows the photograph there.
*/

// a place, product or service page (site-kind other): the photographic look, never the halftone print
const otherPage = () => {
  const m = document.querySelector('meta[name="site-kind"]');
  return document.documentElement.dataset.type === 'place' || (!!m && m.content.trim().toLowerCase() === 'other');
};
return function (root, opts, lib) {
  const img = root.querySelector('img');
  if (!img) return {};
  root.classList.add('mo-pd');
  if (lib.reduced()) { root.classList.add('is-done'); return {}; }
  if ((opts.look || (otherPage() ? 'film' : 'print')) === 'film') return film(root, img, opts, lib);
  if (lib.phone()) { root.dataset.momentStill = 'phone'; root.classList.add('is-done'); return {}; }
  const cell = Math.max(6, Math.min(14, +opts.cell || 9));
  const dur = Math.max(900, +opts.duration || 1800);
  const [fx, fy] = Array.isArray(opts.focus) ? opts.focus : [0.5, 0.5];
  const canvas = document.createElement('canvas');
  canvas.className = 'mo-pd__print';
  canvas.setAttribute('aria-hidden', 'true');
  root.append(canvas);
  root.classList.add('is-live');
  let raf = 0, done = false;
  const finish = () => { if (done) return; done = true; if (raf) cancelAnimationFrame(raf); canvas.remove(); root.classList.remove('is-live'); root.classList.add('is-done'); };
  // the paper is the ground's surface tone, a shade off the page, so the frame keeps its edges while
  // the print develops; the dots are the ink
  const tokens = () => { const cs = getComputedStyle(root); return { bg: cs.getPropertyValue('--surface').trim() || cs.getPropertyValue('--bg').trim() || '#f4f4f4', ink: cs.getPropertyValue('--ink').trim() || '#111' }; };
  const sample = () => {
    const w = root.clientWidth, h = root.clientHeight;
    if (!w || !h || !img.naturalWidth) return null;
    canvas.width = w; canvas.height = h;
    const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
    const off = document.createElement('canvas');
    off.width = cols; off.height = rows;
    const ox = off.getContext('2d', { willReadFrequently: true });
    const ir = img.naturalWidth / img.naturalHeight, fr = w / h;
    let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
    if (ir > fr) { sw = sh * fr; sx = (img.naturalWidth - sw) * fx; } else { sh = sw / fr; sy = (img.naturalHeight - sh) * fy; }
    ox.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);
    let data;
    try { data = ox.getImageData(0, 0, cols, rows).data; } catch { return null; }
    const dark = new Float32Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) dark[i] = 1 - (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
    return { cols, rows, dark };
  };
  const draw = (g, t) => {
    const ctx = canvas.getContext('2d');
    const { bg, ink } = tokens();
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = ink;
    const thr = 1 - t * 1.12;               // the darkest cells first, then the lighter ones
    const half = cell / 2;
    ctx.beginPath();
    for (let r = 0; r < g.rows; r++) {
      const shift = (r & 1) ? half * 0.5 : -half * 0.5;
      for (let c = 0; c < g.cols; c++) {
        const d = g.dark[r * g.cols + c];
        if (d <= thr) continue;
        const k = Math.min(1, (d - thr) / 0.22);  // a cell's dot grows in over a short span
        const rad = half * Math.min(1, d * 1.15) * k;
        if (rad < 0.35) continue;
        const x = c * cell + half + shift, y = r * cell + half;
        ctx.moveTo(x + rad, y);
        ctx.arc(x, y, rad, 0, 6.2832);
      }
    }
    ctx.fill();
  };
  const run = async () => {
    try { if (!img.complete) await new Promise((r, j) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', j, { once: true }); }); await img.decode?.(); } catch { /* shows anyway */ }
    const g = sample();
    if (!g) return finish();
    root.classList.add('is-developing');
    let t0 = 0;
    const step = now => {
      if (done) return;
      if (!t0) t0 = now;
      const u = Math.min(1, (now - t0) / dur);
      if (u < 0.58) { draw(g, 0.14 + lib.ease.out(u / 0.58) * 0.86); canvas.style.opacity = '1'; }
      else { canvas.style.opacity = String(1 - lib.ease.smooth(0.58, 1, u)); }
      if (u < 1) raf = requestAnimationFrame(step); else finish();
    };
    raf = requestAnimationFrame(step);
  };
  // the print covers the photograph only from just before the frame scrolls in: a frame no observer reports keeps its photograph
  canvas.style.display = 'none'; root.classList.remove('is-live');
  const cover = () => { if (done) return; canvas.style.display = ''; root.classList.add('is-live'); };
  const r0 = root.getBoundingClientRect();
  if (r0.bottom > 0 && r0.top < innerHeight * 1.25) cover();   // already near at mount: covered at once, as before
  const arm = lib.once(root, cover, { threshold: 0, margin: '0px 0px 25% 0px' });
  const seen = lib.once(root, () => { cover(); run(); }, { threshold: Math.min(0.4, 0.6 * innerHeight / Math.max(1, root.getBoundingClientRect().height)) });
  return { destroy() { arm.destroy(); seen.destroy(); finish(); } };
}

// the film look: the picture itself, from a pale flat grey print to the photograph (moment.css holds the
// start under .is-armed from just before the frame scrolls in, so a frame no observer reports keeps its photograph)
function film(root, img, opts, lib) {
  const dur = Math.max(1000, +opts.duration || 1600);
  let done = false, anim = null;
  root.classList.add('mo-pd--film');
  const finish = () => { if (done) return; done = true; anim?.cancel(); root.classList.remove('is-armed', 'is-live'); root.classList.add('is-done'); };
  const arm = () => { if (!done) root.classList.add('is-armed'); };
  const run = async () => {
    if (done) return;
    arm();
    try { if (!img.complete) await new Promise(r => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }); } catch { /* shows anyway */ }
    if (done) return;
    root.classList.add('is-live');
    // the darks come first (contrast), the colour last (saturation); the zoom settles over the whole run.
    // The change starts on the first frame and runs evenly to a soft landing: a print that sat still for
    // half a second would read as a picture still loading
    anim = img.animate([
      { filter: 'grayscale(1) contrast(.55) brightness(1.32)', transform: 'scale(1.06)' },
      { filter: 'grayscale(.8) contrast(.82) brightness(1.14)', offset: 0.3 },
      { filter: 'grayscale(.35) contrast(.95) brightness(1.04)', offset: 0.62 },
      { filter: 'grayscale(0) contrast(1) brightness(1)', transform: 'none' },
    ], { duration: dur, easing: 'cubic-bezier(.3, .2, .3, 1)', fill: 'both' });
    root.classList.remove('is-armed');
    anim.finished.then(finish, finish);
  };
  const r0 = root.getBoundingClientRect();
  if (r0.bottom > 0 && r0.top < innerHeight * 1.25) arm();
  const near = lib.once(root, arm, { threshold: 0, margin: '0px 0px 25% 0px' });
  // it develops once a quarter of it is on screen (less of a frame taller than half the screen), so the
  // faint print is seen only briefly before it starts to change
  const seen = lib.once(root, run, { threshold: Math.min(0.25, 0.4 * innerHeight / Math.max(1, r0.height)) });
  return { destroy() { near.destroy(); seen.destroy(); finish(); } };
}

})() };

M["counter-rolls"] = { phone: false, mount: (function () {
/*
  counter-rolls - the digits of one to four proof figures roll once, like an odometer, when the row
  first comes on screen, and stop on the real figure (a price, a count, a time the brief gives; never an
  invented outcome like "98% satisfied"). The figure is written in the HTML as its final
  value (without script it stands); the script builds a strip for every digit that starts and ends on
  that digit, so at rest (before the row enters, in a full-page shot, after the roll) the row reads as
  written, never as zeros. The right-most column turns the most (one turn more per column).

    <div class="grid" data-moment="counter-rolls">
      <div class="span-3"><p class="t-stat">€12</p><p class="t-small muted">a month for unlimited invoices</p></div>
      …
    </div>

  Every .t-stat or [data-count] inside the host rolls (or the host itself when it is one). Whole
  numbers read best: tabular figures make a decimal point or a thousands comma as wide as a digit.
  opts: duration ms (1400), stagger ms between figures (90).
  Reduced motion, no script: the figures stand.
*/
return function (root, opts, lib) {
  const nums = root.matches('[data-count], .t-stat') ? [root] : [...root.querySelectorAll('[data-count], .t-stat')];
  if (!nums.length || lib.reduced()) return {};
  const dur = opts.duration || 1400, stagger = opts.stagger ?? 90;
  const built = nums.map(el => {
    const text = el.textContent.trim();
    el.setAttribute('aria-label', text);
    el.classList.add('mo-cr');
    const frag = document.createDocumentFragment();
    const cols = [];
    for (const ch of text) {
      if (/\d/.test(ch)) {
        const target = +ch, turns = Math.min(4, 1 + cols.length);   // whole turns: the strip stops on the digit
        const col = document.createElement('span');
        col.className = 'mo-cr__col';
        col.setAttribute('aria-hidden', 'true');
        const strip = document.createElement('span');
        strip.className = 'mo-cr__strip';
        // the strip starts on the final digit, runs `turns` times round and ends on it again
        for (let d = 0; d <= turns * 10; d++) { const s = document.createElement('span'); s.textContent = String((target + d) % 10); strip.append(s); }
        col.append(strip);
        frag.append(col);
        cols.push({ strip, turns });
      } else {
        const s = document.createElement('span');
        s.className = 'mo-cr__ch';
        s.setAttribute('aria-hidden', 'true');
        s.textContent = ch;
        frag.append(s);
      }
    }
    el.textContent = '';
    el.append(frag);
    return { el, cols };
  });
  const anims = [];
  const run = () => built.forEach(({ el, cols }, n) => {
    el.classList.add('is-on');
    cols.forEach(({ strip, turns }, c) => {
      const a = strip.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-turns * 10}em)` }], { duration: dur + c * 140, delay: n * stagger, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'forwards' });
      // the last cell is the same digit as the first: cancelling at the end leaves the strip at rest, no change on screen
      a.finished.then(() => { try { a.cancel(); } catch { /* gone */ } }, () => {});
      anims.push(a);
    });
  });
  const seen = lib.once(root, run, { threshold: 0.4 });
  return { destroy() { seen.destroy(); anims.forEach(a => { try { a.cancel(); } catch { /* done */ } }); } };
}

})() };

M["headline-arrives"] = { phone: false, mount: (function () {
/*
  headline-arrives - the hero headline's words rise once on load, each out of its own mask, staggered,
  and settle; the lines after it (the sub-line, the buttons) fade up behind them. Once per visit.

    <div class="section-head" data-moment="headline-arrives" data-moment-opts='{"unit":"words"}'>
      <h1>The full-stack creative canvas</h1>
      <p>…</p>
      <div class="btn-row">…</div>
    </div>

  opts: unit 'words' (default) | 'chars' (a headline of one short line); heading: selector of the
        headline inside the host (default h1, h2); delay ms before the first word (120); stagger ms
        (38 a word, 22 a letter); duration ms of one word's rise (900).
  Reduced motion, no script, a failed module: the headline stands as written. When the module mounts
  late (after the 2.5 s safety mark, html.mo-safe) the headline is already on screen and stays:
  nothing is hidden and replayed. Put <link rel="modulepreload"> for moments.js, lib.js and this
  file in <head> so the headline waits for one round trip, not four.
*/
return function (root, opts, lib) {
  const heading = root.matches('h1, h2') ? root : root.querySelector(opts.heading || 'h1, h2');
  if (!heading || lib.reduced() || document.documentElement.classList.contains('mo-safe')) { root.classList.add('is-done'); return {}; }
  const unit = opts.unit === 'chars' ? 'chars' : 'words';
  const inners = lib.split(heading, unit);
  const rest = root === heading ? [] : [...root.children].filter(c => c !== heading);
  root.classList.add('is-live');
  const dur = opts.duration || 900, delay = opts.delay ?? 120, step = opts.stagger ?? (unit === 'chars' ? 22 : 38);
  const EASE = 'cubic-bezier(.16, 1, .3, 1)';
  const anims = [];
  let done = false;
  const finish = () => { if (done) return; done = true; root.classList.add('is-done'); root.classList.remove('is-live'); anims.forEach(a => { try { a.cancel(); } catch { /* finished */ } }); };
  lib.fontsReady(500).then(() => {
    if (done) return;
    inners.forEach((i, k) => anims.push(i.animate([{ transform: 'translateY(108%)', opacity: 0.001 }, { transform: 'none', opacity: 1 }], { duration: dur, delay: delay + k * step, easing: EASE, fill: 'both' })));
    const after = delay + Math.min(inners.length, 14) * step + 160;
    rest.forEach((el, k) => anims.push(el.animate([{ transform: 'translateY(14px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, delay: after + k * 110, easing: EASE, fill: 'both' })));
    Promise.all(anims.map(a => a.finished)).then(finish, finish);
  }).catch(finish);
  setTimeout(finish, 8000);   // failsafe: whatever stalled, the headline stands after 8 s
  return { destroy: finish };
}

})() };

M["window-parallax"] = { phone: false, mount: (function () {
/*
  window-parallax - one wide photograph seen through a frame moves a little slower than the page, so
  the frame reads as a window onto a larger picture. Scrubbed to the scrollbar, a few percent of
  travel, no pin. Under reduced motion and without script the photograph stands.

    <figure class="frame frame--photo mo-wp" data-moment="window-parallax" data-moment-opts='{"travel": 12}'>
      <img src="…" alt="…" width="2400" height="1200">
    </figure>

  The host sets the frame's size (a wide band, 16:7 to 3:1); the picture is cut taller than it.
  opts: travel (how far the picture moves, % of the frame's height each way; 12, 4-20).
*/
return function (root, opts, lib) {
  const img = root.querySelector('img');
  if (!img) return {};
  root.classList.add('mo-wp');
  if (lib.reduced()) return {};
  const travel = lib.clamp(+opts.travel || 12, 4, 20);
  root.style.setProperty('--mo-travel', `${travel}%`);
  root.classList.add('is-live');
  const s = lib.scrub(root, (p, r) => { img.style.transform = `translateY(${((0.5 - p) * 2 * (travel / 100) * r.height).toFixed(1)}px)`; }, { mode: 'view' });
  return { destroy() { s.destroy(); img.style.transform = ''; root.classList.remove('is-live'); } };
}

})() };

M["giant-type-pass"] = { phone: false, mount: (function () {
/*
  giant-type-pass - a statement of two to four words set very large, with a photograph showing through
  the letters under a 35% ink tint; as the section crosses the screen the photograph passes upward
  through the type, a little faster than the page, so the words read as a window onto the picture.
  Scrubbed to the scrollbar, no pin. The picture's lower half is what shows (the sky of most
  photographs is too pale for a letter). Under reduced motion and without script the photograph
  stands still in the letters; without a picture the words are plain ink.

    <section class="section" data-moment="giant-type-pass" data-moment-opts='{"image": "assets/img/photo-702.jpg", "travel": 60}'>
      <div class="container">
        <h2 class="mo-gt__type">Ride<br>higher</h2>
        <div class="mo-gt__row"><p>…one or two lines…</p><a class="link" href="#">…</a></div>
      </div>
    </section>

  opts: image (the photograph's URL; or set data-image on the h2), travel (how far the picture moves,
        % of its spare height, default 60), focus (the x position of the picture in %, default 50),
        focusY (the y position the travel is centred on, default 62: the lower half).
*/
return function (root, opts, lib) {
  const type = root.querySelector('.mo-gt__type') || root.querySelector('h1, h2');
  if (!type) return {};
  const src = opts.image || type.dataset.image;
  if (!src) return {};
  type.style.setProperty('--mo-img', `url("${src}")`);
  type.style.setProperty('--mo-x', `${lib.clamp(+(opts.focus ?? 50), 0, 100)}%`);
  const fy = lib.clamp(+(opts.focusY ?? 62), 0, 100);
  type.style.setProperty('--mo-y', `${fy}%`);
  root.classList.add('is-live');
  if (lib.reduced()) return {};
  const travel = Math.max(0, Math.min(100, +opts.travel || 60));
  const lo = lib.clamp(fy - travel / 2, 0, 100), hi = lib.clamp(fy + travel / 2, 0, 100);
  const s = lib.scrub(root, p => { type.style.setProperty('--mo-y', `${lib.lerp(hi, lo, p).toFixed(2)}%`); }, { mode: 'view' });
  return { destroy() { s.destroy(); type.style.removeProperty('--mo-y'); } };
}

})() };

M["product-close-up"] = { phone: false, mount: (function () {
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
return function (root, opts, lib) {
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

})() };


// Static loader adapted from moments/moments.js: same mount(root, opts, lib) contract, no import().
const html = document.documentElement;
const STRUCTURE = { "pinned-chapters": ".mo-pc__grid", "photo-chapters": ".mo-ph", "product-close-up": ".mo-cu__stage" };
const libApi = { reduced, phone, still, stillWhy, inCard, coarse, clamp, lerp, ease, scrub, once, split, lines, fontsReady };
function mount(el) {
  if (el.__momentMounted) return;
  el.__momentMounted = true;
  const id = el.dataset.moment, mod = M[id];
  if (!mod) { el.dataset.momentFailed = "not in kit"; el.classList.add("mo-safe", "is-done"); return; }
  // The scroll moments' CSS needs main > section > block. With any other structure the
  // stage would collapse to nothing, so the section stays in its readable static state.
  const block = STRUCTURE[id];
  if (block && !(el.parentElement && el.parentElement.tagName === "MAIN" && [...el.children].some((c) => c.matches(block)))) {
    el.dataset.momentFailed = "structure: main > [data-moment] > " + block;
    el.classList.add("mo-safe", "is-done");
    console.warn("designer-taste: " + id + " needs main > section > " + block + "; shown static");
    return;
  }
  let opts = {};
  try { opts = JSON.parse(el.dataset.momentOpts || "{}"); } catch {}
  const card = inCard(el);
  const why = mod.phone ? (reduced() ? "reduced" : "") : stillWhy();
  if (card) el.dataset.momentStill = "card"; else if (why) el.dataset.momentStill = why;
  try {
    el.__moment = mod.mount(el, opts, { ...libApi, reduced: () => card || (mod.phone ? reduced() : still()) }) || {};
    el.dataset.momentMounted = "1";
  } catch (e) {
    el.dataset.momentFailed = String(e && e.message || e);
    el.classList.add("mo-safe", "is-done");
    el.classList.remove("is-live");
  }
}
html.classList.add("mo-js");
setTimeout(() => html.classList.add("mo-safe"), 2500);
const start = () => {
  const els = [...document.querySelectorAll("[data-moment]")].filter((el) => !el.parentElement?.closest("[data-moment]"));
  els.forEach(mount);
  html.dataset.momentsReady = String(els.length);
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();

})();
