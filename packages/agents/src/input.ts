/** Budget the actual serialized envelope, including metadata and truncation markers. */
export function boundedInput(input: unknown, limit = 180000): string {
  const data = structuredClone(input) as Record<string, any>;
  if (
    Array.isArray(data.sources) &&
    data.sources.some((s: any) => s.text !== undefined)
  )
    throw new Error(
      "Raw source text is not a model input; canonical Markdown is required",
    );
  let omitted = false;
  if (data.originalInput && typeof data.originalInput === "object") {
    data.originalInput = JSON.parse(
      boundedInput(data.originalInput, Math.floor(limit / 2)),
    );
  }
  if (
    typeof data.existingHtml === "string" &&
    data.existingHtml.length > 40000
  ) {
    data.existingHtmlCoverage = {
      start: 0,
      end: 40000,
      total: data.existingHtml.length,
      complete: false,
    };
    data.existingHtml = data.existingHtml.slice(0, 40000);
    omitted = true;
  }
  const encode = () => JSON.stringify(data);
  for (
    let attempts = 0;
    encode().length > limit && attempts < 1000;
    attempts++
  ) {
    const sources = Array.isArray(data.sources) ? data.sources : [];
    const source = sources
      .filter((s: any) => (s.markdown?.length || 0) > 1000)
      .sort(
        (a: any, b: any) =>
          (b.markdown?.length || 0) - (a.markdown?.length || 0),
      )[0];
    if (source) {
      source.markdown = source.markdown.slice(
        0,
        Math.floor(source.markdown.length / 2),
      );
      if (source.markdownCoverage) {
        source.markdownCoverage.end = source.markdown.length;
        source.markdownCoverage.complete = false;
      }
      omitted = true;
      continue;
    }
    if (data.conversation?.length > 1) {
      data.conversation.shift();
      omitted = true;
      continue;
    }
    if (data.existingHtml?.length > 1000) {
      const total =
        data.existingHtmlCoverage?.total ?? data.existingHtml.length;
      data.existingHtml = data.existingHtml.slice(
        0,
        Math.floor(data.existingHtml.length / 2),
      );
      data.existingHtmlCoverage = {
        start: 0,
        total,
        end: data.existingHtml.length,
        complete: false,
      };
      omitted = true;
      continue;
    }
    if (data.invalidOutput?.length > 1000) {
      data.invalidOutput = data.invalidOutput.slice(
        0,
        Math.floor(data.invalidOutput.length / 2),
      );
      data.outputWasClipped = true;
      omitted = true;
      continue;
    }
    throw new Error(
      "Required role input exceeds context budget; reduce source catalogs or request a smaller task",
    );
  }
  if (omitted)
    data.inputCoverage = {
      complete: false,
      note: "Context budget omitted history, page or Markdown ranges. Use project_context_read and source tools for missing context; supplied extracts are not complete. Original stored data is unchanged.",
    };
  const result = encode();
  if (result.length > limit)
    throw new Error("Required role input exceeds serialized context budget");
  return result;
}
