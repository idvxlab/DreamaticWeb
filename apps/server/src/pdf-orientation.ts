import type { OfficeContentNode } from "officeparser";

type Matrix = [number, number, number, number, number, number];
const multiply = (m: Matrix, n: number[]): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/**
 * How far a picture's stored pixels must be turned clockwise to look as the page shows it, from
 * the matrix the page draws the picture with (PDF y up). Only quarter and half turns count.
 */
export function turnOf([a, b, c, d]: number[]) {
  const quarter = Math.abs(a) < 1e-3 && Math.abs(d) < 1e-3;
  if (quarter) return b > 0 && c < 0 ? 270 : b < 0 && c > 0 ? 90 : 0;
  return a < 0 && d < 0 ? 180 : 0;
}

/**
 * Pictures a PDF draws turned (a photograph stored on its side and rotated onto the page). The
 * parser keeps their stored orientation, so they are matched to its image nodes by the box they
 * occupy on the page and turned upright at import. Deterministic geometry, no model call.
 */
export async function pdfImageTurns(
  pdf: Buffer,
  nodes: OfficeContentNode[],
): Promise<Map<string, number>> {
  const placed: { page: number; name: string; x: number; y: number; w: number; h: number }[] = [];
  const visit = (items: OfficeContentNode[], page?: number) => {
    for (const node of items) {
      const p = node.type === "page" ? node.metadata?.pageNumber : page;
      if (node.type === "image" && node.metadata?.attachmentName && node.bounds && p)
        placed.push({
          page: p,
          name: node.metadata.attachmentName,
          x: node.bounds.x,
          y: node.bounds.y,
          w: node.bounds.width,
          h: node.bounds.height,
        });
      visit(node.children || [], p);
    }
  };
  visit(nodes);
  const turns = new Map<string, number>();
  if (!placed.length) return turns;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf), verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages = [...new Set(placed.map((p) => p.page))];
    for (const number of pages) {
      const page = await doc.getPage(number);
      const height = page.getViewport({ scale: 1 }).height;
      const ops = await page.getOperatorList();
      const O = pdfjs.OPS;
      let ctm: Matrix = [1, 0, 0, 1, 0, 0];
      const stack: Matrix[] = [];
      ops.fnArray.forEach((fn: number, i: number) => {
        const args = ops.argsArray[i];
        if (fn === O.save) stack.push(ctm);
        else if (fn === O.restore) ctm = stack.pop() || ctm;
        else if (fn === O.transform) ctm = multiply(ctm, args);
        else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject) {
          const turn = turnOf(ctm);
          if (!turn) return;
          const xs = [ctm[4], ctm[4] + ctm[0], ctm[4] + ctm[2], ctm[4] + ctm[0] + ctm[2]];
          const ys = [ctm[5], ctm[5] + ctm[1], ctm[5] + ctm[3], ctm[5] + ctm[1] + ctm[3]];
          const x = Math.min(...xs),
            w = Math.max(...xs) - x,
            h = Math.max(...ys) - Math.min(...ys),
            top = height - Math.max(...ys);
          const hit = placed.find(
            (p) =>
              p.page === number &&
              Math.abs(p.x - x) < 1 &&
              Math.abs(p.y - top) < 1 &&
              Math.abs(p.w - w) < 1 &&
              Math.abs(p.h - h) < 1,
          );
          if (hit) turns.set(hit.name, turn);
        }
      });
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return turns;
}
