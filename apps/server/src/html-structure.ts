import type { AnyNode as HtmlNode } from "domhandler";
import type { CheerioAPI } from "cheerio";
import type { OfficeContentNode } from "officeparser";
import { structureDocument } from "./document-structure.js";

/** Extract semantic HTML blocks; ignore executable content, never fetch or render it. */
export function structureHtml($: CheerioAPI, preferMain = false) {
  $("script,style,noscript,template").remove();
  const main = $("main").first();
  const articles = $("article").filter(
    (_i, node) => !$(node).parents("article").length,
  );
  const roots =
    preferMain && main.length
      ? main
      : preferMain && articles.length
        ? articles
        : $("body");
  const blocks = new Set(
    "main article section div header footer nav aside p blockquote pre ul ol li dl dt dd figure figcaption h1 h2 h3 h4 h5 h6 table hr".split(
      " ",
    ),
  );
  const inlineText = (node: HtmlNode): string => {
    if (node.type === "text") return node.data.replace(/\s+/g, " ");
    if (node.type !== "tag") return "";
    if (node.name === "br") return "\n";
    if (node.name === "img") return node.attribs.alt || "";
    if (node.name === "table" || node.name === "ul" || node.name === "ol")
      return "";
    return node.children.map(inlineText).join("");
  };
  let hasSpans = false;
  const tableNode = (node: HtmlNode): OfficeContentNode => {
    const rows: OfficeContentNode[] = [];
    const occupied = new Map<number, number>();
    $(node)
      .find("tr")
      .filter((_i, tr) => $(tr).closest("table")[0] === node)
      .each((_i, tr) => {
        const cells: OfficeContentNode[] = [];
        let column = 0;
        const blank = () => {
          cells.push({ type: "cell", text: "" });
          column++;
        };
        $(tr)
          .children("th,td")
          .each((_j, cell) => {
            while ((occupied.get(column) || 0) > 0) blank();
            const span = (name: string) => {
              const value = Number.parseInt($(cell).attr(name) || "1", 10);
              if (!Number.isInteger(value) || value < 1 || value > 200)
                throw new Error(
                  "Unsupported HTML table span; split or simplify the table",
                );
              return value;
            };
            const cols = span("colspan"),
              height = span("rowspan");
            hasSpans ||= cols > 1 || height > 1;
            cells.push({
              type: "cell",
              text: $(cell)
                .contents()
                .toArray()
                .map(inlineText)
                .join("")
                .trim(),
            });
            if (height > 1)
              for (let c = column; c < column + cols; c++)
                occupied.set(c, height);
            column++;
            for (let c = 1; c < cols; c++) blank();
            if (column > 100000)
              throw new Error("HTML table exceeds cell limit");
          });
        const last = Math.max(-1, ...occupied.keys());
        while (column <= last) blank();
        for (const [c, left] of occupied) {
          if (left <= 1) occupied.delete(c);
          else occupied.set(c, left - 1);
        }
        rows.push({ type: "row", children: cells });
      });
    return { type: "table", children: rows };
  };
  const sequence = (nodes: HtmlNode[]): OfficeContentNode[] => {
    const output: OfficeContentNode[] = [];
    let inline = "";
    const flush = () => {
      if (inline.trim())
        output.push({ type: "paragraph", text: inline.trim() });
      inline = "";
    };
    for (const node of nodes) {
      if (node.type !== "tag" || !blocks.has(node.name)) {
        // Unknown containers may still contain block elements.
        if (node.type === "tag" && $(node).find([...blocks].join(",")).length) {
          flush();
          output.push(...sequence(node.children));
        } else inline += inlineText(node);
        continue;
      }
      flush();
      const tag = node.name;
      if (tag === "table") {
        const caption = $(node).children("caption").text().trim();
        if (caption) output.push({ type: "paragraph", text: caption });
        output.push(tableNode(node));
        // Nested tables retain their own index and are not duplicated in parent text.
        $(node)
          .find("table")
          .filter((_i, t) => $(t).parents("table").first()[0] === node)
          .each((_i, t) => {
            output.push(...sequence([t]));
          });
      } else if (tag === "ul" || tag === "ol")
        output.push({ type: "list", children: sequence(node.children) });
      else if (/^h[1-6]$/.test(tag))
        output.push({
          type: "heading",
          text: node.children.map(inlineText).join("").trim(),
          metadata: { level: Number(tag[1]) },
        });
      else if (tag === "pre")
        output.push({ type: "paragraph", text: $(node).text() });
      else output.push(...sequence(node.children));
    }
    flush();
    return output;
  };
  const structured = structureDocument(sequence(roots.toArray()), "html");
  return {
    structured,
    warnings: hasSpans
      ? ["HTML 合并单元格仅保留左上角值，覆盖位置以空单元格表示。"]
      : [],
  };
}
