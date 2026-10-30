# おでかけ日和

東海・名古屋のデートスポット・観光スポットをまとめ、おでかけニュースを1時間ごとに自動で集める非公式サイトです。
GitHub Pages で動く静的サイトで、サーバーやAPIキーはいりません。

## ページ

- `index.html` … スポット一覧（気分・エリア・キーワードで絞り込み）、いま見頃のスポット、行きたいリスト、おでかけニュース
- `map.html` … スポットマップ（Leaflet + OpenStreetMap）。`map.html?id=nagoyajo` でそのスポットを開いた状態に
- `gacha.html` … デートガチャ。エリア・気分・天気・時間帯・予算から行き先を1か所選び、近くで次に寄れる場所も出す

「行きたい」はその端末のブラウザ（localStorage）にだけ保存されます。

## しくみ

- `data/spots.json` … スポットのデータ（手で書いて増やす）
- `scripts/fetch_news.py` … Bingニュース / Googleニュースのキーワード検索RSSから、東海のおでかけ関連の記事を集めて
  カテゴリ（イベント・新スポット・季節・観光）とエリアを振り分け、`data/news.json` に保存（標準ライブラリのみ）
- `.github/workflows/update.yml` … 毎時17分に上のスクリプトを実行し、GitHub Pages に公開

## 初回設定

1. このフォルダの中身を新しいリポジトリの `main` ブランチに push する
2. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする
3. **Actions** タブ → 「ニュース更新と公開」 → **Run workflow** で1回手動実行する
4. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で表示されます

## スポットを増やす

`data/spots.json` の `spots` に1件足します。

| 項目 | 内容 |
| --- | --- |
| `id` | 英数字の短い名前（URLに使う） |
| `area` | `名古屋` / `愛知` / `岐阜` / `三重` |
| `tags` | `date`デート定番 `yakei`夜景 `zekkei`絶景・自然 `cafe`街歩き `taiken`遊ぶ・体験 `rekishi`歴史・寺社 `ame`雨の日OK（先頭のタグがカードの色になる） |
| `indoor` | 屋内なら `true`（ガチャで「雨」を選んだときの候補になる） |
| `best` | 見頃の月（例 `[4,5,11]`）。通年なら `[]` |
| `when` | `朝` `昼` `夕方` `夜` のうちおすすめの時間帯 |
| `budget` | `0`無料 `1`お手頃 `2`ふつう `3`ちょっと贅沢 |
| `stay` / `desc` / `tip` | 滞在時間のめやす / 説明 / デートのコツ |
| `lat` / `lng` | 緯度・経度（Googleマップで右クリックするとコピーできます） |

座標はおおよその位置です。Googleマップへのリンクは名前で検索するので、多少ずれていても迷いません。

## 調整したいとき

- 集めるニュースのキーワード … `scripts/fetch_news.py` の `QUERIES`
- ニュースのカテゴリ分け … 同じファイルの `CATEGORY_RULES`
- エリアの判定 … `AREA_RULES`、除外する話題 … `NG_WORDS`
- 気分（タグ）の名前や色 … `assets/common.js` の `TAGS`

## 手元で試す

```sh
python3 scripts/fetch_news.py
python3 -m http.server 8000   # → http://localhost:8000
```

地図は © OpenStreetMap contributors、Leaflet（BSD-2-Clause, `assets/vendor/leaflet/LICENSE`）を使っています。
