#!/bin/bash
# 親フォルダのWebアプリ本体を www/ にコピーする（ネイティブアプリに同梱するため）
set -e
cd "$(dirname "$0")"
SRC=".."
DEST="www"
rm -rf "$DEST"
mkdir -p "$DEST"
for f in index.html manifest.json icon.svg icon-192.png icon-512.png apple-touch-icon.png; do
  if [ -f "$SRC/$f" ]; then cp "$SRC/$f" "$DEST/"; fi
done
# sw.js はネイティブでは不要（index.html 側でも NATIVE 時は登録しない）
echo "Web資産を www/ にコピーしました:"
ls -1 "$DEST"
