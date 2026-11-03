export type MediaAliases = Record<
  string,
  { sourceId: string; assetId: string }
>;

/** Exact local lookup only; UUID and source-ownership validation still follows. */
export function resolveMediaAliases(input: any, aliases: MediaAliases) {
  const started = performance.now();
  let converted = 0;
  if (!Array.isArray(input?.facts))
    return { value: input, converted, elapsedMs: performance.now() - started };
  const value = {
    ...input,
    facts: input.facts.map((fact: any) => {
      if (!Array.isArray(fact?.assetIds)) return fact;
      return {
        ...fact,
        assetIds: fact.assetIds.map((id: unknown) => {
          if (typeof id !== "string") return id;
          const mapped = Object.hasOwn(aliases, id) ? aliases[id] : undefined;
          if (mapped) {
            if (mapped.sourceId !== fact.sourceId)
              throw new Error(`素材编号 ${id} 不属于该事实的资料`);
            converted++;
            return mapped.assetId;
          }
          if (/^S\d+-I\d+$/.test(id))
            throw new Error(`未知素材编号 ${id}；请原样使用资料中列出的编号`);
          return id;
        }),
      };
    }),
  };
  return { value, converted, elapsedMs: performance.now() - started };
}
