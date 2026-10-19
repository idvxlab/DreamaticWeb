export class OutputFormatError extends Error {
  constructor(message = "模型输出格式不正确：未找到完整且唯一的 JSON 结果") {
    super(message);
    this.name = "OutputFormatError";
  }
}

/** Recover one complete top-level JSON value; never guess or accept partial/nested fragments. */
export function parseJSON(text: string): unknown {
  if (text.length > 2500000)
    throw new OutputFormatError("模型输出过长，无法安全解析");
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(clean);
  } catch {}
  const candidates: unknown[] = [];
  let start = -1;
  let quoted = false;
  let escaped = false;
  const stack: string[] = [];
  for (let index = 0; index < clean.length; index++) {
    const character = clean[index];
    if (start < 0) {
      if (character !== "{" && character !== "[") continue;
      start = index;
      stack.push(character);
      quoted = false;
      escaped = false;
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === "{" || character === "[") stack.push(character);
    if (character === "}" || character === "]") {
      if (stack.pop() !== (character === "}" ? "{" : "["))
        throw new OutputFormatError();
      if (!stack.length) {
        try {
          candidates.push(JSON.parse(clean.slice(start, index + 1)));
        } catch {}
        start = -1;
      }
    }
  }
  if (start >= 0)
    throw new OutputFormatError("模型输出的 JSON 不完整，可能被截断");
  if (candidates.length !== 1)
    throw new OutputFormatError(
      candidates.length > 1
        ? "模型返回多个 JSON 结果，无法确定最终结果"
        : undefined,
    );
  return candidates[0];
}
