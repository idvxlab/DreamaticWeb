import * as cheerio from "cheerio";
import type { Asset, Project } from "./contracts.js";

export function usedImages(project: Project, html: string): Asset[] {
  const $ = cheerio.load(html);
  const references: string[] = [];
  $("img[src],source[src],video[poster]").each((_i, element) => {
    references.push($(element).attr("src") || $(element).attr("poster") || "");
  });
  const css =
    $("style").text() +
    $("[style]")
      .map((_i, element) => $(element).attr("style"))
      .get()
      .join("\n");
  for (const match of css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g))
    references.push(match[1]);
  return project.sources
    .flatMap((source) => source.assets)
    .filter(
      (asset) => asset.type === "image" && references.includes(asset.url),
    );
}

export function designCompletion(
  project: Project,
  demo: boolean,
  language: string,
) {
  const html = project.versions.at(-1)?.html || "";
  const $ = cheerio.load(html);
  const clean = (value: string) =>
    value.replace(/\s+/g, " ").trim().slice(0, 80);
  const headings = [
    ...new Set(
      $("h1,h2")
        .map((_i, element) => clean($(element).text()))
        .get()
        .filter(Boolean),
    ),
  ].slice(0, 6);
  const images = usedImages(project, html).length;
  const en = language === "en";
  const title = clean(
    $("title").text() || $("h1").first().text() || project.title,
  );
  const details = headings.length
    ? en
      ? `Page sections: ${headings.join(", ")}.`
      : `页面内容：${headings.join("、")}。`
    : en
      ? "The page content and layout have been updated."
      : "已完成页面内容与布局设计。";
  const check = project.versions.at(-1)?.checks;
  const verification =
    check?.status === "previewed"
      ? en
        ? ` Previewed at ${check.viewports.map((v) => v.width + "px").join(", ")}; this is not an accessibility certification.`
        : `已预览 ${check.viewports.map((v) => v.width + "px").join("、")}；不代表完整无障碍认证。`
      : check?.status === "warnings"
        ? en
          ? " Saved with check warnings; review before sharing."
          : "已保存，检查仍有警告，请确认后使用。"
        : en
          ? " Browser preview was not verified."
          : "尚未确认浏览器预览结果。";
  return en
    ? `${demo ? "Demo design complete (local sample, no AI calls)." : "Design complete."} Created “${title}”. ${details} ${project.sources.length} sources supplied; ${images} source images used. You can edit the canvas, open it in your browser, or request further changes.${verification}`
    : `${demo ? "演示设计完成（本地示例，未调用 AI）。" : "设计完成。"}已生成「${title}」。${details}本次提供 ${project.sources.length} 份资料，页面使用 ${images} 张资料图片。可继续编辑画布、在浏览器中打开，或提出修改要求。${verification}`;
}
