/* グループ作成ページ (index.php) の動作 */
(function () {
  'use strict';

  var COLORS = window.APP.memberColors;
  var MAX_MEMBERS = window.APP.maxMembers;
  var NAME_MAX = window.APP.memberNameMax;

  var rows = document.getElementById('member-rows');
  var addRowBtn = document.getElementById('add-row');
  var memberHint = document.getElementById('member-hint');
  var form = document.getElementById('create-form');
  var submitBtn = document.getElementById('submit-btn');
  var errorBox = document.getElementById('form-error');
  var result = document.getElementById('result');
  var resultUrl = document.getElementById('result-url');
  var copyBtn = document.getElementById('copy-btn');
  var openBtn = document.getElementById('open-btn');

  /** 入力欄を1行追加する。 */
  function addRow(focus) {
    if (rows.children.length >= MAX_MEMBERS) { return; }
    var index = rows.children.length;

    var row = document.createElement('div');
    row.className = 'member-row';

    var swatch = document.createElement('span');
    swatch.className = 'swatch';
    row.appendChild(swatch);

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'field member-name';
    input.maxLength = NAME_MAX;
    input.autocomplete = 'off';
    input.placeholder = index === 0 ? '例: ヒロキ' : '名前';
    input.setAttribute('aria-label', 'メンバー' + (index + 1) + 'の名前');
    row.appendChild(input);

    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'row-remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'この行を削除');
    remove.addEventListener('click', function () {
      row.remove();
      refresh();
    });
    row.appendChild(remove);

    rows.appendChild(row);
    refresh();
    if (focus) { input.focus(); }
  }

  /** 行の色・削除ボタンの活性・ヒント文言を現在の行数に合わせる。 */
  function refresh() {
    var items = rows.querySelectorAll('.member-row');
    for (var i = 0; i < items.length; i++) {
      items[i].querySelector('.swatch').style.background = COLORS[i % COLORS.length];
      items[i].querySelector('.member-name')
        .setAttribute('aria-label', 'メンバー' + (i + 1) + 'の名前');
      items[i].querySelector('.row-remove').disabled = items.length <= 1;
    }
    addRowBtn.disabled = items.length >= MAX_MEMBERS;
    memberHint.textContent = items.length >= MAX_MEMBERS
      ? 'メンバーは' + MAX_MEMBERS + '人までです。'
      : '色は自動で割り当てられます。あとから追加・変更もできます。';
  }

  function showError(message) {
    errorBox.textContent = message;
  }

  var toastTimer = null;
  function toast(message) {
    var el = document.getElementById('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  /** クリップボードへコピー。https 以外では execCommand にフォールバックする。 */
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

  addRowBtn.addEventListener('click', function () { addRow(true); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    showError('');

    var names = [];
    var inputs = rows.querySelectorAll('.member-name');
    for (var i = 0; i < inputs.length; i++) {
      var v = inputs[i].value.trim();
      if (v !== '') { names.push(v); }
    }
    if (names.length === 0) {
      showError('メンバーを1人以上入力してください。');
      inputs[0].focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '作成中…';

    fetch('api/group_create.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('group-name').value,
        members: names
      })
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok, data: data }; });
    }).then(function (r) {
      if (!r.ok) { throw new Error(r.data && r.data.error ? r.data.error : '作成に失敗しました。'); }
      var url = new URL('map.php?g=' + encodeURIComponent(r.data.token), window.location.href).href;
      resultUrl.textContent = url;
      openBtn.href = url;
      result.hidden = false;
      form.hidden = true;
      result.scrollIntoView({ behavior: 'smooth', block: 'center' });
      copyBtn.onclick = function () {
        copyText(url).then(function () { toast('URLをコピーしました'); })
          .catch(function () { toast('コピーできませんでした。URLを長押しして選択してください。'); });
      };
    }).catch(function (err) {
      showError(err.message || '作成に失敗しました。通信状況を確認してください。');
    }).finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'マップを作る';
    });
  });

  addRow(false);
  addRow(false);
  addRow(false);
})();
