/* おでかけ日和: 各ページ共通の部品 */
(function () {
  'use strict';

  const ICONS = {
    date:   '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    yakei:  '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/><path d="M17 3v3M15.5 4.5h3"/>',
    zekkei: '<path d="M3 19l6-9 4 5 3-4 5 8z"/><circle cx="17" cy="6" r="2"/>',
    cafe:   '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3c0 1-1 1.5-1 2.5M12 3c0 1-1 1.5-1 2.5"/>',
    taiken: '<path d="M12 3l2.2 5.2L20 9l-4.3 3.8L17 19l-5-3-5 3 1.3-6.2L4 9l5.8-.8z"/>',
    rekishi:'<path d="M3 6h18M5 9h14M7 9v11M17 9v11M4 4c3 1 13 1 16 0"/>',
    ame:    '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6a2 2 0 0 1-4 0"/>',
    all:    '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>'
  };

  const TAGS = [
    { id: 'all',     label: 'すべて',     color: '#1F2A44' },
    { id: 'date',    label: 'デート定番', color: '#D9466F' },
    { id: 'yakei',   label: '夜景',       color: '#4338A8' },
    { id: 'zekkei',  label: '絶景・自然', color: '#2E7D4F' },
    { id: 'cafe',    label: '街歩き',     color: '#A85A1F' },
    { id: 'taiken',  label: '遊ぶ・体験', color: '#D9661A' },
    { id: 'rekishi', label: '歴史・寺社', color: '#8E2F2F' },
    { id: 'ame',     label: '雨の日OK',   color: '#1D6FA8' }
  ];
  const TAG_MAP = Object.fromEntries(TAGS.map(t => [t.id, t]));

  const AREAS = ['すべて', '名古屋', '愛知', '岐阜', '三重'];
  const BUDGET = ['無料', 'お手頃', 'ふつう', 'ちょっと贅沢'];
  const BUDGET_MARK = ['¥0', '¥', '¥¥', '¥¥¥'];

  function icon(id, cls) {
    return '<svg class="' + (cls || 'ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[id] || ICONS.all) + '</svg>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* 行きたいリスト（この端末のブラウザにだけ保存） */
  const SAVE_KEY = 'odekake.saved';
  function getSaved() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); } catch (e) { return []; }
  }
  function setSaved(list) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(list)); } catch (e) { /* 保存できない環境では無視 */ }
  }
  function isSaved(id) { return getSaved().includes(id); }
  function toggleSaved(id) {
    const list = getSaved();
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.unshift(id);
    setSaved(list);
    document.dispatchEvent(new CustomEvent('saved-change', { detail: { id, saved: i < 0 } }));
    return i < 0;
  }

  let spotsPromise = null;
  function loadSpots() {
    if (!spotsPromise) {
      spotsPromise = fetch('data/spots.json', { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(d => d.spots);
    }
    return spotsPromise;
  }

  function gmapUrl(s) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.name.replace(/[（(].*?[)）]|「|」/g, ' ') + ' ' + s.city);
  }

  function nowMonth() { return new Date().getMonth() + 1; }
  function inSeason(s, m) { return s.best.length > 0 && s.best.length < 12 && s.best.includes(m || nowMonth()); }
  function seasonText(best) {
    if (!best.length) return '通年';
    let ms = best.slice().sort((a, b) => a - b);
    // 年をまたぐ並び（11〜2月など）は、いちばん大きく空いたところから始める
    let gapAt = 0, gap = 0;
    ms.forEach((m, i) => {
      const next = ms[(i + 1) % ms.length] + (i + 1 === ms.length ? 12 : 0);
      if (next - m > gap) { gap = next - m; gapAt = (i + 1) % ms.length; }
    });
    ms = ms.slice(gapAt).concat(ms.slice(0, gapAt));
    // 続いている月は「4〜6月」のようにまとめる
    const runs = [];
    ms.forEach(m => {
      const last = runs[runs.length - 1];
      if (last && (last[1] % 12) + 1 === m) last[1] = m; else runs.push([m, m]);
    });
    return runs.map(r => r[0] === r[1] ? r[0] + '月' : r[0] + '〜' + r[1] + '月').join('・');
  }

  function distanceKm(a, b) {
    const R = 6371, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function primaryTag(s) { return TAG_MAP[s.tags[0]] || TAG_MAP.all; }

  /* スポットのカード（切符のかたち） */
  function spotCard(s, opts) {
    opts = opts || {};
    const t = primaryTag(s);
    const saved = isSaved(s.id);
    const season = inSeason(s) ? '<span class="badge-season">いま見頃</span>' : '';
    const tags = s.tags.map(id => '<span class="chip" style="--c:' + TAG_MAP[id].color + '">' + icon(id, 'ic-s') + esc(TAG_MAP[id].label) + '</span>').join('');
    return '' +
      '<article class="ticket" style="--c:' + t.color + '" data-id="' + esc(s.id) + '">' +
        '<div class="ticket-top">' +
          '<span class="ticket-area">' + esc(s.area) + '<small>' + esc(s.city) + '</small></span>' +
          season +
          '<span class="ticket-icon">' + icon(t.id) + '</span>' +
        '</div>' +
        '<div class="ticket-body">' +
          '<h3 class="ticket-name">' + esc(s.name) + '</h3>' +
          '<p class="ticket-desc">' + esc(s.desc) + '</p>' +
          '<dl class="ticket-meta">' +
            '<div><dt>予算</dt><dd><b>' + BUDGET_MARK[s.budget] + '</b> ' + BUDGET[s.budget] + '</dd></div>' +
            '<div><dt>滞在</dt><dd>' + esc(s.stay) + '</dd></div>' +
            '<div><dt>時間帯</dt><dd>' + esc(s.when.join('・')) + '</dd></div>' +
            '<div><dt>見頃</dt><dd>' + esc(seasonText(s.best)) + '</dd></div>' +
          '</dl>' +
          '<p class="ticket-tip"><span>ふたりで行くなら</span>' + esc(s.tip) + '</p>' +
          '<div class="chips">' + tags + '</div>' +
        '</div>' +
        '<div class="ticket-stub">' +
          '<button type="button" class="save-btn" data-save="' + esc(s.id) + '" aria-pressed="' + saved + '">' +
            '<svg class="ic-s" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>' +
            '<span>' + (saved ? '行きたい済み' : '行きたい') + '</span></button>' +
          (opts.noMapLink ? '' : '<a class="stub-link" href="map.html?id=' + encodeURIComponent(s.id) + '">地図で見る</a>') +
          '<a class="stub-link" href="' + gmapUrl(s) + '" target="_blank" rel="noopener">Googleマップ ↗</a>' +
        '</div>' +
      '</article>';
  }

  /* 行きたいボタン（どのページでも同じ動き） */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-save]');
    if (!b) return;
    const on = toggleSaved(b.dataset.save);
    document.querySelectorAll('[data-save="' + CSS.escape(b.dataset.save) + '"]').forEach(x => {
      x.setAttribute('aria-pressed', on);
      const sp = x.querySelector('span');
      if (sp) sp.textContent = on ? '行きたい済み' : '行きたい';
    });
    toast(on ? '行きたいリストに入れました' : '行きたいリストから外しました');
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
    el.hidden = false;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.classList.remove('show'); }, 1800);
  }

  window.Odekake = {
    TAGS, TAG_MAP, AREAS, BUDGET, BUDGET_MARK, icon, esc, loadSpots, getSaved, isSaved, toggleSaved,
    gmapUrl, inSeason, nowMonth, seasonText, distanceKm, primaryTag, spotCard, toast
  };
})();
