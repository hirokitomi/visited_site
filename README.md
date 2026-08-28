# みんなの行った国マップ

仲間内で「誰がどの国に行ったことがあるか」を世界地図上で共有するWebアプリです。
次の旅行の行き先を決めるときに、まだ誰も行っていない国を見つける用途を想定しています。

- ログイン不要。グループを作ると推測困難なトークン付きの専用URLが発行されます
- URLを知っている人だけがアクセスでき、誰でも誰の旗も操作できます（性善説運用）
- 地図はベースタイルを使わず、同梱の国境GeoJSONだけを描画します（外部タイルサーバに依存しません）

## 画面と操作

| 画面 | できること |
| --- | --- |
| `index.php` | グループ名とメンバー（1〜10人）を入力して専用URLを発行 |
| `map.php?g={token}` | 世界地図の表示、国をタップして旗のON/OFF、メンバーの追加・名前変更・色変更・削除、URL共有 |

地図上の見え方:

- 誰か1人でも行った国はポリゴンを塗ります。**訪問人数が多い国ほど濃く**なります
- ズームアウト時（zoom 4未満）は国ごとに**人数バッジ**（`3` など）
- ズームインすると**メンバーの色の旗が横並び**で表示されます。旗が3本なら3人が行った国です
- **国名（日本語）**はズームに応じて出し分けます。世界全体の表示では出さず、
  拡大するにつれて表示される国が増えます（zoom 2 で31カ国、zoom 3 で106カ国、zoom 5 で229カ国）。
  どのズームから出すかは Natural Earth が国ごとに持つ `MIN_LABEL` に従うので、
  ロシアや中国は早く、サンマリノやモナコは大きく拡大したときだけ出ます
- ヘッダーにグループ名と、メンバーごとの「色＋名前＋訪問国数」の凡例が並びます

旗・人数バッジは代表点の上、国名ラベルは代表点の下に配置されるので互いに重なりません。
国名ラベルはタップを拾わない設定なので、ラベルの上からでも国を選択できます。

同じURLを開いている人が同時に操作している場合に備えて、
ブラウザのタブに戻ってきたタイミングでサーバの最新状態に同期します。

## 動作環境

- PHP 8.0 以上（`pdo_mysql`, `mbstring`, `json`）。フレームワーク・Composer は使いません
- MySQL 5.7 / 8.0 または MariaDB（`utf8mb4`）
- フロントは素の HTML/CSS/JS。ビルド工程はありません。CDN 利用は Leaflet 1.9.4 のみ
- ドキュメントルート直下でも任意のサブディレクトリでも動くよう、すべて相対パスで書いています

## ファイル構成

```
index.php               グループ作成ページ
map.php                 グループページ（?g={token}）
schema.sql              MySQL のテーブル定義
config.example.php      設定ファイルの雛形（コピーして config.php を作る）
.htaccess               gzip・キャッシュ・エラー非表示などの推奨設定

api/                    JSON を返す API
  group_create.php        POST  グループ＋メンバー作成 -> {token}
  group_get.php           GET   group / members / visits を一括取得
  member_add.php          POST  メンバー追加
  member_update.php       POST  メンバーの名前・色の変更
  member_delete.php       POST  メンバー削除（旗もまとめて削除）
  visit_toggle.php        POST  旗の ON/OFF -> {on: true|false}

lib/
  bootstrap.php           設定読み込み・エラー表示の抑止
  db.php                  PDO 接続
  util.php                JSON 応答・入力バリデーション・トークン検証・色パレット

assets/
  app.css                 スタイル
  create.js               グループ作成ページの動作
  map.js                  グループページの動作
  countries.geojson       国境データ（232カ国・約600KB / 代表点とラベル表示ズームを含む）
  countries_ja.json       ISO 3166-1 alpha-2 -> 日本語国名（250件）

tools/                  地図データの生成スクリプト（デプロイには不要）
tests/                  API の動作確認スクリプト（デプロイには不要）
```

## さくらのレンタルサーバへのデプロイ

### 1. データベースを作る

1. サーバコントロールパネルにログインし、**「Webサイト/データ」→「データベース」**を開く
2. **「新規追加」**でデータベースを作成する
   - データベース文字コードは **UTF-8（utf8mb4）** を選ぶ
   - 表示された **データベースサーバ（`mysql○○○.db.sakura.ne.jp`）**、**データベース名**、
     **ユーザ名**、設定したパスワードを控える

### 2. テーブルを作る

1. コントロールパネルの **phpMyAdmin** を開き、作成したデータベースにログインする
2. 左のツリーで対象データベースを選び、上部の **「インポート」** タブを開く
3. このリポジトリの `schema.sql` をアップロードして実行する
4. `groups` / `members` / `visits` の3テーブルができていることを確認する

### 3. 設定ファイルを用意する

`config.example.php` をコピーして `config.php` を作り、1.で控えた値を入れます。

```php
<?php
return [
    'db' => [
        'dsn'  => 'mysql:host=mysql○○○.db.sakura.ne.jp;dbname=アカウント名_visited;charset=utf8mb4',
        'user' => 'アカウント名',
        'pass' => 'データベースのパスワード',
    ],
    'debug' => false,   // 本番は必ず false
];
```

`config.php` は `.gitignore` に入れてあるのでリポジトリには含まれません。

> 接続情報をドキュメントルート外に置きたい場合は、`config.php` を公開ディレクトリの外に置き、
> 環境変数 `VISITED_SITE_CONFIG` にその絶対パスを設定してください（`.htaccess` の `SetEnv` などで指定できます）。

### 4. ファイルをアップロードする

FTP / SFTP クライアント（FileZilla など）で、`www/` 配下の任意のディレクトリ
（例: `www/visited/`）に以下をアップロードします。

アップロードするもの:

```
index.php  map.php  schema.sql  config.php  .htaccess
api/  lib/  assets/
```

アップロード不要なもの: `tools/`、`tests/`、`config.example.php`、`README.md`

- `assets/countries.geojson` は約600KBあります。転送が終わるまで待ってください
- ディレクトリのパーミッションは 705、ファイルは 644 で問題ありません
- 書き込み権限が必要なディレクトリはありません（データはすべて MySQL に入ります）

### 5. 動作確認

1. `https://あなたのドメイン/visited/` を開き、グループ作成フォームが表示されることを確認
2. メンバーを入れて「マップを作る」→ 専用URLが表示されれば DB 接続は成功しています
3. 「マップを開く」で世界地図が出て、国をタップして旗が立てられれば完了です

うまく動かないときは、一時的に `config.php` の `'debug' => true` にすると
API のレスポンスにエラー内容が出ます。**確認できたら必ず `false` に戻してください。**

## ローカルでの確認手順

MySQL とローカルの PHP で動かします。

```sh
# 1. データベースとテーブルを作る
mysql -u root -p -e "CREATE DATABASE visited_site CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p visited_site < schema.sql

# 2. 設定ファイルを作る
cp config.example.php config.php
#    dsn を 'mysql:host=127.0.0.1;dbname=visited_site;charset=utf8mb4' に、
#    user / pass をローカルの値に書き換え、'debug' => true にする

# 3. ビルトインサーバを起動
php -S localhost:8000

# 4. ブラウザで http://localhost:8000/ を開く
```

### API の動作確認（MySQL なしで実行できます）

`tests/run_api_tests.sh` は SQLite 上に同じスキーマを作り、
すべてのエンドポイントを HTTP 経由で叩いて検証します（API のコードは MySQL 固有の構文を使っていません）。

```sh
sh tests/run_api_tests.sh
```

グループ作成、トークン検証、旗のON/OFF、入力バリデーション、人数上限、
メンバー削除に伴う旗の削除まで確認します。

## 地図データについて

`assets/countries.geojson` と `assets/countries_ja.json` は生成済みでコミットしてあるので、
**通常は再生成の必要はありません。** 差し替えたいときだけ以下を実行してください。

```sh
sh tools/build_map_data.sh    # curl と Node.js 18 以上が必要
```

### 取得元

- **Natural Earth 1:50m Admin 0 – Countries**（パブリックドメイン）
  <https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson>
  （配布元プロジェクト: <https://www.naturalearthdata.com/> / <https://github.com/nvkelso/natural-earth-vector>）
- **日本語国名**: Node.js に同梱されている ICU/CLDR の `Intl.DisplayNames`（`ja` ロケール）

### 加工手順

`tools/build_map_data.sh` が次の3ステップを実行します。

1. **ダウンロード**（約3.0MB）— `tools/tmp/` にキャッシュされます
2. **整形**（`tools/prepare_geojson.mjs`）
   - 国コードは `ISO_A2_EH` を採用。`ISO_A2` が `-99` になるフランス・ノルウェー・コソボ等を拾えます
   - ISO コードを持たない地物（ソマリランド、北キプロス、シアチェン氷河）を除外
   - 南極・無人地域（`AQ` `TF` `HM` `BV` `GS` `IO` `UM`）を除外
   - 同じ国コードの地物を1つの MultiPolygon に統合
     （例: オーストラリア本土＋アシュモア・カルティエ諸島＋インド洋地域 → `AU`）
   - properties を `{ c: 国コード, x: 代表点経度, y: 代表点緯度, z: ラベル表示ズーム }` だけに削減
     - 代表点は Natural Earth のラベル位置 `LABEL_X` / `LABEL_Y`（旗と国名ラベルを置く位置になります）
     - `z` は Natural Earth の `MIN_LABEL`（その国名を出してよい最小ズーム）
3. **簡略化**（mapshaper）
   ```sh
   npx mapshaper tools/tmp/prepared.geojson \
     -simplify visvalingam 35% keep-shapes \
     -o assets/countries.geojson precision=0.001 format=geojson
   ```
   `keep-shapes` により小さな島国が消えません。`precision=0.001`（約100m）で座標を丸めます。
   結果は **232カ国・約600KB**（gzip 転送で約170KB）です。

簡略化の強さは `tools/build_map_data.sh` の `SIMPLIFY_PCT` で調整できます
（`50%` で約820KB、`15%` で約290KB）。

### 対象とする「国」の範囲

独立国に加えて、旅行先として一般的な属領・自治領も個別の国として扱います
（グリーンランド、香港、マカオ、プエルトリコ、グアム、フランス領ポリネシア、
ニューカレドニア、フェロー諸島など）。合計232件です。

`assets/countries_ja.json` は ISO 3166-1 alpha-2 の全249コードに `XK`（コソボ）を加えた
250件を収録しています。API の国コード検証はこのファイルのキーを「既知のコード」として使います。
GeoJSON に含まれない極小国（モナコの一部離島など）は今回のスコープ外です。

## データベース設計

```
groups  (id, token UNIQUE, name, created_at)
members (id, group_id -> groups.id, name, color, sort_order, created_at)
visits  (id, group_id, member_id -> members.id, country_code, created_at,
         UNIQUE(member_id, country_code))
```

- 外部キーはすべて `ON DELETE CASCADE`
- `visits.group_id` はグループ単位の取得を1クエリで済ませるための非正規化です
- 将来的に都市単位の記録を足す場合は、`visits` に手を入れず
  `city_visits (id, group_id, member_id, country_code, city_name, ...)` のような
  テーブルを別途追加する形が素直です

> `groups` は MySQL 8.0 の予約語です。SQL 中では必ずバッククォートで囲んでください。

## セキュリティについて

このアプリは**ログインを持たず、URLを知っている人は誰でも編集できる**前提です。

- URL のトークンは `bin2hex(random_bytes(16))`（128ビット）で、推測は事実上不可能です
- 全 API でトークンを検証し、不一致・不正な形式は 404 を返します
- SQL は PDO のプリペアドステートメントのみ。文字列連結でクエリを組み立てている箇所はありません
- 出力は PHP 側で `htmlspecialchars`、JS 側は `textContent` / DOM 生成のみを使い、
  ユーザー入力を `innerHTML` に渡しません
- 更新系 API は POST 限定です。ログインが無いため CSRF の厳密な対策は行っていません
- 本番では `config.php` の `'debug' => false` により PHP のエラーを画面に出しません

**URLが漏れると誰でも閲覧・編集できます。** 公開の場に貼らないでください。

## ライセンス・クレジット

- 国境データ: [Natural Earth](https://www.naturalearthdata.com/)（パブリックドメイン）
- 地図描画: [Leaflet](https://leafletjs.com/) 1.9.4（BSD-2-Clause / CDN から読み込み）
