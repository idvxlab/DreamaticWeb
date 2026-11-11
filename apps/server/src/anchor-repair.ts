import * as cheerio from "cheerio";

const TOP = /^(?:top|hero|home|header|start|page|main)$/i;

/**
 * Harness repair before validation: an in-page link whose target id is missing is pointed at
 * the section its words name, at the first section for a link to the top, or else dropped
 * (a nav item removed, a body link unwrapped), so a whole page is not rewritten for it.
 */
export function repairAnchors(html: string): {
  html: string;
  repaired: string[];
} {
  const $ = cheerio.load(html);
  const repaired: string[] = [];
  const ids = new Set(
    $("[id]")
      .toArray()
      .map((element) => $(element).attr("id")!),
  );

  $('a[href^="#"]').each((_index, element) => {
    const link = $(element);
    const href = link.attr("href")!;
    let target = href.slice(1);
    try {
      target = decodeURIComponent(target);
    } catch {}
    if (!target || ids.has(target)) return;

    const linkText = link.text().trim().replace(/\s/g, "");
    let matched = $("h1,h2,h3").slice(0, 0);
    if (linkText) {
      $("h1,h2,h3").each((_headingIndex, heading) => {
        const headingText = $(heading).text().trim().replace(/\s/g, "");
        if (
          headingText &&
          (headingText.includes(linkText) || linkText.includes(headingText))
        ) {
          matched = $(heading);
          return false;
        }
      });
    }

    if (matched.length) {
      const section = matched.closest("section");
      const destination = section.length ? section : matched;
      const existingId = destination.attr("id");
      if (existingId) {
        link.attr("href", `#${existingId}`);
        repaired.push(`${href} → #${existingId}`);
      } else {
        destination.attr("id", target);
        ids.add(target);
        repaired.push(
          `${href} → id on ${destination.prop("tagName")!.toLowerCase()}`,
        );
      }
      return;
    }

    // A link to the top of the page (the logo, "#hero", "#top") goes to the first section.
    if (TOP.test(target) || link.hasClass("nav__logo")) {
      const first = $("main section, body section").first();
      const destination = first.length ? first : $("main").first();
      if (destination.length) {
        const existingId = destination.attr("id");
        if (existingId) {
          link.attr("href", `#${existingId}`);
          repaired.push(`${href} → #${existingId}`);
        } else {
          destination.attr("id", target);
          ids.add(target);
          repaired.push(`${href} → id on first section`);
        }
        return;
      }
    }

    if (link.closest("nav,header,footer").length) {
      const parent = link.parent();
      if (parent.is("li") || parent.hasClass("nav__item")) parent.remove();
      else link.remove();
      repaired.push(`${href} → removed nav item`);
    } else {
      link.replaceWith(link.contents());
      repaired.push(`${href} → unlinked`);
    }
  });

  return repaired.length ? { html: $.html(), repaired } : { html, repaired };
}
