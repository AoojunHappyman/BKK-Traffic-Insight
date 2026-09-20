# MySQL schema

`schema.sql` defines `bangkok_traffic` with UTF-8 Thai text. Production targets
MySQL 8.4; `compose.production.yml` currently selects MySQL 8.4.11. Configure
local Flask via `.env` or follow `deploy/README.md` for the production stack.

```text
source_file → survey → survey_road → traffic_observation
      └──────────────────────────→ data_quality_issue
```

| Pipeline JSON | Table | Grain |
|---|---|---|
| sources.json | source_file | Filename and SHA-256 version |
| surveys.json | survey | One source survey block, date and observed location |
| roads.json | survey_road | One road grouping within that survey |
| observations.json | traffic_observation | One road and observation interval, six counts |
| issues.json | data_quality_issue | One warning/error with source references |

Load parents before children. Omit `vehicle_total` when inserting observations:
MySQL generates it from the six counts. Compare it with the exported total.
`all_surveys.json` and `rejected_rows.json` are review artifacts, not traffic facts.

Survey labels are not canonical intersection identities. Do not merge locations on
name alone; preserve coordinates per survey until identity is reviewed. There are
no invented speed/accident tables. Rejected survey IDs can appear in the issue table
without an accepted survey record, so that audit column intentionally has no FK.

Run the schema once in an empty target database through a configured MySQL client.
It contains no DROP statements. Existing tables cause an error rather than silently
accepting a different schema. Use `python -m pipeline.import_mysql` for transactional
loading; see `reports/mysql_integration.md`. No automatic migration is included.
Credentials come from local `.env` or environment variables.

Validation loaded all five export mappings into a temporary database, checked row
counts and generated totals against Python, and verified rejection of an invalid
duration, negative count, unknown road FK, invalid coordinates and mismatched report
month. The temporary server was stopped afterwards.
