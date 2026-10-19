/** Never persist upstream error bodies: they can contain complete tool arguments. */
export function toolFailureSummary(
  result: unknown,
): Record<string, string> & { category: string; reason: string } {
  const texts = (
    (result as { content?: { type?: string; text?: string }[] })?.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text || "")
      .join("\n") || ""
  ).split(/Received arguments:/i)[0];
  if (
    /EvidenceValidationError|Evidence quote(?:\/cell)? (?:validation failed|does not match)|quote_not_found|ambiguous_quote|cell_mismatch/i.test(
      texts,
    )
  )
    return {
      category: "evidence",
      fields: [
        ...new Set(
          [...texts.matchAll(/"factIndex"\s*:\s*(\d{1,6})/g)]
            .slice(0, 8)
            .map((m) => `facts[${m[1]}].evidence`),
        ),
      ].join(", "),
      reason: "证据校验失败，请按返回的问题修正引用",
    };
  if (/No saved version/i.test(texts))
    return {
      category: "no_saved_version",
      reason: "尚无已保存页面，请使用候选 candidateId 读取或修改草稿",
    };
  if (/Missing baseVersionId/i.test(texts))
    return {
      category: "missing_base_version",
      reason: "修改已保存页面需要当前 baseVersionId，请读取版本信息",
    };
  if (/Invalid arguments|JSON|Unterminated|Unexpected token/i.test(texts))
    return {
      category: "arguments_json",
      reason: "工具参数 JSON 无效，请重新编码参数",
    };
  if (/Validation failed|invalid_type|invalid_format|ZodError/i.test(texts))
    return {
      category: "arguments_schema",
      fields: [...texts.matchAll(/^\s*-\s*([/\w.[\]-]{1,100}):/gm)]
        .slice(0, 8)
        .map((m) => m[1])
        .join(", "),
      reason: "工具参数不符合格式，请检查字段类型、范围和互斥参数",
    };
  if (/stale|version.*changed/i.test(texts))
    return {
      category: "version_conflict",
      reason: "页面版本已变化，请读取最新版本",
    };
  if (/budget|limit exhausted/i.test(texts))
    return {
      category: "budget",
      reason: "工具预算不足，请缩小返回范围或结束重复调用",
    };
  if (/Browser unavailable|browserType.launch/i.test(texts))
    return {
      category: "browser_unavailable",
      reason: "浏览器预览不可用，本次未完成视觉检查",
    };
  return {
    category: "execution",
    reason: "工具执行失败，请根据返回结果修正后继续",
  };
}
