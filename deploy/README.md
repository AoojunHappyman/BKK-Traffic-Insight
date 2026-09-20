# Production deployment

For a zero-budget portfolio/demo deployment, see [Render + Aiven](FREE_HOSTING.md).

The production stack uses Gunicorn, MySQL 8.4, and Redis. Redis stores shared
rate-limit counters so limits remain correct across Gunicorn workers. MySQL data
lives in a named Docker volume. The web port binds to localhost and should be
published through an HTTPS reverse proxy such as Caddy, Nginx, or the hosting
provider's load balancer.

The production start command baked into `Dockerfile` is:

```sh
gunicorn --config gunicorn.conf.py wsgi:app
```

Run it on Linux or in the provided container; Gunicorn does not support native
Windows workers.

## 1. Prepare the host

Install Docker Engine with the Compose plugin, clone the repository, and create
the production environment file:

```sh
cp .env.production.example .env.production
chmod 600 .env.production
```

Replace both password placeholders with long, independent random values. Keep
`DB_HOST=db`, `DB_NAME=bangkok_traffic`, and `RATE_LIMIT_STORAGE_URI` unchanged
for the bundled stack. Keep `TRUST_PROXY_HOPS=0` for direct localhost access. Set
it to `1` only when exactly one trusted proxy removes incoming forwarding headers
and writes its own `X-Forwarded-*` headers.

Validate and start the stack:

```sh
docker compose --env-file .env.production -f compose.production.yml config
docker compose --env-file .env.production -f compose.production.yml up -d --build
```

`sql/schema.sql` runs automatically only when the MySQL volume is empty. Later
deployments keep the existing database.

## 2. Transfer and import the curated data

The real files under `data/processed` are deliberately excluded from Git. Copy
the complete, reviewed bundle to the server through a private transfer channel.
For the current release the directory must contain `sources.json`, `surveys.json`,
`roads.json`, `observations.json`, `issues.json`, and `summary.json` from
`data/processed/run_without_2022`.

Example server location:

```text
/srv/bkk-traffic/import/run_without_2022
```

Mount that folder read-only and run the transactional importer:

```sh
docker compose --env-file .env.production -f compose.production.yml run --rm \
  -v /srv/bkk-traffic/import/run_without_2022:/import:ro \
  web python -m pipeline.import_mysql /import
```

The importer validates IDs, relationships, accepted status, vehicle totals, and
the exclusion of 2022 before writing. A repeat import is a no-op when every row
matches. It rolls back if an existing row differs. Do not use `--init-schema` in
this Docker stack because MySQL initializes the empty volume from `sql/schema.sql`.

## 3. Verify before exposing traffic

```sh
curl --fail http://127.0.0.1:8000/health/live
curl --fail http://127.0.0.1:8000/api/health
docker compose --env-file .env.production -f compose.production.yml ps
```

`/health/live` proves that Gunicorn can serve requests without touching MySQL.
`/api/health` is the readiness check and should report `database: connected` and
the expected observation count (`4707` for the current reviewed bundle).

Configure the reverse proxy to terminate HTTPS, proxy to the localhost
`HOST_PORT` (8000 by default), and
replace rather than append `X-Forwarded-For`, `X-Forwarded-Proto`, and
`X-Forwarded-Host`. Then set `TRUST_PROXY_HOPS=1` and recreate the web service.
Do not expose MySQL or Redis ports publicly.

## 4. Operations

Deploy application updates without resetting data:

```sh
git pull --ff-only
docker compose --env-file .env.production -f compose.production.yml up -d --build
```

Back up the database before MySQL upgrades or data changes:

```sh
mkdir -p backups
docker compose --env-file .env.production -f compose.production.yml exec -T db \
  sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers bangkok_traffic' \
  > "backups/bangkok_traffic_$(date +%Y%m%d_%H%M%S).sql"
```

Export requests default to 6 per minute per client and read at most 50,001 rows
to enforce a 50,000-row ceiling before building CSV/XLSX in memory. The Vehicles
API defaults to 30 requests per minute, emits an ETag with a 60-second browser
cache, and JSON responses larger than 1 KB are compressed when supported by the
client. A rejected request returns HTTP 429 with rate-limit headers.

Tune `EXPORT_RATE_LIMIT`, `EXPORT_MAX_ROWS`, and `VEHICLES_RATE_LIMIT` from real
traffic and memory measurements. Redis persistence is disabled because counters
may safely reset during a Redis restart; MySQL persistence remains enabled.

## External MySQL

MySQL 8.4 is the selected production database. To use a managed MySQL 8.4
service, create the `bangkok_traffic` database, apply `sql/schema.sql` with an
administrative account, and give the application account only the permissions it
needs to read dashboard tables. Run imports with a separate account that can
insert data. Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and optionally
`DB_SSL_CA`; remove the bundled `db` dependency from a provider-specific Compose
override. Require TLS and keep the database off the public internet where the
provider supports private networking.
