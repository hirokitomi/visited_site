<?php
/**
 * グループページ。
 * 専用URL (map.php?g={token}) でアクセスされる。
 * トークンが不正・未登録なら 404 を返す。初期データはページに埋め込んで
 * 最初の描画で API を叩かなくてよいようにしている。
 */
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';

$token = $_GET['g'] ?? '';

$group = null;
if (is_valid_token($token)) {
    $stmt = db()->prepare('SELECT id, token, name, created_at FROM `groups` WHERE token = ?');
    $stmt->execute([$token]);
    $group = $stmt->fetch() ?: null;
}

if ($group === null) {
    http_response_code(404);
    ?>
    <!DOCTYPE html>
    <html lang="ja">
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>グループが見つかりません</title>
    <link rel="stylesheet" href="assets/app.css">
    </head>
    <body>
    <main class="create-page">
      <h1>グループが見つかりません</h1>
      <p class="lead">URLが間違っているか、グループが削除された可能性があります。<br>
        共有された専用URLをもう一度確認してください。</p>
      <p><a class="btn" href="index.php">新しくマップを作る</a></p>
    </main>
    </body>
    </html>
    <?php
    exit;
}

$groupId = (int) $group['id'];
$members = fetch_members($groupId);

$stmt = db()->prepare('SELECT member_id, country_code FROM visits WHERE group_id = ?');
$stmt->execute([$groupId]);
$visits = array_map(static fn (array $v): array => [
    'member_id'    => (int) $v['member_id'],
    'country_code' => $v['country_code'],
], $stmt->fetchAll());

$groupName = $group['name'] !== null && $group['name'] !== '' ? $group['name'] : '行った国マップ';

// <script> の中に埋め込むので、タグやクォートは必ずエスケープしておく。
$bootstrapJson = json_encode([
    'token'        => $group['token'],
    'group'        => ['name' => $group['name']],
    'members'      => $members,
    'visits'       => $visits,
    'memberColors' => MEMBER_COLORS,
    'maxMembers'   => MAX_MEMBERS,
    'nameMax'      => MEMBER_NAME_MAX,
], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
?>
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?= htmlspecialchars($groupName, ENT_QUOTES, 'UTF-8') ?> | みんなの行った国マップ</title>
<meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<link rel="stylesheet" href="assets/app.css">
</head>
<body class="map-page">

<header class="app-header">
  <div class="header-top">
    <h1 class="group-title"><?= htmlspecialchars($groupName, ENT_QUOTES, 'UTF-8') ?></h1>
    <div class="header-actions">
      <button type="button" class="btn btn-ghost btn-sm" id="members-btn">メンバー</button>
      <button type="button" class="btn btn-ghost btn-sm" id="share-btn">共有</button>
    </div>
  </div>
  <ul class="legend" id="legend"></ul>
</header>

<div id="map" role="application" aria-label="世界地図"></div>
<p class="map-note">地図データ: Natural Earth</p>

<!-- 国をタップしたときに出るボトムシート -->
<button type="button" class="backdrop" id="backdrop" hidden aria-label="閉じる"></button>

<section class="sheet" id="sheet" hidden aria-labelledby="sheet-title" role="dialog" aria-modal="false">
  <div class="sheet-handle"></div>
  <div class="sheet-head">
    <h2 class="sheet-title" id="sheet-title"></h2>
    <span class="sheet-sub" id="sheet-sub"></span>
    <button type="button" class="sheet-close" id="sheet-close" aria-label="閉じる">✕</button>
  </div>
  <div class="sheet-body">
    <ul class="member-list" id="sheet-members"></ul>
  </div>
</section>

<!-- メンバー管理 -->
<section class="modal" id="manage-modal" hidden aria-labelledby="manage-title" role="dialog" aria-modal="true">
  <div class="modal-head">
    <h2 id="manage-title">メンバー</h2>
    <button type="button" class="sheet-close" id="manage-close" aria-label="閉じる">✕</button>
  </div>
  <div class="modal-body">
    <ul class="manage-list" id="manage-list"></ul>
    <form class="add-row" id="add-member-form">
      <input class="field" type="text" id="new-member-name" maxlength="<?= MEMBER_NAME_MAX ?>"
             placeholder="新しいメンバーの名前" autocomplete="off" aria-label="新しいメンバーの名前">
      <button type="submit" class="btn btn-sm" id="add-member-btn">追加</button>
    </form>
    <p class="manage-note" id="manage-note"></p>
  </div>
  <div class="modal-foot">
    <button type="button" class="btn" id="manage-done">閉じる</button>
  </div>
</section>

<div class="toast" id="toast" hidden></div>

<script type="application/json" id="bootstrap-data"><?= $bootstrapJson ?></script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script src="assets/map.js"></script>
</body>
</html>
