-- MySQL 8.0.16+ (CHECK constraints enforced), utf8mb4 for Thai names.
-- Run on an empty database. This script never drops or overwrites existing tables.
CREATE DATABASE IF NOT EXISTS bangkok_traffic
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs;
USE bangkok_traffic;

CREATE TABLE source_file (
  source_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_path TEXT NOT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_source_version (filename, sha256)
) ENGINE=InnoDB;

-- One source survey block, not a canonical city-wide intersection identity.
-- Never merge locations on name alone; retain observed coordinates per survey.
CREATE TABLE survey (
  survey_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  source_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  sheet_name VARCHAR(31) NOT NULL,
  source_start_row INT UNSIGNED NOT NULL,
  source_end_row INT UNSIGNED NOT NULL,
  source_sequence INT UNSIGNED NOT NULL,
  report_month DATE NOT NULL,
  survey_date DATE NOT NULL,
  survey_date_raw VARCHAR(255) NOT NULL,
  survey_date_source_row INT UNSIGNED NOT NULL,
  intersection_name_raw TEXT NOT NULL,
  intersection_name VARCHAR(512) NOT NULL,
  coordinate_raw TEXT NULL,
  latitude DECIMAL(18,15) NULL,
  longitude DECIMAL(18,15) NULL,
  quality_status ENUM('accepted') NOT NULL,
  CONSTRAINT fk_survey_source FOREIGN KEY (source_id) REFERENCES source_file(source_id),
  CONSTRAINT ck_survey_rows CHECK (source_start_row > 0 AND source_end_row >= source_start_row),
  CONSTRAINT ck_report_month CHECK (DAYOFMONTH(report_month) = 1),
  CONSTRAINT ck_survey_month CHECK (YEAR(survey_date) = YEAR(report_month) AND MONTH(survey_date) = MONTH(report_month)),
  CONSTRAINT ck_coordinates CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  ),
  UNIQUE KEY uq_survey_source_block (source_id, sheet_name, source_start_row),
  KEY ix_survey_date (survey_date),
  KEY ix_location_name (intersection_name(128))
) ENGINE=InnoDB;

CREATE TABLE survey_road (
  road_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  survey_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_start_row INT UNSIGNED NOT NULL,
  road_name_source_row INT UNSIGNED NOT NULL,
  road_name_raw TEXT NOT NULL,
  road_name VARCHAR(512) NOT NULL,
  CONSTRAINT fk_road_survey FOREIGN KEY (survey_id) REFERENCES survey(survey_id),
  CONSTRAINT ck_road_rows CHECK (source_start_row > 0 AND road_name_source_row >= source_start_row),
  UNIQUE KEY uq_road_block (survey_id, source_start_row),
  UNIQUE KEY uq_road_survey (road_id, survey_id)
) ENGINE=InnoDB;

-- Grain: one road within one survey, for one observed interval, six vehicle categories.
-- These intervals are NOT hourly counts. Source K/L/M subtotals are not fact rows.
CREATE TABLE traffic_observation (
  observation_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  survey_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  road_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_row INT UNSIGNED NOT NULL,
  period_raw VARCHAR(255) NOT NULL,
  period_start TIME NOT NULL,
  period_end TIME NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  passenger_car BIGINT UNSIGNED NOT NULL,
  van_pickup BIGINT UNSIGNED NOT NULL,
  large_bus BIGINT UNSIGNED NOT NULL,
  small_bus BIGINT UNSIGNED NOT NULL,
  truck BIGINT UNSIGNED NOT NULL,
  three_wheeler BIGINT UNSIGNED NOT NULL,
  vehicle_total BIGINT UNSIGNED GENERATED ALWAYS AS
    (passenger_car + van_pickup + large_bus + small_bus + truck + three_wheeler) STORED,
  CONSTRAINT fk_observation_road FOREIGN KEY (road_id, survey_id) REFERENCES survey_road(road_id, survey_id),
  CONSTRAINT ck_period CHECK (period_start >= '00:00:00' AND period_end < '24:00:00' AND period_end > period_start),
  CONSTRAINT ck_duration CHECK (duration_minutes > 0 AND duration_minutes * 60 = TIME_TO_SEC(period_end) - TIME_TO_SEC(period_start)),
  CONSTRAINT ck_source_row CHECK (source_row > 0),
  UNIQUE KEY uq_observation_interval (road_id, period_start, period_end),
  UNIQUE KEY uq_observation_source_row (survey_id, source_row)
) ENGINE=InnoDB;

-- Audit records from issues.json, including quarantined surveys absent from survey.
-- survey_id is intentionally not a FK: rejected observations are never facts.
CREATE TABLE data_quality_issue (
  issue_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  survey_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  sheet_name VARCHAR(31) NULL,
  source_row INT UNSIGNED NULL,
  severity ENUM('warning', 'error') NOT NULL,
  code VARCHAR(80) NOT NULL,
  detail TEXT NOT NULL,
  CONSTRAINT fk_issue_source FOREIGN KEY (source_id) REFERENCES source_file(source_id),
  KEY ix_issue_source (source_id, severity)
) ENGINE=InnoDB;
