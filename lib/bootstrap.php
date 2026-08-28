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

// util.php は never 戻り値型を使うため PHP 8.1 以上が必要。
// 古い PHP だと読み込んだ瞬間に parse error になるので、読み込む前に確認する。
// (さくらのレンタルサーバではコントロールパネルの「PHP設定」でバージョンを選べます)
if (PHP_VERSION_ID < 80100) {
    http_response_code(500);
    header('Content-Type: text/html; charset=utf-8');
    echo '<meta charset="utf-8"><h1>PHP のバージョンが古すぎます</h1>';
    echo '<p>このアプリは PHP 8.1 以上が必要です。現在のバージョンは '
        . htmlspecialchars(PHP_VERSION, ENT_QUOTES, 'UTF-8') . ' です。</p>';
    echo '<p>さくらのレンタルサーバの場合、サーバコントロールパネルの'
        . '「Webサイト/データ」→「スクリプト設定」→「PHP設定」で 8.1 以上を選んでください。</p>';
    exit;
}

require_once __DIR__ . '/util.php';
require_once __DIR__ . '/db.php';

// 想定外の例外は 500 + JSON で返す(本番では詳細を出さない)。
set_exception_handler(static function (Throwable $e) use ($APP_DEBUG): void {
    error_log('[visited_site] ' . $e);

    if ($APP_DEBUG) {
        json_error(500, $e->getMessage());
    }

    // 設置直後にいちばん多いのが DB の設定ミスとテーブル未作成。
    // 接続情報そのものは出さずに、どこを見ればよいかだけ伝える。
    if ($e instanceof PDOException) {
        json_error(500, 'データベースに接続できないか、テーブルがありません。'
            . 'config.php の接続情報と、schema.sql の取り込みを確認してください。');
    }

    json_error(500, 'サーバ内部エラーが発生しました。');
});
