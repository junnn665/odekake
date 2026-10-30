/* おでかけ日和: スポットマップ */
(function () {
  'use strict';
  const O = window.Odekake;
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);

  const state = { tag: params.get('tag') || 'all', savedOnly: false };
  const map = L.map('map', { zoomControl: true }).setView([35.17, 136.91], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  let spots = [];
  const markers = {};
  const layer = L.layerGroup().addTo(map);

  function pinIcon(s) {
    const t = O.primaryTag(s);
    return L.divIcon({
      className: '',
      html: '<div class="pin' + (O.isSaved(s.id) ? ' saved' : '') + '" style="--c:' + t.color + '">' + O.icon(t.id) + '</div>',
      iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28]
    });
  }

  function popupHtml(s) {
    const saved = O.isSaved(s.id);
    return '<div class="pop">' +
      '<div class="pop-area">' + O.esc(s.area) + '・' + O.esc(s.city) + (O.inSeason(s) ? '　<b style="color:#D9466F">いま見頃</b>' : '') + '</div>' +
      '<h3>' + O.esc(s.name) + '</h3>' +
      '<p>' + O.esc(s.desc) + '</p>' +
      '<p><b>' + O.BUDGET_MARK[s.budget] + '</b> ' + O.BUDGET[s.budget] + '・滞在 ' + O.esc(s.stay) + '</p>' +
      '<div class="pop-actions">' +
        '<button type="button" class="save-btn" data-save="' + O.esc(s.id) + '" aria-pressed="' + saved + '">' +
          '<svg class="ic-s" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>' +
          '<span>' + (saved ? '行きたい済み' : '行きたい') + '</span></button>' +
        '<a class="stub-link" href="' + O.gmapUrl(s) + '" target="_blank" rel="noopener">Googleマップ ↗</a>' +
      '</div></div>';
  }

  function visible() {
    return spots.filter(s =>
      (state.tag === 'all' || s.tags.includes(state.tag)) &&
      (!state.savedOnly || O.isSaved(s.id)));
  }

  function renderTabs() {
    $('tabs').innerHTML = O.TAGS.map(t => {
      const n = spots.filter(s => (t.id === 'all' || s.tags.includes(t.id)) && (!state.savedOnly || O.isSaved(s.id))).length;
      return '<button type="button" class="tab" style="--c:' + t.color + '" data-tag="' + t.id + '" aria-pressed="' + (state.tag === t.id) + '">' +
        O.icon(t.id, 'tab-icon') + '<span class="tab-label">' + O.esc(t.label) + '</span><span class="count">' + n + '</span></button>';
    }).join('');
  }

  function renderMarkers(fit) {
    layer.clearLayers();
    const list = visible();
    list.forEach(s => {
      const m = markers[s.id] || L.marker([s.lat, s.lng]).bindPopup(() => popupHtml(s), { maxWidth: 280 });
      m.setIcon(pinIcon(s));
      markers[s.id] = m;
      layer.addLayer(m);
    });
    if (fit && list.length) {
      map.fitBounds(L.latLngBounds(list.map(s => [s.lat, s.lng])), { padding: [40, 40], maxZoom: 13 });
    }
    $('saved-count').textContent = O.getSaved().length;
    $('saved-toggle').setAttribute('aria-pressed', state.savedOnly);
  }

  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tag]'); if (!b) return;
    state.tag = b.dataset.tag; renderTabs(); renderMarkers(true);
  });
  $('saved-toggle').addEventListener('click', () => {
    if (!state.savedOnly && !O.getSaved().length) { O.toast('まだ行きたいリストは空です'); return; }
    state.savedOnly = !state.savedOnly; renderTabs(); renderMarkers(true);
  });
  document.addEventListener('saved-change', e => {
    const s = spots.find(x => x.id === e.detail.id);
    if (s && markers[s.id]) markers[s.id].setIcon(pinIcon(s));
    $('saved-count').textContent = O.getSaved().length;
  });

  let me = null;
  $('locate').addEventListener('click', () => {
    if (!navigator.geolocation) { O.toast('この端末では現在地を使えません'); return; }
    O.toast('現在地を調べています…');
    navigator.geolocation.getCurrentPosition(pos => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (me) me.setLatLng(ll); else me = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#1D6FA8', fillOpacity: 1 }).addTo(map).bindTooltip('現在地');
      map.setView(ll, 12);
    }, () => O.toast('現在地を取得できませんでした'), { enableHighAccuracy: false, timeout: 10000 });
  });

  O.loadSpots().then(list => {
    spots = list;
    renderTabs();
    const focus = params.get('id') && spots.find(s => s.id === params.get('id'));
    renderMarkers(!focus);
    if (focus) {
      map.setView([focus.lat, focus.lng], 14);
      markers[focus.id].openPopup();
    }
  }).catch(() => O.toast('スポットを読み込めませんでした'));
})();
