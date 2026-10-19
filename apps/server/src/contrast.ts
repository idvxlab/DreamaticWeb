/** Runs in the isolated preview browser. Conservative solid-background checks. */
export function inspectTextContrast() {
  const rgb = (value: string) => {
    const match = value.match(/^rgba?\(([^)]+)\)$/);
    if (!match) return null;
    const values = match[1].split(/[,\s/]+/).map(Number);
    return values.length >= 3
      ? [values[0], values[1], values[2], values[3] ?? 1]
      : null;
  };
  const blend = (front: number[], back: number[]) =>
    front.slice(0, 3).map((c, i) => c * front[3] + back[i] * (1 - front[3]));
  const luminance = (color: number[]) =>
    color
      .slice(0, 3)
      .map((c) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const issues: {
    selector: string;
    text: string;
    foreground: string;
    background: number[];
    ratio: number;
    required: number;
  }[] = [];
  let unchecked = 0;
  const elements = Array.from(document.body.querySelectorAll<HTMLElement>("*"));
  elements.unshift(document.body);
  for (const element of elements.slice(0, 10000)) {
    const text = Array.from(element.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join("")
      .trim();
    if (!text || !element.getClientRects().length) continue;
    const style = getComputedStyle(element);
    if (
      style.visibility !== "visible" ||
      element.closest("[hidden],[aria-hidden=true]")
    )
      continue;
    const chain: HTMLElement[] = [];
    let current: HTMLElement | null = element;
    while (current) {
      chain.push(current);
      current = current.parentElement;
    }
    // Images, gradients, pseudo-element overlays, blending and opacity need visual review.
    // Do not claim that an unknown painted background is white.
    let unknown = false;
    let complexCompositing = false;
    let background = [255, 255, 255];
    for (const ancestor of chain.reverse()) {
      const s = getComputedStyle(ancestor);
      const color = rgb(s.backgroundColor);
      if (
        Number(s.opacity) !== 1 ||
        s.mixBlendMode !== "normal" ||
        s.filter !== "none"
      )
        complexCompositing = true;
      if (!color) unknown = true;
      if (color) {
        if (color[3] === 1) unknown = false;
        background = blend(color, background);
      }
      if (s.backgroundImage !== "none") unknown = true;
      for (const pseudo of ["::before", "::after"]) {
        const p = getComputedStyle(ancestor, pseudo);
        if (p.content !== "none" && p.content !== "normal") unknown = true;
      }
    }
    const foreground = rgb(
      style.getPropertyValue("-webkit-text-fill-color") || style.color,
    );
    if (unknown || complexCompositing || !foreground) {
      unchecked++;
      continue;
    }
    const fg = luminance(blend(foreground, background)),
      bg = luminance(background);
    const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    const size = parseFloat(style.fontSize);
    const required =
      size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
        ? 3
        : 4.5;
    if (ratio + 0.01 < required && issues.length < 100) {
      const parts: string[] = [];
      let node: Element | null = element;
      while (node && node !== document.documentElement) {
        if (node.id) {
          parts.unshift(`#${CSS.escape(node.id)}`);
          break;
        }
        const siblings = node.parentElement
          ? Array.from(node.parentElement.children)
          : [];
        parts.unshift(
          `${node.tagName.toLowerCase()}:nth-child(${siblings.indexOf(node) + 1})`,
        );
        node = node.parentElement;
      }
      issues.push({
        selector: parts.join(" > "),
        text: text.slice(0, 120),
        foreground: style.color,
        background,
        ratio: Math.round(ratio * 100) / 100,
        required,
      });
    }
  }
  return {
    issues,
    unchecked,
    scope:
      "Visible direct text on solid ancestor backgrounds; images, gradients, overlays and complex compositing require visual review",
  };
}
