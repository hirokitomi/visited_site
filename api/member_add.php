<?php
/**
 * POST api/member_add.php
 *   { "token": "...", "name": "新しいメンバー" }
 * -> { "member": { "id":.., "name":.., "color":.., "sort_order":.. } }
 */
declare(strict_types=1);
require __DIR__ . '/../lib/bootstrap.php';

require_post();
$in = request_payload();
$group = require_group($in['token'] ?? null);

$name = normalize_member_name($in['name'] ?? null);
if ($name === null) {
    json_error(400, 'メンバー名は1〜' . MEMBER_NAME_MAX . '文字で入力してください。');
}

$members = fetch_members($group['id']);
if (count($members) >= MAX_MEMBERS) {
    json_error(409, 'メンバーは' . MAX_MEMBERS . '人までです。');
}

$color = pick_member_color(array_column($members, 'color'));
$sortOrder = $members === [] ? 0 : max(array_column($members, 'sort_order')) + 1;

$stmt = db()->prepare('INSERT INTO members (group_id, name, color, sort_order) VALUES (?, ?, ?, ?)');
$stmt->execute([$group['id'], $name, $color, $sortOrder]);

json_response([
    'member' => [
        'id'         => (int) db()->lastInsertId(),
        'name'       => $name,
        'color'      => $color,
        'sort_order' => $sortOrder,
    ],
], 201);
