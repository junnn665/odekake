/* おでかけ日和: トップページ */
(function () {
  'use strict';
  const O = window.Odekake;
  const $ = id => document.getElementById(id);
  const PAGE = 24;

  const state = { tag: 'all', q: '', savedOnly: false, sort: 'rec', shown: PAGE };
  let spots = [];        // いまの場所のまわりのスポット
  let loading = false;
  let errorMsg = '';
  let searchSeq = 0;

  O.mountLocBar($('locbar'), { idPrefix: 'top' });

  /* ---------- スポット ---------- */
  function source() {
    if (!state.savedOnly) return spots;
    const loc = O.getLoc();
    const list = O.getSavedList().map(s => Object.assign({}, s, { dist: loc ? O.distanceKm(loc, s) : null }));
    O.register(list);
    return list;
  }

  function matches(s, ignoreTag) {
    if (!ignoreTag && state.tag !== 'all' && !s.tags.includes(state.tag)) return false;
    if (state.q) {
      const hay = [s.name, s.kind, s.pref, s.city, s.desc, s.tip, s.tags.map(t => (O.TAG_MAP[t] || {}).label).join(' ')].join(' ');
      if (!state.q.split(/\s+/).filter(Boolean).every(w => hay.includes(w))) return false;
    }
    return true;
  }

  function renderTabs() {
    const src = source();
    $('tabs').innerHTML = O.TAGS.map(t => {
      const n = src.filter(s => (t.id === 'all' || s.tags.includes(t.id)) && matches(s, true)).length;
      return '<button type="button" class="tab" style="--c:' + t.color + '" data-tag="' + t.id + '" aria-pressed="' + (state.tag === t.id) + '">' +
        O.icon(t.id, 'tab-icon') + '<span class="tab-label">' + O.esc(t.label) + '</span><span class="count">' + n + '</span></button>';
    }).join('');
  }

  function renderTools() {
    const r = O.getRadius();
    $('radius').innerHTML = O.RADII.map(k =>
      '<button type="button" class="area" data-radius="' + k + '" aria-pressed="' + (r === k) + '">' + k + 'km以内</button>').join('');
    $('sort').innerHTML = [['rec', 'おすすめ順'], ['near', '近い順']].map(([v, l]) =>
      '<button type="button" class="area area-sub" data-sort="' + v + '" aria-pressed="' + (state.sort === v) + '">' + l + '</button>').join('');
    $('saved-count').textContent = O.getSaved().length;
    $('saved-toggle').setAttribute('aria-pressed', state.savedOnly);
    $('radius').hidden = state.savedOnly;
  }

  function currentList() {
    const loc = O.getLoc();
    let list = source().filter(s => matches(s));
    if (state.savedOnly) {
      if (loc && state.sort === 'near') list.sort((a, b) => a.dist - b.dist);
    } else {
      list = O.sortSpots(list, state.sort, O.getRadius());
    }
    return list;
  }

  function renderGrid() {
    const loc = O.getLoc();
    const grid = $('grid');
    $('more').hidden = true;
    $('spots-heading').textContent = state.savedOnly ? '行きたいリスト' : '近くのスポット';
    $('spots-sub').textContent = state.savedOnly ? 'この端末に保存しています' : (loc ? loc.label + 'から' + O.getRadius() + 'km以内' : '');

    if (!state.savedOnly) {
      if (!loc) {
        $('result-note').textContent = '';
        grid.innerHTML = '<div class="prompt"><b>まず、さがす場所を決めましょう</b>' +
          '<p>上の「現在地」を押すか、都道府県・地名を選ぶと、そのまわりのデート＆観光スポットを地図データから探します。</p></div>';
        return;
      }
      if (loading) {
        $('result-note').textContent = '';
        grid.innerHTML = '<div class="prompt loading"><span class="spinner" aria-hidden="true"></span><b>近くのスポットを探しています…</b><p>はじめての場所は10〜20秒ほどかかることがあります。</p></div>';
        return;
      }
      if (errorMsg) {
        $('result-note').textContent = '';
        grid.innerHTML = '<div class="prompt"><b>うまく探せませんでした</b><p>' + O.esc(errorMsg) + '</p><button type="button" class="more" id="retry">もう一度探す</button></div>';
        $('retry').addEventListener('click', search);
        return;
      }
    }

    const list = currentList();
    const shown = list.slice(0, state.shown);
    grid.innerHTML = shown.map(s => O.spotCard(s)).join('');
    $('more').hidden = list.length <= state.shown;
    let note = list.length + '件';
    if (state.tag !== 'all') note = O.TAG_MAP[state.tag].label + '・' + note;
    if (state.q) note = '「' + state.q + '」' + note;
    $('result-note').textContent = list.length ? note : '';
    if (!list.length) {
      grid.innerHTML = '<p class="empty">' + (state.savedOnly && !O.getSaved().length
        ? 'まだ行きたいリストは空です。気になるスポットの「行きたい」を押すと、ここに集まります（全国どこのスポットでも入れられます）。'
        : '条件に合うスポットが見つかりませんでした。気分を変えるか、範囲を広げてみてください。') + '</p>';
      return;
    }
    // 説明と写真をあとから入れる
    const seq = searchSeq;
    O.enrich(shown).then(changed => { if (changed && seq === searchSeq) O.refreshCards(grid, shown); });
  }

  function renderSeason() {
    const loc = O.getLoc();
    O.loadCurated().then(cur => {
      const m = O.nowMonth();
      const list = cur.filter(s => O.inSeason(s, m) && (!loc || O.distanceKm(loc, s) <= 150));
      if (!list.length || !loc) { $('season').hidden = true; return; }
      const mark = m >= 3 && m <= 5 ? '🌸' : m >= 6 && m <= 8 ? '🎆' : m >= 9 && m <= 11 ? '🍁' : '❄️';
      $('season').querySelector('.leaf').textContent = mark;
      $('season-title').textContent = m + '月がいま見頃';
      O.register(list);
      $('season-row').innerHTML = list.map(s => {
        const t = O.primaryTag(s);
        return '<a class="mini" href="map.html?id=' + encodeURIComponent(s.id) + '" data-jump="' + s.id + '" style="--c:' + t.color + '">' +
          '<span class="mini-icon">' + O.icon(t.id) + '</span>' +
          '<span class="mini-area">' + O.esc(O.prefShort(s.pref)) + '・' + O.esc(O.distText(O.distanceKm(loc, s))) + '</span>' +
          '<b>' + O.esc(s.name) + '</b>' +
          '<span class="mini-when">見頃 ' + O.esc(O.seasonText(s.best)) + '</span></a>';
      }).join('');
      $('season').hidden = false;
    });
  }

  function renderAll() { renderTabs(); renderTools(); renderGrid(); }

  async function search() {
    const loc = O.getLoc();
    const seq = ++searchSeq;
    errorMsg = '';
    if (!loc) { spots = []; renderAll(); return; }
    loading = true; state.shown = PAGE; renderAll();
    try {
      const list = await O.searchSpots(loc, O.getRadius());
      if (seq !== searchSeq) return;
      spots = list;
    } catch (e) {
      if (seq !== searchSeq) return;
      spots = []; errorMsg = e.message;
    }
    loading = false;
    renderAll();
  }

  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tag]'); if (!b) return;
    state.tag = b.dataset.tag; state.shown = PAGE; renderTabs(); renderGrid();
  });
  $('radius').addEventListener('click', e => {
    const b = e.target.closest('[data-radius]'); if (!b) return;
    O.setRadius(Number(b.dataset.radius));
  });
  $('sort').addEventListener('click', e => {
    const b = e.target.closest('[data-sort]'); if (!b) return;
    state.sort = b.dataset.sort; state.shown = PAGE; renderTools(); renderGrid();
  });
  $('saved-toggle').addEventListener('click', () => { state.savedOnly = !state.savedOnly; state.shown = PAGE; renderAll(); });
  $('more').addEventListener('click', () => { state.shown += PAGE; renderGrid(); });
  let qTimer;
  $('q').addEventListener('input', e => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = e.target.value.trim(); state.shown = PAGE; renderTabs(); renderGrid(); }, 150);
  });
  $('search-form').addEventListener('submit', e => { e.preventDefault(); $('q').blur(); });
  document.addEventListener('saved-change', () => { renderTools(); if (state.savedOnly) { renderTabs(); renderGrid(); } });
  document.addEventListener('loc-change', () => { state.savedOnly = false; search(); renderSeason(); loadNewsScope(); });
  document.addEventListener('radius-change', search);

  renderSeason();
  search();

  /* ---------- おでかけニュース ---------- */
  const NEWS_CATS = [
    { id: 'all', label: 'すべて' },
    { id: 'event', label: 'イベント' },
    { id: 'shin', label: '新スポット' },
    { id: 'kisetsu', label: '季節・イルミ' },
    { id: 'kanko', label: '観光' }
  ];
  const CAT_LABEL = Object.fromEntries(NEWS_CATS.map(c => [c.id, c.label]));
  const NPAGE = 12;
  let news = [], newsCat = 'all', newsScope = 'pref', newsShown = NPAGE;

  function ago(iso) {
    const d = new Date(iso), diff = (Date.now() - d) / 60000;
    if (diff < 60) return Math.max(1, Math.round(diff)) + '分前';
    if (diff < 60 * 24) return Math.round(diff / 60) + '時間前';
    if (diff < 60 * 24 * 7) return Math.round(diff / 1440) + '日前';
    return (d.getMonth() + 1) + '/' + d.getDate();
  }
  function itemPref(x) {
    if (x.pref !== undefined) return x.pref;
    // 東海だけを集めていたころの記事
    return { '名古屋': '愛知県', '愛知': '愛知県', '岐阜': '岐阜県', '三重': '三重県' }[x.area] || '';
  }
  function scoped() {
    const loc = O.getLoc();
    if (newsScope === 'pref' && loc) return news.filter(x => itemPref(x) === loc.pref);
    return news;
  }
  function loadNewsScope() {
    const loc = O.getLoc();
    const n = loc ? news.filter(x => itemPref(x) === loc.pref).length : 0;
    if (!loc) newsScope = 'all';
    else if (newsScope === 'pref' && !n && news.length) newsScope = 'all';
    $('news-scope').innerHTML = (loc ? '<button type="button" class="nf" data-scope="pref" aria-pressed="' + (newsScope === 'pref') + '">' + O.esc(O.prefShort(loc.pref)) + 'の話題 <small>' + n + '</small></button>' : '') +
      '<button type="button" class="nf" data-scope="all" aria-pressed="' + (newsScope === 'all') + '">全国 <small>' + news.length + '</small></button>';
    renderNewsFilter(); renderNews();
  }
  function renderNewsFilter() {
    const src = scoped();
    $('news-filter').innerHTML = NEWS_CATS.map(c => {
      const n = c.id === 'all' ? src.length : src.filter(x => x.category === c.id).length;
      return '<button type="button" class="nf nf-sub" data-cat="' + c.id + '" aria-pressed="' + (newsCat === c.id) + '">' + c.label + ' <small>' + n + '</small></button>';
    }).join('');
  }
  function renderNews() {
    const list = scoped().filter(x => newsCat === 'all' || x.category === newsCat);
    $('news-list').innerHTML = list.slice(0, newsShown).map(x => {
      const where = itemPref(x) ? O.prefShort(itemPref(x)) : '全国';
      return '<li class="news-item cat-' + O.esc(x.category) + '"><a href="' + O.esc(x.link) + '" target="_blank" rel="noopener">' +
        (x.image ? '<img src="' + O.esc(x.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : '') +
        '<span class="news-body"><span class="news-meta"><span class="news-cat">' + O.esc(CAT_LABEL[x.category] || '観光') + '</span><span>' + O.esc(where) + '</span><span>' + ago(x.published) + '</span></span>' +
        '<b class="news-title">' + O.esc(x.title) + '</b>' +
        '<span class="news-src">' + O.esc(x.source) + '</span></span></a></li>';
    }).join('');
    $('news-more').hidden = list.length <= newsShown;
    $('news-status').hidden = list.length > 0;
    if (!list.length) $('news-status').textContent = news.length ? 'この条件のニュースはまだありません。' : 'ニュースはまだありません。次の自動更新のあとに表示されます。';
  }

  $('news-scope').addEventListener('click', e => {
    const b = e.target.closest('[data-scope]'); if (!b) return;
    newsScope = b.dataset.scope; newsShown = NPAGE; loadNewsScope();
  });
  $('news-filter').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    newsCat = b.dataset.cat; newsShown = NPAGE; renderNewsFilter(); renderNews();
  });
  $('news-more').addEventListener('click', () => { newsShown += NPAGE; renderNews(); });

  fetch('data/news.json', { cache: 'no-cache' }).then(r => r.json()).then(d => {
    news = d.items || [];
    if (d.updated) {
      const u = new Date(d.updated);
      $('news-updated').textContent = (u.getMonth() + 1) + '/' + u.getDate() + ' ' + u.getHours() + ':' + String(u.getMinutes()).padStart(2, '0') + ' 更新';
    }
    loadNewsScope();
  }).catch(() => { $('news-status').textContent = 'ニュースを読み込めませんでした。'; });
})();
