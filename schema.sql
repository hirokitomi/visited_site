-- みんなの行った国マップ / テーブル定義
--
-- さくらのレンタルサーバでは、コントロールパネルで作成したデータベースに対して
-- phpMyAdmin の「インポート」からこのファイルを読み込んでください。
-- ローカルでは: mysql -u root -p visited_site < schema.sql
--
-- 注意: `groups` は MySQL 8.0 の予約語なので、必ずバッククォートで囲むこと。

SET NAMES utf8mb4;

CREATE TABLE `groups` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `token`      CHAR(32)     NOT NULL COMMENT '共有URL用トークン(bin2hex(random_bytes(16)))',
  `name`       VARCHAR(60)  DEFAULT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_groups_token` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `members` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id`   INT UNSIGNED NOT NULL,
  `name`       VARCHAR(30)  NOT NULL,
  `color`      CHAR(7)      NOT NULL COMMENT '#rrggbb',
  `sort_order` INT          NOT NULL DEFAULT 0,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_members_group` (`group_id`, `sort_order`),
  CONSTRAINT `fk_members_group` FOREIGN KEY (`group_id`)
    REFERENCES `groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `visits` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id`     INT UNSIGNED NOT NULL,
  `member_id`    INT UNSIGNED NOT NULL,
  `country_code` CHAR(2)      NOT NULL COMMENT 'ISO 3166-1 alpha-2',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_visits_member_country` (`member_id`, `country_code`),
  KEY `idx_visits_group` (`group_id`),
  CONSTRAINT `fk_visits_group` FOREIGN KEY (`group_id`)
    REFERENCES `groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_visits_member` FOREIGN KEY (`member_id`)
    REFERENCES `members` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
