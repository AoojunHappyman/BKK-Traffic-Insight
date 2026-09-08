"""Minimal Flask entry point; traffic endpoints come after data validation."""

from flask import Flask


def create_app():
    app = Flask(__name__)

    @app.get('/api/health')
    def health():
        return {'status': 'ok', 'phase': '1-preparation', 'database': 'not_configured'}

    return app
