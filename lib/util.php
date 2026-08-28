<?php
/**
 * API 共通のヘルパ: JSON 応答、入力バリデーション、トークン検証、色パレット。
 */
declare(strict_types=1);

/** グループあたりのメンバー数上限 */
const MAX_MEMBERS = 10;
/** メンバー名の長さ(文字数) */
const MEMBER_NAME_MAX = 30;
/** グループ名の長さ(文字数) */
const GROUP_NAME_MAX = 60;

/**
 * メンバーに自動割当する色。白地の地図の上でも 10 色を区別できるように選んである。
 * members.color は CHAR(7) なので必ず #rrggbb 形式。
 */
const MEMBER_COLORS = [
    '#e6194b', // レッド
    '#f58231', // オレンジ
    '#ffb400', // アンバー
    '#3cb44b', // グリーン
    '#00a3a3', // ティール
    '#4363d8', // ブルー
    '#911eb4', // パープル
    '#f032e6', // マゼンタ
    '#9a6324', // ブラウン
    '#2b2d42', // チャコール
];

/** JSON を返して終了する。 */
function json_response(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** エラー JSON を返して終了する。 */
function json_error(int $status, string $message): never
{
    json_response(['error' => $message], $status);
}

/**
 * リクエストボディを配列で受け取る。
 * fetch からの JSON (application/json) と、通常のフォーム POST の両方に対応する。
 */
function request_payload(): array
{
    if (!empty($_POST)) {
        return $_POST;
    }
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

/** 更新系 API は POST 限定。 */
function require_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST');
        json_error(405, 'POST で呼び出してください。');
    }
}

/** 参照系 API は GET 限定。 */
function require_get(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
        header('Allow: GET');
        json_error(405, 'GET で呼び出してください。');
    }
}

/** 新しい共有トークンを発行する。 */
function generate_token(): string
{
    return bin2hex(random_bytes(16));
}

/** トークンの形式チェック(32桁の16進)。 */
function is_valid_token(mixed $token): bool
{
    return is_string($token) && preg_match('/\A[0-9a-f]{32}\z/', $token) === 1;
}

/**
 * トークンからグループを引く。見つからなければ 404 で終了する。
 * 「URL を知っている人だけがアクセスできる」という前提の唯一の入口。
 */
function require_group(mixed $token): array
{
    if (!is_valid_token($token)) {
        json_error(404, 'グループが見つかりません。');
    }
    $stmt = db()->prepare('SELECT id, token, name, created_at FROM `groups` WHERE token = ?');
    $stmt->execute([$token]);
    $group = $stmt->fetch();
    if (!$group) {
        json_error(404, 'グループが見つかりません。');
    }
    $group['id'] = (int) $group['id'];
    return $group;
}

/** メンバー名を正規化して返す。不正なら null。 */
function normalize_member_name(mixed $name): ?string
{
    if (!is_string($name)) {
        return null;
    }
    // 制御文字を除去してから前後の空白を落とす
    $name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? '';
    $name = trim($name);
    $len = mb_strlen($name, 'UTF-8');
    if ($len < 1 || $len > MEMBER_NAME_MAX) {
        return null;
    }
    return $name;
}

/** グループ名を正規化して返す。空なら null(未設定)。長すぎる場合は false。 */
function normalize_group_name(mixed $name): string|null|false
{
    if ($name === null || $name === '') {
        return null;
    }
    if (!is_string($name)) {
        return false;
    }
    $name = trim(preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? '');
    if ($name === '') {
        return null;
    }
    return mb_strlen($name, 'UTF-8') <= GROUP_NAME_MAX ? $name : false;
}

/** アプリが知っている国コードの一覧(assets/countries_ja.json のキー)。 */
function known_country_codes(): array
{
    /** @var ?array<string,true> $codes */
    static $codes = null;
    if ($codes !== null) {
        return $codes;
    }
    $json = @file_get_contents(__DIR__ . '/../assets/countries_ja.json');
    $table = $json === false ? null : json_decode($json, true);
    if (!is_array($table)) {
        throw new RuntimeException('assets/countries_ja.json を読み込めません。');
    }
    $codes = array_fill_keys(array_keys($table), true);
    return $codes;
}

/** 国コードを正規化して返す。既知のコードでなければ null。 */
function normalize_country_code(mixed $code): ?string
{
    if (!is_string($code)) {
        return null;
    }
    $code = strtoupper(trim($code));
    if (preg_match('/\A[A-Z]{2}\z/', $code) !== 1) {
        return null;
    }
    return isset(known_country_codes()[$code]) ? $code : null;
}

/** 正の整数として解釈する。できなければ null。 */
function to_positive_int(mixed $value): ?int
{
    if (is_int($value)) {
        return $value > 0 ? $value : null;
    }
    if (is_string($value) && preg_match('/\A[0-9]+\z/', $value) === 1) {
        $n = (int) $value;
        return $n > 0 ? $n : null;
    }
    return null;
}

/** グループのメンバー一覧を並び順で取得する。 */
function fetch_members(int $groupId): array
{
    $stmt = db()->prepare(
        'SELECT id, name, color, sort_order FROM members WHERE group_id = ? ORDER BY sort_order, id'
    );
    $stmt->execute([$groupId]);
    return array_map(static fn (array $m): array => [
        'id'         => (int) $m['id'],
        'name'       => $m['name'],
        'color'      => $m['color'],
        'sort_order' => (int) $m['sort_order'],
    ], $stmt->fetchAll());
}

/** 既存メンバーとかぶらない色をパレットから選ぶ。 */
function pick_member_color(array $usedColors): string
{
    foreach (MEMBER_COLORS as $color) {
        if (!in_array($color, $usedColors, true)) {
            return $color;
        }
    }
    // 上限 10 人なので通常ここには来ない
    return MEMBER_COLORS[count($usedColors) % count(MEMBER_COLORS)];
}

/** メンバーがそのグループのものか確認する。違えば 404 で終了。 */
function require_member(int $groupId, mixed $memberId): array
{
    $id = to_positive_int($memberId);
    if ($id === null) {
        json_error(400, 'member_id が不正です。');
    }
    $stmt = db()->prepare('SELECT id, group_id, name, color, sort_order FROM members WHERE id = ?');
    $stmt->execute([$id]);
    $member = $stmt->fetch();
    if (!$member || (int) $member['group_id'] !== $groupId) {
        json_error(404, 'メンバーが見つかりません。');
    }
    $member['id'] = (int) $member['id'];
    $member['sort_order'] = (int) $member['sort_order'];
    unset($member['group_id']);
    return $member;
}
