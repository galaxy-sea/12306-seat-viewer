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
  scripts/popup.js
  icons/icon16.png
  icons/icon32.png
  icons/icon48.png
  icons/icon64.png
  icons/icon128.png
  images/AliPay.png
  images/WeChatPay.png

)

VERSION=$(date +%Y.%-m%d.1%H%M)

sed -i '' "s/\"version\": *\"[0-9\.]*\"/\"version\": \"$VERSION\"/" "manifest.json"

echo "Packing files into ${OUTPUT_ZIP} ..."

zip -r "$OUTPUT_ZIP" "${FILES[@]}"

echo "Done."
