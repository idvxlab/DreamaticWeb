import * as cheerio from "cheerio";

const SCHEME = /^skill:\/\/(.+)$/;

/**
 * Harness capability, independent of any particular Skill: a page may reference
 * a loaded Skill's own stylesheet or script as skill://<name>/assets/<file>; the
 * host replaces each reference with the file's text before validation, so the
 * saved, previewed and exported document stays self-contained and the normal
 * HTML policy still applies. Each asset is inlined once.
 */
export async function inlineSkillAssets(
  html: string,
  load: (reference: string) => Promise<string>,
) {
  if (!html.includes("skill://")) return { html, assets: [] as string[] };
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const assets: string[] = [];
  const take = async (reference: string) => {
    if (seen.has(reference)) return undefined;
    seen.add(reference);
    assets.push(reference);
    return load(reference);
  };
  for (const node of $('link[href^="skill://"]').toArray()) {
    const reference = SCHEME.exec($(node).attr("href") || "")![1];
    if (!reference.endsWith(".css"))
      throw new Error("link 只能引用 Skill 的 .css 资源：" + reference);
    const text = await take(reference);
    if (text === undefined) $(node).remove();
    else
      $(node).replaceWith(
        $("<style>")
          // "name:file", so the marker is never read as a project asset path.
          .attr("data-skill-asset", reference.replace("/assets/", ":"))
          .text(text),
      );
  }
  for (const node of $('script[src^="skill://"]').toArray()) {
    const reference = SCHEME.exec($(node).attr("src") || "")![1];
    if (!reference.endsWith(".js"))
      throw new Error("script 只能引用 Skill 的 .js 资源：" + reference);
    const text = await take(reference);
    if (text === undefined) $(node).remove();
    // An inline script ends at the first "</script": escape it in any shipped code.
    else
      $(node).replaceWith(
        $("<script>").text(text.replace(/<\/(script)/gi, "<\\/$1")),
      );
  }
  const leftover = /skill:\/\/[^\s"'<>)]+/.exec($.html());
  if (leftover)
    throw new Error(
      "skill:// 只能用于 <link rel=stylesheet href> 和 <script src>：" +
        leftover[0],
    );
  return { html: $.html(), assets };
}
