<?php
/**
 * 全 API 共通の初期化。
 * config.php の読み込み、エラー表示の抑止、共通ヘルパの読み込みを行う。
 */
declare(strict_types=1);

// 通常はリポジトリ直下の config.php。
// 環境変数 VISITED_SITE_CONFIG を設定すると、その絶対パスの設定ファイルを読む。
// (ドキュメントルート外に接続情報を置きたい場合や、ローカルの動作確認で使う)
$configPath = getenv('VISITED_SITE_CONFIG') ?: __DIR__ . '/../config.php';
if (!is_file($configPath)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(
        ['error' => 'config.php がありません。config.example.php をコピーして作成してください。'],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

/** @var array{db: array{dsn: string, user: ?string, pass: ?string}, debug: bool} $APP_CONFIG */
$APP_CONFIG = require $configPath;

$APP_DEBUG = !empty($APP_CONFIG['debug']);

error_reporting(E_ALL);
ini_set('display_errors', $APP_DEBUG ? '1' : '0');
ini_set('log_errors', '1');

require_once __DIR__ . '/util.php';
require_once __DIR__ . '/db.php';

// 想定外の例外は 500 + JSON で返す(本番では詳細を出さない)。
set_exception_handler(static function (Throwable $e) use ($APP_DEBUG): void {
    error_log('[visited_site] ' . $e);
    json_error(500, $APP_DEBUG ? $e->getMessage() : 'サーバ内部エラーが発生しました。');
});
