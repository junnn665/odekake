/* おでかけ日和: デートガチャ */
(function () {
  'use strict';
  const O = window.Odekake;
  const $ = id => document.getElementById(id);

  const OPTIONS = {
    tag: { el: 'g-tag', items: [['any', 'おまかせ']].concat(O.TAGS.filter(t => t.id !== 'all' && t.id !== 'ame').map(t => [t.id, t.label])) },
    weather: { el: 'g-weather', items: [['fine', '晴れ・くもり'], ['rain', '雨']] },
    when: { el: 'g-when', items: [['any', 'いつでも'], ['day', '昼'], ['night', '夕方〜夜']] },
    fame: { el: 'g-fame', items: [['famous', '有名どころ'], ['any', '穴場もOK']] }
  };
  const SAVE_KEY = 'odekake.gacha2';
  const state = { tag: 'any', weather: 'fine', when: 'any', fame: 'famous' };
  try { Object.assign(state, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* 使えなければ初期値 */ }

  let spots = [];
  let loading = false, errorMsg = '';
  let lastId = null, seq = 0;

  O.mountLocBar($('locbar'), { idPrefix: 'g' });

  function renderOptions() {
    const r = O.getRadius();
    $('g-radius').innerHTML = O.RADII.map(k => '<button type="button" data-radius="' + k + '" aria-pressed="' + (r === k) + '">' + k + 'km以内</button>').join('');
    Object.entries(OPTIONS).forEach(([key, o]) => {
      $(o.el).innerHTML = o.items.map(([v, label]) =>
        '<button type="button" data-key="' + key + '" data-val="' + v + '" aria-pressed="' + (state[key] === v) + '">' + label + '</button>').join('');
    });
  }

  const isNight = s => (s.when || []).some(w => w === '夕方' || w === '夜');
  const isDay = s => !s.when || !s.when.length || s.when.some(w => w === '朝' || w === '昼');
  function weatherOk(s) { return state.weather !== 'rain' || s.indoor || s.tags.includes('ame'); }

  function pool() {
    let list = spots.filter(s => {
      if (!weatherOk(s)) return false;
      if (state.tag !== 'any' && !s.tags.includes(state.tag)) return false;
      if (state.when === 'day' && !isDay(s)) return false;
      if (state.when === 'night' && !isNight(s)) return false;
      return true;
    });
    if (state.fame === 'famous') {
      const famous = list.filter(s => s.score >= 3);
      if (famous.length >= 3) list = famous;
    }
    return list;
  }

  function updateNote() {
    const loc = O.getLoc();
    let msg = '', ok = false;
    if (!loc) msg = '上で、さがす場所を決めてください';
    else if (loading) msg = 'まわりのスポットを探しています…';
    else if (errorMsg) msg = errorMsg;
    else {
      const n = pool().length;
      ok = n > 0;
      msg = n ? loc.label + 'の候補 ' + n + ' か所から選びます' : '条件に合う場所がありません。範囲を広げるか、条件をゆるめてみてください';
    }
    $('pool-note').textContent = msg;
    $('spin').disabled = !ok;
  }

  async function search() {
    const loc = O.getLoc();
    const my = ++seq;
    errorMsg = ''; spots = [];
    if (!loc) { loading = false; updateNote(); return; }
    loading = true; updateNote();
    try {
      const list = await O.searchSpots(loc, O.getRadius());
      if (my !== seq) return;
      spots = list;
    } catch (e) { if (my === seq) errorMsg = e.message; }
    if (my !== seq) return;
    loading = false; updateNote();
  }

  function weightedPick(list) {
    // 見頃・行きたいリスト・有名な場所は出やすく、前回と同じ場所は出にくく
    const w = list.map(s => (1 + Math.max(0, s.score) / 3) * (O.inSeason(s) ? 2 : 1) * (O.isSaved(s.id) ? 2 : 1) *
      (s.id === lastId && list.length > 1 ? 0 : 1));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  }

  function nextStop(main) {
    const near = spots
      .filter(s => s.id !== main.id && weatherOk(s) && s.score >= 1)
      .map(s => ({ s, d: O.distanceKm(main, s) }))
      .filter(x => x.d <= 5)
      .sort((a, b) => (a.d - b.s.score * 0.3) - (b.d - a.s.score * 0.3));
    if (!near.length) return null;
    // 昼の場所なら、締めに夜景を
    if (!isNight(main) && state.when !== 'day') {
      const night = near.find(x => x.s.tags.includes('yakei'));
      if (night) return Object.assign({ label: '暗くなったら' }, night);
    }
    // 夜の場所なら、その前に寄れる昼の場所を
    if (state.when === 'night' || (isNight(main) && !isDay(main))) {
      const day = near.find(x => isDay(x.s) && !x.s.tags.includes('yakei'));
      if (day) return Object.assign({ label: 'その前に' }, day);
    }
    const other = near.find(x => !x.s.tags.some(t => main.tags[0] === t)) || near[0];
    return Object.assign({ label: '近くでもう1か所' }, other);
  }

  function fillDome() {
    const colors = O.TAGS.slice(1).map(t => t.color);
    let html = '';
    for (let i = 0; i < 11; i++) {
      const x = 8 + (i % 4) * 36 + (i > 7 ? 18 : 0), y = 74 - Math.floor(i / 4) * 30 + (i % 2) * 6;
      html += '<span class="cap" style="--c:' + colors[i % colors.length] + ';left:' + x + 'px;top:' + y + 'px;--dx:' + (Math.random() * 16 - 8).toFixed(1) + 'px;--dy:' + (-6 - Math.random() * 14).toFixed(1) + 'px;transform:rotate(' + (i * 37 % 90) + 'deg)"></span>';
    }
    $('dome').innerHTML = html;
  }

  function showResult(main) {
    const next = nextStop(main);
    const shown = [main].concat(next ? [next.s] : []);
    let html = '<div class="result-head"><h2>今日の行き先は…</h2><span class="result-sub">' + O.esc(main.kind || '') + '・ここから' + O.esc(O.distText(main.dist)) + '</span></div>';
    html += O.spotCard(main);
    if (next) {
      html += '<div class="route"><span class="route-arrow">↓</span><span>' + O.esc(next.label) + '　<b>' + O.esc(next.s.name) + '</b>（約' + O.esc(O.distText(next.d)) + '）</span></div>';
      html += O.spotCard(next.s);
    }
    html += '<div class="result-actions"><button type="button" id="again">もう1回まわす</button>' +
      '<a href="map.html?id=' + encodeURIComponent(main.id) + '">地図で周辺を見る</a></div>';
    $('result').innerHTML = html;
    $('again').addEventListener('click', spin);
    O.enrich(shown).then(changed => { if (changed) O.refreshCards($('result'), shown); });
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
    const r = e.target.closest('[data-radius]');
    if (r) { O.setRadius(Number(r.dataset.radius)); return; }
    const b = e.target.closest('[data-key]'); if (!b) return;
    state[b.dataset.key] = b.dataset.val;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (err) { /* 保存できなくても動く */ }
    renderOptions(); updateNote();
  });
  $('spin').addEventListener('click', spin);
  document.addEventListener('loc-change', search);
  document.addEventListener('radius-change', () => { renderOptions(); search(); });

  fillDome();
  renderOptions();
  search();
})();
