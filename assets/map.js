/* おでかけ日和: スポットマップ */
(function () {
  'use strict';
  const O = window.Odekake;
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);

  const state = { tag: params.get('tag') || 'all', savedOnly: false };
  let focusId = params.get('id');
  let spots = [];
  let seq = 0;

  O.mountLocBar($('locbar'), { idPrefix: 'm' });

  const map = L.map('map', { zoomControl: true }).setView([36.5, 137.8], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const layer = L.layerGroup().addTo(map);
  const markers = {};
  let circle = null, meMarker = null;

  function pinIcon(s) {
    const t = O.primaryTag(s);
    return L.divIcon({
      className: '',
      html: '<div class="pin' + (O.isSaved(s.id) ? ' saved' : '') + (s.score >= 3 ? ' big' : '') + '" style="--c:' + t.color + '">' + O.icon(t.id) + '</div>',
      iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28]
    });
  }

  function popupHtml(s) {
    const meta = [s.kind, s.dist != null ? O.distText(s.dist) : ''].filter(Boolean).join('　');
    return '<div class="pop">' +
      (s.img ? '<img class="pop-img" src="' + O.esc(s.img) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '') +
      '<div class="pop-area">' + O.esc(meta) + (O.inSeason(s) ? '<span class="flag flag-season">見頃</span>' : '') + (s.curated ? '<span class="flag">おすすめ</span>' : '') + '</div>' +
      '<h3>' + O.esc(s.name) + '</h3>' +
      (s.desc ? '<p>' + O.esc(s.desc) + '</p>' : '') +
      '<div class="pop-actions">' + O.saveButton(s) +
        '<a class="act-link" href="' + O.gmapUrl(s) + '" target="_blank" rel="noopener">Googleマップ</a>' +
      '</div></div>';
  }

  function source() {
    if (!state.savedOnly) return spots;
    const loc = O.getLoc();
    const list = O.getSavedList().map(s => Object.assign({}, s, { dist: loc ? O.distanceKm(loc, s) : null }));
    O.register(list);
    return list;
  }
  function visible() { return source().filter(s => state.tag === 'all' || s.tags.includes(state.tag)); }

  function renderTabs() {
    const src = source();
    $('tabs').innerHTML = O.TAGS.map(t => {
      const n = src.filter(s => t.id === 'all' || s.tags.includes(t.id)).length;
      return '<button type="button" class="tab" style="--c:' + t.color + '" data-tag="' + t.id + '" aria-pressed="' + (state.tag === t.id) + '">' +
        O.icon(t.id, 'tab-icon') + '<span class="tab-label">' + O.esc(t.label) + '</span><span class="count">' + n + '</span></button>';
    }).join('');
    const r = O.getRadius();
    $('radius').innerHTML = O.RADII.map(k => '<button type="button" class="area" data-radius="' + k + '" aria-pressed="' + (r === k) + '">' + k + 'km</button>').join('');
    $('radius').hidden = state.savedOnly;
    $('saved-count').textContent = O.getSaved().length;
    $('saved-toggle').setAttribute('aria-pressed', state.savedOnly);
  }

  function renderMarkers(fit) {
    layer.clearLayers();
    const list = visible();
    list.forEach(s => {
      let m = markers[s.id];
      if (!m) {
        m = L.marker([s.lat, s.lng]);
        m.on('popupopen', () => {
          O.enrich([s]).then(changed => { if (changed && m.isPopupOpen()) m.setPopupContent(popupHtml(s)); });
        });
        markers[s.id] = m;
      }
      m.bindPopup(() => popupHtml(s), { maxWidth: 280 });
      m.setIcon(pinIcon(s));
      m.setZIndexOffset(s.score * 10);
      layer.addLayer(m);
    });
    if (fit) {
      if (state.savedOnly && list.length) map.fitBounds(L.latLngBounds(list.map(s => [s.lat, s.lng])), { padding: [40, 40], maxZoom: 13 });
      else if (circle) map.fitBounds(circle.getBounds(), { padding: [10, 10] });
    }
  }

  function drawArea() {
    const loc = O.getLoc();
    if (circle) { circle.remove(); circle = null; }
    if (meMarker) { meMarker.remove(); meMarker = null; }
    if (!loc) return;
    circle = L.circle([loc.lat, loc.lng], { radius: O.getRadius() * 1000, color: '#E0513E', weight: 2, fillOpacity: 0.03, dashArray: '6 6', interactive: false }).addTo(map);
    meMarker = L.circleMarker([loc.lat, loc.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2F6CA8', fillOpacity: 1 }).addTo(map).bindTooltip(loc.label);
  }

  async function search() {
    const loc = O.getLoc();
    const my = ++seq;
    drawArea();
    $('here').hidden = true;
    if (!loc) { $('map-status').textContent = '先に場所を決めてください'; spots = []; renderTabs(); renderMarkers(false); return; }
    $('map-status').textContent = '探しています…';
    if (!focusId) map.fitBounds(circle.getBounds(), { padding: [10, 10] });
    try {
      const list = await O.searchSpots(loc, O.getRadius());
      if (my !== seq) return;
      spots = list;
      $('map-status').textContent = spots.length + 'か所';
    } catch (e) {
      if (my !== seq) return;
      spots = []; $('map-status').textContent = '';
      O.toast(e.message);
    }
    renderTabs();
    const focus = focusId && spots.find(s => s.id === focusId);
    renderMarkers(!focus && !focusId);
    if (focusId) openFocus();
  }

  async function openFocus() {
    const id = focusId; focusId = null;
    let s = spots.find(x => x.id === id) || O.getSavedList().find(x => x.id === id);
    if (!s) s = (await O.loadCurated()).find(x => x.id === id);
    if (!s) { if (circle) map.fitBounds(circle.getBounds()); return; }
    O.register([s]);
    if (!markers[s.id] || !layer.hasLayer(markers[s.id])) {
      const m = L.marker([s.lat, s.lng], { icon: pinIcon(s) }).bindPopup(() => popupHtml(s), { maxWidth: 280 });
      m.on('popupopen', () => { O.enrich([s]).then(c => { if (c && m.isPopupOpen()) m.setPopupContent(popupHtml(s)); }); });
      markers[s.id] = m; layer.addLayer(m);
    }
    map.setView([s.lat, s.lng], 15);
    markers[s.id].openPopup();
  }

  // 地図を動かしたら「この辺りで探す」を出す
  map.on('moveend', () => {
    const loc = O.getLoc();
    if (state.savedOnly) return;
    const c = map.getCenter();
    const far = !loc || O.distanceKm(loc, { lat: c.lat, lng: c.lng }) > O.getRadius() * 0.6;
    $('here').hidden = !(far && map.getZoom() >= 9);
  });
  $('here').addEventListener('click', async () => {
    const c = map.getCenter();
    $('here').disabled = true; $('here').textContent = '検索中…';
    try {
      // 今の表示範囲がおさまる範囲で探す
      const b = map.getBounds();
      const halfKm = Math.min(O.distanceKm({ lat: c.lat, lng: b.getWest() }, { lat: c.lat, lng: c.lng }), O.distanceKm({ lat: b.getNorth(), lng: c.lng }, { lat: c.lat, lng: c.lng }));
      const r = O.RADII.slice().reverse().find(k => k <= halfKm * 1.2) || O.RADII[0];
      const loc = await O.locFromPoint(c.lat, c.lng);
      suppressFit = true;
      if (r !== O.getRadius()) O.setRadius(r);
      suppressFit = false;
      O.setLoc(loc);
    } finally { $('here').disabled = false; $('here').textContent = 'この辺りで探す'; }
  });

  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tag]'); if (!b) return;
    state.tag = b.dataset.tag; renderTabs(); renderMarkers(false);
  });
  $('radius').addEventListener('click', e => {
    const b = e.target.closest('[data-radius]'); if (!b) return;
    O.setRadius(Number(b.dataset.radius));
  });
  $('saved-toggle').addEventListener('click', () => {
    if (!state.savedOnly && !O.getSaved().length) { O.toast('行きたいリストは空です'); return; }
    state.savedOnly = !state.savedOnly; $('here').hidden = true; renderTabs(); renderMarkers(true);
  });
  document.addEventListener('saved-change', e => {
    const m = e.detail && markers[e.detail.id];
    const s = e.detail && (spots.find(x => x.id === e.detail.id) || O.getSavedList().find(x => x.id === e.detail.id));
    if (m && s) m.setIcon(pinIcon(s));
    $('saved-count').textContent = O.getSaved().length;
  });
  let suppressFit = false;
  document.addEventListener('loc-change', () => { state.savedOnly = false; search(); });
  document.addEventListener('radius-change', () => { if (!suppressFit) search(); });

  renderTabs();
  search();
})();
