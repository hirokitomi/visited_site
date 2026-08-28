#!/usr/bin/env node
/**
 * Natural Earth 50m admin_0 countries の生 GeoJSON を、このアプリ用に整形する。
 *
 *  - 国コードは ISO_A2_EH を採用(ISO_A2 が "-99" のフランス・ノルウェー・コソボ等を補える)
 *  - ISO コードを持たない地物(ソマリランド・北キプロス・シアチェン氷河)は除外
 *  - 南極・無人地域は除外 (tools/iso3166.mjs の EXCLUDED_CODES)
 *  - 同じ国コードの地物は 1 つの MultiPolygon に統合
 *    (例: オーストラリア本土 + アシュモア・カルティエ諸島 + インド洋地域)
 *  - properties は { c: 国コード, x: 代表点経度, y: 代表点緯度, z: ラベル表示ズーム } に削減
 *    代表点は Natural Earth が持つラベル位置 LABEL_X / LABEL_Y を使う
 *    z は Natural Earth の MIN_LABEL(この国名を出してよい最小ズーム)。
 *    ロシアや中国は早く、サンマリノやモナコは拡大時だけラベルが出るように調整されている
 *
 * 使い方: node tools/prepare_geojson.mjs <入力.geojson> <出力.geojson>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ISO_3166_1_ALPHA2, EXCLUDED_CODES } from './iso3166.mjs';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node tools/prepare_geojson.mjs <input.geojson> <output.geojson>');
  process.exit(1);
}

const KNOWN = new Set(ISO_3166_1_ALPHA2);
const src = JSON.parse(readFileSync(inPath, 'utf8'));

/** 同じ国コードの地物をまとめる。代表点は人口最大の地物のものを採用。 */
const byCode = new Map();
const skipped = [];

for (const f of src.features) {
  const p = f.properties ?? {};
  const code = String(p.ISO_A2_EH ?? p.ISO_A2 ?? '').toUpperCase();

  if (!/^[A-Z]{2}$/.test(code) || !KNOWN.has(code)) {
    skipped.push(`${p.ADMIN} (ISOコードなし)`);
    continue;
  }
  if (EXCLUDED_CODES.has(code)) {
    skipped.push(`${p.ADMIN} (${code}: 対象外地域)`);
    continue;
  }

  const polygons =
    f.geometry?.type === 'Polygon' ? [f.geometry.coordinates]
    : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates
    : null;
  if (!polygons) {
    skipped.push(`${p.ADMIN} (${code}: ポリゴンなし)`);
    continue;
  }

  const pop = Number(p.POP_EST) || 0;
  const entry = byCode.get(code);
  if (!entry) {
    byCode.set(code, {
      code, polygons: [...polygons], pop,
      x: p.LABEL_X, y: p.LABEL_Y, minLabel: p.MIN_LABEL,
    });
  } else {
    entry.polygons.push(...polygons);
    if (pop > entry.pop) { entry.pop = pop; entry.x = p.LABEL_X; entry.y = p.LABEL_Y; }
    // 統合後は面積が広がるので、いちばん早く出せるラベルズームを採用する
    if (Number.isFinite(p.MIN_LABEL) && !(entry.minLabel <= p.MIN_LABEL)) {
      entry.minLabel = p.MIN_LABEL;
    }
  }
}

const noLabel = [];
const features = [...byCode.values()]
  .sort((a, b) => a.code.localeCompare(b.code))
  .map(({ code, polygons, x, y, minLabel }) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      // ラベル位置が無い場合は全頂点の平均を代表点にする
      let sx = 0, sy = 0, n = 0;
      for (const poly of polygons) for (const [px, py] of poly[0]) { sx += px; sy += py; n++; }
      x = sx / n; y = sy / n;
      noLabel.push(code);
    }
    // MIN_LABEL が無い地物は、拡大しないと出ない側に倒しておく
    const labelZoom = Number.isFinite(minLabel) ? Math.round(minLabel * 10) / 10 : 5;
    return {
      type: 'Feature',
      properties: {
        c: code,
        x: Math.round(x * 1e4) / 1e4,
        y: Math.round(y * 1e4) / 1e4,
        z: labelZoom,
      },
      geometry: { type: 'MultiPolygon', coordinates: polygons },
    };
  });

writeFileSync(outPath, JSON.stringify({ type: 'FeatureCollection', features }), 'utf8');

console.log(`入力地物: ${src.features.length}`);
console.log(`出力国数: ${features.length}`);
console.log(`除外: ${skipped.length} 件 -> ${skipped.join(', ')}`);
if (noLabel.length) console.log(`代表点を重心で補完: ${noLabel.join(', ')}`);
