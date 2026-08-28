<?php
/**
 * PDO 接続。クエリは必ずプリペアドステートメントで実行すること。
 */
declare(strict_types=1);

function db(): PDO
{
    /** @var ?PDO $pdo */
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    global $APP_CONFIG;
    $conf = $APP_CONFIG['db'] ?? [];

    $pdo = new PDO(
        (string) ($conf['dsn'] ?? ''),
        $conf['user'] ?? null,
        $conf['pass'] ?? null,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );

    return $pdo;
}
