#!/bin/bash
# icon.svg から PNG アイコン一式を作り直す
# 使い方: bash tools/make-icons.sh（要 Node.js。初回だけ npx が変換ツールを取得する）
# 鯉の絵そのものを描き直すときは、先に node tools/make-icon-svg.mjs icon.svg を実行する
set -e
cd "$(dirname "$0")/.."
R="npx -y @resvg/resvg-js-cli@2.6.2-beta.1"

$R --fit-width 192 icon.svg icon-192.png
$R --fit-width 512 icon.svg icon-512.png
$R --fit-width 180 icon.svg apple-touch-icon.png
# マスカブル: Android などで丸く切り抜かれても欠けないよう、絵を中央に 72% の大きさで置く
sed -e 's|<g id="art">|<g id="art" transform="translate(128 128) scale(0.72) translate(-128 -128)">|' icon.svg | $R --fit-width 512 - icon-512-maskable.png
# iOS アプリ用の元画像（ios-app/ がある場合）。このあと ios-app で npm run icons を実行すると、アイコンと起動画面が作られる
if [ -d ios-app/assets ]; then
  $R --fit-width 1024 icon.svg ios-app/assets/icon-only.png
  # 起動画面（2732×2732）: 池の色の地の中央に、アイコンの絵（背景の四角なし）を置く
  sed -e 's|width="512" height="512" viewBox="0 0 256 256"|width="2732" height="2732" viewBox="0 0 2732 2732"|' \
      -e 's|<rect width="256" height="256" fill="url(#bg)"/>|<rect width="2732" height="2732" fill="#08151c"/>|' \
      -e 's|<g id="art">|<g id="art" transform="translate(1366 1366) scale(2.4) translate(-128 -128)">|' icon.svg | $R - ios-app/assets/splash.png
  cp ios-app/assets/splash.png ios-app/assets/splash-dark.png
fi

echo "アイコンを作り直しました"
