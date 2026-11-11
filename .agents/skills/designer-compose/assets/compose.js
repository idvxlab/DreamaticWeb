/* designer-compose: a split's picture is never taller than its words need. Measures once the
   pictures have loaded and again on resize; without script the CSS cap still applies. */
(() => {
  const fit = () => {
    document.querySelectorAll(".cx-split").forEach((split) => {
      const words = split.querySelector(":scope > .cx-text");
      if (!words) return;
      split.style.removeProperty("--cx-media-h");
      if (innerWidth < 900) return;
      const height = words.getBoundingClientRect().height;
      if (height > 0) split.style.setProperty("--cx-media-h", Math.round(Math.max(240, height * 1.15)) + "px");
    });
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", fit);
  else fit();
  addEventListener("load", fit);
  let pending = 0;
  addEventListener("resize", () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(fit); });
})();
