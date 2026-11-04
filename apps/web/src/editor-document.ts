import { PREVIEW_CSP } from "../../../packages/shared/html-policy";

export interface DocumentMetadata {
  title: string;
  lang: string;
  description: string;
}

function removeBodyMetadata(body: HTMLElement) {
  // Older saved documents may already contain head metadata inside the body.
  body.querySelectorAll("title,meta,base,link").forEach((element) => {
    if (element.namespaceURI === "http://www.w3.org/1999/xhtml")
      element.remove();
  });
}

export function parseEditorDocument(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const metadata: DocumentMetadata = {
    title: doc.title || "Dreamatic · Web",
    lang: doc.documentElement.lang || "zh-CN",
    description:
      doc.head
        .querySelector('meta[name="description"]')
        ?.getAttribute("content") || "",
  };
  const scripts = Array.from(doc.querySelectorAll("script:not([src])"))
    // SVG (including foreignObject HTML) must not be lifted into an ordinary
    // HTML script that would escape the server's SVG content policy on save.
    .filter(
      (script) =>
        script.namespaceURI === "http://www.w3.org/1999/xhtml" &&
        !script.closest("svg"),
    )
    .map((script) => script.outerHTML);
  const bodyAttributes = Object.fromEntries(
    Array.from(doc.body.attributes)
      .filter((attribute) =>
        /^(id|class|style|lang|dir|title|role|aria-[\w-]+|data-[\w-]+)$/.test(
          attribute.name,
        ),
      )
      .map((attribute) => [attribute.name, attribute.value]),
  );
  doc.querySelectorAll("script").forEach((script) => script.remove());
  removeBodyMetadata(doc.body);
  // GrapesJS still parses the author's head CSS, but never imports the head's
  // title/meta nodes as visible components. Inline scripts are stored separately.
  const styles = Array.from(
    doc.head.querySelectorAll("style"),
    (style) => style.outerHTML,
  ).join("\n");
  return {
    metadata,
    scripts,
    bodyAttributes,
    markup: styles + doc.body.innerHTML,
  };
}

export function serializeEditorDocument(input: {
  html: string;
  css: string;
  metadata: DocumentMetadata;
  scripts: string[];
  bodyAttributes: Record<string, unknown>;
}) {
  const doc = document.implementation.createHTMLDocument(input.metadata.title);
  doc.documentElement.lang = input.metadata.lang;
  const charset = doc.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  const policy = doc.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = PREVIEW_CSP;
  const viewport = doc.createElement("meta");
  viewport.name = "viewport";
  viewport.content = "width=device-width,initial-scale=1";
  const description = doc.createElement("meta");
  description.name = "description";
  description.content = input.metadata.description;
  const style = doc.createElement("style");
  style.textContent = input.css;
  doc.head.prepend(charset, policy);
  doc.head.append(viewport, description, style);
  const exported = new DOMParser().parseFromString(input.html, "text/html");
  doc.body.innerHTML = exported.body.innerHTML;
  for (const attribute of Array.from(exported.body.attributes))
    doc.body.setAttribute(attribute.name, attribute.value);
  for (const [name, value] of Object.entries(input.bodyAttributes))
    if (value !== undefined && value !== null)
      doc.body.setAttribute(name, String(value));
  removeBodyMetadata(doc.body);
  doc.body.querySelectorAll("script").forEach((script) => script.remove());
  for (const script of input.scripts)
    doc.body.insertAdjacentHTML("beforeend", script);
  return "<!doctype html>" + doc.documentElement.outerHTML;
}
