<?php
/**
 * DB 接続情報などの設定。
 *
 * このファイルを config.php にコピーして、実際の値を入れてください。
 * config.php は .gitignore に入れてあるのでリポジトリには含まれません。
 */
return [
    'db' => [
        // さくらのレンタルサーバの例:
        //   ホスト名はコントロールパネルの「データベース」画面に表示されるもの
        'dsn'  => 'mysql:host=mysql0000.db.sakura.ne.jp;dbname=youraccount_visited;charset=utf8mb4',
        'user' => 'youraccount',
        'pass' => 'your-database-password',

        // ローカル確認用の例:
        // 'dsn'  => 'mysql:host=127.0.0.1;dbname=visited_site;charset=utf8mb4',
        // 'user' => 'root',
        // 'pass' => '',
    ],

    // true にすると PHP のエラーが画面/レスポンスに出ます。本番は必ず false。
    'debug' => false,
];
