#!/bin/bash
# 打包浏览器扩展工程文件为 zip 包。

set -euo pipefail


OUTPUT_ZIP="./12306-seat-viewer.zip"

FILES=(
  manifest.json
  popup.html
  styles/content.css
  styles/popup.css
  scripts/content-script.js
  icons/icon16.png
  icons/icon32.png
  icons/icon48.png
  icons/icon64.png
  icons/icon128.png
)

echo "Packing files into ${OUTPUT_ZIP} ..."

zip -r "$OUTPUT_ZIP" "${FILES[@]}"

echo "Done."
