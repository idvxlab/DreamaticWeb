"""Local PDF layout analysis for import. No OCR, no network, no language model.

Pages are rendered with PDFium and passed to the PP-DocLayoutV3 layout detector (ONNX, CPU, via
rapid-layout); the PDF's own text layer is placed into the detected blocks by PDFium character boxes.
Reads the PDF on stdin; argv: <model.onnx> <crop directory>. Writes JSON to stdout:
  nodes:    officeparser-shaped page nodes (paragraph / heading / table / image) with bounds in
            points, top-left origin, in the detector's reading order;
  pictures: picture regions {page, box, label, file} with an upright crop rendered into the directory.
Rules (document-agnostic): a word belongs to the block holding its centre; text printed inside a
picture region stays readable after it; text outside every block is kept line by line; page headers
and footers are dropped only when the same running text (digits ignored) repeats on two or more pages
or is a bare page number; a picture region lying mostly inside a larger one is the same figure.
"""
import io
import json
import os
import re
import signal
import sys
from collections import Counter
from pathlib import Path

if hasattr(signal, "alarm"):
    signal.alarm(170)  # a local deadline even if the Node worker is terminated

import numpy as np
import pdfplumber
import pypdfium2 as pdfium
from rapid_layout import ModelType, RapidLayout

MAX_BYTES = 30 * 1024 * 1024
MAX_PAGES = 300
DETECT_SCALE = 1.5          # 108 dpi page image for the detector (it resizes to 800x800)
CROP_DPI, CROP_MAX_SIDE = 200, 2000
FURNITURE = {"header", "footer", "number", "page_number", "header_image", "footer_image", "aside_text", "footnote_number"}
PICTURE = {"image", "figure", "chart", "seal"}
TITLE = {"doc_title", "paragraph_title", "title"}
TABLE = {"table"}
SOFT = "\x02￾"

model_path, crop_dir = sys.argv[1], Path(sys.argv[2])
payload = sys.stdin.buffer.read(MAX_BYTES + 1)
if len(payload) > MAX_BYTES:
    raise ValueError("PDF exceeds input limit")
threads = int(os.environ.get("DREAMATIC_LAYOUT_THREADS", "-1"))
engine = RapidLayout(model_type=ModelType.PP_DOC_LAYOUTV3, model_dir_or_path=model_path,
                     engine_cfg={"intra_op_num_threads": threads})


def furniture_key(text):
    return re.sub(r"[\divxlcIVXLC\s.,·|/-]+", "", text)


def bounds(box):
    return {"x": round(box[0], 2), "y": round(box[1], 2), "width": round(box[2] - box[0], 2), "height": round(box[3] - box[1], 2)}


def inside(a, b):
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    return w > 0 and h > 0 and w * h >= 0.8 * (a[2] - a[0]) * (a[3] - a[1])


def area(b):
    return (b[2] - b[0]) * (b[3] - b[1])


doc = pdfium.PdfDocument(payload)
if len(doc) > MAX_PAGES:
    raise ValueError("PDF exceeds page limit")
plumb = pdfplumber.open(io.BytesIO(payload))
pages, pictures, characters = [], [], 0
for n in range(len(doc)):
    page = doc[n]
    pw, ph = page.get_width(), page.get_height()
    image = np.array(page.render(scale=DETECT_SCALE).to_pil().convert("RGB"))[:, :, ::-1]
    res = engine(image)
    boxes = [[v / DETECT_SCALE for v in b] for b in (res.boxes if res.boxes is not None else [])]
    names = [str(x).lower() for x in (res.class_names if res.class_names is not None else [])]
    pic = [i for i, nm in enumerate(names) if nm in PICTURE]
    drop = {i for i in pic for j in pic if i != j and inside(boxes[i], boxes[j]) and area(boxes[i]) < area(boxes[j])}
    blocks = [(b, nm) for k, (b, nm) in enumerate(zip(boxes, names)) if k not in drop]

    tp = page.get_textpage()
    count = tp.count_chars()
    full = tp.get_text_range(0, count) if count else ""
    characters += len(full)
    if characters > 8_000_000:
        raise ValueError("PDF exceeds text limit")
    words, run = [], []

    def flush():
        if run:
            words.append({"x0": min(c[1] for c in run), "x1": max(c[2] for c in run), "top": min(c[3] for c in run),
                          "bottom": max(c[4] for c in run), "idx": [c[0] for c in run]})
        run.clear()
    for i in range(min(count, len(full))):
        if full[i].isspace() or full[i] in SOFT:
            flush()
            continue
        left, bottom, right, top = tp.get_charbox(i)
        if run and (abs((ph - top) - run[-1][3]) > 3 or left - run[-1][2] > 2):
            flush()
        run.append((i, left, right, ph - top, ph - bottom))
    flush()

    def text_of(ws):
        out, prev = [], None
        for i in sorted(i for w in ws for i in w["idx"]):
            if prev is not None and i != prev + 1:
                gap = full[prev + 1:i]
                out.append(gap if all(c.isspace() or c in SOFT for c in gap) else " ")
            out.append(full[i])
            prev = i
        text = re.sub(r"[\x02￾]\s*", "", "".join(out))  # PDFium marks a line-end hyphenation
        return re.sub(r"\s+", " ", text).strip()

    def paragraph(text, box, kind="paragraph", level=None):
        node = {"type": kind, "text": text, "bounds": bounds(box), "children": [{"type": "text", "text": text, "bounds": bounds(box)}]}
        if level:
            node["metadata"] = {"level": level}
        return node

    used, children = set(), []
    for box, name in blocks:
        ws = [w for w in words if id(w) not in used
              and box[0] - 1 <= (w["x0"] + w["x1"]) / 2 <= box[2] + 1 and box[1] - 1 <= (w["top"] + w["bottom"]) / 2 <= box[3] + 1]
        used.update(id(w) for w in ws)
        text = text_of(ws)
        if name in FURNITURE:
            if text:
                children.append({"_furniture": furniture_key(text), "node": paragraph(text, box)})
            continue
        if name in PICTURE:
            file = crop_dir / f"p{n + 1}-{len(pictures) + 1}.png"
            scale = min(CROP_DPI / 72, CROP_MAX_SIDE / max(box[2] - box[0], box[3] - box[1], 1))
            crop = page.render(scale=scale, crop=(box[0], ph - box[3], pw - box[2], box[1])).to_pil()
            crop.save(file)
            pictures.append({"page": n + 1, "box": bounds(box), "label": name, "file": str(file), "index": len(pictures)})
            children.append({"type": "image", "metadata": {"layoutPicture": len(pictures) - 1}, "bounds": bounds(box)})
            if text:  # sub-captions and labels printed inside the figure
                children.append(paragraph(text, box))
            continue
        if not text:
            continue
        if name in TITLE:
            children.append(paragraph(text, box, "heading", 1 if name == "doc_title" else 2))
        elif name in TABLE:
            pp = plumb.pages[n]
            region = [max(0, box[0] - 1), max(0, box[1] - 1), min(pp.width, box[2] + 1), min(pp.height, box[3] + 1)]
            grid = pp.crop(region).find_table({"vertical_strategy": "lines", "horizontal_strategy": "lines"})
            if not grid or len(grid.rows) < 2 or len(grid.rows[0].cells) < 2:
                grid = pp.crop(region).find_table({"vertical_strategy": "text", "horizontal_strategy": "text"})

            def cell(c):
                return "" if c is None else re.sub(r"\s+", " ", re.sub(r"[\x02￾]\s*", "", tp.get_text_bounded(
                    left=c[0], bottom=ph - c[3], right=c[2], top=ph - c[1]))).strip()
            rows = [[cell(c) for c in r.cells] for r in (grid.rows if grid else [])]
            rows = [r for r in rows if any(r)]
            keep = [j for j in range(max((len(r) for r in rows), default=0)) if any(j < len(r) and r[j] for r in rows)]
            rows = [[r[j] if j < len(r) else "" for j in keep] for r in rows]
            if len(rows) >= 2 and len(rows[0]) >= 2:
                children.append({"type": "table", "bounds": bounds(box), "children": [
                    {"type": "row", "children": [{"type": "cell", "text": c} for c in r]} for r in rows]})
            else:
                children.append(paragraph(text, box))
        else:
            children.append(paragraph(text, box))
    lines = {}
    for w in words:
        if id(w) not in used:
            lines.setdefault(round(w["top"] / 4), []).append(w)
    for _, ws in sorted(lines.items()):
        box = [min(w["x0"] for w in ws), min(w["top"] for w in ws), max(w["x1"] for w in ws), max(w["bottom"] for w in ws)]
        text = text_of(ws)
        if not text:
            continue
        if box[1] < 0.08 * ph or box[3] > 0.92 * ph:
            children.append({"_furniture": furniture_key(text), "node": paragraph(text, box)})
        else:
            children.append(paragraph(text, box))
    pages.append({"type": "page", "metadata": {"pageNumber": n + 1, "pageWidth": pw, "pageHeight": ph}, "children": children})
    tp.close()
    page.close()
plumb.close()

seen = Counter(k for p in pages for k in {c["_furniture"] for c in p["children"] if "_furniture" in c})
for p in pages:
    p["children"] = [c["node"] if "_furniture" in c else c for c in p["children"]
                     if "_furniture" not in c or (c["_furniture"] and seen[c["_furniture"]] < 2)]
print(json.dumps({"nodes": pages, "pictures": pictures}, ensure_ascii=False))
