// Host layer, not upstream: a product range's frames take the median proportion of its own
// pictures (clamped), so wide drawings fill their frames instead of floating in empty space.
function rangeRatio(range) {
  const imgs = [...range.querySelectorAll(".range__media > img")];
  const ratios = imgs.filter((i) => i.naturalWidth && i.naturalHeight).map((i) => i.naturalWidth / i.naturalHeight).sort((a, b) => a - b);
  if (!ratios.length) return;
  const mid = ratios[Math.floor(ratios.length / 2)];
  range.style.setProperty("--range-ratio", String(Math.min(2.4, Math.max(1, mid)).toFixed(3)));
}
function startRanges() {
  document.querySelectorAll(".range").forEach((range) => {
    rangeRatio(range);
    range.querySelectorAll(".range__media > img").forEach((img) => { if (!img.complete) img.addEventListener("load", () => rangeRatio(range), { once: true }); });
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startRanges, { once: true }); else startRanges();

// A page script that rewrites a counter's text breaks its digit columns into a long string; put the
// figure back as plain text (its final state) when its columns are gone.
function guardCounters() {
  document.querySelectorAll('[data-moment="counter-rolls"] .t-stat').forEach((el) => {
    const final = el.getAttribute("aria-label") || el.textContent;
    // Runs before paint after every outside write, so the reader only ever sees the real figure.
    new MutationObserver(() => {
      if (!el.querySelector(".mo-cr__col") && el.textContent !== final) el.textContent = final;
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", guardCounters, { once: true }); else guardCounters();

// A page that writes "0" and keeps the real figure in data-count (for its own count-up script) would
// roll the kit's counter to 0. Before the kit mounts, write the real figure as the counter's text.
(function normalizeCounters() {
  document.querySelectorAll('[data-moment="counter-rolls"] .t-stat').forEach((el) => {
    const d = el.dataset, raw = d.count ?? d.target ?? d.value ?? d.to ?? d.end;
    if (raw == null || raw === "" || isNaN(Number(raw))) return;
    const places = d.decimal ?? d.decimals ?? (String(raw).split(".")[1] || "").length;
    el.textContent = (d.prefix || "") + Number(raw).toFixed(Number(places) || 0) + (d.suffix || "");
  });
})();
