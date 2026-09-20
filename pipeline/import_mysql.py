"""Import accepted cleaning outputs in one transaction; repeat runs are no-ops."""
import argparse
from datetime import date, datetime, timedelta
from decimal import Decimal
import hashlib
import json
from pathlib import Path

import pymysql

from app.database import ROOT, connect
from pipeline.clean import CATEGORIES, EXCLUDED_REPORT_YEARS, stable_id

TABLES = [('sources', 'source_file', 'source_id'), ('surveys', 'survey', 'survey_id'),
          ('roads', 'survey_road', 'road_id'), ('observations', 'traffic_observation', 'observation_id'),
          ('issues', 'data_quality_issue', 'issue_key')]


def read_bundle(directory):
    bundle = {name: json.loads((Path(directory) / f'{name}.json').read_text(encoding='utf-8'))
              for name, _, _ in TABLES}
    summary = json.loads((Path(directory) / 'summary.json').read_text(encoding='utf-8'))
    if any(not isinstance(rows, list) for rows in bundle.values()):
        raise ValueError('Export tables must be JSON arrays')
    if summary['surveys_accepted'] != len(bundle['surveys']) or summary['observations_accepted'] != len(bundle['observations']):
        raise ValueError('Export counts differ from cleaning summary')
    sources = {r['source_id'] for r in bundle['sources']}
    surveys = {r['survey_id'] for r in bundle['surveys']}
    roads = {r['road_id']: r['survey_id'] for r in bundle['roads']}
    for r in bundle['sources']:
        if r['source_id'] != stable_id(r['filename'], r['sha256']):
            raise ValueError('Source identity does not match its filename/hash')
    for r in bundle['surveys']:
        if date.fromisoformat(r['survey_date']).year in EXCLUDED_REPORT_YEARS or date.fromisoformat(r['report_month']).year in EXCLUDED_REPORT_YEARS:
            raise ValueError('Year 2022 is excluded from the active dataset; regenerate cleaning outputs')
        if r['quality_status'] != 'accepted' or r['source_id'] not in sources:
            raise ValueError('Only accepted surveys with known sources can be imported')
    if any(r['survey_id'] not in surveys for r in bundle['roads']):
        raise ValueError('Road references an unknown survey')
    for r in bundle['observations']:
        if r['survey_id'] not in surveys or roads.get(r['road_id']) != r['survey_id']:
            raise ValueError('Observation references an unknown road/survey')
        if any(type(r[k]) is not int or r[k] < 0 for k in CATEGORIES):
            raise ValueError('Vehicle counts must be nonnegative integers')
        if r['vehicle_total'] != sum(r[k] for k in CATEGORIES):
            raise ValueError('Exported vehicle total does not match category counts')
    for r in bundle['issues']:
        if r['source_id'] not in sources:
            raise ValueError('Issue references an unknown source')
        if r['severity'] == 'error' and (r['survey_id'] in surveys or r['survey_id'] is None):
            raise ValueError('Unresolved source/survey error affects accepted export')
        r['issue_key'] = hashlib.sha256(json.dumps(r, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()
    for name, _, key in TABLES:
        if len({r[key] for r in bundle[name]}) != len(bundle[name]):
            raise ValueError(f'Duplicate primary identities in {name}')
    return bundle


def initialize_schema():
    # DDL commits implicitly in MySQL; run separately from the data transaction.
    with connect(with_database=False) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s", ('bangkok_traffic',))
            if cursor.fetchall():
                raise ValueError('Database has existing tables; omit --init-schema. No tables were changed.')
            sql = '\n'.join(line for line in (ROOT / 'sql/schema.sql').read_text(encoding='utf-8').splitlines()
                            if not line.lstrip().startswith('--'))
            for statement in sql.split(';'):
                if statement.strip():
                    cursor.execute(statement)


def equivalent(key, stored, incoming):
    if stored is None or incoming is None:
        return stored is incoming
    if key in {'latitude', 'longitude'}:
        return abs(Decimal(str(stored)) - Decimal(str(incoming))) <= Decimal('0.000000000000001')
    if isinstance(stored, (date, datetime)):
        stored = stored.isoformat()
    if isinstance(stored, timedelta):
        seconds = int(stored.total_seconds())
        stored = f'{seconds // 3600:02}:{seconds % 3600 // 60:02}:{seconds % 60:02}'
    return stored == incoming


def import_bundle(bundle):
    results = {}
    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT GET_LOCK('bkk_traffic_import', 10) AS acquired")
            if cursor.fetchone()['acquired'] != 1:
                raise ValueError('Another import is running; retry later')
            try:
                connection.begin()
                # Revised source files need explicit migration, never double-count revisions.
                for source in bundle['sources']:
                    cursor.execute('SELECT sha256 FROM source_file WHERE filename=%s', (source['filename'],))
                    if any(row['sha256'] != source['sha256'] for row in cursor.fetchall()):
                        raise ValueError(f"A different revision of {source['filename']} is already loaded")
                for name, table, key in TABLES:
                    inserted = 0
                    cursor.execute(f'SHOW COLUMNS FROM `{table}`')
                    allowed = {row['Field'] for row in cursor.fetchall()}
                    existing_by_id = {}
                    records = bundle[name]
                    for start in range(0, len(records), 500):
                        ids = [r[key] for r in records[start:start + 500]]
                        cursor.execute(f'SELECT * FROM `{table}` WHERE `{key}` IN (' +
                                       ','.join(['%s'] * len(ids)) + ')', ids)
                        existing_by_id.update((r[key], r) for r in cursor.fetchall())
                    pending = {}
                    for record in bundle[name]:
                        existing = existing_by_id.get(record[key])
                        if existing:
                            if any(k not in existing or not equivalent(k, existing[k], v) for k, v in record.items()):
                                raise ValueError(f'Existing {table} record differs from this export; import rolled back')
                            continue
                        columns = tuple(k for k in record if k != 'vehicle_total')
                        # Column names come from the validated fixed table schema, not CLI input.
                        if not set(columns) <= allowed:
                            raise ValueError(f'Unexpected export columns for {table}')
                        pending.setdefault(columns, []).append(tuple(record[c] for c in columns))
                        inserted += 1
                    # Bound batches keep remote imports fast without changing row identities,
                    # conflict checks, generated totals, or the all-or-nothing transaction.
                    for columns, values in pending.items():
                        sql = f'INSERT INTO `{table}` (' + ','.join(f'`{c}`' for c in columns) + ') VALUES (' + ','.join(['%s'] * len(columns)) + ')'
                        for start in range(0, len(values), 500):
                            cursor.executemany(sql, values[start:start + 500])
                    results[table] = {'inserted': inserted, 'unchanged': len(bundle[name]) - inserted}
                expected_total = sum(r['vehicle_total'] for r in bundle['observations'])
                actual_total = 0
                ids = [r['observation_id'] for r in bundle['observations']]
                actual_count = 0
                for start in range(0, len(ids), 500):
                    chunk = ids[start:start + 500]
                    cursor.execute('SELECT COUNT(*) AS n, COALESCE(SUM(vehicle_total),0) AS total FROM traffic_observation WHERE observation_id IN (' + ','.join(['%s'] * len(chunk)) + ')', chunk)
                    row = cursor.fetchone()
                    actual_count += row['n']
                    actual_total += int(row['total'])
                if actual_count != len(ids) or actual_total != expected_total:
                    raise ValueError('Database row/total reconciliation failed')
                connection.commit()
                results['verified_observations'] = actual_count
                results['verified_vehicle_total'] = actual_total
            except Exception:
                connection.rollback()
                raise
            finally:
                cursor.execute("SELECT RELEASE_LOCK('bkk_traffic_import')")
    return results


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--init-schema', action='store_true', help='Create schema only in an empty database')
    args = parser.parse_args(argv)
    try:
        bundle = read_bundle(args.directory)
        if args.init_schema:
            initialize_schema()
        print(json.dumps(import_bundle(bundle), indent=2))
    except pymysql.MySQLError as error:
        parser.exit(1, f'MySQL operation failed (code {error.args[0]}). Check local connection/schema configuration.\n')
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, f'Import failed: {error}\n')


if __name__ == '__main__':
    main()
