-- 動作確認用の SQLite 版スキーマ。本番は schema.sql (MySQL) を使うこと。
-- API のコードは MySQL 固有の構文を使っていないため、同じコードがそのまま動く。
PRAGMA foreign_keys = ON;

CREATE TABLE `groups` (
  `id`         INTEGER PRIMARY KEY AUTOINCREMENT,
  `token`      TEXT NOT NULL UNIQUE,
  `name`       TEXT DEFAULT NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `members` (
  `id`         INTEGER PRIMARY KEY AUTOINCREMENT,
  `group_id`   INTEGER NOT NULL REFERENCES `groups`(`id`) ON DELETE CASCADE,
  `name`       TEXT NOT NULL,
  `color`      TEXT NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `idx_members_group` ON `members` (`group_id`, `sort_order`);

CREATE TABLE `visits` (
  `id`           INTEGER PRIMARY KEY AUTOINCREMENT,
  `group_id`     INTEGER NOT NULL REFERENCES `groups`(`id`) ON DELETE CASCADE,
  `member_id`    INTEGER NOT NULL REFERENCES `members`(`id`) ON DELETE CASCADE,
  `country_code` TEXT NOT NULL,
  `created_at`   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (`member_id`, `country_code`)
);
CREATE INDEX `idx_visits_group` ON `visits` (`group_id`);
