/* おでかけ日和: トップページ */
(function () {
  'use strict';
  const O = window.Odekake;
  const $ = id => document.getElementById(id);

  const state = { tag: 'all', area: 'すべて', q: '', savedOnly: false };
  let spots = [];

  /* ---------- スポット ---------- */
  function matches(s, ignoreTag) {
    if (!ignoreTag && state.tag !== 'all' && !s.tags.includes(state.tag)) return false;
    if (state.area !== 'すべて' && s.area !== state.area) return false;
    if (state.savedOnly && !O.isSaved(s.id)) return false;
    if (state.q) {
      const hay = [s.name, s.area, s.city, s.desc, s.tip, s.tags.map(t => O.TAG_MAP[t].label).join(' '), s.when.join(' ')].join(' ');
      const words = state.q.split(/\s+/).filter(Boolean);
      if (!words.every(w => hay.includes(w))) return false;
    }
    return true;
  }

  function renderTabs() {
    $('tabs').innerHTML = O.TAGS.map(t => {
      const n = spots.filter(s => (t.id === 'all' || s.tags.includes(t.id)) && matches(s, true)).length;
      return '<button type="button" class="tab" style="--c:' + t.color + '" data-tag="' + t.id + '" aria-pressed="' + (state.tag === t.id) + '">' +
        O.icon(t.id, 'tab-icon') + '<span class="tab-label">' + O.esc(t.label) + '</span><span class="count">' + n + '</span></button>';
    }).join('');
  }

  function renderAreas() {
    $('areas').innerHTML = O.AREAS.map(a =>
      '<button type="button" class="area" data-area="' + a + '" aria-pressed="' + (state.area === a) + '">' + a + '</button>').join('');
  }

  function renderGrid() {
    const list = spots.filter(s => matches(s));
    // 見頃のスポットを先に
    list.sort((a, b) => (O.inSeason(b) - O.inSeason(a)));
    $('grid').innerHTML = list.map(s => O.spotCard(s)).join('');
    const tagLabel = O.TAG_MAP[state.tag].label;
    let note = (state.savedOnly ? '行きたいリスト・' : '') + (state.area !== 'すべて' ? state.area + '・' : '') + (state.tag !== 'all' ? tagLabel + '・' : '');
    note += list.length + '件';
    if (state.q) note = '「' + state.q + '」' + note;
    $('result-note').textContent = list.length ? note : '';
    if (!list.length) {
      $('grid').innerHTML = '<p class="empty">' + (state.savedOnly && !O.getSaved().length
        ? 'まだ行きたいリストは空です。気になるスポットの「行きたい」を押すと、ここに集まります。'
        : '条件に合うスポットが見つかりませんでした。気分やエリアを変えてみてください。') + '</p>';
    }
  }

  function renderSaved() {
    $('saved-count').textContent = O.getSaved().length;
    $('saved-toggle').setAttribute('aria-pressed', state.savedOnly);
  }

  function renderSeason() {
    const m = O.nowMonth();
    const list = spots.filter(s => O.inSeason(s, m));
    if (!list.length) return;
    const mark = m >= 3 && m <= 5 ? '🌸' : m >= 6 && m <= 8 ? '🎆' : m >= 9 && m <= 11 ? '🍁' : '❄️';
    $('season').querySelector('.leaf').textContent = mark;
    $('season-title').textContent = m + '月がいま見頃';
    $('season-row').innerHTML = list.map(s => {
      const t = O.primaryTag(s);
      return '<a class="mini" href="#spot-' + s.id + '" data-jump="' + s.id + '" style="--c:' + t.color + '">' +
        '<span class="mini-icon">' + O.icon(t.id) + '</span>' +
        '<span class="mini-area">' + O.esc(s.area) + '</span>' +
        '<b>' + O.esc(s.name) + '</b>' +
        '<span class="mini-when">見頃 ' + O.esc(O.seasonText(s.best)) + '</span></a>';
    }).join('');
    $('season').hidden = false;
  }

  function renderAll() { renderTabs(); renderAreas(); renderGrid(); renderSaved(); }

  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tag]'); if (!b) return;
    state.tag = b.dataset.tag; renderTabs(); renderGrid();
  });
  $('areas').addEventListener('click', e => {
    const b = e.target.closest('[data-area]'); if (!b) return;
    state.area = b.dataset.area; renderAll();
  });
  $('saved-toggle').addEventListener('click', () => { state.savedOnly = !state.savedOnly; renderAll(); });
  let qTimer;
  $('q').addEventListener('input', e => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = e.target.value.trim(); renderTabs(); renderGrid(); }, 150);
  });
  $('search-form').addEventListener('submit', e => { e.preventDefault(); $('q').blur(); });
  document.addEventListener('saved-change', () => { renderSaved(); if (state.savedOnly) renderAll(); });

  $('season-row').addEventListener('click', e => {
    const a = e.target.closest('[data-jump]'); if (!a) return;
    e.preventDefault();
    state.tag = 'all'; state.area = 'すべて'; state.q = ''; state.savedOnly = false; $('q').value = '';
    renderAll();
    const card = document.querySelector('.ticket[data-id="' + a.dataset.jump + '"]');
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
    }
  });

  O.loadSpots().then(list => {
    spots = list;
    renderSeason();
    renderAll();
  }).catch(() => {
    $('grid').innerHTML = '<p class="empty">スポットを読み込めませんでした。時間をおいて開き直してください。</p>';
  });

  /* ---------- おでかけニュース ---------- */
  const NEWS_CATS = [
    { id: 'all', label: 'すべて' },
    { id: 'event', label: 'イベント' },
    { id: 'shin', label: '新スポット' },
    { id: 'kisetsu', label: '季節・イルミ' },
    { id: 'kanko', label: '観光' }
  ];
  const CAT_LABEL = Object.fromEntries(NEWS_CATS.map(c => [c.id, c.label]));
  const PAGE = 12;
  let news = [], newsCat = 'all', newsShown = PAGE;

  function ago(iso) {
    const d = new Date(iso), diff = (Date.now() - d) / 60000;
    if (diff < 60) return Math.max(1, Math.round(diff)) + '分前';
    if (diff < 60 * 24) return Math.round(diff / 60) + '時間前';
    if (diff < 60 * 24 * 7) return Math.round(diff / 1440) + '日前';
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function renderNewsFilter() {
    $('news-filter').innerHTML = NEWS_CATS.map(c => {
      const n = c.id === 'all' ? news.length : news.filter(x => x.category === c.id).length;
      return '<button type="button" class="nf" data-cat="' + c.id + '" aria-pressed="' + (newsCat === c.id) + '">' + c.label + ' <small>' + n + '</small></button>';
    }).join('');
  }

  function renderNews() {
    const list = news.filter(x => newsCat === 'all' || x.category === newsCat);
    $('news-list').innerHTML = list.slice(0, newsShown).map(x =>
      '<li class="news-item cat-' + O.esc(x.category) + '"><a href="' + O.esc(x.link) + '" target="_blank" rel="noopener">' +
        (x.image ? '<img src="' + O.esc(x.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : '') +
        '<span class="news-body"><span class="news-meta"><span class="news-cat">' + O.esc(CAT_LABEL[x.category] || '観光') + '</span><span>' + O.esc(x.area) + '</span><span>' + ago(x.published) + '</span></span>' +
        '<b class="news-title">' + O.esc(x.title) + '</b>' +
        '<span class="news-src">' + O.esc(x.source) + '</span></span></a></li>').join('');
    $('news-more').hidden = list.length <= newsShown;
    $('news-status').hidden = list.length > 0;
    if (!list.length) $('news-status').textContent = news.length ? 'この種類のニュースはまだありません。' : 'ニュースはまだありません。初回の自動更新のあとに表示されます。';
  }

  $('news-filter').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    newsCat = b.dataset.cat; newsShown = PAGE; renderNewsFilter(); renderNews();
  });
  $('news-more').addEventListener('click', () => { newsShown += PAGE; renderNews(); });

  fetch('data/news.json', { cache: 'no-cache' }).then(r => r.json()).then(d => {
    news = d.items || [];
    if (d.updated) {
      const u = new Date(d.updated);
      $('news-updated').textContent = (u.getMonth() + 1) + '/' + u.getDate() + ' ' + u.getHours() + ':' + String(u.getMinutes()).padStart(2, '0') + ' 更新';
    }
    renderNewsFilter(); renderNews();
  }).catch(() => { $('news-status').textContent = 'ニュースを読み込めませんでした。'; });
})();
