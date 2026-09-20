"""Shared Flask extensions; configured by create_app for each process."""
from ipaddress import ip_address

from flask import current_app, request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address


def client_address():
    # Opt in only behind a provider that overwrites this header, never on a
    # directly exposed Gunicorn port. Render's Cloudflare edge sets this value.
    if current_app.config.get('TRUST_CLOUDFLARE_CLIENT_IP'):
        try:
            return str(ip_address(request.headers.get('CF-Connecting-IP', '')))
        except ValueError:
            pass
    return get_remote_address()


limiter = Limiter(key_func=client_address, default_limits=[])
