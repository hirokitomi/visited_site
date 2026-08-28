<?php
/**
 * POST api/member_delete.php
 *   { "token": "...", "member_id": 1 }
 * -> { "deleted_member_id": 1 }
 *
 * そのメンバーの旗(visits)もまとめて削除する。
 * visits には ON DELETE CASCADE があるが、テーブルエンジン等に依存しないよう明示的にも消す。
 */
declare(strict_types=1);
require __DIR__ . '/../lib/bootstrap.php';

require_post();
$in = request_payload();
$group = require_group($in['token'] ?? null);
$member = require_member($group['id'], $in['member_id'] ?? null);

$pdo = db();
$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare('DELETE FROM visits WHERE member_id = ? AND group_id = ?');
    $stmt->execute([$member['id'], $group['id']]);
    $deletedVisits = $stmt->rowCount();

    $stmt = $pdo->prepare('DELETE FROM members WHERE id = ? AND group_id = ?');
    $stmt->execute([$member['id'], $group['id']]);

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
}

json_response([
    'deleted_member_id' => $member['id'],
    'deleted_visits'    => $deletedVisits,
]);
