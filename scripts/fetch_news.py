#!/usr/bin/env python3
"""おでかけ日和: 全国のおでかけニュースを集めて data/news.json を更新する。

GitHub Actions から1時間ごとに実行される。標準ライブラリだけで動く。

取得元
  - Bing ニュース RSS（キーワード検索。記事への直リンクとサムネイルが取れる）
  - Google ニュース RSS（キーワード検索。件数の補完用）

全国共通のキーワードは毎回、都道府県ごとのキーワードは1回に12県ずつ順番に
（4時間で47都道府県をひと回り）検索して、検索サイトへの負担を抑える。
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

KEEP_DAYS = 21      # この日数より古い記事は消す
INGEST_DAYS = 10    # この日数より古い記事は新しく取り込まない
MAX_ITEMS = 1500    # 保存する最大件数
PREFS_PER_RUN = 12  # 1回の実行で検索する都道府県の数

UA = "Mozilla/5.0 (compatible; OdekakeBiyoriBot/1.0) Python-urllib"

PREFS = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
    "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
    "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
    "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
    "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
]


def short(pref: str) -> str:
    return pref if pref == "北海道" else pref[:-1]


# ---------------------------------------------------------------------------
# 検索キーワード（カテゴリの初期値）。ここを書き換えれば集めるニュースを調整できる
# ---------------------------------------------------------------------------
NATIONAL_QUERIES = [
    ("デートスポット 新しい", "kanko"),
    ("観光スポット オープン", "shin"),
    ("新スポット 開業 観光", "shin"),
    ("イルミネーション 点灯", "kisetsu"),
    ("紅葉 ライトアップ 見頃", "kisetsu"),
    ("桜 見頃 名所", "kisetsu"),
    ("花火大会 開催", "kisetsu"),
    ("クリスマスマーケット", "kisetsu"),
    ("水族館 新展示 OR リニューアル", "shin"),
    ("テーマパーク 新エリア OR 新アトラクション", "shin"),
    ("展望台 夜景 オープン", "shin"),
    ("美術館 企画展 開幕", "event"),
    ("週末 イベント おでかけ", "event"),
]


def pref_queries(pref: str):
    p = short(pref)
    return [
        (f"{p} 観光 スポット", "kanko"),
        (f"{p} イベント OR イルミネーション OR 紅葉 OR 花火", "event"),
        (f"{p} オープン 施設 OR 開業", "shin"),
    ]


# 上から順に判定し、最初に当たったカテゴリにする
CATEGORY_RULES = [
    ("kisetsu", ["イルミネーション", "イルミ", "ライトアップ", "紅葉", "花火", "桜", "お花見", "あじさい",
                 "藤まつり", "梅まつり", "雪景色", "雪まつり", "クリスマスマーケット", "ひまわり", "コスモス"]),
    ("shin", ["オープン", "開業", "新施設", "新スポット", "リニューアル", "誕生", "グランドオープン", "新エリア"]),
    ("event", ["イベント", "フェス", "まつり", "祭り", "開催", "展覧会", "企画展", "マルシェ", "ライブ",
               "体験会", "フェア", "限定公開", "開幕"]),
]

# 都道府県の判定 ------------------------------------------------------------
# 1) 「◯◯県」のような正式名  2) 主な市・観光地の名前  3) 県名だけ（名字と紛らわしいものは除く）
PLACE_WORDS = {
    "北海道": ["札幌", "函館", "小樽", "富良野", "旭川", "美瑛", "登別", "洞爺", "釧路", "知床", "帯広", "ニセコ"],
    "青森県": ["弘前", "八戸", "奥入瀬", "十和田"],
    "岩手県": ["盛岡", "平泉", "花巻"],
    "宮城県": ["仙台", "松島", "秋保", "鳴子"],
    "秋田県": ["角館", "男鹿", "乳頭温泉", "田沢湖"],
    "山形県": ["銀山温泉", "蔵王", "米沢", "鶴岡", "酒田"],
    "福島県": ["会津", "郡山", "いわき", "猪苗代", "大内宿"],
    "茨城県": ["水戸", "つくば", "ひたち海浜公園", "大洗", "袋田"],
    "栃木県": ["宇都宮", "日光", "那須", "鬼怒川", "足利"],
    "群馬県": ["前橋", "高崎", "草津温泉", "伊香保", "富岡製糸"],
    "埼玉県": ["さいたま市", "川越", "秩父", "所沢", "大宮"],
    "千葉県": ["千葉市", "舞浜", "ディズニーランド", "ディズニーシー", "幕張", "鴨川", "成田", "館山", "房総"],
    "東京都": ["渋谷", "新宿", "銀座", "浅草", "池袋", "お台場", "原宿", "表参道", "六本木", "吉祥寺",
              "丸の内", "上野", "豊洲", "スカイツリー", "東京タワー", "高尾山", "日本橋", "麻布台", "下北沢"],
    "神奈川県": ["横浜", "鎌倉", "箱根", "江の島", "江ノ島", "川崎", "みなとみらい", "湘南", "小田原", "三浦"],
    "新潟県": ["新潟市", "佐渡", "越後湯沢", "長岡"],
    "富山県": ["富山市", "黒部", "立山", "五箇山", "氷見"],
    "石川県": ["金沢", "能登", "加賀", "輪島", "兼六園", "ひがし茶屋"],
    "福井県": ["福井市", "東尋坊", "敦賀", "永平寺", "恐竜博物館"],
    "山梨県": ["甲府", "河口湖", "富士吉田", "山中湖", "富士急"],
    "長野県": ["長野市", "軽井沢", "松本", "白馬", "上高地", "諏訪", "善光寺", "安曇野"],
    "岐阜県": ["岐阜市", "高山", "飛騨", "白川郷", "郡上", "下呂", "多治見", "大垣", "関市", "恵那", "中津川"],
    "静岡県": ["静岡市", "熱海", "伊豆", "浜松", "富士宮", "修善寺", "沼津", "三島", "御殿場"],
    "愛知県": ["名古屋", "長久手", "常滑", "犬山", "豊田", "岡崎", "蒲郡", "豊橋", "一宮", "春日井", "瀬戸",
              "知多", "半田", "日間賀", "セントレア", "ジブリパーク", "栄", "名駅", "大須", "久屋大通"],
    "三重県": ["伊勢", "志摩", "鳥羽", "桑名", "四日市", "鈴鹿", "松阪", "熊野", "なばなの里", "ナガシマ"],
    "滋賀県": ["大津", "琵琶湖", "彦根", "長浜", "近江"],
    "京都府": ["嵐山", "祇園", "清水寺", "伏見稲荷", "金閣寺", "宇治", "天橋立", "舞鶴", "京都市", "京都駅", "河原町"],
    "大阪府": ["大阪", "梅田", "難波", "なんば", "心斎橋", "道頓堀", "天王寺", "ユニバーサル・スタジオ", "USJ",
              "万博記念公園", "堺市", "通天閣", "あべのハルカス"],
    "兵庫県": ["神戸", "姫路", "有馬温泉", "淡路", "城崎", "宝塚", "西宮", "芦屋", "明石"],
    "奈良県": ["奈良市", "東大寺", "吉野", "法隆寺", "奈良公園"],
    "和歌山県": ["白浜", "高野山", "熊野古道", "那智", "アドベンチャーワールド"],
    "鳥取県": ["鳥取砂丘", "米子", "境港", "大山"],
    "島根県": ["松江", "出雲", "石見銀山", "隠岐"],
    "岡山県": ["岡山市", "倉敷", "後楽園", "牛窓", "蒜山"],
    "広島県": ["広島市", "宮島", "厳島", "尾道", "呉市", "しまなみ"],
    "山口県": ["下関", "萩市", "角島", "秋芳洞", "錦帯橋", "岩国"],
    "徳島県": ["鳴門", "祖谷", "徳島市"],
    "香川県": ["高松", "小豆島", "直島", "琴平", "金刀比羅"],
    "愛媛県": ["松山", "道後", "今治", "内子", "宇和島"],
    "高知県": ["高知市", "四万十", "桂浜", "室戸"],
    "福岡県": ["博多", "天神", "北九州", "小倉", "門司", "太宰府", "糸島", "柳川", "福岡市"],
    "佐賀県": ["唐津", "有田", "嬉野", "武雄", "佐賀市"],
    "長崎県": ["ハウステンボス", "佐世保", "五島", "雲仙", "長崎市", "軍艦島"],
    "熊本県": ["熊本市", "熊本城", "阿蘇", "天草", "黒川温泉"],
    "大分県": ["別府", "湯布院", "由布院", "大分市", "九重"],
    "宮崎県": ["宮崎市", "高千穂", "日南", "青島"],
    "鹿児島県": ["鹿児島市", "屋久島", "指宿", "桜島", "霧島", "奄美"],
    "沖縄県": ["那覇", "石垣", "宮古島", "美ら海", "恩納", "国際通り", "首里", "竹富", "名護"],
}
# 名字や一般名詞と紛らわしいので、県名だけでは判定しない
AMBIGUOUS = {"石川", "山口", "千葉", "福島", "宮崎", "長野", "熊本", "岡山", "福井", "富山", "高知", "秋田",
             "山形", "大分", "長崎", "佐賀", "岩手", "新潟", "静岡", "広島", "福岡", "宮城", "群馬", "奈良"}


def detect_pref(text: str) -> str:
    # 「東京都」に含まれる「京都」を誤って拾わないよう先に消す
    if "東京都" in text:
        return "東京都"
    for p in PREFS:
        if p in text:
            return p
    for p, words in PLACE_WORDS.items():
        if any(w in text for w in words):
            return p
    t = text.replace("東京", "＿＿")  # 「東京」の中の「京都」は拾わない（東京都 は上で処理済み）
    for p in PREFS:
        s = short(p)
        if s not in AMBIGUOUS and (s in t or (p == "東京都" and "東京" in text)):
            return p
    return ""


# おでかけと関係の薄い記事
NG_WORDS = [
    "事故", "死亡", "逮捕", "容疑", "火災", "殺人", "詐欺", "訃報", "不祥事", "求人", "株価", "決算",
    "選挙", "議会", "グラビア", "水着", "写真集", "地震", "被害", "遺体", "負傷", "倒産", "裁判",
]
OUTING_WORDS = [
    "観光", "スポット", "デート", "イベント", "オープン", "開業", "イルミ", "ライトアップ", "紅葉", "花火", "桜",
    "見頃", "展望", "夜景", "水族館", "動物園", "美術館", "博物館", "テーマパーク", "公園", "庭園", "温泉",
    "まつり", "祭り", "フェス", "展覧会", "企画展", "マーケット", "体験", "名所", "城", "神社", "寺", "絶景",
    "おでかけ", "お出かけ", "旅", "ツアー", "リニューアル", "植物園", "雪", "夏祭り", "ビーチ", "海水浴",
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
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return []
    out = []
    for it in root.iter("item"):
        link = it.findtext("link") or ""
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(link).query)
        if "url" in qs:
            link = qs["url"][0]
        source, image = "", None
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
        {"q": f"{query} when:{INGEST_DAYS}d", "hl": "ja", "gl": "JP", "ceid": "JP:ja"})
    raw = fetch(url)
    if not raw:
        return []
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return []
    out = []
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


def accept(item: dict) -> bool:
    title = item["title"]
    if not title or len(title) < 8:
        return False
    if any(p.search(title) for p in JUNK_PATTERNS):
        return False
    text = title + " " + item.get("desc", "")
    if any(w in text for w in NG_WORDS):
        return False
    return any(w in text for w in OUTING_WORDS)


def migrate(it: dict) -> dict:
    """東海だけを集めていたころの記事（area）を都道府県（pref）に直す"""
    if "pref" not in it:
        old = {"名古屋": "愛知県", "愛知": "愛知県", "岐阜": "岐阜県", "三重": "三重県"}
        it["pref"] = old.get(it.pop("area", ""), "") or detect_pref(it.get("title", ""))
    return it


def main() -> int:
    old = {"items": []}
    if DATA_FILE.exists():
        try:
            old = json.loads(DATA_FILE.read_text("utf-8"))
        except json.JSONDecodeError:
            pass
    items = {it["id"]: migrate(it) for it in old.get("items", [])}
    seen_keys = {norm_key(it["title"]) for it in items.values()}

    # 都道府県は1時間ごとに12県ずつ順番に
    hour = int(NOW.timestamp() // 3600)
    start = (hour % ((len(PREFS) + PREFS_PER_RUN - 1) // PREFS_PER_RUN)) * PREFS_PER_RUN
    run_prefs = PREFS[start:start + PREFS_PER_RUN]
    print("今回の都道府県:", "・".join(short(p) for p in run_prefs))

    jobs = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        for q, cat in NATIONAL_QUERIES:
            jobs.append((cat, None, ex.submit(bing_items, q)))
            jobs.append((cat, None, ex.submit(google_items, q)))
        for p in run_prefs:
            for q, cat in pref_queries(p):
                jobs.append((cat, p, ex.submit(google_items, q)))
            jobs.append(("kanko", p, ex.submit(bing_items, f"{short(p)} 観光 イベント")))
        results = [(cat, p, f.result()) for cat, p, f in jobs]

    added = 0
    now_jst = NOW.astimezone(JST).isoformat(timespec="seconds")
    for default_cat, query_pref, found in results:
        for it in found:
            if not accept(it):
                continue
            pub = it["published"] or NOW
            if NOW - pub > dt.timedelta(days=INGEST_DAYS):
                continue
            text = it["title"] + " " + it.get("desc", "")
            pref = detect_pref(text)
            # 県名で検索した記事は、見出しに別の県が出ていなければその県とみなす
            if not pref and query_pref:
                pref = query_pref
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
                "pref": pref,
                "published": pub.astimezone(JST).isoformat(timespec="seconds"),
                "added": now_jst,
            }
            added += 1

    cutoff = NOW - dt.timedelta(days=KEEP_DAYS)
    kept = [it for it in items.values() if dt.datetime.fromisoformat(it["published"]) >= cutoff]
    kept.sort(key=lambda it: it["published"], reverse=True)
    kept = kept[:MAX_ITEMS]

    out = {"updated": now_jst, "items": kept}
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", "utf-8")
    print(f"新しい記事 {added} 件 / 保存 {len(kept)} 件")
    return 0


if __name__ == "__main__":
    sys.exit(main())
