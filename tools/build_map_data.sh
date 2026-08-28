#!/bin/sh
# 地図データ(assets/countries.geojson)と日本語国名表(assets/countries_ja.json)を生成する。
#
#   sh tools/build_map_data.sh
#
# 必要なもの: curl, Node.js 18 以上 (npx 経由で mapshaper を取得します)
# 生成済みのファイルはリポジトリにコミット済みなので、通常この実行は不要です。
# 地図データを差し替えたい / 簡略化の強さを変えたいときにだけ使ってください。
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP="$ROOT/tools/tmp"
OUT="$ROOT/assets/countries.geojson"

# Natural Earth 50m admin_0 countries (public domain)
SRC_URL='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson'

# Visvalingam 法で頂点を 35% 残す。keep-shapes で小さな島国が消えないようにする。
SIMPLIFY_PCT='35%'
# 座標の丸め(度)。0.001 度 ≒ 約 100m。世界地図の用途には十分。
PRECISION='0.001'

MAPSHAPER_VERSION='0.6.111'

mkdir -p "$TMP"

echo "1/3 Natural Earth 50m をダウンロード"
if [ -f "$TMP/ne_50m_admin_0_countries.geojson" ]; then
  echo "    キャッシュ済み: $TMP/ne_50m_admin_0_countries.geojson"
else
  curl -fSL -o "$TMP/ne_50m_admin_0_countries.geojson" "$SRC_URL"
fi

echo "2/3 国コードの付与・統合・不要地域の除外"
node "$ROOT/tools/prepare_geojson.mjs" \
  "$TMP/ne_50m_admin_0_countries.geojson" \
  "$TMP/prepared.geojson"

echo "3/3 mapshaper で簡略化 (visvalingam $SIMPLIFY_PCT, precision $PRECISION)"
npx -y "mapshaper@$MAPSHAPER_VERSION" "$TMP/prepared.geojson" \
  -simplify visvalingam "$SIMPLIFY_PCT" keep-shapes \
  -o "$OUT" precision="$PRECISION" format=geojson

node "$ROOT/tools/build_countries_ja.mjs"

echo
echo "完了:"
ls -l "$OUT" "$ROOT/assets/countries_ja.json" | awk '{printf "  %-10s %s\n", $5, $9}'
