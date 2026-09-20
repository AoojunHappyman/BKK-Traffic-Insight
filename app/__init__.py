"""Flask application serving validated Bangkok survey data from MySQL."""

import os
from flask import Flask, jsonify, render_template
from flask_compress import Compress
import pymysql
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.exceptions import BadRequest

from app.database import connect
from app.extensions import limiter
from app.routes.traffic import api


def create_app():
    app = Flask(__name__)
    app.json.ensure_ascii = False
    environment = os.getenv('APP_ENV', 'development').lower()
    rate_storage = os.getenv('RATE_LIMIT_STORAGE_URI', 'memory://')
    if environment == 'production' and rate_storage == 'memory://':
        raise RuntimeError('Production requires shared RATE_LIMIT_STORAGE_URI, for example Redis')
    app.config.update(
        APP_ENV=environment,
        TRUST_CLOUDFLARE_CLIENT_IP=os.getenv('TRUST_CLOUDFLARE_CLIENT_IP', '0') == '1',
        RATELIMIT_STORAGE_URI=rate_storage,
        RATELIMIT_HEADERS_ENABLED=True,
        RATELIMIT_STRATEGY='fixed-window',
        EXPORT_RATE_LIMIT=os.getenv('EXPORT_RATE_LIMIT', '60 per minute'),
        VEHICLES_RATE_LIMIT=os.getenv('VEHICLES_RATE_LIMIT', '120 per minute'),
        EXPORT_MAX_ROWS=int(os.getenv('EXPORT_MAX_ROWS', '50000')),
        COMPRESS_MIN_SIZE=1024,
        COMPRESS_MIMETYPES=['application/json', 'text/csv', 'text/html', 'text/css', 'application/javascript'],
    )
    proxy_hops = int(os.getenv('TRUST_PROXY_HOPS', '0'))
    if proxy_hops:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=proxy_hops, x_proto=proxy_hops,
                                x_host=proxy_hops, x_port=proxy_hops)
    limiter.init_app(app)
    Compress(app)
    app.register_blueprint(api)

    @app.after_request
    def production_headers(response):
        response.headers.setdefault('X-Content-Type-Options', 'nosniff')
        response.headers.setdefault('X-Frame-Options', 'DENY')
        response.headers.setdefault('Referrer-Policy', 'same-origin')
        response.headers.setdefault('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        if app.config['APP_ENV'] == 'production':
            response.headers.setdefault('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
        return response

    @app.get('/')
    def overview_page():
        return render_template('overview.html')

    @app.get('/map')
    def map_page():
        return render_template('map.html')

    @app.get('/temporal')
    def temporal_page():
        return render_template('temporal.html')

    @app.get('/vehicles')
    def vehicles_page():
        return render_template('vehicles.html')

    @app.errorhandler(BadRequest)
    def invalid_request(error):
        return jsonify(error=error.description), 400

    @app.errorhandler(429)
    def too_many_requests(error):
        return jsonify(error='Too many requests. Wait before trying again.'), 429

    @app.errorhandler(pymysql.MySQLError)
    @app.errorhandler(ValueError)
    def database_unavailable(error):
        return jsonify(error='Database unavailable. Check local configuration and import status.'), 503

    @app.get('/api/health')
    def health():
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute('SELECT COUNT(*) AS n FROM traffic_observation')
                count = cursor.fetchone()['n']
        return {'status': 'ok', 'phase': '1-data-api', 'database': 'connected', 'observations': count}

    @app.get('/health/live')
    def live():
        return {'status': 'ok'}

    return app
