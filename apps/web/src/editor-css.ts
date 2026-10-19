import type { ParsedCssRule } from "grapesjs";

/** Keep authored shorthands: expanding var() shorthands loses their values. */
export function parseEditorCss(input: string): ParsedCssRule[] {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(input);
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
        const style: Record<string, string> = {};
        // cssText retains authored var() shorthands even when CSSOM enumerates
        // empty expanded longhands. Split only outside strings/functions.
        let start = 0,
          depth = 0,
          quote = "";
        const css = declaration.style.cssText;
        for (let i = 0; i <= css.length; i++) {
          const c = css[i];
          if (quote) {
            if (c === "\\") i++;
            else if (c === quote) quote = "";
          } else if (c === '"' || c === "'") quote = c;
          else if (c === "(" || c === "[") depth++;
          else if (c === ")" || c === "]") depth--;
          else if ((c === ";" || i === css.length) && depth === 0) {
            const entry = css.slice(start, i);
            const colon = entry.indexOf(":");
            if (colon >= 0)
              style[entry.slice(0, colon).trim()] = entry
                .slice(colon + 1)
                .trim();
            start = i + 1;
          }
        }
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
        return [
          {
            selectors:
              declaration.selectorText ||
              (rule as CSSKeyframeRule).keyText ||
              "",
            style,
            atRule,
            params,
          },
        ];
      }
      const group = rule as CSSGroupingRule;
      return group.cssRules && match
        ? parse(group.cssRules, match[1], match[2])
        : [];
    });
  return parse(sheet.cssRules);
}
