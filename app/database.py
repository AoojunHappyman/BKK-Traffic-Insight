"""Shared MySQL configuration. No credentials are logged or returned by APIs."""
import os
from pathlib import Path

from dotenv import dotenv_values
import pymysql

ROOT = Path(__file__).resolve().parents[1]


def settings():
    values = {**dotenv_values(ROOT / '.env'), **os.environ}
    if not values.get('DB_USER'):
        raise ValueError('Set DB_USER and DB_PASSWORD in the local .env file')
    database = values.get('DB_NAME', 'bangkok_traffic')
    if database != 'bangkok_traffic':
        raise ValueError('This schema currently supports DB_NAME=bangkok_traffic only')
    return dict(host=values.get('DB_HOST', '127.0.0.1'), port=int(values.get('DB_PORT', '3306')),
                user=values['DB_USER'], password=values.get('DB_PASSWORD') or '',
                database=database, charset='utf8mb4', connect_timeout=5,
                read_timeout=30, write_timeout=30, autocommit=False,
                cursorclass=pymysql.cursors.DictCursor)


def connect(with_database=True):
    config = settings()
    if not with_database:
        config.pop('database')
    return pymysql.connect(**config)
