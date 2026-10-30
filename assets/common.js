/* おでかけ日和: 各ページ共通の部品
 *  - さがす場所（現在地・都道府県・地名）の管理
 *  - 周辺スポットの検索（OpenStreetMap Overpass API）と説明・写真（Wikipedia）
 *  - 行きたいリスト、スポットのカード
 */
(function () {
  'use strict';

  /* ---------- 見た目の部品 ---------- */
  const ICONS = {
    date:   '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    yakei:  '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/><path d="M17 3v3M15.5 4.5h3"/>',
    zekkei: '<path d="M3 19l6-9 4 5 3-4 5 8z"/><circle cx="17" cy="6" r="2"/>',
    cafe:   '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3c0 1-1 1.5-1 2.5M12 3c0 1-1 1.5-1 2.5"/>',
    taiken: '<path d="M12 3l2.2 5.2L20 9l-4.3 3.8L17 19l-5-3-5 3 1.3-6.2L4 9l5.8-.8z"/>',
    art:    '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 16l5-5 4 4 2-2 5 5"/><circle cx="15.5" cy="9" r="1.3"/>',
    rekishi:'<path d="M3 6h18M5 9h14M7 9v11M17 9v11M4 4c3 1 13 1 16 0"/>',
    ame:    '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6a2 2 0 0 1-4 0"/>',
    all:    '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    gps:    '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22"/>'
  };

  const TAGS = [
    { id: 'all',     label: 'すべて',       color: '#23282C' },
    { id: 'date',    label: 'デート定番',   color: '#C2364F' },
    { id: 'yakei',   label: '夜景・展望',   color: '#34418F' },
    { id: 'zekkei',  label: '絶景・自然',   color: '#3D7A3A' },
    { id: 'taiken',  label: '遊ぶ・体験',   color: '#C75F14' },
    { id: 'art',     label: 'ミュージアム', color: '#714A8C' },
    { id: 'rekishi', label: '歴史・寺社',   color: '#A1372A' },
    { id: 'cafe',    label: '街歩き・名所', color: '#80612F' },
    { id: 'ame',     label: '雨の日OK',     color: '#2D6BA8' }
  ];
  const TAG_MAP = Object.fromEntries(TAGS.map(t => [t.id, t]));

  const BUDGET = ['無料', 'お手頃', 'ふつう', 'ちょっと贅沢'];
  const BUDGET_MARK = ['¥0', '¥', '¥¥', '¥¥¥'];
  const RADII = [3, 10, 30];

  // 都道府県（JISコード順）: 名前, 県庁所在地の緯度・経度, 表示名
  const PREFS = [
    ['北海道', 43.064, 141.347, '札幌'], ['青森県', 40.824, 140.740, '青森'], ['岩手県', 39.704, 141.153, '盛岡'],
    ['宮城県', 38.269, 140.872, '仙台'], ['秋田県', 39.719, 140.102, '秋田'], ['山形県', 38.240, 140.364, '山形'],
    ['福島県', 37.750, 140.468, '福島'], ['茨城県', 36.342, 140.447, '水戸'], ['栃木県', 36.566, 139.884, '宇都宮'],
    ['群馬県', 36.391, 139.061, '前橋'], ['埼玉県', 35.857, 139.649, 'さいたま'], ['千葉県', 35.605, 140.123, '千葉'],
    ['東京都', 35.681, 139.767, '東京駅'], ['神奈川県', 35.448, 139.643, '横浜'], ['新潟県', 37.902, 139.023, '新潟'],
    ['富山県', 36.695, 137.211, '富山'], ['石川県', 36.594, 136.626, '金沢'], ['福井県', 36.065, 136.222, '福井'],
    ['山梨県', 35.664, 138.568, '甲府'], ['長野県', 36.651, 138.181, '長野'], ['岐阜県', 35.391, 136.722, '岐阜'],
    ['静岡県', 34.977, 138.383, '静岡'], ['愛知県', 35.170, 136.905, '名古屋'], ['三重県', 34.730, 136.509, '津'],
    ['滋賀県', 35.004, 135.869, '大津'], ['京都府', 35.003, 135.769, '京都'], ['大阪府', 34.686, 135.520, '大阪'],
    ['兵庫県', 34.691, 135.183, '神戸'], ['奈良県', 34.685, 135.833, '奈良'], ['和歌山県', 34.226, 135.168, '和歌山'],
    ['鳥取県', 35.504, 134.238, '鳥取'], ['島根県', 35.472, 133.051, '松江'], ['岡山県', 34.662, 133.935, '岡山'],
    ['広島県', 34.397, 132.460, '広島'], ['山口県', 34.186, 131.471, '山口'], ['徳島県', 34.066, 134.559, '徳島'],
    ['香川県', 34.340, 134.043, '高松'], ['愛媛県', 33.842, 132.766, '松山'], ['高知県', 33.560, 133.531, '高知'],
    ['福岡県', 33.590, 130.401, '福岡'], ['佐賀県', 33.249, 130.299, '佐賀'], ['長崎県', 32.745, 129.874, '長崎'],
    ['熊本県', 32.790, 130.742, '熊本'], ['大分県', 33.238, 131.613, '大分'], ['宮崎県', 31.911, 131.424, '宮崎'],
    ['鹿児島県', 31.560, 130.558, '鹿児島'], ['沖縄県', 26.212, 127.681, '那覇']
  ];
  const prefShort = p => p === '北海道' ? p : String(p || '').replace(/[都府県]$/, '');

  function icon(id, cls) {
    return '<svg class="' + (cls || 'ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[id] || ICONS.all) + '</svg>';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- 保存（この端末のブラウザだけ） ---------- */
  function load(key, def) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function save(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 保存できない環境では無視 */ }
  }

  async function fetchJSON(url, ms, init) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms || 10000);
    try {
      const r = await fetch(url, Object.assign({ signal: ctl.signal }, init || {}));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  function distanceKm(a, b) {
    const R = 6371, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function distText(d) {
    if (d == null) return '';
    return d < 1 ? Math.max(50, Math.round(d * 20) * 50) + 'm' : (d < 10 ? d.toFixed(1) : Math.round(d)) + 'km';
  }
  function nearestPref(lat, lng) {
    let best = PREFS[0], bd = Infinity;
    PREFS.forEach(p => { const d = distanceKm({ lat, lng }, { lat: p[1], lng: p[2] }); if (d < bd) { bd = d; best = p; } });
    return best[0];
  }

  /* ---------- さがす場所 ---------- */
  const LOC_KEY = 'odekake.loc';
  const RADIUS_KEY = 'odekake.radius';
  function getLoc() { return load(LOC_KEY, null); }
  function setLoc(loc) {
    save(LOC_KEY, loc);
    document.dispatchEvent(new CustomEvent('loc-change', { detail: loc }));
  }
  function getRadius() { const r = load(RADIUS_KEY, 10); return RADII.includes(r) ? r : 10; }
  function setRadius(r) { save(RADIUS_KEY, r); document.dispatchEvent(new CustomEvent('radius-change', { detail: r })); }

  function prefFromMuniCd(code) {
    const n = parseInt(String(code || '').padStart(5, '0').slice(0, 2), 10);
    return PREFS[n - 1] ? PREFS[n - 1][0] : '';
  }

  // 国土地理院の逆ジオコーダで、緯度経度から都道府県と町名を調べる
  async function reverseLookup(lat, lng) {
    try {
      const r = await fetchJSON('https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=' + lat + '&lon=' + lng, 8000);
      if (r && r.results) {
        const pref = prefFromMuniCd(r.results.muniCd);
        const town = r.results.lv01Nm && r.results.lv01Nm !== '－' ? r.results.lv01Nm : '';
        if (pref) return { pref, town };
      }
    } catch (e) { /* 調べられなければ近い県庁所在地で代わりにする */ }
    return { pref: nearestPref(lat, lng), town: '' };
  }

  function locateMe() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('この端末では現在地を使えません')); return; }
      navigator.geolocation.getCurrentPosition(async pos => {
        const lat = +pos.coords.latitude.toFixed(5), lng = +pos.coords.longitude.toFixed(5);
        const { pref, town } = await reverseLookup(lat, lng);
        resolve({ lat, lng, pref, label: (town ? prefShort(pref) + '・' + town : '現在地（' + prefShort(pref) + '）') + ' 付近', src: 'gps' });
      }, () => reject(new Error('現在地を取得できませんでした。ブラウザの設定で位置情報を許可してください')),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
    });
  }

  // 地名・駅名から場所を探す（国土地理院 → だめなら OpenStreetMap Nominatim）
  async function searchPlace(q) {
    q = q.trim();
    if (!q) throw new Error('地名か駅名を入力してください');
    let hit = null;
    try {
      const r = await fetchJSON('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q), 8000);
      if (Array.isArray(r) && r.length) {
        const exact = r.find(f => (f.properties.title || '').endsWith(q)) || r[0];
        hit = { lat: exact.geometry.coordinates[1], lng: exact.geometry.coordinates[0], title: exact.properties.title || q };
      }
    } catch (e) { /* 次を試す */ }
    if (!hit) {
      try {
        const r = await fetchJSON('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp&accept-language=ja&q=' + encodeURIComponent(q), 8000);
        if (Array.isArray(r) && r.length) hit = { lat: +r[0].lat, lng: +r[0].lon, title: r[0].display_name || q };
      } catch (e) { /* 見つからない */ }
    }
    if (!hit) throw new Error('「' + q + '」は見つかりませんでした。市区町村名か駅名で入力してください');
    const pref = (PREFS.find(p => hit.title.startsWith(p[0])) || [])[0] || nearestPref(hit.lat, hit.lng);
    return { lat: +hit.lat.toFixed(5), lng: +hit.lng.toFixed(5), pref, label: q + ' 付近', src: 'search' };
  }

  async function locFromPoint(lat, lng) {
    lat = +lat.toFixed(5); lng = +lng.toFixed(5);
    const { pref, town } = await reverseLookup(lat, lng);
    return { lat, lng, pref, label: (town ? prefShort(pref) + '・' + town : '地図で選んだ場所（' + prefShort(pref) + '）') + ' 付近', src: 'map' };
  }

  function prefLoc(name) {
    const p = PREFS.find(x => x[0] === name);
    return p ? { lat: p[1], lng: p[2], pref: p[0], label: p[3] + '周辺（' + prefShort(p[0]) + '）', src: 'pref' } : null;
  }

  /* さがす場所のバー（どのページでも同じ） */
  function mountLocBar(el, opts) {
    opts = opts || {};
    el.classList.add('locbar');
    el.innerHTML =
      '<div class="loc-now">' + icon('all', 'loc-pin') +
        '<span class="loc-text"><small>さがす場所</small><b class="loc-label">未設定</b></span></div>' +
      '<div class="loc-actions">' +
        '<button type="button" class="loc-btn loc-gps">' + icon('gps', 'ic-s') + '現在地</button>' +
        '<label class="visually-hidden" for="' + (opts.idPrefix || 'lb') + '-pref">都道府県</label>' +
        '<select class="loc-pref" id="' + (opts.idPrefix || 'lb') + '-pref"><option value="">都道府県からえらぶ</option>' +
          PREFS.map(p => '<option value="' + p[0] + '">' + p[0] + '</option>').join('') + '</select>' +
        '<form class="loc-search" role="search"><label class="visually-hidden" for="' + (opts.idPrefix || 'lb') + '-q">地名・駅名</label>' +
          '<input id="' + (opts.idPrefix || 'lb') + '-q" type="search" placeholder="地名・駅名" enterkeyhint="search" autocomplete="off">' +
          '<button type="submit" class="loc-btn">さがす</button></form>' +
      '</div>';
    const label = el.querySelector('.loc-label');
    function show() {
      const loc = getLoc();
      label.textContent = loc ? loc.label : '未設定';
      el.classList.toggle('is-empty', !loc);
      el.querySelector('.loc-pref').value = '';
    }
    async function run(p, btn) {
      const old = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.textContent = '検索中…'; }
      try { setLoc(await p); } catch (e) { toast(e.message); } finally { if (btn) { btn.disabled = false; btn.innerHTML = old; } }
    }
    el.querySelector('.loc-gps').addEventListener('click', e => run(locateMe(), e.currentTarget));
    el.querySelector('.loc-pref').addEventListener('change', e => { const l = prefLoc(e.target.value); if (l) setLoc(l); });
    el.querySelector('.loc-search').addEventListener('submit', e => {
      e.preventDefault();
      const input = el.querySelector('input');
      run(searchPlace(input.value), e.currentTarget.querySelector('button')).then(() => input.blur());
    });
    document.addEventListener('loc-change', show);
    show();
  }

  /* ---------- 周辺スポットの検索 ---------- */
  const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

  function overpassQuery(lat, lng, km) {
    const A = '(around:' + Math.round(km * 1000) + ',' + lat + ',' + lng + ')';
    return '[out:json][timeout:40];(' +
      'nwr' + A + '["tourism"~"^(viewpoint|aquarium|zoo|theme_park|museum|gallery|attraction)$"]["name"];' +
      'nwr' + A + '["man_made"="tower"]["tower:type"="observation"]["name"];' +
      'nwr' + A + '["amenity"="planetarium"]["name"];' +
      'nwr' + A + '["leisure"="water_park"]["name"];' +
      'nwr' + A + '["historic"="castle"]["name"];' +
      'nwr' + A + '["historic"]["name"]["wikipedia"];' +
      'nwr' + A + '["amenity"="place_of_worship"]["name"]["wikipedia"];' +
      'nwr' + A + '["leisure"~"^(park|garden)$"]["name"]["wikipedia"];' +
      'nwr' + A + '["natural"="peak"]["name"]["wikipedia"];' +
      'nwr' + A + '["natural"="beach"]["name"];' +
      'nwr' + A + '["waterway"="waterfall"]["name"];' +
      ');out center tags;';
  }

  // OpenStreetMap のタグから、種類・気分・時間帯などを決める
  function classify(t) {
    const name = t['name:ja'] || t.name;
    const s = { tags: [], kind: '', when: ['昼'], indoor: false, score: 0, budget: null, stay: '' };
    const add = (...ids) => ids.forEach(id => { if (!s.tags.includes(id)) s.tags.push(id); });
    const tour = t.tourism, am = t.amenity, lei = t.leisure;
    if (tour === 'aquarium') { s.kind = '水族館'; add('date', 'taiken', 'ame'); s.indoor = true; s.score = 4; s.stay = '2〜3時間'; }
    else if (tour === 'theme_park') { s.kind = 'テーマパーク・遊園地'; add('taiken', 'date'); s.when = ['昼', '夜']; s.score = 3; s.stay = '半日'; }
    else if (tour === 'zoo') { s.kind = '動物園'; add('taiken', 'date'); s.score = 3; s.stay = '2〜3時間'; }
    else if (am === 'planetarium') { s.kind = 'プラネタリウム'; add('date', 'ame', 'taiken'); s.indoor = true; s.score = 3; s.stay = '1時間'; }
    else if (t.man_made === 'tower') { s.kind = '展望タワー'; add('yakei', 'date', 'ame'); s.when = ['昼', '夕方', '夜']; s.indoor = true; s.score = 3; s.stay = '1時間'; }
    else if (tour === 'viewpoint') { s.kind = '展望スポット'; add('yakei', 'zekkei', 'date'); s.when = ['昼', '夕方', '夜']; s.score = 1; s.stay = '30分'; }
    else if (lei === 'water_park') { s.kind = 'プール・ウォーターパーク'; add('taiken'); s.score = 2; s.stay = '半日'; }
    else if (tour === 'museum') { s.kind = /美術|アート|ART|Art/.test(name) ? '美術館' : '博物館・資料館'; add('art', 'ame'); s.indoor = true; s.score = 1; s.stay = '1〜2時間'; }
    else if (tour === 'gallery') { s.kind = 'ギャラリー'; add('art', 'ame'); s.indoor = true; s.stay = '1時間'; }
    else if (t.historic === 'castle') { s.kind = '城・城跡'; add('rekishi'); s.score = 2; s.stay = '1〜2時間'; }
    else if (am === 'place_of_worship') {
      s.kind = t.religion === 'shinto' ? '神社' : t.religion === 'buddhist' ? '寺院' : t.religion === 'christian' ? '教会' : '寺社';
      add('rekishi'); s.when = ['朝', '昼']; s.stay = '30分〜1時間';
    }
    else if (t.historic) { s.kind = '史跡'; add('rekishi'); s.stay = '30分'; }
    else if (lei === 'garden') { s.kind = '庭園'; add('zekkei', 'date', 'rekishi'); s.score = 1; s.stay = '1時間'; }
    else if (lei === 'park') { s.kind = '公園'; add('zekkei'); s.stay = '1時間'; }
    else if (t.natural === 'beach') { s.kind = '海岸・ビーチ'; add('zekkei', 'date'); s.when = ['昼', '夕方']; s.stay = '1時間'; }
    else if (t.waterway === 'waterfall') { s.kind = '滝'; add('zekkei'); s.stay = '30分'; }
    else if (t.natural === 'peak') { s.kind = '山'; add('zekkei'); s.stay = '半日'; }
    else { s.kind = '名所'; add('cafe'); s.stay = '30分〜1時間'; }

    if (/タワー|展望|スカイ/.test(name) && !s.tags.includes('yakei')) { add('yakei'); s.when = ['昼', '夕方', '夜']; }
    if (/商店街|横丁|通り|町並|街並|朝市|市場/.test(name)) add('cafe');
    if (t.wikipedia || t.wikidata) s.score += 3;
    if (t.wikipedia && /^ja:/.test(t.wikipedia)) s.score += 1;
    if (t.fee === 'no') s.budget = 0;
    return s;
  }

  function normName(n) { return String(n || '').replace(/[\s　・「」『』（）()]/g, ''); }

  let curatedPromise = null;
  function loadCurated() {
    if (!curatedPromise) {
      curatedPromise = fetch('data/spots.json', { cache: 'no-cache' })
        .then(r => r.ok ? r.json() : { spots: [] })
        .then(d => d.spots.map(s => Object.assign({}, s, {
          pref: s.pref || (s.area === '名古屋' ? '愛知県' : s.area + '県'),
          kind: s.kind || 'おすすめ', curated: true, score: 12
        })))
        .catch(() => []);
    }
    return curatedPromise;
  }

  const memo = {};
  async function searchSpots(loc, km) {
    const key = [loc.lat.toFixed(3), loc.lng.toFixed(3), km].join(',');
    if (memo[key]) return memo[key];
    const SKEY = 'odekake.q.' + key;
    let elements = null;
    try {
      const c = JSON.parse(sessionStorage.getItem(SKEY) || 'null');
      if (c && Date.now() - c.t < 6 * 3600e3) elements = c.e;
    } catch (e) { /* キャッシュなし */ }

    if (!elements) {
      const body = 'data=' + encodeURIComponent(overpassQuery(loc.lat, loc.lng, km));
      let lastErr;
      for (const url of OVERPASS) {
        try {
          const d = await fetchJSON(url, 45000, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
          elements = d.elements || [];
          break;
        } catch (e) { lastErr = e; }
      }
      if (!elements) throw new Error('地図データのサーバーが混んでいて、スポットを取得できませんでした。少し待ってから再読み込みしてください。');
      // 保存は軽くするため、使うタグだけ
      const KEEP = ['name', 'name:ja', 'tourism', 'amenity', 'leisure', 'historic', 'natural', 'waterway', 'man_made', 'tower:type', 'religion', 'wikipedia', 'wikidata', 'fee', 'addr:city', 'addr:province', 'website'];
      elements = elements.map(el => {
        const t = {}; KEEP.forEach(k => { if (el.tags && el.tags[k]) t[k] = el.tags[k]; });
        return { i: el.type[0] + el.id, lat: el.lat != null ? el.lat : el.center && el.center.lat, lng: el.lon != null ? el.lon : el.center && el.center.lon, t };
      }).filter(e => e.lat != null);
      try { sessionStorage.setItem(SKEY, JSON.stringify({ t: Date.now(), e: elements })); } catch (e) { /* 入らなければ保存しない */ }
    }

    // 同じ名前の近い場所（建物と敷地など）はまとめる
    const byName = {};
    elements.forEach(el => {
      const name = el.t['name:ja'] || el.t.name;
      if (!name || name.length < 2) return;
      const c = classify(el.t);
      const s = Object.assign(c, {
        id: 'osm-' + el.i, name, lat: el.lat, lng: el.lng, pref: loc.pref, city: el.t['addr:city'] || '',
        wiki: /^ja:/.test(el.t.wikipedia || '') ? el.t.wikipedia.slice(3).split('#')[0] : '', web: el.t.website || ''
      });
      const k = normName(name);
      const prev = byName[k];
      if (!prev || (distanceKm(prev, s) < 1 && s.score > prev.score)) byName[k] = s;
      else if (distanceKm(prev, s) >= 1) byName[k + '@' + el.i] = s;
    });
    let list = Object.values(byName);

    // 手で選んだおすすめ（data/spots.json）を合わせる
    const curated = (await loadCurated()).filter(c => distanceKm(loc, c) <= km);
    curated.forEach(c => {
      const cn = normName(c.name);
      list = list.filter(s => {
        const sn = normName(s.name);
        const same = Math.min(sn.length, cn.length) >= 3 && (sn.includes(cn) || cn.includes(sn) || cn.startsWith(sn.slice(0, 3))) && distanceKm(s, c) < 1.5;
        if (same && s.wiki && !c.wiki) c.wiki = s.wiki;
        return !same;
      });
    });
    list = list.concat(curated.map(c => Object.assign({}, c)));
    list.forEach(s => { s.dist = distanceKm(loc, s); });
    register(list);
    memo[key] = list;
    return list;
  }

  function sortSpots(list, how, km) {
    const arr = list.slice();
    if (how === 'near') arr.sort((a, b) => a.dist - b.dist);
    else arr.sort((a, b) => (b.score - b.dist / km * 3) - (a.score - a.dist / km * 3));
    return arr;
  }

  /* ---------- Wikipedia から説明と写真 ---------- */
  const wikiCache = {};
  function trimExtract(t) {
    t = String(t || '').replace(/^([^（(]{1,40})[（(][^）)]{0,80}[）)]/, '$1').replace(/\s+/g, ' ').trim();
    if (t.length <= 120) return t;
    const parts = t.split('。');
    let out = '';
    for (const p of parts) { if ((out + p).length > 120) break; out += p + '。'; }
    return out || t.slice(0, 118) + '…';
  }
  async function enrich(list) {
    const need = [...new Set(list.filter(s => s.wiki && !(s.wiki in wikiCache)).map(s => s.wiki))];
    for (let i = 0; i < need.length; i += 20) {
      const chunk = need.slice(i, i + 20);
      chunk.forEach(t => { wikiCache[t] = null; });
      try {
        const url = 'https://ja.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&redirects=1' +
          '&prop=extracts|pageimages&exintro=1&explaintext=1&exlimit=20&piprop=thumbnail&pithumbsize=480&titles=' +
          encodeURIComponent(chunk.join('|'));
        const d = await fetchJSON(url, 10000);
        const q = d.query || {};
        const back = {};
        (q.normalized || []).concat(q.redirects || []).forEach(m => { back[m.to] = (back[m.from] || m.from); });
        (q.pages || []).forEach(p => {
          if (p.missing) return;
          let orig = p.title; while (back[orig] && !chunk.includes(orig)) orig = back[orig];
          const val = { extract: trimExtract(p.extract), img: p.thumbnail ? p.thumbnail.source : '', title: p.title };
          wikiCache[orig] = val; wikiCache[p.title] = val;
        });
      } catch (e) { /* 説明なしで表示する */ }
    }
    let changed = false;
    list.forEach(s => {
      const w = s.wiki && wikiCache[s.wiki];
      if (!w) return;
      if (!s.desc && w.extract) { s.desc = w.extract; s.descSrc = 'wiki'; changed = true; }
      if (!s.img && w.img) { s.img = w.img; changed = true; }
      if (!s.wikiTitle) s.wikiTitle = w.title;
    });
    return changed;
  }

  /* ---------- 行きたいリスト ---------- */
  const SAVE_KEY = 'odekake.saved2';
  const SLIM = ['id', 'name', 'lat', 'lng', 'tags', 'pref', 'city', 'kind', 'desc', 'descSrc', 'tip', 'stay', 'when', 'budget', 'best', 'indoor', 'wiki', 'wikiTitle', 'img', 'curated', 'score', 'web'];
  const spotIndex = {};
  function register(list) { list.forEach(s => { spotIndex[s.id] = s; }); }
  function getSavedList() { return load(SAVE_KEY, []); }
  function getSaved() { return getSavedList().map(s => s.id); }
  function isSaved(id) { return getSavedList().some(s => s.id === id); }
  function toggleSaved(id) {
    const list = getSavedList();
    const i = list.findIndex(s => s.id === id);
    if (i >= 0) list.splice(i, 1);
    else {
      const s = spotIndex[id]; if (!s) return false;
      const slim = {}; SLIM.forEach(k => { if (s[k] != null) slim[k] = s[k]; });
      slim.savedAt = Date.now();
      list.unshift(slim);
    }
    save(SAVE_KEY, list);
    document.dispatchEvent(new CustomEvent('saved-change', { detail: { id, saved: i < 0 } }));
    return i < 0;
  }
  // 以前の「行きたい」（idだけ保存していた版）を引き継ぐ
  loadCurated().then(cur => {
    const old = load('odekake.saved', null);
    if (!Array.isArray(old)) return;
    const list = getSavedList();
    old.forEach(id => {
      const c = cur.find(x => x.id === id);
      if (c && !list.some(s => s.id === id)) { const slim = {}; SLIM.forEach(k => { if (c[k] != null) slim[k] = c[k]; }); list.push(slim); }
    });
    save(SAVE_KEY, list);
    try { localStorage.removeItem('odekake.saved'); } catch (e) { /* 無視 */ }
    document.dispatchEvent(new CustomEvent('saved-change', { detail: {} }));
  });

  /* ---------- 季節 ---------- */
  function nowMonth() { return new Date().getMonth() + 1; }
  function inSeason(s, m) { return !!(s.best && s.best.length > 0 && s.best.length < 12 && s.best.includes(m || nowMonth())); }
  function seasonText(best) {
    if (!best || !best.length) return '通年';
    let ms = best.slice().sort((a, b) => a - b);
    let gapAt = 0, gap = 0;
    ms.forEach((m, i) => {
      const next = ms[(i + 1) % ms.length] + (i + 1 === ms.length ? 12 : 0);
      if (next - m > gap) { gap = next - m; gapAt = (i + 1) % ms.length; }
    });
    ms = ms.slice(gapAt).concat(ms.slice(0, gapAt));
    const runs = [];
    ms.forEach(m => {
      const last = runs[runs.length - 1];
      if (last && (last[1] % 12) + 1 === m) last[1] = m; else runs.push([m, m]);
    });
    return runs.map(r => r[0] === r[1] ? r[0] + '月' : r[0] + '〜' + r[1] + '月').join('・');
  }

  /* ---------- カード ---------- */
  function gmapUrl(s) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.name.replace(/[（(].*?[)）]|「|」/g, ' ') + ' ' + (s.city || prefShort(s.pref) || ''));
  }
  function primaryTag(s) {
    const order = ['date', 'yakei', 'zekkei', 'taiken', 'art', 'rekishi', 'cafe', 'ame'];
    if (s.curated) return TAG_MAP[s.tags[0]] || TAG_MAP.all;
    const t = order.find(id => id !== 'date' && s.tags.includes(id)) || s.tags[0];
    return TAG_MAP[t] || TAG_MAP.all;
  }
  function heart() {
    return '<svg class="ic-s" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';
  }
  function saveButton(s) {
    const saved = isSaved(s.id);
    return '<button type="button" class="save-btn" data-save="' + esc(s.id) + '" aria-pressed="' + saved + '">' + heart() +
      '<span>行きたい</span></button>';
  }

  function spotCard(s, opts) {
    opts = opts || {};
    const t = primaryTag(s);
    const head = [s.dist != null ? distText(s.dist) : '', s.kind || '', prefShort(s.pref)].filter(Boolean).join('・');
    const flags = (inSeason(s) ? '<span class="flag">いま見頃</span>' : '') + (s.curated ? '<span class="flag">おすすめ</span>' : '');
    const facts = [];
    if (s.stay) facts.push('滞在 ' + esc(s.stay));
    if (s.when && s.when.length) facts.push(esc(s.when.join('・')));
    if (s.budget != null) facts.push(BUDGET[s.budget]);
    if (s.curated && s.best && s.best.length) facts.push('見頃 ' + esc(seasonText(s.best)));
    const wikiLink = s.descSrc === 'wiki' && s.wikiTitle
      ? '<a class="src-link" href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(s.wikiTitle) + '" target="_blank" rel="noopener">Wikipedia</a>' : '';
    return '' +
      '<article class="spot" style="--c:' + t.color + '" data-id="' + esc(s.id) + '">' +
        (s.img ? '<div class="spot-img"><img src="' + esc(s.img) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></div>' : '') +
        '<p class="spot-kind">' + esc(head) + flags + '</p>' +
        '<h3 class="spot-name">' + esc(s.name) + '</h3>' +
        (s.desc ? '<p class="spot-desc">' + esc(s.desc) + ' ' + wikiLink + '</p>' : '') +
        (s.tip ? '<p class="spot-tip">' + esc(s.tip) + '</p>' : '') +
        (facts.length ? '<p class="spot-facts">' + facts.join('　') + '</p>' : '') +
        '<div class="spot-actions">' + saveButton(s) +
          (opts.noMapLink ? '' : '<a class="act-link" href="map.html?id=' + encodeURIComponent(s.id) + '">地図</a>') +
          '<a class="act-link" href="' + gmapUrl(s) + '" target="_blank" rel="noopener">Googleマップ</a>' +
        '</div>' +
      '</article>';
  }

  // 説明・写真が届いたカードを描き直す
  function refreshCards(root, list, opts) {
    list.forEach(s => {
      root.querySelectorAll('.spot[data-id="' + CSS.escape(s.id) + '"]').forEach(el => {
        const tmp = document.createElement('div');
        tmp.innerHTML = spotCard(s, opts);
        el.replaceWith(tmp.firstChild);
      });
    });
  }

  /* 行きたいボタン（どのページでも同じ動き） */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-save]');
    if (!b) return;
    if (!spotIndex[b.dataset.save]) { const s = getSavedList().find(x => x.id === b.dataset.save); if (s) register([s]); }
    const on = toggleSaved(b.dataset.save);
    document.querySelectorAll('[data-save="' + CSS.escape(b.dataset.save) + '"]').forEach(x => {
      x.setAttribute('aria-pressed', on);
      const sp = x.querySelector('span');
    });
    toast(on ? '行きたいリストに追加しました' : '行きたいリストから外しました');
  });

  let toastTimer;
  function toast(msg) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.classList.remove('show'); }, 2600);
  }

  window.Odekake = {
    TAGS, TAG_MAP, BUDGET, BUDGET_MARK, RADII, PREFS, prefShort, icon, esc,
    getLoc, setLoc, getRadius, setRadius, locateMe, searchPlace, prefLoc, locFromPoint, mountLocBar,
    searchSpots, sortSpots, loadCurated, enrich, refreshCards, register,
    getSaved, getSavedList, isSaved, toggleSaved, saveButton,
    gmapUrl, inSeason, nowMonth, seasonText, distanceKm, distText, primaryTag, spotCard, toast
  };
})();
