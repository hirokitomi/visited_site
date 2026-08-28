#!/bin/sh
# API の動作確認スクリプト。
# MySQL を用意せずに API のロジックを検証できるよう、SQLite 上で全エンドポイントを叩く。
# (API のコードは MySQL 固有の構文を使っていないため、同じコードがそのまま動く)
#
#   sh tests/run_api_tests.sh
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP="$ROOT/tests/tmp"
PORT=${PORT:-8111}

rm -rf "$TMP"
mkdir -p "$TMP"

php -r '
$db = $argv[1];
$pdo = new PDO("sqlite:$db");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->exec(file_get_contents($argv[2]));
' "$TMP/test.sqlite" "$ROOT/tests/schema_sqlite.sql"

cat > "$TMP/config.php" <<PHP
<?php
return [
    'db' => ['dsn' => 'sqlite:$TMP/test.sqlite', 'user' => null, 'pass' => null],
    'debug' => true,
];
PHP

VISITED_SITE_CONFIG="$TMP/config.php" php -S "127.0.0.1:$PORT" -t "$ROOT" >"$TMP/server.log" 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

# サーバの起動待ち
i=0
while [ $i -lt 50 ]; do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/assets/countries_ja.json"; then break; fi
  i=$((i+1))
  php -r 'usleep(100000);'
done

BASE="http://127.0.0.1:$PORT"
PASS=0
FAIL=0

# assert_status <期待ステータス> <説明> <curlの追加引数...>
check() {
  expected=$1; label=$2; shift 2
  body=$(curl -s -o "$TMP/body.json" -w '%{http_code}' --noproxy '*' "$@")
  if [ "$body" = "$expected" ]; then
    PASS=$((PASS+1)); printf '  \033[32mok\033[0m   %-58s [%s]\n' "$label" "$body"
  else
    FAIL=$((FAIL+1)); printf '  \033[31mNG\033[0m   %-58s [期待 %s / 実際 %s]\n' "$label" "$expected" "$body"
    sed -e 's/^/       /' "$TMP/body.json" | head -5
  fi
}

json() { php -r '$d=json_decode(file_get_contents($argv[1]),true); $k=$argv[2]; foreach(explode(".",$k) as $p){$d=is_array($d)?($d[$p]??null):null;} echo is_bool($d)?($d?"true":"false"):(string)$d;' "$TMP/body.json" "$1"; }

echo "== グループ作成 =="
check 201 'グループ作成(3人)' -X POST "$BASE/api/group_create.php" \
  -H 'Content-Type: application/json' \
  -d '{"name":"ヨーロッパ旅行部","members":["ヒロキ","ミカ","","タロウ"]}'
TOKEN=$(json token)
echo "     token=$TOKEN"

check 400 'メンバー0人は拒否' -X POST "$BASE/api/group_create.php" \
  -H 'Content-Type: application/json' -d '{"name":"x","members":[]}'
check 400 'メンバー11人は拒否' -X POST "$BASE/api/group_create.php" \
  -H 'Content-Type: application/json' \
  -d '{"members":["1","2","3","4","5","6","7","8","9","10","11"]}'
NAME30=$(php -r 'echo str_repeat("あ", 30);')
NAME31=$(php -r 'echo str_repeat("あ", 31);')
check 201 'メンバー名30文字ちょうどは許可' -X POST "$BASE/api/group_create.php" \
  -H 'Content-Type: application/json' -d "{\"members\":[\"$NAME30\"]}"
check 400 'メンバー名31文字は拒否' -X POST "$BASE/api/group_create.php" \
  -H 'Content-Type: application/json' -d "{\"members\":[\"$NAME31\"]}"
check 400 '空白だけのメンバー名は拒否' -X POST "$BASE/api/group_create.php" \
  -H 'Content-Type: application/json' -d '{"members":["   ","\t"]}'
check 405 'GET でのグループ作成は拒否' "$BASE/api/group_create.php"

echo "== グループ取得 =="
check 200 'グループ取得' "$BASE/api/group_get.php?token=$TOKEN"
echo "     members=$(json members.0.name)/$(json members.1.name)/$(json members.2.name) colors=$(json members.0.color),$(json members.1.color),$(json members.2.color)"
M1=$(json members.0.id); M2=$(json members.1.id)
check 404 '存在しないトークンは404' "$BASE/api/group_get.php?token=$(printf '0%.0s' $(seq 32))"
check 404 '不正な形式のトークンは404' "$BASE/api/group_get.php?token=notatoken"

echo "== 旗のON/OFF =="
check 201 '旗を立てる(JP)' -X POST "$BASE/api/visit_toggle.php" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"member_id\":$M1,\"country_code\":\"JP\"}"
echo "     on=$(json on)"
check 200 '同じ国をもう一度で旗を下ろす' -X POST "$BASE/api/visit_toggle.php" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"member_id\":$M1,\"country_code\":\"JP\"}"
echo "     on=$(json on)"
check 201 '再度立てる(JP)' -X POST "$BASE/api/visit_toggle.php" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"member_id\":$M1,\"country_code\":\"JP\"}"
check 201 '小文字の国コードも受け付ける(fr)' -X POST "$BASE/api/visit_toggle.php" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"member_id\":$M1,\"country_code\":\"fr\"}"
check 201 '別メンバーも同じ国に立てられる' -X POST "$BASE/api/visit_toggle.php" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"member_id\":$M2,\"country_code\":\"JP\"}"
check 400 '未知の国コードは拒否(ZZ)' -X POST "$BASE/api/visit_toggle.php" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"member_id\":$M1,\"country_code\":\"ZZ\"}"
check 400 '3文字の国コードは拒否' -X POST "$BASE/api/visit_toggle.php" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"member_id\":$M1,\"country_code\":\"JPN\"}"
check 404 'トークン不一致は404' -X POST "$BASE/api/visit_toggle.php" -H 'Content-Type: application/json' \
  -d "{\"token\":\"ffffffffffffffffffffffffffffffff\",\"member_id\":$M1,\"country_code\":\"JP\"}"

echo "== メンバー管理 =="
check 201 'メンバー追加' -X POST "$BASE/api/member_add.php" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"name\":\"サトシ\"}"
M4=$(json member.id)
echo "     追加: id=$M4 color=$(json member.color) sort_order=$(json member.sort_order)"
check 200 'メンバー名の変更' -X POST "$BASE/api/member_update.php" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"member_id\":$M4,\"name\":\"サトシ改\"}"
check 200 'メンバーの色変更(パレット内)' -X POST "$BASE/api/member_update.php" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"member_id\":$M4,\"name\":\"サトシ改\",\"color\":\"#911eb4\"}"
check 400 'パレット外の色は拒否' -X POST "$BASE/api/member_update.php" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"member_id\":$M4,\"name\":\"サトシ改\",\"color\":\"#123456\"}"
check 404 '他グループのメンバーIDは404' -X POST "$BASE/api/member_update.php" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"member_id\":99999,\"name\":\"だれか\"}"

echo "== 上限10人 =="
for n in 5 6 7 8 9 10; do
  curl -s -o /dev/null --noproxy '*' -X POST "$BASE/api/member_add.php" -H 'Content-Type: application/json' \
    -d "{\"token\":\"$TOKEN\",\"name\":\"メンバー$n\"}"
done
check 409 '11人目の追加は拒否' -X POST "$BASE/api/member_add.php" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"name\":\"あふれる人\"}"
curl -s -o "$TMP/body.json" --noproxy '*' "$BASE/api/group_get.php?token=$TOKEN"
COLORS=$(php -r '$d=json_decode(file_get_contents($argv[1]),true); $c=array_column($d["members"],"color"); echo count($c)."人 / ユニーク色".count(array_unique($c));' "$TMP/body.json")
echo "     $COLORS"

echo "== メンバー削除(旗も消える) =="
curl -s -o /dev/null --noproxy '*' -X POST "$BASE/api/visit_toggle.php" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"member_id\":$M1,\"country_code\":\"IT\"}"
check 200 'メンバー削除' -X POST "$BASE/api/member_delete.php" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"member_id\":$M1}"
echo "     消えた旗: $(json deleted_visits) 件"
curl -s -o "$TMP/body.json" --noproxy '*' "$BASE/api/group_get.php?token=$TOKEN"
LEFT=$(php -r '$d=json_decode(file_get_contents($argv[1]),true); $ids=array_column($d["visits"],"member_id"); echo in_array((int)$argv[2],$ids,true)?"残っている(NG)":"残っていない(OK)";' "$TMP/body.json" "$M1")
echo "     削除したメンバーの旗: $LEFT"
check 404 '削除済みメンバーの再削除は404' -X POST "$BASE/api/member_delete.php" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"member_id\":$M1}"

echo
echo "結果: $PASS 件成功 / $FAIL 件失敗"
[ "$FAIL" -eq 0 ]
