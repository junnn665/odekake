# おでかけ日和

全国どこでも、いる場所のまわりのデートスポット・観光スポットを探せる非公式サイトです。
全国のおでかけニュースも1時間ごとに自動で集めます。GitHub Pages で動く静的サイトで、サーバーやAPIキーはいりません。

## ページ

- `index.html` … さがす場所（現在地・都道府県・地名）を決めると、まわりのスポットを気分別に一覧。行きたいリスト、おでかけニュース
- `map.html` … スポットマップ。地図を動かして「この辺りで探す」で、どこでも探せる。`map.html?id=...` でそのスポットを開く
- `gacha.html` … デートガチャ。範囲・気分・天気・時間帯から行き先を1か所選び、近くで次に寄れる場所も出す

さがす場所・範囲・行きたいリストは、その端末のブラウザ（localStorage）にだけ保存されます。

## スポットの探し方（ページを開いた人のブラウザで動きます）

- 場所 … 現在地はブラウザの位置情報。町名は国土地理院の逆ジオコーダ、地名・駅名の検索は国土地理院の住所検索
  （見つからないときは OpenStreetMap Nominatim）を使います
- スポット … OpenStreetMap の Overpass API で、指定した範囲の展望台・水族館・動物園・テーマパーク・美術館・博物館・城・
  寺社（Wikipedia の記事があるもの）・庭園・公園・海岸・滝などを探します（`assets/common.js` の `overpassQuery`）
- 種類・気分・時間帯・屋内かどうかは OpenStreetMap のタグから決めます（`classify`）。Wikipedia に記事がある場所は「有名どころ」として上に並べます
- 説明文と写真は Wikipedia から取り、カードに出典を表示します
- 同じ場所の結果は6時間ブラウザに保存し、何度も問い合わせないようにしています
- `data/spots.json` … 編集部のおすすめ（デートのコツ・見頃つき）。近くにあれば「編集部おすすめ」として一緒に出ます

## ニュース

- `scripts/fetch_news.py` … Bingニュース / Googleニュースのキーワード検索RSSから、おでかけ関連の記事を集めて
  カテゴリ（イベント・新スポット・季節・観光）と都道府県を振り分け、`data/news.json` に保存（標準ライブラリのみ）
- 全国共通のキーワードは毎回、都道府県ごとのキーワードは1回に12県ずつ（4時間で47都道府県をひと回り）検索します
- トップページでは、さがす場所の都道府県のニュースと全国のニュースを切り替えて見られます
- `.github/workflows/update.yml` … 毎時17分に上のスクリプトを実行し、GitHub Pages に公開

## 初回設定

1. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする
2. **Actions** タブ → 「ニュース更新と公開」 → **Run workflow** で1回手動実行する
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で表示されます

## ホーム画面に追加

スマホのブラウザで開いて「ホーム画面に追加」すると、アプリのように使えます。
アイコンは `assets/icon.svg`（元の絵）から `apple-touch-icon.png`（iPhone）、`icon-192.png` / `icon-512.png`、
`icon-maskable-512.png`（Android の丸や角丸に切り抜かれる用）を書き出しています。

## 編集部のおすすめを増やす

`data/spots.json` の `spots` に1件足します。

| 項目 | 内容 |
| --- | --- |
| `id` | 英数字の短い名前（URLに使う） |
| `area` | 都道府県（`愛知` のように「県」なし。`名古屋` は愛知県あつかい）。`pref` に `東京都` のように書いてもよい |
| `tags` | `date`デート定番 `yakei`夜景・展望 `zekkei`絶景・自然 `taiken`遊ぶ・体験 `art`ミュージアム `rekishi`歴史・寺社 `cafe`街歩き・名所 `ame`雨の日OK（先頭のタグがカードの色になる） |
| `indoor` | 屋内なら `true`（ガチャで「雨」を選んだときの候補になる） |
| `best` | 見頃の月（例 `[4,5,11]`）。通年なら `[]` |
| `when` | `朝` `昼` `夕方` `夜` のうちおすすめの時間帯 |
| `budget` | `0`無料 `1`お手頃 `2`ふつう `3`ちょっと贅沢 |
| `stay` / `desc` / `tip` | 滞在時間のめやす / 説明 / デートのコツ |
| `lat` / `lng` | 緯度・経度（Googleマップで右クリックするとコピーできます） |

## 調整したいとき

- 探すスポットの種類 … `assets/common.js` の `overpassQuery` と `classify`
- 気分（タグ）の名前や色 … 同じファイルの `TAGS`、範囲の選択肢 … `RADII`
- ニュースのキーワード … `scripts/fetch_news.py` の `NATIONAL_QUERIES` と `pref_queries`
- ニュースの都道府県判定 … 同じファイルの `PLACE_WORDS`（主な市・観光地の名前）

## 手元で試す

```sh
python3 scripts/fetch_news.py
python3 -m http.server 8000   # → http://localhost:8000
```

地図データ © OpenStreetMap contributors（ODbL）、位置の検索は国土地理院、説明と写真は Wikipedia（CC BY-SA）。
地図の表示に Leaflet（BSD-2-Clause, `assets/vendor/leaflet/LICENSE`）を使っています。
