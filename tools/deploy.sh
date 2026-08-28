#!/bin/sh
# さくらのレンタルサーバへアップロードする。手元のPC(Mac/Linux)から実行してください。
#
#   sh tools/deploy.sh <ホスト名> <アカウント名> [アップロード先]
#
# 例:
#   sh tools/deploy.sh example.sakura.ne.jp example www/visited
#   sh tools/deploy.sh --host example.sakura.ne.jp --user example --path www/visited
#   sh tools/deploy.sh example.sakura.ne.jp example --dry-run
#
# 引数の代わりに環境変数 SAKURA_HOST / SAKURA_USER / SAKURA_PATH / DRY_RUN でも指定できます
# (その場合は改行せず1行で書いてください。行末の "\" のあとに空白が入ると
#  別々のコマンドとして実行され、変数が sh に渡りません)。
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

usage() {
  cat >&2 <<'USAGE'
使い方:
  sh tools/deploy.sh <ホスト名> <アカウント名> [アップロード先]

  <ホスト名>        例: example.sakura.ne.jp (独自ドメインでも可)
  <アカウント名>    さくらの初期ドメインのアカウント名
  [アップロード先]  ホームディレクトリからの相対パス (既定: www/visited)

オプション:
  --host <値> / --user <値> / --path <値>
  --dry-run   実際には転送せず、実行するコマンドだけ表示する
  -h, --help  この使い方を表示する

例:
  sh tools/deploy.sh example.sakura.ne.jp example
  sh tools/deploy.sh example.sakura.ne.jp example www/visited --dry-run
USAGE
}

# 環境変数を初期値にし、引数があれば上書きする
HOST=${SAKURA_HOST:-}
USER_NAME=${SAKURA_USER:-}
REMOTE_PATH=${SAKURA_PATH:-}
DRY_RUN=${DRY_RUN:-0}
POSITIONAL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --host)     [ $# -ge 2 ] || { echo "エラー: --host に値がありません" >&2; exit 2; }; HOST=$2; shift 2 ;;
    --host=*)   HOST=${1#*=}; shift ;;
    --user)     [ $# -ge 2 ] || { echo "エラー: --user に値がありません" >&2; exit 2; }; USER_NAME=$2; shift 2 ;;
    --user=*)   USER_NAME=${1#*=}; shift ;;
    --path)     [ $# -ge 2 ] || { echo "エラー: --path に値がありません" >&2; exit 2; }; REMOTE_PATH=$2; shift 2 ;;
    --path=*)   REMOTE_PATH=${1#*=}; shift ;;
    --dry-run|-n) DRY_RUN=1; shift ;;
    -h|--help)  usage; exit 0 ;;
    -*)         echo "エラー: 不明なオプション: $1" >&2; usage; exit 2 ;;
    *)
      POSITIONAL=$((POSITIONAL + 1))
      case $POSITIONAL in
        1) HOST=$1 ;;
        2) USER_NAME=$1 ;;
        3) REMOTE_PATH=$1 ;;
        *) echo "エラー: 引数が多すぎます: $1" >&2; usage; exit 2 ;;
      esac
      shift ;;
  esac
done

# 貼り付け時に紛れ込んだ空白・改行を落とす(ホスト名やパスに空白は入らないため)
trim() { printf '%s' "$1" | tr -d '[:space:]'; }
HOST=$(trim "$HOST")
USER_NAME=$(trim "$USER_NAME")
REMOTE_PATH=$(trim "${REMOTE_PATH:-www/visited}")

if [ -z "$HOST" ] || [ -z "$USER_NAME" ]; then
  echo "エラー: ホスト名とアカウント名を指定してください。" >&2
  echo >&2
  usage
  exit 2
fi

SAKURA_PATH=$REMOTE_PATH

TARGETS="index.php map.php .htaccess api lib assets"

for t in $TARGETS; do
  [ -e "$t" ] || { echo "エラー: $t が見つかりません。リポジトリのルートで実行してください。" >&2; exit 1; }
done

REMOTE="$USER_NAME@$HOST"

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
        'dsn'  => 'mysql:host=mysql○○○.db.sakura.ne.jp;dbname=${USER_NAME}_visited;charset=utf8mb4',
        'user' => '$USER_NAME',
        'pass' => 'データベースのパスワード',
    ],
    'debug' => false,
];

保存したら chmod 600 config.php を実行しておくと安心です。
config.php はこのスクリプトでは転送しないので、以降の更新で上書きされることはありません。
MSG
fi
