# GitHub Pages で公開

- 管理番号: #0008
- 種類: DPL（デプロイ）
- 対象: 全体（ALL）
- 作成日: 2026-10-08
- 関連: #0005（iOS のビルド確認）、#0007（サポートページ）

## 概要

リポジトリ `kiyotake1229/nagi-pond`（公開）を作り、GitHub Pages で Web 版とサポートページを公開した。push のたびに Pages が更新され、GitHub Actions で iOS のビルド確認も走る。

## 対象ファイル

- リポジトリ全体（`リラックス/` がリポジトリの一番上）
- `.nojekyll` … GitHub Pages の変換（Jekyll）を使わず、そのまま配信する
- `.gitignore` … `ios-app/node_modules/`・`ios-app/www/`・Pods・ビルド物・`.claude/launch.json` を除く
- `.github/workflows/ios-build.yml`

## 変更内容

- `git init` → 最初のコミット（`[#0001]…[#0010]`）→ `gh repo create kiyotake1229/nagi-pond --public` → push
- 最初の push が HTTP 408 で切れたため、このリポジトリだけ `http.version = HTTP/1.1` にして送り直した（`git config` のリポジトリ内の設定）
- Pages の公開元: `main` ブランチの一番上（`/`）

## 確認URL

| 環境 | URL |
|------|-----|
| 本番（ゲーム） | https://kiyotake1229.github.io/nagi-pond/ |
| サポート・プライバシーポリシー | https://kiyotake1229.github.io/nagi-pond/support.html |
| リポジトリ | https://github.com/kiyotake1229/nagi-pond |
| iOS ビルド確認 | https://github.com/kiyotake1229/nagi-pond/actions/runs/37786685490 |

確認したこと（2026-10-08）:

- `index.html`・`support.html`・`manifest.json`・`sw.js`・アイコンがすべて 200 で返る
- 公開版を Claude のブラウザ（スマホの大きさ、音は消して）で開き、開始 → 18回のタップで満開 → 新しい鯉（プラチナ）が図鑑に登録 → 池の写真（1080×1350）まで動いた。Service Worker が登録された。エラーなし
- GitHub Actions（macOS）で `npm ci` → `npx cap sync ios`（pod install を含む）→ `xcodebuild build` が成功（`** BUILD SUCCEEDED **`）

## 作業概要と概算費用

| 項目 | 内容 | 工数 |
|------|------|------|
| 公開 | リポジトリ作成・push・Pages の設定 | 0.2h |
| 確認 | 公開版の動作、iOS ビルドの結果 | 0.2h |
| 合計 | | 0.4h（0.05人日） |

概算費用: 人日単価が未設定のため金額は未記載
