/* グループページ (map.php) の動作 */
(function () {
  'use strict';

  var BOOT = JSON.parse(document.getElementById('bootstrap-data').textContent);

  /** これ以上ズームすると人数バッジから個別の旗表示に切り替える */
  var FLAG_ZOOM = 4;

  var state = {
    token: BOOT.token,
    members: BOOT.members.slice(),
    /** 国コード -> 行ったメンバーIDの Set */
    visits: new Map(),
    /** メンバーID -> 訪問国数 */
    counts: new Map(),
    /** 国コード -> 日本語名 */
    names: {},
    activeCode: null
  };

  var map = null;
  var geoLayer = null;
  var markerLayer = null;
  var labelLayer = null;
  /** { marker, minZoom } の配列。国名ラベルはズームに応じて出し入れする */
  var labelMarkers = [];
  /** 国コード -> ポリゴンの Leaflet レイヤ */
  var polygonByCode = new Map();
  /** 国コード -> 旗マーカー */
  var markerByCode = new Map();
  var lastDetailed = null;

  var el = {
    map: document.getElementById('map'),
    legend: document.getElementById('legend'),
    sheet: document.getElementById('sheet'),
    sheetTitle: document.getElementById('sheet-title'),
    sheetSub: document.getElementById('sheet-sub'),
    sheetMembers: document.getElementById('sheet-members'),
    backdrop: document.getElementById('backdrop'),
    modal: document.getElementById('manage-modal'),
    manageList: document.getElementById('manage-list'),
    manageNote: document.getElementById('manage-note'),
    newMemberName: document.getElementById('new-member-name'),
    addMemberBtn: document.getElementById('add-member-btn'),
    toast: document.getElementById('toast')
  };

  /* ---------------- 汎用 ---------------- */

  var toastTimer = null;
  function toast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 2400);
  }

  /** 更新系 API を叩く。エラーは Error として reject する。 */
  function post(path, body) {
    body.token = state.token;
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) { throw new Error(data.error || ('通信エラー (' + res.status + ')')); }
        return data;
      });
    });
  }

  function memberById(id) {
    for (var i = 0; i < state.members.length; i++) {
      if (state.members[i].id === id) { return state.members[i]; }
    }
    return null;
  }

  function countryName(code) {
    return state.names[code] || code;
  }

  function visitorsOf(code) {
    return state.visits.get(code) || null;
  }

  function visitorCount(code) {
    var s = state.visits.get(code);
    return s ? s.size : 0;
  }

  /* ---------------- 訪問データ ---------------- */

  function indexVisits(visits) {
    state.visits = new Map();
    state.counts = new Map();
    for (var i = 0; i < visits.length; i++) {
      addVisitLocal(visits[i].member_id, visits[i].country_code);
    }
  }

  function addVisitLocal(memberId, code) {
    var set = state.visits.get(code);
    if (!set) { set = new Set(); state.visits.set(code, set); }
    if (set.has(memberId)) { return; }
    set.add(memberId);
    state.counts.set(memberId, (state.counts.get(memberId) || 0) + 1);
  }

  function removeVisitLocal(memberId, code) {
    var set = state.visits.get(code);
    if (!set || !set.has(memberId)) { return; }
    set.delete(memberId);
    if (set.size === 0) { state.visits.delete(code); }
    state.counts.set(memberId, Math.max(0, (state.counts.get(memberId) || 0) - 1));
  }

  function setVisitLocal(memberId, code, on) {
    on ? addVisitLocal(memberId, code) : removeVisitLocal(memberId, code);
  }

  /** メンバーを消したとき、そのメンバーの旗も地図から消す。 */
  function dropMemberVisits(memberId) {
    var affected = [];
    state.visits.forEach(function (set, code) {
      if (set.has(memberId)) { affected.push(code); }
    });
    affected.forEach(function (code) { removeVisitLocal(memberId, code); });
    state.counts.delete(memberId);
    return affected;
  }

  /* ---------------- 地図 ---------------- */

  /**
   * 訪問人数に応じた塗り色。1人でも行っていれば色が付き、
   * 全員が行った国がいちばん濃くなる。
   */
  function fillFor(count) {
    if (count <= 0) { return '#f6f8fa'; }
    var total = Math.max(state.members.length, 1);
    var t = total <= 1 ? 1 : Math.min(1, (count - 1) / (total - 1));
    var lightness = 84 - 38 * t;
    var saturation = 34 + 26 * t;
    return 'hsl(174, ' + saturation.toFixed(0) + '%, ' + lightness.toFixed(0) + '%)';
  }

  function styleFor(code) {
    var isActive = state.activeCode === code;
    return {
      color: isActive ? '#0f766e' : '#9fadbb',
      weight: isActive ? 2 : 0.7,
      opacity: 1,
      fillColor: fillFor(visitorCount(code)),
      fillOpacity: 1
    };
  }

  function detailedMode() {
    return map.getZoom() >= FLAG_ZOOM;
  }

  /** 旗(または人数バッジ)のアイコンを組み立てる。文字列 HTML は使わず DOM で作る。 */
  function buildIcon(code) {
    var set = visitorsOf(code);
    if (!set || set.size === 0) { return null; }

    var wrap = document.createElement('div');

    if (detailedMode()) {
      wrap.className = 'flag-stack';
      // 凡例と同じ並び順になるよう members の順で走査する
      for (var i = 0; i < state.members.length; i++) {
        var m = state.members[i];
        if (!set.has(m.id)) { continue; }
        var flag = document.createElement('i');
        flag.className = 'flag';
        flag.style.setProperty('--flag-color', m.color);
        wrap.appendChild(flag);
      }
    } else {
      wrap.className = 'count-badge';
      wrap.textContent = String(set.size);
    }

    return L.divIcon({
      html: wrap,
      className: 'flag-marker',
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });
  }

  /**
   * 国名ラベルを全国ぶん作る。
   * どのズームから出すかは Natural Earth の MIN_LABEL(properties.z)に従う。
   * ラベルはタップを拾わない(interactive: false)ので、国の選択を邪魔しない。
   */
  function buildLabels(geo) {
    for (var i = 0; i < geo.features.length; i++) {
      var p = geo.features[i].properties;

      var span = document.createElement('span');
      span.textContent = countryName(p.c);

      var marker = L.marker([p.y, p.x], {
        icon: L.divIcon({
          html: span,
          className: 'country-label',
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        }),
        interactive: false,
        keyboard: false,
        // 旗マーカーより必ず下に描く
        zIndexOffset: -10000
      });
      marker.addTo(labelLayer);

      labelMarkers.push({
        marker: marker,
        minZoom: typeof p.z === 'number' ? p.z : 5
      });
    }
    updateLabelVisibility();
  }

  /** 現在のズームで出してよいラベルだけを表示する。 */
  function updateLabelVisibility() {
    var zoom = map.getZoom();
    for (var i = 0; i < labelMarkers.length; i++) {
      var entry = labelMarkers[i];
      var node = entry.marker.getElement();
      if (node) { node.style.display = zoom >= entry.minZoom ? '' : 'none'; }
    }
  }

  /** 1つの国の旗マーカーを作り直す。 */
  function refreshMarker(code) {
    var existing = markerByCode.get(code);
    var icon = buildIcon(code);

    if (!icon) {
      if (existing) { markerLayer.removeLayer(existing); markerByCode.delete(code); }
      return;
    }
    if (existing) {
      existing.setIcon(icon);
      return;
    }

    var point = state.points.get(code);
    if (!point) { return; }
    var marker = L.marker(point, { icon: icon, keyboard: false, riseOnHover: true });
    marker.on('click', function () { openSheet(code); });
    marker.addTo(markerLayer);
    markerByCode.set(code, marker);
  }

  function renderAllMarkers() {
    markerLayer.clearLayers();
    markerByCode.clear();
    state.visits.forEach(function (set, code) {
      if (set.size > 0) { refreshMarker(code); }
    });
  }

  function refreshCountry(code) {
    var layer = polygonByCode.get(code);
    if (layer) { layer.setStyle(styleFor(code)); }
    refreshMarker(code);
  }

  function buildMap(geo) {
    map = L.map('map', {
      // スマホの狭い画面だと zoom 1 でも世界が横にはみ出すので 0 まで許す
      minZoom: 0,
      maxZoom: 9,
      zoomSnap: 0.5,
      zoomControl: true,
      attributionControl: false,
      worldCopyJump: false,
      preferCanvas: true,
      maxBounds: [[-89, -190], [89, 190]],
      maxBoundsViscosity: 0.8
    });

    state.points = new Map();
    for (var i = 0; i < geo.features.length; i++) {
      var p = geo.features[i].properties;
      state.points.set(p.c, [p.y, p.x]);
    }

    geoLayer = L.geoJSON(geo, {
      // 国のクリックを地図まで伝播させない。
      // 伝播すると「海をタップしたら閉じる」処理が同じクリックで走ってしまう。
      bubblingMouseEvents: false,
      style: function (feature) { return styleFor(feature.properties.c); },
      onEachFeature: function (feature, layer) {
        var code = feature.properties.c;
        polygonByCode.set(code, layer);
        layer.on('click', function () { openSheet(code); });
      }
    }).addTo(map);

    labelLayer = L.layerGroup().addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    buildLabels(geo);

    // 極端な高緯度を除いた世界全体が入る初期表示
    map.fitBounds([[-56, -168], [73, 178]], { padding: [4, 4] });

    lastDetailed = detailedMode();
    renderAllMarkers();

    map.on('zoomend', function () {
      updateLabelVisibility();
      if (detailedMode() !== lastDetailed) {
        lastDetailed = detailedMode();
        renderAllMarkers();
      }
    });

    // 海(どの国でもない場所)をタップしたらシートを閉じる
    map.on('click', function () { closeSheet(); });
  }

  /* ---------------- 凡例 ---------------- */

  function renderLegend() {
    el.legend.textContent = '';
    for (var i = 0; i < state.members.length; i++) {
      var m = state.members[i];
      var li = document.createElement('li');

      var dot = document.createElement('span');
      dot.className = 'swatch';
      dot.style.background = m.color;
      li.appendChild(dot);

      var name = document.createElement('span');
      name.textContent = m.name;
      li.appendChild(name);

      var count = document.createElement('span');
      count.className = 'legend-count';
      count.textContent = (state.counts.get(m.id) || 0) + 'ヶ国';
      li.appendChild(count);

      el.legend.appendChild(li);
    }
  }

  /* ---------------- ボトムシート ---------------- */

  function renderSheet() {
    var code = state.activeCode;
    if (!code) { return; }

    var set = visitorsOf(code);
    var n = set ? set.size : 0;

    el.sheetTitle.textContent = countryName(code);
    el.sheetSub.textContent = n === 0 ? 'まだ誰も行っていない' : n + '人が行った';

    el.sheetMembers.textContent = '';

    if (state.members.length === 0) {
      var empty = document.createElement('li');
      empty.className = 'manage-note';
      empty.textContent = 'メンバーがいません。右上の「メンバー」から追加してください。';
      el.sheetMembers.appendChild(empty);
      return;
    }

    for (var i = 0; i < state.members.length; i++) {
      el.sheetMembers.appendChild(buildSheetRow(state.members[i], set));
    }
  }

  function buildSheetRow(member, visitorSet) {
    var on = !!(visitorSet && visitorSet.has(member.id));

    var li = document.createElement('li');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'member-toggle';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');

    var flag = document.createElement('i');
    flag.className = 'flag';
    if (on) { flag.style.setProperty('--flag-color', member.color); }
    btn.appendChild(flag);

    var name = document.createElement('span');
    name.className = 'name';
    name.textContent = member.name;
    btn.appendChild(name);

    var stateLabel = document.createElement('span');
    stateLabel.className = 'state';
    stateLabel.textContent = on ? '行った' : '行ってない';
    btn.appendChild(stateLabel);

    btn.addEventListener('click', function () { toggleVisit(member.id); });
    li.appendChild(btn);
    return li;
  }

  function openSheet(code) {
    var previous = state.activeCode;
    state.activeCode = code;

    if (previous && previous !== code) {
      var prevLayer = polygonByCode.get(previous);
      if (prevLayer) { prevLayer.setStyle(styleFor(previous)); }
    }
    var layer = polygonByCode.get(code);
    if (layer) { layer.setStyle(styleFor(code)); layer.bringToFront(); }

    renderSheet();
    el.sheet.hidden = false;
    el.backdrop.hidden = false;
    requestAnimationFrame(function () { el.sheet.classList.add('is-open'); });
  }

  var closeTimer = null;
  function closeSheet() {
    if (el.sheet.hidden) { return; }
    var code = state.activeCode;
    state.activeCode = null;
    if (code) {
      var layer = polygonByCode.get(code);
      if (layer) { layer.setStyle(styleFor(code)); }
    }
    el.sheet.classList.remove('is-open');
    el.backdrop.hidden = true;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(function () { el.sheet.hidden = true; }, 200);
  }

  /** 旗の ON/OFF。まず画面を先に更新し、失敗したら元に戻す。 */
  function toggleVisit(memberId) {
    var code = state.activeCode;
    if (!code) { return; }
    var wasOn = !!(visitorsOf(code) && visitorsOf(code).has(memberId));

    setVisitLocal(memberId, code, !wasOn);
    afterVisitChange(code);

    post('api/visit_toggle.php', { member_id: memberId, country_code: code })
      .then(function (data) {
        if (!!data.on !== !wasOn) {
          setVisitLocal(memberId, code, !!data.on);
          afterVisitChange(code);
        }
      })
      .catch(function (err) {
        setVisitLocal(memberId, code, wasOn);
        afterVisitChange(code);
        toast(err.message || '更新できませんでした');
      });
  }

  function afterVisitChange(code) {
    refreshCountry(code);
    renderLegend();
    if (state.activeCode === code) { renderSheet(); }
  }

  /* ---------------- メンバー管理 ---------------- */

  function openManage() {
    renderManageList();
    el.modal.hidden = false;
    el.backdrop.hidden = false;
  }

  function closeManage() {
    el.modal.hidden = true;
    if (el.sheet.hidden) { el.backdrop.hidden = true; }
  }

  function renderManageList() {
    el.manageList.textContent = '';
    for (var i = 0; i < state.members.length; i++) {
      el.manageList.appendChild(buildManageRow(state.members[i]));
    }
    var full = state.members.length >= BOOT.maxMembers;
    el.newMemberName.disabled = full;
    el.addMemberBtn.disabled = full;
    el.manageNote.textContent = full
      ? 'メンバーは' + BOOT.maxMembers + '人までです。'
      : '名前を変えたら入力欄の外をタップすると保存されます。';
  }

  function buildManageRow(member) {
    var li = document.createElement('li');

    var row = document.createElement('div');
    row.className = 'manage-row';

    var colorBtn = document.createElement('button');
    colorBtn.type = 'button';
    colorBtn.className = 'color-btn';
    colorBtn.setAttribute('aria-label', member.name + 'の色を変える');
    var dot = document.createElement('span');
    dot.className = 'swatch';
    dot.style.background = member.color;
    colorBtn.appendChild(dot);
    row.appendChild(colorBtn);

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'field';
    input.value = member.name;
    input.maxLength = BOOT.nameMax;
    input.setAttribute('aria-label', 'メンバー名');
    row.appendChild(input);

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-danger';
    del.textContent = '削除';
    row.appendChild(del);

    li.appendChild(row);

    var palette = document.createElement('div');
    palette.className = 'palette';
    palette.hidden = true;
    var used = state.members.map(function (m) { return m.color; });
    BOOT.memberColors.forEach(function (color) {
      var swatchBtn = document.createElement('button');
      swatchBtn.type = 'button';
      swatchBtn.style.background = color;
      swatchBtn.setAttribute('aria-label', color);
      swatchBtn.setAttribute('aria-pressed', color === member.color ? 'true' : 'false');
      swatchBtn.disabled = color !== member.color && used.indexOf(color) !== -1;
      swatchBtn.addEventListener('click', function () {
        palette.hidden = true;
        if (color === member.color) { return; }
        updateMember(member, member.name, color);
      });
      palette.appendChild(swatchBtn);
    });
    li.appendChild(palette);

    colorBtn.addEventListener('click', function () { palette.hidden = !palette.hidden; });

    input.addEventListener('change', function () {
      var name = input.value.trim();
      if (name === member.name) { return; }
      if (name === '') { input.value = member.name; toast('名前を空にはできません'); return; }
      updateMember(member, name, member.color);
    });

    del.addEventListener('click', function () {
      var visited = state.counts.get(member.id) || 0;
      var message = member.name + ' を削除します。\n';
      message += visited > 0
        ? '立てている旗 ' + visited + 'ヶ国分も一緒に消えます。よろしいですか?'
        : 'よろしいですか?';
      if (!window.confirm(message)) { return; }
      deleteMember(member);
    });

    return li;
  }

  function updateMember(member, name, color) {
    post('api/member_update.php', { member_id: member.id, name: name, color: color })
      .then(function (data) {
        member.name = data.member.name;
        member.color = data.member.color;
        renderLegend();
        renderManageList();
        renderAllMarkers();
        if (state.activeCode) { renderSheet(); }
        toast('保存しました');
      })
      .catch(function (err) {
        toast(err.message || '保存できませんでした');
        renderManageList();
      });
  }

  function deleteMember(member) {
    post('api/member_delete.php', { member_id: member.id })
      .then(function () {
        dropMemberVisits(member.id);
        state.members = state.members.filter(function (m) { return m.id !== member.id; });
        // メンバー数が変わると塗りの濃さの基準も変わるので全体を塗り直す
        repaintAllCountries();
        renderLegend();
        renderManageList();
        if (state.activeCode) { renderSheet(); }
        toast(member.name + ' を削除しました');
      })
      .catch(function (err) { toast(err.message || '削除できませんでした'); });
  }

  function addMember(name) {
    return post('api/member_add.php', { name: name })
      .then(function (data) {
        state.members.push(data.member);
        state.members.sort(function (a, b) { return a.sort_order - b.sort_order || a.id - b.id; });
        repaintAllCountries();
        renderLegend();
        renderManageList();
        if (state.activeCode) { renderSheet(); }
        toast(data.member.name + ' を追加しました');
      });
  }

  function repaintAllCountries() {
    polygonByCode.forEach(function (layer, code) { layer.setStyle(styleFor(code)); });
    renderAllMarkers();
  }

  /* ---------------- 再同期 ---------------- */

  /**
   * サーバから現在の状態を取り直す。
   * 同じURLを共有した他の人が旗を立てている可能性があるので、
   * 画面に戻ってきたタイミングで最新に合わせる。
   */
  function reloadFromServer() {
    if (!map) { return Promise.resolve(); }
    return fetch('api/group_get.php?token=' + encodeURIComponent(state.token))
      .then(function (res) {
        if (!res.ok) { throw new Error('reload failed'); }
        return res.json();
      })
      .then(function (data) {
        state.members = data.members;
        indexVisits(data.visits);
        renderLegend();
        repaintAllCountries();
        if (state.activeCode) { renderSheet(); }
      })
      .catch(function () { /* 取れなければ今の表示を保つ */ });
  }

  /* ---------------- 共有 ---------------- */

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  function share() {
    var url = window.location.href;
    var title = document.querySelector('.group-title').textContent;
    if (navigator.share) {
      navigator.share({ title: title, url: url }).catch(function (e) {
        if (e && e.name === 'AbortError') { return; }
        copyText(url).then(function () { toast('URLをコピーしました'); });
      });
      return;
    }
    copyText(url)
      .then(function () { toast('URLをコピーしました'); })
      .catch(function () { toast('コピーできませんでした'); });
  }

  /* ---------------- 起動 ---------------- */

  function showLoading(message) {
    var box = document.createElement('div');
    box.className = 'map-loading';
    box.id = 'map-loading';
    box.textContent = message;
    box.style.cssText =
      'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:600;' +
      'background:rgba(255,255,255,.94);padding:10px 18px;border-radius:999px;' +
      'font-size:14px;box-shadow:0 2px 10px rgba(19,32,48,.15)';
    el.map.appendChild(box);
    return box;
  }

  function start() {
    indexVisits(BOOT.visits);
    renderLegend();

    var loading = showLoading('地図を読み込み中…');

    Promise.all([
      fetch('assets/countries_ja.json').then(function (r) { return r.json(); }),
      fetch('assets/countries.geojson').then(function (r) { return r.json(); })
    ]).then(function (results) {
      state.names = results[0];
      loading.remove();
      buildMap(results[1]);
    }).catch(function () {
      loading.textContent = '地図データを読み込めませんでした。再読み込みしてください。';
    });

    document.getElementById('share-btn').addEventListener('click', share);
    document.getElementById('members-btn').addEventListener('click', openManage);
    document.getElementById('manage-close').addEventListener('click', closeManage);
    document.getElementById('manage-done').addEventListener('click', closeManage);
    document.getElementById('sheet-close').addEventListener('click', closeSheet);

    el.backdrop.addEventListener('click', function () {
      if (!el.modal.hidden) { closeManage(); } else { closeSheet(); }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') { return; }
      if (!el.modal.hidden) { closeManage(); } else { closeSheet(); }
    });

    document.addEventListener('visibilitychange', function () {
      // メンバー管理を開いている間は入力中の内容を消さないよう同期しない
      if (document.visibilityState === 'visible' && el.modal.hidden) { reloadFromServer(); }
    });

    document.getElementById('add-member-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = el.newMemberName.value.trim();
      if (name === '') { return; }
      el.addMemberBtn.disabled = true;
      addMember(name)
        .then(function () { el.newMemberName.value = ''; })
        .catch(function (err) { toast(err.message || '追加できませんでした'); })
        .finally(function () { renderManageList(); });
    });
  }

  start();
})();
