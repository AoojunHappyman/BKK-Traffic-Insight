"""Flask application serving validated Bangkok survey data from MySQL."""

from flask import Flask, jsonify, render_template
import pymysql
from werkzeug.exceptions import BadRequest

from app.database import connect
from app.routes.traffic import api


def create_app():
    app = Flask(__name__)
    app.json.ensure_ascii = False
    app.register_blueprint(api)

    @app.get('/')
    def overview_page():
        return render_template('overview.html')

    @app.errorhandler(BadRequest)
    def invalid_request(error):
        return jsonify(error=error.description), 400

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

    return app
