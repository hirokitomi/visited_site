<?php
/**
 * POST api/group_create.php
 *   { "name": "グループ名(任意)", "members": ["ヒロキ", "ミカ", ...] }
 * -> { "token": "..." }
 *
 * グループとメンバーをまとめて作成し、共有URL用のトークンを返す。
 */
declare(strict_types=1);
require __DIR__ . '/../lib/bootstrap.php';

require_post();
$in = request_payload();

$groupName = normalize_group_name($in['name'] ?? null);
if ($groupName === false) {
    json_error(400, 'グループ名は' . GROUP_NAME_MAX . '文字以内で入力してください。');
}

$rawMembers = $in['members'] ?? null;
if (!is_array($rawMembers)) {
    json_error(400, 'members を配列で送ってください。');
}
$rawMembers = array_values($rawMembers);
if (count($rawMembers) > MAX_MEMBERS) {
    json_error(400, 'メンバーは' . MAX_MEMBERS . '人までです。');
}

$names = [];
foreach ($rawMembers as $raw) {
    $name = normalize_member_name($raw);
    if ($name === null) {
        // 空欄はフォームの未入力とみなして読み飛ばす
        if (is_string($raw) && trim($raw) === '') {
            continue;
        }
        json_error(400, 'メンバー名は1〜' . MEMBER_NAME_MAX . '文字で入力してください。');
    }
    $names[] = $name;
}
if (count($names) < 1) {
    json_error(400, 'メンバーを1人以上入力してください。');
}

$pdo = db();
$pdo->beginTransaction();
try {
    // token は UNIQUE。万一衝突しても数回リトライすれば通る。
    $token = null;
    for ($attempt = 0; $attempt < 5; $attempt++) {
        $candidate = generate_token();
        $stmt = $pdo->prepare('SELECT 1 FROM `groups` WHERE token = ?');
        $stmt->execute([$candidate]);
        if (!$stmt->fetchColumn()) {
            $token = $candidate;
            break;
        }
    }
    if ($token === null) {
        throw new RuntimeException('トークンを発行できませんでした。');
    }

    $stmt = $pdo->prepare('INSERT INTO `groups` (token, name) VALUES (?, ?)');
    $stmt->execute([$token, $groupName]);
    $groupId = (int) $pdo->lastInsertId();

    $stmt = $pdo->prepare(
        'INSERT INTO members (group_id, name, color, sort_order) VALUES (?, ?, ?, ?)'
    );
    foreach ($names as $i => $name) {
        $stmt->execute([$groupId, $name, MEMBER_COLORS[$i % count(MEMBER_COLORS)], $i]);
    }

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
}

json_response(['token' => $token], 201);
