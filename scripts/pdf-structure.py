"""Bounded opt-in PDF text-layer extraction. No OCR, neural models or network."""
import io
import json
import sys
import signal

# Retain a local deadline even if the Node ingestion worker is terminated.
if hasattr(signal, "alarm"):
    signal.alarm(30)
import pdfplumber

payload = sys.stdin.buffer.read(30 * 1024 * 1024 + 1)
if len(payload) > 30 * 1024 * 1024:
    raise ValueError("PDF exceeds input limit")
pages, tables = [], []
characters = cells = 0
with pdfplumber.open(io.BytesIO(payload)) as pdf:
    if len(pdf.pages) > 300:
        raise ValueError("PDF exceeds 300-page enhancement limit")
    for number, page in enumerate(pdf.pages, 1):
        found = [(t, t.extract()) for t in page.find_tables()]
        found = [(t, rows) for t, rows in found if len(rows) >= 2 and max(map(len, rows), default=0) >= 2]
        excluded = [t.bbox for t, _ in found]
        body = page.filter(lambda o: not any(o.get("x0", -1) >= x0 and o.get("x1", -1) <= x1 and o.get("top", -1) >= top and o.get("bottom", -1) <= bottom for x0, top, x1, bottom in excluded))
        # Coordinate ordering is conservative: no speculative multi-column reconstruction.
        entries = []
        for line in body.extract_text_lines(layout=False):
            text = line["text"]
            characters += len(text)
            if characters > 8000000:
                raise ValueError("PDF exceeds enhancement text limit")
            entries.append((line["top"], line["x0"], {"type": "paragraph", "text": text, "bounds": {"x": line["x0"], "y": line["top"], "width": line["x1"]-line["x0"], "height": line["bottom"]-line["top"]}}))
        for table, rows in found:
            cells += sum(len(row) for row in rows)
            if cells > 100000 or len(tables) >= 100:
                raise ValueError("PDF table budget exceeded")
            entries.append((table.bbox[1], table.bbox[0], {"type": "table", "_rows": rows}))
        children = []
        for _, _, node in sorted(entries, key=lambda e: (e[0], e[1])):
            if node["type"] == "table":
                tables.append({"name": f"Page {number} table {len(tables)+1}", "rows": node.pop("_rows")})
            children.append(node)
        pages.append({"type": "page", "metadata": {"pageNumber": number}, "children": children})
        page.close()
print(json.dumps({"nodes": pages, "tables": tables}, ensure_ascii=False))
