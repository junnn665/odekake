/* おでかけ日和: デートガチャ */
(function () {
  'use strict';
  const O = window.Odekake;
  const $ = id => document.getElementById(id);

  const OPTIONS = {
    area: { el: 'g-area', items: O.AREAS.map(a => [a, a]) },
    tag: { el: 'g-tag', items: [['any', 'おまかせ']].concat(O.TAGS.filter(t => t.id !== 'all' && t.id !== 'ame').map(t => [t.id, t.label])) },
    weather: { el: 'g-weather', items: [['fine', '晴れ・くもり'], ['rain', '雨']] },
    when: { el: 'g-when', items: [['any', 'いつでも'], ['day', '昼'], ['night', '夕方〜夜']] },
    budget: { el: 'g-budget', items: [['any', 'こだわらない'], ['1', 'お手頃まで'], ['2', 'ふつうまで']] }
  };
  const SAVE_KEY = 'odekake.gacha';
  let state = { area: 'すべて', tag: 'any', weather: 'fine', when: 'any', budget: 'any' };
  try { Object.assign(state, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* 使えなければ初期値 */ }

  let spots = [];
  let lastId = null;

  function renderOptions() {
    Object.entries(OPTIONS).forEach(([key, o]) => {
      $(o.el).innerHTML = o.items.map(([v, label]) =>
        '<button type="button" data-key="' + key + '" data-val="' + v + '" aria-pressed="' + (state[key] === v) + '">' + label + '</button>').join('');
    });
  }

  function basicOk(s) {
    if (state.weather === 'rain' && !(s.indoor || s.tags.includes('ame'))) return false;
    if (state.budget !== 'any' && s.budget > Number(state.budget)) return false;
    return true;
  }
  const isNight = s => s.when.includes('夕方') || s.when.includes('夜');
  const isDay = s => s.when.includes('朝') || s.when.includes('昼');

  function pool() {
    return spots.filter(s => {
      if (!basicOk(s)) return false;
      if (state.area !== 'すべて' && s.area !== state.area) return false;
      if (state.tag !== 'any' && !s.tags.includes(state.tag)) return false;
      if (state.when === 'day' && !isDay(s)) return false;
      if (state.when === 'night' && !isNight(s)) return false;
      return true;
    });
  }

  function updateNote() {
    const n = pool().length;
    $('pool-note').textContent = n ? '候補 ' + n + ' か所から選びます' : '条件に合う場所がありません。条件をゆるめてみてください';
    $('spin').disabled = !n;
  }

  function weightedPick(list) {
    // 見頃・行きたいリストに入っている場所は出やすく、前回と同じ場所は出にくく
    const w = list.map(s => (O.inSeason(s) ? 3 : 1) * (O.isSaved(s.id) ? 2 : 1) * (s.id === lastId && list.length > 1 ? 0 : 1));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  }

  function nextStop(main) {
    const near = spots
      .filter(s => s.id !== main.id && basicOk(s))
      .map(s => ({ s, d: O.distanceKm(main, s) }))
      .filter(x => x.d <= 25)
      .sort((a, b) => a.d - b.d);
    if (!near.length) return null;
    // 昼の場所なら、締めに夜景を
    if (!isNight(main) && state.when !== 'day') {
      const night = near.find(x => x.s.tags.includes('yakei'));
      if (night) return { ...night, label: '暗くなったら' };
    }
    // 夜の場所なら、その前に寄れる昼の場所を
    if (state.when === 'night' || (isNight(main) && !isDay(main))) {
      const day = near.find(x => isDay(x.s));
      if (day) return { ...day, label: 'その前に' };
    }
    return { ...near[0], label: '近くでもう1か所' };
  }

  function fillDome() {
    const colors = O.TAGS.slice(1).map(t => t.color);
    let html = '';
    for (let i = 0; i < 11; i++) {
      const x = 8 + (i % 4) * 36 + (i > 7 ? 18 : 0), y = 74 - Math.floor(i / 4) * 30 + (i % 2) * 6;
      html += '<span class="cap" style="--c:' + colors[i % colors.length] + ';left:' + x + 'px;top:' + y + 'px;--dx:' + (Math.random() * 16 - 8) + 'px;--dy:' + (-6 - Math.random() * 14) + 'px;transform:rotate(' + (i * 37 % 90) + 'deg)"></span>';
    }
    $('dome').innerHTML = html;
  }

  function showResult(main) {
    const next = nextStop(main);
    let html = '<div class="result-head"><h2>今日の行き先は…</h2><span class="result-sub">' + O.esc(main.area) + '・' + O.esc(main.stay) + '</span></div>';
    html += O.spotCard(main);
    if (next) {
      html += '<div class="route"><span class="route-arrow">↓</span><span>' + O.esc(next.label) + '　<b>' + O.esc(next.s.name) + '</b>（約' + (next.d < 1 ? '1km以内' : Math.round(next.d) + 'km') + '）</span></div>';
      html += O.spotCard(next.s);
    }
    html += '<div class="result-actions"><button type="button" id="again">もう1回まわす</button>' +
      '<a href="map.html?id=' + encodeURIComponent(main.id) + '">地図で周辺を見る</a></div>';
    $('result').innerHTML = html;
    $('again').addEventListener('click', spin);
    if (window.innerWidth < 900) $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function spin() {
    const list = pool();
    if (!list.length) return;
    const pick = weightedPick(list);
    lastId = pick.id;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('spin').disabled = true;
    $('machine').classList.add('spinning');
    setTimeout(() => {
      $('machine').classList.remove('spinning');
      $('spin').disabled = false;
      fillDome();
      showResult(pick);
    }, reduce ? 0 : 1200);
  }

  document.querySelector('.gacha-panel').addEventListener('click', e => {
    const b = e.target.closest('[data-key]'); if (!b) return;
    state[b.dataset.key] = b.dataset.val;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (err) { /* 保存できなくても動く */ }
    renderOptions(); updateNote();
  });
  $('spin').addEventListener('click', spin);

  fillDome();
  renderOptions();
  O.loadSpots().then(list => { spots = list; updateNote(); })
    .catch(() => { $('pool-note').textContent = 'スポットを読み込めませんでした'; });
})();
