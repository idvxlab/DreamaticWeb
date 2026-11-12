/**
 * Harness shim for a common model slip: a list argument written as a JSON string, often with
 * unescaped ASCII quotes inside its text ("产学研"). The string is parsed; when that fails, a
 * double quote inside a string value that is not followed by JSON punctuation is read as content
 * and turned into a Chinese quote, then parsed again. Anything that still fails is left as it was,
 * so normal schema validation reports it.
 */
export function lenientList(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text.startsWith("[")) return value;
  for (const candidate of [text, repairContentQuotes(text)]) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return value;
}

/** End (exclusive) of the bracketed JSON value starting at `start`, skipping string contents. */
function valueEnd(text: string, start: number) {
  let depth = 0,
    inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") if (--depth === 0) return i + 1;
  }
  return -1;
}

const parseList = (text: string) => {
  for (const candidate of [text, repairContentQuotes(text)])
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  return undefined;
};

/**
 * The same slip, one step further: the string also carries the arguments that follow the list
 * (`[...], "limitations": [...]}`). The leading list is the field's value; a later field it
 * swallowed is recovered from the rest, unless that field was also sent on its own.
 */
export function lenientArgs(
  raw: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const out = { ...raw };
  for (const key of keys) {
    const value = out[key];
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (!text.startsWith("[")) continue;
    const whole = parseList(text);
    if (whole) {
      out[key] = whole;
      continue;
    }
    const end = valueEnd(text, 0);
    const head = end > 0 ? parseList(text.slice(0, end)) : undefined;
    if (!head) continue;
    out[key] = head;
    const rest = text.slice(end);
    for (const other of keys) {
      if (other === key || (out[other] !== undefined && typeof out[other] !== "string")) continue;
      const at = rest.search(new RegExp(`"${other}"\\s*:\\s*\\[`));
      if (at < 0) continue;
      const open = rest.indexOf("[", at);
      const close = valueEnd(rest, open);
      const list = close > 0 ? parseList(rest.slice(open, close)) : undefined;
      if (list) out[other] = list;
    }
  }
  for (const key of keys) out[key] = lenientList(out[key]);
  return out;
}

export function repairContentQuotes(json: string) {
  let out = "",
    inString = false,
    open = true;
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (!inString) {
      out += c;
      if (c === '"') inString = true;
      continue;
    }
    if (c === "\\") {
      out += c + (json[i + 1] ?? "");
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < json.length && /\s/.test(json[j])) j++;
      if (j >= json.length || ",:}]".includes(json[j])) {
        out += c;
        inString = false;
        open = true;
      } else {
        out += open ? "“" : "”";
        open = !open;
      }
      continue;
    }
    out += c;
  }
  return out;
}
