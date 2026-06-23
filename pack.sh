#!/bin/bash
# 打包浏览器扩展工程文件为 zip 包。

set -euo pipefail


OUTPUT_ZIP="./12306-seat-viewer.zip"
USERSCRIPT_TEMPLATE="./userscripts/12306-seat-viewer.user.template.js"
USERSCRIPT_OUTPUT="./userscripts/12306-seat-viewer.user.js"

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

json_string() {
  sed \
    -e 's/\\/\\\\/g' \
    -e 's/"/\\"/g' \
    -e 's/$/\\n/' "$1" | tr -d '\n' | sed 's/^/"/;s/\\n$/"/'
}

CONTENT_CSS_STRING=$(json_string "./styles/content.css")
{
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "__CONTENT_SCRIPT__" ]]; then
      cat "./scripts/content-script.js"
      continue
    fi

    line="${line//__VERSION__/$VERSION}"
    if [[ "$line" == *"__CONTENT_CSS_STRING__"* ]]; then
      before="${line%%__CONTENT_CSS_STRING__*}"
      after="${line#*__CONTENT_CSS_STRING__}"
      printf '%s%s%s\n' "$before" "$CONTENT_CSS_STRING" "$after"
      continue
    fi

    printf '%s\n' "$line"
  done < "$USERSCRIPT_TEMPLATE"
} > "$USERSCRIPT_OUTPUT"

echo "Generated ${USERSCRIPT_OUTPUT}"

echo "Packing files into ${OUTPUT_ZIP} ..."

zip -r "$OUTPUT_ZIP" "${FILES[@]}"

echo "Done."
