import { parse } from "yaml";
export default function matter(input: string): {
  data: Record<string, unknown>;
  content: string;
} {
  const m = input.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return { data: {}, content: input };
  const data = parse(m[1], { maxAliasCount: 20 });
  return {
    data: data && typeof data === "object" ? data : {},
    content: input.slice(m[0].length),
  };
}
