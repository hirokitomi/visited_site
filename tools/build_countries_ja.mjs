#!/usr/bin/env node
/**
 * assets/countries_ja.json (ISO 3166-1 alpha-2 -> 日本語国名) を生成する。
 *
 * 名前の出典は Node.js 同梱の ICU/CLDR (Intl.DisplayNames の ja ロケール)。
 * CLDR の正式表記が地図UIには冗長なもの(「中華人民共和国香港特別行政区」等)は
 * 下の OVERRIDES で通称に置き換える。
 *
 * 使い方: node tools/build_countries_ja.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ISO_3166_1_ALPHA2 } from './iso3166.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'assets/countries_ja.json');

// CLDR の表記が長い / 括弧付きのものを日常的な通称へ。
const OVERRIDES = {
  HK: '香港',                 // CLDR: 中華人民共和国香港特別行政区
  MO: 'マカオ',               // CLDR: 中華人民共和国マカオ特別行政区
  CD: 'コンゴ民主共和国',     // CLDR: コンゴ民主共和国(キンシャサ)
  CG: 'コンゴ共和国',         // CLDR: コンゴ共和国(ブラザビル)
  MM: 'ミャンマー',           // CLDR: ミャンマー (ビルマ)
  PS: 'パレスチナ',           // CLDR: パレスチナ自治区
  PF: 'フランス領ポリネシア', // CLDR: 仏領ポリネシア
};

const dn = new Intl.DisplayNames(['ja'], { type: 'region', fallback: 'none' });

const table = {};
const missing = [];
for (const code of [...ISO_3166_1_ALPHA2].sort()) {
  const name = OVERRIDES[code] ?? dn.of(code);
  if (!name || name === code) {
    missing.push(code);
    continue;
  }
  // CLDR の補足括弧を落とす: 「ミャンマー (ビルマ)」→「ミャンマー」
  table[code] = name.replace(/\s*[(（].*?[)）]\s*$/u, '').trim();
}

if (missing.length) {
  console.error(`日本語名を解決できないコードがあります: ${missing.join(', ')}`);
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(table, null, 0) + '\n', 'utf8');
console.log(`countries_ja.json: ${Object.keys(table).length} 件 -> ${OUT}`);
