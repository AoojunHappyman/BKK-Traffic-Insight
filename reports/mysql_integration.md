# MySQL integration

Current dataset excludes 2022 by user request: 30 sources, 820 surveys, 1,569 roads,
4,707 observations, 80 issues and 30,651,553 counted vehicles. Use
`data/processed/run_without_2022` for imports. Earlier figures below describe the
initial verification before removal. The raw July2022.xlsx workbook is preserved.

## Local configuration

Copy `.env.example` to `.env` only if `.env` does not already exist. Fill `DB_HOST`,
`DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` locally. Do not commit the file or post
the password in chat. Environment variables override `.env`. The supported database
name is currently `bangkok_traffic`.

PyMySQL provides parameterized connections; its RSA extra supports modern MySQL
authentication. python-dotenv reads local configuration. Credentials are not returned
by endpoints or printed by the importer.

## First import

Run in PowerShell at the project root, using an account permitted to create the
database/tables and insert/select data:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pipeline.import_mysql data/processed/run_without_2022 --init-schema
```

`--init-schema` requires an empty database and never drops existing tables. MySQL DDL
commits implicitly; schema setup is a separate stage, not part of the import transaction.
If schema initialization stops halfway, inspect the database rather than rerunning
blindly. Existing installations of the previous schema need a reviewed migration for
the new `data_quality_issue.issue_key` unique column before importing.

For repeat imports omit `--init-schema`:

```powershell
.\.venv\Scripts\python.exe -m pipeline.import_mysql data/processed/run_without_2022
```

The importer validates exported counts, accepted status, relationships and category
totals before writes. All data tables are written in one transaction, protected by
a named import lock. Source versions and existing rows must agree. A differing row
or database error rolls back the entire data transaction. Changed versions of an
existing filename are rejected for explicit revision review, not added as duplicate
traffic. Repeat imports report zero inserted rows. Audit issue hashes prevent duplicate
issues. No `INSERT IGNORE`, destructive replacement or implicit cleanup is used.

Counts and SQL-generated vehicle totals are reconciled before commit. The 9 quarantined
surveys remain excluded from traffic facts; their audit issues are retained.
The original/cached rejected cells remain local in the cleaning output directory.

## Flask

```powershell
.\.venv\Scripts\python.exe -m flask --app app:create_app run
```

| Endpoint | Response |
|---|---|
| `/api/health` | Live DB read, connected status and observation count; 503 on DB/config failure |
| `/api/surveys` | Survey date, original/normalized labels, coordinates and source filename |
| `/api/traffic` | Six vehicle counts, road, actual observation interval and source references |
| `/api/traffic/summary` | Filtered observation/survey/road counts and total vehicle count |

List filters: `start_date`, `end_date` (inclusive YYYY-MM-DD), `intersection_name`
(exact match), `survey_id` (source survey identity, not canonical intersection ID).
`limit` defaults to 100 and is bounded 1–500; `offset` defaults to 0 and is bounded
0–1000000. Sorting is stable. Summary accepts the same filters but aggregates all
matching rows, independent of pagination. Invalid/unknown/repeated parameters return
400. Query values are bound SQL parameters. Database errors return a generic 503.

Example: `/api/traffic?start_date=2024-01-01&end_date=2024-01-31&limit=10`.
Counts describe observed survey intervals, not continuous monthly traffic. No hourly
observations or congestion conclusions are inferred. No Dashboard is added in this step.

## Verification

16 unit tests passed. Integration tests on a task-owned MySQL 9.7.1 instance verified
the 4,851-row import, idempotent repeat, rollback after an earlier insert, filtered
API results, exact total reconciliation and SQL-injection-like input treated as text.
The running user MySQL database was populated on 2026-09-09 using saved local
credentials: 31 sources, 839 surveys, 1,617 survey roads, 4,851 observations and
99 audit issues. The verified vehicle total is 31,693,461 across accepted survey
intervals. A second import inserted zero rows in all five tables.

Flask was restarted and verified over HTTP on port 5000: health reports connected
with 4,851 observations; summary matches the database total; traffic pagination and
date-filtered surveys return the expected results. No credentials are stored here.
