<?php
/**
 * グループ作成ページ。
 * メンバー名を入力して「マップを作る」を押すと、api/group_create.php が
 * 推測困難なトークン付きの専用URLを発行する。
 */
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';

$colorsJson = json_encode(MEMBER_COLORS, JSON_UNESCAPED_SLASHES);
?>
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>みんなの行った国マップ</title>
<link rel="stylesheet" href="assets/app.css">
</head>
<body>
<main class="create-page">
  <h1>みんなの行った国マップ</h1>
  <p class="lead">
    メンバーを登録すると専用URLが発行されます。<br>
    URLを共有した人だけが、世界地図に「行ったことのある国」の旗を立てられます。
  </p>

  <form id="create-form" class="card" novalidate>
    <div class="form-group">
      <label for="group-name">グループ名 <span class="hint">(任意)</span></label>
      <input class="field" type="text" id="group-name" name="group_name"
             maxlength="<?= GROUP_NAME_MAX ?>" placeholder="例: ヨーロッパ旅行部" autocomplete="off">
    </div>

    <div class="form-group">
      <span class="form-label" id="members-label">メンバー <span class="hint">(1〜<?= MAX_MEMBERS ?>人)</span></span>
      <div class="member-rows" id="member-rows" role="group" aria-labelledby="members-label"></div>
      <p class="hint" id="member-hint"></p>
      <button type="button" class="btn btn-sm" id="add-row" style="margin-top:10px">＋ メンバーを追加</button>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn btn-primary" id="submit-btn">マップを作る</button>
    </div>
    <p class="error-box" id="form-error" role="alert"></p>
  </form>

  <section class="card" id="result" hidden style="margin-top:20px">
    <p class="form-label">専用URLができました</p>
    <p class="hint" style="margin:0 0 10px">このURLを知っている人だけがマップを見られます。なくさないように共有してください。</p>
    <code class="result-url" id="result-url"></code>
    <div class="result-actions">
      <button type="button" class="btn" id="copy-btn">URLをコピー</button>
      <a class="btn btn-primary" id="open-btn" href="#">マップを開く</a>
    </div>
  </section>
</main>

<div class="toast" id="toast" hidden></div>

<script>
  window.APP = {
    memberColors: <?= $colorsJson ?>,
    maxMembers: <?= MAX_MEMBERS ?>,
    memberNameMax: <?= MEMBER_NAME_MAX ?>
  };
</script>
<script src="assets/create.js"></script>
</body>
</html>
