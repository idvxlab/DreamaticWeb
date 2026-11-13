#!/usr/bin/env bash
# Optional local document runtime: .venv-documents (PDF layout analysis and table grids) and the
# PP-DocLayoutV3 layout model (Apache-2.0, ~130 MB) in models/. Linux or macOS, CPU only.
# Without it, PDF import uses officeparser alone.
set -euo pipefail
cd "$(dirname "$0")/.."
PYTHON="${PYTHON:-python3}"
MODEL_URL="${DREAMATIC_LAYOUT_MODEL_URL:-https://www.modelscope.cn/models/RapidAI/RapidLayout/resolve/v1.2.0/onnx/pp_doc_layout/pp_doc_layoutv3.onnx}"
MODEL_SHA256=250dbad1dfb9e4983fab75e1bf5085cd56ec3f41d5c7d0f8623ec74856e7aa67

"$PYTHON" -m venv .venv-documents
.venv-documents/bin/python -m pip install -r requirements-documents.txt
# rapid-layout declares the full OpenCV (needs libGL on Linux); its runtime needs are pinned above
# with the headless build, so it is installed without its declared dependencies.
.venv-documents/bin/python -m pip install --no-deps rapid-layout==1.2.1

mkdir -p models
if [ ! -f models/pp_doc_layoutv3.onnx ]; then
  curl -fL --retry 3 -o models/pp_doc_layoutv3.onnx.part "$MODEL_URL"
  mv models/pp_doc_layoutv3.onnx.part models/pp_doc_layoutv3.onnx
fi
if command -v sha256sum >/dev/null; then
  echo "$MODEL_SHA256  models/pp_doc_layoutv3.onnx" | sha256sum -c -
else
  echo "$MODEL_SHA256  models/pp_doc_layoutv3.onnx" | shasum -a 256 -c -
fi
echo "Document runtime ready."
