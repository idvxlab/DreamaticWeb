import type { ParsedCssRule } from "grapesjs";

/** CSSOM loses var() shorthands combined with longhand overrides. Keep the
 * authored declarations in a side table; CSSOM still parses rule structure. */
function preserveDeclarations(input: string) {
  let marker = "--dreamatic-editor-raw";
  while (input.includes(marker)) marker += "-";
  const bodies = new Map<string, string>();
  const blocks: { start: number; nested: boolean; value: boolean }[] = [];
  let output = "",
    copied = 0,
    boundary = 0,
    quote = "",
    depth = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === "/" && input[i + 1] === "*") {
      const end = input.indexOf("*/", i + 2);
      i = end < 0 ? input.length : end + 1;
    } else if (c === "\\") i++;
    else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (!depth && c === "{") {
      const parent = blocks.at(-1);
      const value =
        !!parent?.value || /^\s*--[\w-]+\s*:/.test(input.slice(boundary, i));
      if (parent && !value) parent.nested = true;
      blocks.push({ start: i + 1, nested: false, value });
      boundary = i + 1;
    } else if (!depth && c === "}") {
      const block = blocks.pop();
      if (block && !block.nested && !block.value) {
        const id = String(bodies.size);
        bodies.set(id, input.slice(block.start, i));
        output += input.slice(copied, i) + `;${marker}:${id};`;
        copied = i;
      }
      boundary = i + 1;
    } else if (!depth && c === ";") boundary = i + 1;
  }
  return { css: output + input.slice(copied), marker, bodies };
}

function parseDeclarations(
  css: string,
  parsed: CSSStyleDeclaration,
  descriptors = false,
): Record<string, string> {
  const style: Record<string, string> = {};
  let start = 0,
    depth = 0,
    quote = "";
  // Comments outside strings are whitespace, including between property/value.
  let clean = "";
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      clean += c;
      if (c === "\\") clean += css[++i] || "";
      else if (c === quote) quote = "";
    } else if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? css.length : end + 1;
      clean += " ";
    } else {
      clean += c;
      if (c === '"' || c === "'") quote = c;
    }
  }
  for (let i = 0; i <= clean.length; i++) {
    const c = clean[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === "\\") i++;
    else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if ((c === ";" || i === clean.length) && depth === 0) {
      const entry = clean.slice(start, i),
        colon = entry.indexOf(":");
      if (colon >= 0) {
        let name = entry.slice(0, colon).trim();
        if (!name.startsWith("--")) name = name.toLowerCase();
        const value = entry.slice(colon + 1).trim();
        const important = /!\s*important\s*$/i;
        if (
          (CSS.supports(name, value.replace(important, "").trim()) ||
            (descriptors && parsed.getPropertyValue(name))) &&
          (!important.test(style[name] || "") || important.test(value))
        ) {
          // Repeated declarations must retain their last position, so a later
          // shorthand can reset an earlier longhand, just as authored.
          delete style[name];
          style[name] = value;
        }
      }
      start = i + 1;
    }
  }
  return style;
}

/** Keep authored shorthands: expanding var() shorthands loses their values. */
export function parseEditorCss(input: string): ParsedCssRule[] {
  const prepared = preserveDeclarations(input);
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(prepared.css);
  const parse = (
    rules: CSSRuleList,
    atRule?: string,
    params?: string,
  ): ParsedCssRule[] =>
    Array.from(rules).flatMap((rule): ParsedCssRule[] => {
      const declaration = rule as CSSStyleRule;
      const header = rule.cssText.slice(0, rule.cssText.indexOf("{"));
      const match = header.match(/^@([\w-]+)\s*(.*?)\s*$/);
      if (declaration.style) {
        const id = declaration.style.getPropertyValue(prepared.marker).trim();
        const original = prepared.bodies.get(id);
        const style = parseDeclarations(
          match
            ? declaration.style.cssText
            : (original ?? declaration.style.cssText),
          declaration.style,
          !!match,
        );
        delete style[prepared.marker];
        if (match)
          return [
            {
              selectors: [],
              style,
              atRuleType: match[1],
              mediaText: match[2],
              singleAtRule: true,
            } as ParsedCssRule,
          ];
        const selectorText =
          declaration.selectorText || (rule as CSSKeyframeRule).keyText || "";
        // GrapesJS splits selector lists at every comma, so `:is(.a, .b)` would be cut
        // into broken pieces. Keep such a list whole as one additional selector.
        if (/\([^)]*,/.test(selectorText))
          return [
            {
              selectors: [],
              selectorsAdd: selectorText,
              style,
              // A node GrapesJS does not parse itself must carry its own at-rule fields.
              ...(atRule ? { atRuleType: atRule } : {}),
              ...(params ? { mediaText: params } : {}),
            } as ParsedCssRule,
          ];
        return [{ selectors: selectorText, style, atRule, params }];
      }
      const group = rule as CSSGroupingRule;
      if (!group.cssRules || !match) return [];
      // A media query nested in another one holds under both conditions.
      if (
        atRule === "media" &&
        match[1] === "media" &&
        params?.startsWith("(") &&
        match[2].startsWith("(")
      )
        return parse(group.cssRules, "media", `${params} and ${match[2]}`);
      return parse(group.cssRules, match[1], match[2]);
    });
  return parse(sheet.cssRules);
}
