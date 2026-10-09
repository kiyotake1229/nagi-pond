# 凪の池 — 波紋と鯉のリラックスゲーム

夜の池の水面に触れて、波紋と音を楽しむスマホ向けのゲーム。波紋で蓮を咲かせ、満開になると新しい鯉がやってくる。時間制限や失敗はない。

| 項目 | 内容 |
|---|---|
| 状態 | **Web版 1.2.0 公開中**。PWA対応済み。**iOS プロジェクト構築済み**（GitHub Actions でビルド確認。Xcode 環境で署名して申請するだけ） |
| Web公開 | https://kiyotake1229.github.io/nagi-pond/ |
| サポート・プライバシーポリシー | https://kiyotake1229.github.io/nagi-pond/support.html |
| 確認用（Claude Artifact） | https://claude.ai/artifact/FivdBkt9EX3YCDXuZuuNqn （非公開。見るには共有設定が必要） |
| リポジトリ | https://github.com/kiyotake1229/nagi-pond |
| 本体 | `index.html`（約130KB。画像・音源ファイルなし） |
| 自動テスト | `node tools/test.mjs`（24件。長時間の動作・保存データ・iOS の控え・引き継ぎなど） |
| 通信 | なし（完全オフライン。外部フォントも使わない） |
| データ | 端末内のみ（localStorage のキー `nagi.v1`。iOS 版はアプリ用の保存領域にも二重に保存） |
| PWA | 対応（`manifest.json` / `sw.js` / アイコン一式） |
| iOS | Capacitor 7 → [`ios-app/`](ios-app/)。Bundle ID `work.ltv.nagi` |

---

## 岩崎さんへ

App Store への申請手順は **[ios-app/岩崎さんへの引き渡し手順.md](ios-app/岩崎さんへの引き渡し手順.md)** にまとめてあります。
申請時に入力する文面（説明文・キーワードなど）と、App Store 用のスクリーンショット（4サイズ×5枚、`ios-app/screenshots/`）も用意済みです。

---

## 主な機能

- **波紋と音** — 触れた位置で音の高さが変わる。どこを触っても濁らない音階
- **蓮を咲かせる** — 波紋がつぼみに届くと開く。五輪そろうと「満開」
- **鯉が育つ・集まる** — 餌を食べて稚魚から大鯉へ。12種類の図鑑（めずらしさ3段階）。池には9匹まで。**名前を付けられる**
- **池の写真** — 今の池を一枚の写真（節気・日付・記録入り）にして共有
- **池のしつらえ** — 満開の回数で白蓮・鹿威し・浮き灯籠などが増える
- **景色と季節** — 時刻で夜・朝霧・昼・夕暮れ、二十四節気で桜・蛍・紅葉・雪が変わる
- **呼吸** — 輪に合わせて息をする（ととのう・ねむる・しずめる、1/3/5分）
- **記録** — 今日の時間、続けた日数、一週間のグラフ
- **おやすみタイマー** — 15/30/60分で音が消えて画面が暗くなる
- **夜のお知らせ（iOS 版）** — 毎晩、季節のひとことと一緒に通知
- **記録の引き継ぎ** — 引き継ぎコードで、機種変更やブラウザ版→アプリ版でも池をそのまま移せる

## ネイティブ版（iOS）の追加機能

| 機能 | Web版 | iOS版 |
|---|---|---|
| 触覚 | Android のみ（`navigator.vibrate`） | 本物の触覚 |
| 池の写真の共有 | Web Share API。使えなければ長押し保存 | 共有シート（写真への保存も） |
| 夜のお知らせ | なし | ローカル通知（14日分を予約し、開くたびに補充） |
| データ保存 | localStorage | localStorage ＋ アプリ用の保存領域 |

## 開発ドキュメント

開発の記録は `docs/` で管理している。命名規則・連番のルールは [docs/README.md](docs/README.md)。

- 現状の仕様と構成（最初の1本）: [docs/20261008_DOC_0001_ALL_現状の仕様と構成.md](docs/20261008_DOC_0001_ALL_現状の仕様と構成.md)
- 以降の変更: #0002 名前 / #0003 写真 / #0004 夜のお知らせ / #0005 iOS化 / #0006 満開の文字のぼやけ / #0007 サポートページ / #0008 GitHub Pages 公開 / #0009 スクリーンショット / #0010 収益化の案
- 不具合チェック（v1.2.0）: #0011 iOS の控え / #0012 池が止まる / #0013 合計時間 / #0014 意図しない開花 / #0015 小さな修正 / #0016 電波が弱いときの起動 / #0017 記録の引き継ぎ / #0018 自動テスト
- 機能追加・バグ修正・改善をしたら、1件ごとに文書を足して `bash docs/manager/generate_docs_json.sh` を実行する

## ファイル構成

```
リラックス/
  index.html              アプリ本体
  support.html            サポート・プライバシーポリシー
  manifest.json / sw.js   PWA用
  icon.svg                アイコン元データ
  icon-192.png / icon-512.png / icon-512-maskable.png / apple-touch-icon.png
  tools/
    make-icon-svg.mjs     icon.svg を作る（鯉の絵）
    make-icons.sh         icon.svg から PNG 一式と iOS 用の元画像を作る
    make-artifact.sh      Claude Artifact に載せる版を作る
    make-screenshots.mjs  App Store 用スクリーンショットを作る（台紙: screenshot-frame.html）
    test.mjs              自動テスト（node tools/test.mjs）
  ios-app/                iOS プロジェクト（Capacitor）
    岩崎さんへの引き渡し手順.md
    screenshots/          App Store 用スクリーンショット
  docs/                   開発ドキュメント
  .github/workflows/      iOS のビルド確認と自動テスト（GitHub Actions）
```

## 修正したいとき

1. `index.html` を直す
2. 自動テストを流す: `node tools/test.mjs`（全件合格を確かめる）
3. ローカルで確認する: `python3 -m http.server 8791` → http://localhost:8791/
4. GitHub に push すると、数分で Web 公開版が更新され、iOS のビルド確認も自動で走る
5. iOS に反映する: `ios-app/` で `npm run sync` → Xcode で再ビルド
6. 確認用URLを更新する: `bash tools/make-artifact.sh 出力先.html` で作ったファイルを、同じ Artifact に載せ直す
7. `sw.js` の保存対象（アイコンなど）を変えたときは、`CACHE` の名前（今は `nagi-v2`）の数字を上げる

`ios-app/node_modules/`（約100MB）は Dropbox の同期を重くするので、使い終わったら消してよい（`npm install` で戻る）。

## 残作業

| 作業 | 内容 |
|---|---|
| App Store 申請 | 岩崎さんの Xcode 環境で署名 → アップロード → 審査提出（引き渡し手順のとおり） |
| 実機での確認 | 音の出方（消音モード）、触覚、写真の共有、夜のお知らせ |
| 収益化（任意） | 案は [docs/20261008_RPT_0010_ALL_収益化の案.md](docs/20261008_RPT_0010_ALL_収益化の案.md)。v1.2 で「応援」と景色パック1つから |
