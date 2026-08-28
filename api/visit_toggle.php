<?php
/**
 * POST api/visit_toggle.php
 *   { "token": "...", "member_id": 1, "country_code": "JP" }
 * -> { "on": true | false }
 *
 * 旗が立っていれば下ろし、立っていなければ立てる。
 */
declare(strict_types=1);
require __DIR__ . '/../lib/bootstrap.php';

require_post();
$in = request_payload();
$group = require_group($in['token'] ?? null);
$member = require_member($group['id'], $in['member_id'] ?? null);

$code = normalize_country_code($in['country_code'] ?? null);
if ($code === null) {
    json_error(400, '国コードが不正です。');
}

$pdo = db();

// まず削除を試し、消せなければ立っていなかったので INSERT する。
$stmt = $pdo->prepare('DELETE FROM visits WHERE member_id = ? AND country_code = ?');
$stmt->execute([$member['id'], $code]);
if ($stmt->rowCount() > 0) {
    json_response(['on' => false, 'member_id' => $member['id'], 'country_code' => $code]);
}

try {
    $stmt = $pdo->prepare(
        'INSERT INTO visits (group_id, member_id, country_code) VALUES (?, ?, ?)'
    );
    $stmt->execute([$group['id'], $member['id'], $code]);
} catch (PDOException $e) {
    // 同時押しなどで UNIQUE(member_id, country_code) に当たった場合は、
    // すでに立っている状態なので ON として扱う。
    if (!str_starts_with((string) $e->getCode(), '23')) {
        throw $e;
    }
}

json_response(['on' => true, 'member_id' => $member['id'], 'country_code' => $code], 201);
