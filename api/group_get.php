<?php
/**
 * GET api/group_get.php?token=...
 * -> { "group": {...}, "members": [...], "visits": [...] }
 *
 * グループページの初期描画に必要なデータを一括で返す。
 */
declare(strict_types=1);
require __DIR__ . '/../lib/bootstrap.php';

require_get();
$group = require_group($_GET['token'] ?? null);

$stmt = db()->prepare(
    'SELECT member_id, country_code FROM visits WHERE group_id = ? ORDER BY member_id, country_code'
);
$stmt->execute([$group['id']]);
$visits = array_map(static fn (array $v): array => [
    'member_id'    => (int) $v['member_id'],
    'country_code' => $v['country_code'],
], $stmt->fetchAll());

json_response([
    'group' => [
        'token'      => $group['token'],
        'name'       => $group['name'],
        'created_at' => $group['created_at'],
    ],
    'members' => fetch_members($group['id']),
    'visits'  => $visits,
]);
