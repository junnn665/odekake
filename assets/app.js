/* おでかけ日和: トップページ（日和との会話で行き先を決める） */
(function () {
  'use strict';
  const O = window.Odekake;
  const $ = id => document.getElementById(id);
  const log = $('chat');
  const choicesEl = $('choices');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));

  let spots = [];
  let queue = [];
  let idx = 0;
  let moodLabel = '';

  /* ---------- 会話の部品 ---------- */
  function scrollEnd() {
    const target = choicesEl.children.length ? choicesEl : log.lastElementChild;
    if (!target) return;
    const r = target.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 12 || r.top < 0) {
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' });
    }
  }
  function addRow(cls, inner) {
    const row = document.createElement('div');
    row.className = 'row ' + cls;
    row.innerHTML = inner;
    log.appendChild(row);
    return row;
  }
  // 日和が話す（少し間をおいてから）
  async function bot(html, fast) {
    const row = addRow('bot', '<div class="face" aria-hidden="true"></div><div class="bb"><span class="typing" aria-label="入力中"><i></i><i></i><i></i></span></div>');
    scrollEnd();
    await wait(fast ? 200 : 520);
    row.querySelector('.bb').innerHTML = html;
    scrollEnd();
    return row;
  }
  function me(text) {
    addRow('me', '<div class="bb">' + O.esc(text) + '</div>');
    scrollEnd();
  }
  function clearChoices() { choicesEl.innerHTML = ''; }
  // 答えの候補を出す。押すと自分の吹き出しになって次へ進む
  function choices(items, extra) {
    clearChoices();
    items.forEach(it => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (it.main ? ' chip-main' : '');
      b.innerHTML = O.esc(it.label) + (it.n != null ? '<small>' + it.n + '</small>' : '');
      b.addEventListener('click', () => { clearChoices(); me(it.say || it.label); it.go(); });
      choicesEl.appendChild(b);
    });
    if (extra) choicesEl.appendChild(extra);
    scrollEnd();
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ---------- 場所 ---------- */
  async function askLoc(text) {
    await bot(text || 'いま どのへん？');
    const box = document.createElement('div');
    box.className = 'loc-form';
    box.innerHTML =
      '<form class="loc-search"><input type="search" placeholder="駅名・地名" aria-label="駅名・地名" enterkeyhint="search" autocomplete="off"><button type="submit">さがす</button></form>' +
      '<select aria-label="都道府県からえらぶ"><option value="">都道府県からえらぶ</option>' +
      O.PREFS.map(p => '<option>' + p[0] + '</option>').join('') + '</select>';
    choices([{ label: '現在地をつかう', main: true, go: () => findLoc(O.locateMe(), '現在地を しらべてるね…') }], box);
    box.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      const q = box.querySelector('input').value.trim();
      if (!q) return;
      clearChoices(); me(q);
      findLoc(O.searchPlace(q), '「' + O.esc(q) + '」を さがしてるね…');
    });
    box.querySelector('select').addEventListener('change', e => {
      const l = O.prefLoc(e.target.value);
      if (!l) return;
      clearChoices(); me(e.target.value);
      gotLoc(l);
    });
  }

  async function findLoc(promise, waitingText) {
    await bot(waitingText, true);
    try {
      gotLoc(await promise);
    } catch (e) {
      await bot(O.esc(e.message));
      askLoc('ほかの言い方で さがしてみる？');
    }
  }

  async function gotLoc(loc) {
    O.setLoc(loc);
    await bot('<b>' + O.esc(loc.label) + '</b> だね。まわり' + O.getRadius() + 'kmで さがしてみる…', true);
    search();
  }

  async function search() {
    const loc = O.getLoc();
    try {
      spots = await O.searchSpots(loc, O.getRadius());
    } catch (e) {
      await bot(O.esc(e.message));
      choices([
        { label: 'もう一回さがして', go: search },
        { label: '場所を変える', go: () => askLoc('どこで さがす？') }
      ]);
      return;
    }
    if (!spots.length) {
      await bot('ごめん、このまわりには 見つからなかった。');
      const items = [];
      if (O.getRadius() < 30) items.push({ label: '30kmまで広げて', go: widen });
      items.push({ label: '場所を変える', go: () => askLoc('どこで さがす？') });
      choices(items);
      return;
    }
    askMood();
  }

  async function widen() {
    O.setRadius(30);
    await bot('30kmまで 広げて さがすね…', true);
    search();
  }

  /* ---------- 気分 ---------- */
  async function askMood(text) {
    const n = spots.length;
    await bot(text || '近くに <b>' + n + 'か所</b> あったよ。どんな気分？');
    const items = O.TAGS.filter(t => t.id !== 'all')
      .map(t => ({ t, n: spots.filter(s => s.tags.includes(t.id)).length }))
      .filter(x => x.n > 0)
      .map(x => ({ label: x.t.id === 'ame' ? '雨でもOKなところ' : x.t.label, n: x.n, go: () => onMood(x.t.id, x.t.label) }));
    items.push({ label: 'おまかせ', main: true, go: () => onMood('any', 'おまかせ') });
    choices(items);
  }

  // 有名なところ・見頃・近いところが先に来やすいように、少しだけばらつかせて並べる
  function arrange(list) {
    const km = O.getRadius();
    const w = s => Math.pow(1 + Math.max(0, s.score), 1.6) * (O.inSeason(s) ? 2 : 1) * (O.isSaved(s.id) ? 1.5 : 1) / (1 + s.dist / (km / 2));
    const pool = list.map(s => ({ s, k: Math.pow(Math.random(), 1 / w(s)) }));
    return pool.sort((a, b) => b.k - a.k).map(x => x.s);
  }

  function onMood(tag, label) {
    moodLabel = tag === 'any' ? '' : label;
    queue = arrange(tag === 'any' ? spots : spots.filter(s => s.tags.includes(tag)));
    idx = 0;
    suggest('じゃあ ここは どう？');
  }

  /* ---------- 提案 ---------- */
  async function showSpot(s, text) {
    const row = await bot(text + O.spotCard(s));
    O.enrich([s]).then(changed => { if (changed) O.refreshCards(row, [s]); });
  }

  async function suggest(text) {
    const s = queue[idx];
    await showSpot(s, text);
    afterSpot();
  }

  function afterSpot() {
    const s = queue[idx];
    const items = [];
    if (idx < queue.length - 1) items.push({ label: 'ほかのにする', say: 'ほかのは？', main: true, go: () => { idx++; suggest(pick(['それなら こっちは？', 'ここも いいよ', 'こんなのも あるよ'])); } });
    else items.push({ label: 'ほかのにする', say: 'ほかのは？', main: true, go: outOfIdeas });
    items.push({ label: 'そのあと寄れるところは？', go: () => after(s) });
    if (queue.length > 1) items.push({ label: 'ぜんぶ見せて', n: queue.length, go: showAll });
    items.push({ label: '気分を変える', go: () => askMood('どんな気分にする？') });
    items.push({ label: '場所を変える', go: () => askLoc('どこで さがす？') });
    choices(items);
  }

  async function outOfIdeas() {
    await bot((moodLabel ? '「' + O.esc(moodLabel) + '」のところは' : 'このまわりは') + ' これで ぜんぶ見せたよ。');
    const items = [{ label: 'さいしょから見る', go: () => { idx = 0; suggest('もう一回、これから。'); } }];
    if (O.getRadius() < 30) items.push({ label: '30kmまで広げて', go: widen });
    items.push({ label: '気分を変える', go: () => askMood('どんな気分にする？') });
    items.push({ label: '場所を変える', go: () => askLoc('どこで さがす？') });
    choices(items);
  }

  // 次に寄れる場所（昼の場所なら夜景、夜の場所ならその前に行ける場所）
  function nextStop(main) {
    const isNight = x => (x.when || []).some(w => w === '夕方' || w === '夜');
    const near = spots
      .filter(x => x.id !== main.id && x.score >= 1)
      .map(x => ({ s: x, d: O.distanceKm(main, x) }))
      .filter(x => x.d <= 3)
      .sort((a, b) => (a.d - a.s.score * 0.2) - (b.d - b.s.score * 0.2));
    if (!near.length) return null;
    if (!isNight(main)) {
      const n = near.find(x => x.s.tags.includes('yakei'));
      if (n) return Object.assign({ label: '暗くなったら' }, n);
    } else {
      const d = near.find(x => !x.s.tags.includes('yakei'));
      if (d) return Object.assign({ label: 'その前に' }, d);
    }
    return Object.assign({ label: 'すぐそばに' }, near[0]);
  }

  async function after(main) {
    const n = nextStop(main);
    if (!n) await bot('歩いて行けるところには、ほかに なさそう。');
    else await showSpot(n.s, n.label + '、<b>' + O.esc(n.s.name) + '</b> も近いよ（そこから' + O.esc(O.distText(n.d)) + '）');
    afterSpot();
  }

  async function showAll() {
    const sorted = queue.map((s, i) => ({ s, i })).sort((a, b) => a.s.dist - b.s.dist);
    const html = (moodLabel ? '「' + O.esc(moodLabel) + '」のところ、' : '') + '近い順に ならべたよ。気になるのを押してね。' +
      '<ol class="pick-list">' + sorted.map(x =>
        '<li><button type="button" data-pick="' + x.i + '"><span>' + O.esc(x.s.name) + '</span><em>' + O.esc(O.distText(x.s.dist)) + '</em></button></li>').join('') + '</ol>';
    await bot(html);
    afterSpot();
  }

  log.addEventListener('click', e => {
    const b = e.target.closest('[data-pick]');
    if (!b || !queue.length) return;
    const i = Number(b.dataset.pick);
    if (!queue[i]) return;
    clearChoices(); me(queue[i].name);
    idx = i;
    suggest('ここだね。');
  });

  /* ---------- はじまり ---------- */
  async function start() {
    const h = new Date().getHours();
    const hello = h < 10 ? 'おはよう。' : h < 18 ? 'こんにちは。' : 'こんばんは。';
    const loc = O.getLoc();
    await bot(hello + '近くの デートスポット、いっしょに さがそう。', true);
    if (loc) {
      await bot('前は <b>' + O.esc(loc.label) + '</b> で さがしてたね。今日も そこにする？');
      choices([
        { label: 'うん、そこで', main: true, go: () => gotLoc(loc) },
        { label: 'ほかの場所にする', go: () => askLoc('いま どのへん？') }
      ]);
    } else {
      askLoc();
    }
  }
  start();

  /* ---------- 行きたいリスト ---------- */
  function renderSaved() {
    const list = O.getSavedList();
    const loc = O.getLoc();
    $('saved-count').textContent = list.length;
    O.register(list);
    $('saved-list').innerHTML = list.length ? list.map(s => {
      const d = loc ? O.distText(O.distanceKm(loc, s)) : '';
      return '<li><div class="memo-main"><b>' + O.esc(s.name) + '</b><span>' + O.esc([s.kind, O.prefShort(s.pref), d].filter(Boolean).join('・')) + '</span></div>' +
        '<div class="memo-acts">' + O.saveButton(s) + '<a href="map.html?id=' + encodeURIComponent(s.id) + '">地図</a>' +
        '<a href="' + O.gmapUrl(s) + '" target="_blank" rel="noopener">Googleマップ</a></div></li>';
    }).join('') : '<li class="empty">まだ ありません。会話で出てきたスポットの「行きたい」を押すと、ここに書きこまれます。</li>';
  }
  document.addEventListener('saved-change', renderSaved);
  renderSaved();

  /* ---------- おでかけニュース ---------- */
  const NEWS_CATS = [
    { id: 'all', label: 'すべて' },
    { id: 'event', label: 'イベント' },
    { id: 'shin', label: '新スポット' },
    { id: 'kisetsu', label: '季節・イルミ' },
    { id: 'kanko', label: '観光' }
  ];
  const CAT_LABEL = Object.fromEntries(NEWS_CATS.map(c => [c.id, c.label]));
  const NPAGE = 10;
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
    return { '名古屋': '愛知県', '愛知': '愛知県', '岐阜': '岐阜県', '三重': '三重県' }[x.area] || '';
  }
  function scoped() {
    const loc = O.getLoc();
    if (newsScope === 'pref' && loc) return news.filter(x => itemPref(x) === loc.pref);
    return news;
  }
  function renderNewsAll() {
    const loc = O.getLoc();
    const n = loc ? news.filter(x => itemPref(x) === loc.pref).length : 0;
    if (!loc || (newsScope === 'pref' && !n && news.length)) newsScope = 'all';
    $('news-scope').innerHTML = (loc ? '<button type="button" class="tab" data-scope="pref" aria-pressed="' + (newsScope === 'pref') + '">' + O.esc(O.prefShort(loc.pref)) + ' <small>' + n + '</small></button>' : '') +
      '<button type="button" class="tab" data-scope="all" aria-pressed="' + (newsScope === 'all') + '">全国 <small>' + news.length + '</small></button>';
    const src = scoped();
    $('news-filter').innerHTML = NEWS_CATS.map(c => {
      const k = c.id === 'all' ? src.length : src.filter(x => x.category === c.id).length;
      return '<button type="button" class="tab" data-cat="' + c.id + '" aria-pressed="' + (newsCat === c.id) + '">' + c.label + ' <small>' + k + '</small></button>';
    }).join('');
    const list = src.filter(x => newsCat === 'all' || x.category === newsCat);
    $('news-list').innerHTML = list.slice(0, newsShown).map(x =>
      '<li class="cat-' + O.esc(x.category) + '"><a href="' + O.esc(x.link) + '" target="_blank" rel="noopener">' +
        '<span class="news-meta"><span class="news-cat">' + O.esc(CAT_LABEL[x.category] || '観光') + '</span>' +
        '<span>' + O.esc(itemPref(x) ? O.prefShort(itemPref(x)) : '全国') + '</span><span>' + ago(x.published) + '</span><span>' + O.esc(x.source) + '</span></span>' +
        '<b class="news-title">' + O.esc(x.title) + '</b></a></li>').join('');
    $('news-more').hidden = list.length <= newsShown;
    $('news-status').hidden = list.length > 0;
    if (!list.length) $('news-status').textContent = news.length ? 'この条件のニュースはありません。' : 'ニュースはまだありません。';
  }

  $('news-scope').addEventListener('click', e => {
    const b = e.target.closest('[data-scope]'); if (!b) return;
    newsScope = b.dataset.scope; newsShown = NPAGE; renderNewsAll();
  });
  $('news-filter').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    newsCat = b.dataset.cat; newsShown = NPAGE; renderNewsAll();
  });
  $('news-more').addEventListener('click', () => { newsShown += NPAGE; renderNewsAll(); });
  document.addEventListener('loc-change', () => { newsScope = 'pref'; renderNewsAll(); renderSaved(); });

  fetch('data/news.json', { cache: 'no-cache' }).then(r => r.json()).then(d => {
    news = d.items || [];
    if (d.updated) {
      const u = new Date(d.updated);
      $('news-updated').textContent = (u.getMonth() + 1) + '月' + u.getDate() + '日 ' + u.getHours() + ':' + String(u.getMinutes()).padStart(2, '0') + ' 更新（6時間ごと）';
    }
    renderNewsAll();
  }).catch(() => { $('news-status').textContent = 'ニュースを読み込めませんでした。再読み込みしてください。'; });
})();
