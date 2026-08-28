<?php
/**
 * POST api/member_update.php
 *   { "token": "...", "member_id": 1, "name": "新しい名前", "color": "#4363d8" (任意) }
 * -> { "member": {...} }
 *
 * color はパレット(MEMBER_COLORS)にある色だけを受け付ける。
 */
declare(strict_types=1);
require __DIR__ . '/../lib/bootstrap.php';

require_post();
$in = request_payload();
$group = require_group($in['token'] ?? null);
$member = require_member($group['id'], $in['member_id'] ?? null);

$name = normalize_member_name($in['name'] ?? null);
if ($name === null) {
    json_error(400, 'メンバー名は1〜' . MEMBER_NAME_MAX . '文字で入力してください。');
}

$color = $member['color'];
if (array_key_exists('color', $in) && $in['color'] !== null && $in['color'] !== '') {
    $requested = is_string($in['color']) ? strtolower($in['color']) : '';
    if (!in_array($requested, MEMBER_COLORS, true)) {
        json_error(400, '指定できない色です。');
    }
    $color = $requested;
}

$stmt = db()->prepare('UPDATE members SET name = ?, color = ? WHERE id = ? AND group_id = ?');
$stmt->execute([$name, $color, $member['id'], $group['id']]);

json_response([
    'member' => [
        'id'         => $member['id'],
        'name'       => $name,
        'color'      => $color,
        'sort_order' => $member['sort_order'],
    ],
]);
