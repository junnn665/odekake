#!/usr/bin/env python3
"""おでかけ日和: 東海・名古屋のおでかけニュースを集めて data/news.json を更新する。

GitHub Actions から1時間ごとに実行される。標準ライブラリだけで動く。

取得元
  - Bing ニュース RSS（キーワード検索。記事への直リンクとサムネイルが取れる）
  - Google ニュース RSS（キーワード検索。件数の補完用）
"""

from __future__ import annotations

import concurrent.futures
import datetime as dt
import email.utils
import hashlib
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "news.json"

JST = dt.timezone(dt.timedelta(hours=9))
NOW = dt.datetime.now(dt.timezone.utc)

KEEP_DAYS = 30     # この日数より古い記事は消す
INGEST_DAYS = 14   # この日数より古い記事は新しく取り込まない
MAX_ITEMS = 300    # 保存する最大件数

UA = "Mozilla/5.0 (compatible; OdekakeBiyoriBot/1.0) Python-urllib"

# ---------------------------------------------------------------------------
# 検索キーワード（カテゴリの初期値）。ここを書き換えれば集めるニュースを調整できる
# ---------------------------------------------------------------------------
QUERIES = [
    ("名古屋 デートスポット", "kanko"),
    ("名古屋 デート", "kanko"),
    ("名古屋 観光", "kanko"),
    ("名古屋 夜景", "kanko"),
    ("愛知 観光 スポット", "kanko"),
    ("岐阜 観光", "kanko"),
    ("三重 観光", "kanko"),
    ("伊勢志摩 観光", "kanko"),
    ("名古屋 イルミネーション", "kisetsu"),
    ("東海 紅葉 ライトアップ", "kisetsu"),
    ("愛知 花火大会", "kisetsu"),
    ("名古屋 桜 名所", "kisetsu"),
    ("名古屋 イベント 週末", "event"),
    ("名古屋 展覧会 OR 企画展", "event"),
    ("愛知 イベント 開催", "event"),
    ("名古屋 フェス", "event"),
    ("名古屋 新スポット OR 開業", "shin"),
    ("愛知 新施設 オープン", "shin"),
    ("名古屋 リニューアル オープン 施設", "shin"),
    ("ジブリパーク", "kanko"),
    ("名古屋港水族館", "kanko"),
    ("なばなの里", "kisetsu"),
]

# 上から順に判定し、最初に当たったカテゴリにする
CATEGORY_RULES = [
    ("kisetsu", ["イルミネーション", "イルミ", "ライトアップ", "紅葉", "花火", "桜", "お花見",
                 "あじさい", "藤まつり", "梅まつり", "雪景色", "クリスマスマーケット"]),
    ("shin", ["オープン", "開業", "新施設", "新スポット", "リニューアル", "誕生", "グランドオープン"]),
    ("event", ["イベント", "フェス", "まつり", "祭り", "開催", "展覧会", "企画展", "マルシェ",
               "ライブ", "体験会", "フェア", "限定公開"]),
]

# 東海の地名（エリア判定。上から順に判定）
AREA_RULES = [
    ("名古屋", ["名古屋", "栄", "名駅", "大須", "金山", "久屋大通", "覚王山", "東山", "熱田", "名城", "ささしま"]),
    ("愛知", ["愛知", "長久手", "常滑", "犬山", "豊田", "岡崎", "蒲郡", "豊橋", "一宮", "春日井",
              "瀬戸", "知多", "半田", "刈谷", "安城", "西尾", "日間賀", "篠島", "セントレア", "ジブリパーク"]),
    ("岐阜", ["岐阜", "高山", "飛騨", "白川郷", "郡上", "下呂", "多治見", "大垣", "関市", "美濃", "恵那", "中津川"]),
    ("三重", ["三重", "伊勢", "志摩", "鳥羽", "桑名", "四日市", "鈴鹿", "津市", "松阪", "熊野", "菰野",
              "湯の山", "なばなの里", "ナガシマ", "長島"]),
]

# 東海以外の地域名（東海の地名が無く、これが入っている記事は除外）
OTHER_REGION_WORDS = [
    "北海道", "札幌", "東北", "仙台", "東京", "関東", "神奈川", "横浜", "埼玉", "千葉", "渋谷", "新宿",
    "銀座", "大阪", "関西", "梅田", "京都", "神戸", "兵庫", "奈良", "和歌山", "滋賀", "広島", "岡山",
    "四国", "九州", "福岡", "博多", "沖縄", "長野", "新潟", "北陸", "金沢", "富山", "福井", "静岡", "浜松",
]

# おでかけと関係の薄い記事
NG_WORDS = [
    "事故", "死亡", "逮捕", "容疑", "火災", "殺人", "詐欺", "訃報", "不祥事", "求人", "株価", "決算",
    "選挙", "議会", "グラビア", "水着", "写真集",
]

JUNK_PATTERNS = [
    re.compile(r"画像\s*\d+\s*/\s*\d+"),
    re.compile(r"写真\s*\d+\s*/\s*\d+"),
    re.compile(r"【画像】"),
    re.compile(r"\s\d+\s*/\s*\d+\s*$"),
]


def fetch(url: str, timeout: int = 20) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ja"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.read()
    except Exception as e:  # noqa: BLE001 ネットワークの失敗は次回に回す
        print(f"  取得失敗: {url[:90]} ({e})", file=sys.stderr)
        return None


def parse_date(text: str | None) -> dt.datetime | None:
    if not text:
        return None
    try:
        d = email.utils.parsedate_to_datetime(text)
        if d.tzinfo is None:
            d = d.replace(tzinfo=dt.timezone.utc)
        return d
    except Exception:  # noqa: BLE001
        return None


def clean_title(title: str, source: str) -> str:
    title = html.unescape(title or "").strip()
    if source and title.endswith(" - " + source):
        title = title[: -len(" - " + source)]
    return re.sub(r"\s+", " ", title).strip()


def bing_items(query: str):
    url = "https://www.bing.com/news/search?" + urllib.parse.urlencode(
        {"q": query, "format": "rss", "mkt": "ja-JP", "setlang": "ja"})
    raw = fetch(url)
    if not raw:
        return []
    out = []
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return []
    for it in root.iter("item"):
        link = it.findtext("link") or ""
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(link).query)
        if "url" in qs:
            link = qs["url"][0]
        source = ""
        image = None
        for child in it:
            tag = child.tag.split("}")[-1]
            if tag == "Source":
                source = (child.text or "").strip()
            elif tag == "Image" and child.text:
                image = child.text.strip()
        out.append({
            "title": clean_title(it.findtext("title") or "", source),
            "link": link,
            "source": source or urllib.parse.urlparse(link).netloc,
            "image": image,
            "published": parse_date(it.findtext("pubDate")),
            "desc": html.unescape(re.sub(r"<[^>]+>", "", it.findtext("description") or "")).strip(),
        })
    return out


def google_items(query: str):
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": query + " when:14d", "hl": "ja", "gl": "JP", "ceid": "JP:ja"})
    raw = fetch(url)
    if not raw:
        return []
    out = []
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return []
    for it in root.iter("item"):
        source = (it.findtext("source") or "").strip()
        out.append({
            "title": clean_title(it.findtext("title") or "", source),
            "link": it.findtext("link") or "",
            "source": source,
            "image": None,
            "published": parse_date(it.findtext("pubDate")),
            "desc": "",
        })
    return out


def norm_key(title: str) -> str:
    """同じ記事を見分けるためのキー（記号と空白を取り除いた見出しの先頭）"""
    t = re.sub(r"[\s　「」『』【】\[\]（）()！!？?、。・…:：\-—–~〜]", "", title)
    return t[:28]


def classify(text: str, default: str) -> str:
    for cat, words in CATEGORY_RULES:
        if any(w in text for w in words):
            return cat
    return default


def detect_area(text: str) -> str | None:
    for area, words in AREA_RULES:
        if any(w in text for w in words):
            return area
    if "東海" in text:
        return "東海"
    return None


def accept(item: dict) -> bool:
    title = item["title"]
    if not title or len(title) < 8:
        return False
    if any(p.search(title) for p in JUNK_PATTERNS):
        return False
    text = title + " " + item.get("desc", "")
    if any(w in text for w in NG_WORDS):
        return False
    return True


def main() -> int:
    old = {"items": []}
    if DATA_FILE.exists():
        try:
            old = json.loads(DATA_FILE.read_text("utf-8"))
        except json.JSONDecodeError:
            pass
    items = {it["id"]: it for it in old.get("items", [])}
    seen_keys = {norm_key(it["title"]) for it in items.values()}

    jobs = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        for q, cat in QUERIES:
            jobs.append((cat, ex.submit(bing_items, q)))
            jobs.append((cat, ex.submit(google_items, q)))
        results = [(cat, f.result()) for cat, f in jobs]

    added = 0
    now_jst = NOW.astimezone(JST).isoformat(timespec="seconds")
    for default_cat, found in results:
        for it in found:
            if not accept(it):
                continue
            pub = it["published"] or NOW
            if NOW - pub > dt.timedelta(days=INGEST_DAYS):
                continue
            text = it["title"] + " " + it.get("desc", "")
            area = detect_area(text)
            if area is None:
                if any(w in text for w in OTHER_REGION_WORDS):
                    continue
                area = "東海"
            key = norm_key(it["title"])
            if key in seen_keys:
                continue
            seen_keys.add(key)
            nid = hashlib.sha1(it["link"].encode("utf-8")).hexdigest()[:16]
            if nid in items:
                continue
            items[nid] = {
                "id": nid,
                "title": it["title"],
                "link": it["link"],
                "source": it["source"],
                "image": it["image"],
                "category": classify(text, default_cat),
                "area": area,
                "published": pub.astimezone(JST).isoformat(timespec="seconds"),
                "added": now_jst,
            }
            added += 1

    # 古い記事を消して新しい順に並べる
    cutoff = NOW - dt.timedelta(days=KEEP_DAYS)
    kept = [it for it in items.values()
            if dt.datetime.fromisoformat(it["published"]) >= cutoff]
    kept.sort(key=lambda it: it["published"], reverse=True)
    kept = kept[:MAX_ITEMS]

    out = {"updated": now_jst, "items": kept}
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", "utf-8")
    print(f"新しい記事 {added} 件 / 保存 {len(kept)} 件")
    return 0


if __name__ == "__main__":
    sys.exit(main())
