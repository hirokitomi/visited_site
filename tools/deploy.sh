#!/bin/sh
# さくらのレンタルサーバへアップロードする。手元のPC(Mac/Linux)から実行してください。
#
#   SAKURA_HOST=example.sakura.ne.jp \
#   SAKURA_USER=example \
#   SAKURA_PATH=www/visited \
#   sh tools/deploy.sh
#
# 環境変数:
#   SAKURA_HOST  接続先ホスト名(例: example.sakura.ne.jp / 独自ドメインでも可)
#   SAKURA_USER  さくらの初期ドメインのアカウント名
#   SAKURA_PATH  アップロード先。ホームディレクトリからの相対パス(既定: www/visited)
#   DRY_RUN=1    実際には転送せず、実行するコマンドだけ表示する
#
# アップロードするもの: index.php map.php .htaccess api/ lib/ assets/
# アップロードしないもの:
#   config.php       … DB接続情報。サーバ側に置いたものを上書きしないため(下の手順参照)
#   schema.sql       … 実行時に不要。公開領域に置く意味がない
#   tools/ tests/ README.md config.example.php … 開発用
#
# 既存ファイルの削除は行いません(--delete を使っていません)。
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

: "${SAKURA_HOST:?SAKURA_HOST を指定してください (例: SAKURA_HOST=example.sakura.ne.jp)}"
: "${SAKURA_USER:?SAKURA_USER を指定してください (例: SAKURA_USER=example)}"
SAKURA_PATH=${SAKURA_PATH:-www/visited}
DRY_RUN=${DRY_RUN:-0}

TARGETS="index.php map.php .htaccess api lib assets"

for t in $TARGETS; do
  [ -e "$t" ] || { echo "エラー: $t が見つかりません。リポジトリのルートで実行してください。" >&2; exit 1; }
done

REMOTE="$SAKURA_USER@$SAKURA_HOST"

run() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "[DRY_RUN] $*"
  else
    "$@"
  fi
}

echo "アップロード先: $REMOTE:$SAKURA_PATH"
echo "対象: $TARGETS"
echo

if command -v rsync >/dev/null 2>&1; then
  echo "rsync で転送します(2回目以降は変更のあったファイルだけ送られます)"
  # shellcheck disable=SC2086
  run rsync -avz --human-readable \
      --exclude='.DS_Store' --exclude='config.php' \
      --rsync-path="mkdir -p '$SAKURA_PATH' && rsync" \
      $TARGETS "$REMOTE:$SAKURA_PATH/"
else
  echo "rsync が無いので tar + ssh で転送します"
  if [ "$DRY_RUN" = "1" ]; then
    echo "[DRY_RUN] tar czf - $TARGETS | ssh $REMOTE \"mkdir -p '$SAKURA_PATH' && tar xzf - -C '$SAKURA_PATH'\""
  else
    # shellcheck disable=SC2086
    tar czf - --exclude='.DS_Store' $TARGETS \
      | ssh "$REMOTE" "mkdir -p '$SAKURA_PATH' && tar xzf - -C '$SAKURA_PATH'"
  fi
fi

echo
echo "転送が終わりました。"

# 初回は config.php がサーバ側に無いので気づけるようにしておく。
if [ "$DRY_RUN" = "1" ]; then
  echo "[DRY_RUN] ssh $REMOTE \"test -f '$SAKURA_PATH/config.php'\""
elif ssh "$REMOTE" "test -f '$SAKURA_PATH/config.php'" 2>/dev/null; then
  echo "config.php はサーバ上にあります。"
else
  cat <<MSG

まだ config.php がサーバにありません。初回だけ以下を実行して作成してください。
(DBのパスワードを含むため、このリポジトリには含めていません)

  ssh $REMOTE
  cd $SAKURA_PATH
  vi config.php

中身は config.example.php を参考に、次のようにします。

<?php
return [
    'db' => [
        'dsn'  => 'mysql:host=mysql○○○.db.sakura.ne.jp;dbname=${SAKURA_USER}_visited;charset=utf8mb4',
        'user' => '$SAKURA_USER',
        'pass' => 'データベースのパスワード',
    ],
    'debug' => false,
];

保存したら chmod 600 config.php を実行しておくと安心です。
config.php はこのスクリプトでは転送しないので、以降の更新で上書きされることはありません。
MSG
fi
