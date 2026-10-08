#!/bin/bash
# index.html から Claude Artifact に載せる版を作る
# Artifact は <html> や <head> を自動で付けるため、それらと、公開先に無いファイル（manifest・アイコン）への参照を外す
# 使い方: bash tools/make-artifact.sh 出力先.html
set -e
cd "$(dirname "$0")/.."
OUT="${1:?出力先のファイル名を指定してください}"
sed -e '/^<!doctype html>$/d' -e '/^<html lang="ja">$/d' -e '/^<head>$/d' -e '/^<\/head>$/d' \
    -e '/^<body class="intro">$/d' -e '/^<\/body>$/d' -e '/^<\/html>$/d' \
    -e '/rel="manifest"/d' -e '/rel="icon"/d' -e '/rel="apple-touch-icon"/d' index.html > "$OUT"
echo "作成しました: $OUT"
