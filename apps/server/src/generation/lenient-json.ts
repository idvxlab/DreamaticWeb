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
