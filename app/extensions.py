"""Shared Flask extensions; configured by create_app for each process."""
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address


limiter = Limiter(key_func=get_remote_address, default_limits=[])
