import os
import unittest
from unittest.mock import patch

from app import create_app
from app.database import settings
from app.extensions import client_address


class ProductionControlsTests(unittest.TestCase):
    def test_client_header_is_opt_in_and_rate_limit_survives_proxy_changes(self):
        app = self.app(TRUST_CLOUDFLARE_CLIENT_IP='0')
        with app.test_request_context(headers={'CF-Connecting-IP': '198.51.100.1'},
                                      environ_base={'REMOTE_ADDR': '192.0.2.1'}):
            self.assertEqual(client_address(), '192.0.2.1')
        app = self.app(TRUST_CLOUDFLARE_CLIENT_IP='1', EXPORT_RATE_LIMIT='1 per minute')
        client = app.test_client()
        with patch('app.routes.traffic.query', return_value=[]):
            first = client.get('/api/export/overview.csv', headers={'CF-Connecting-IP': '198.51.100.1'},
                               environ_overrides={'REMOTE_ADDR': '192.0.2.1'})
            second = client.get('/api/export/overview.csv', headers={'CF-Connecting-IP': '198.51.100.1'},
                                environ_overrides={'REMOTE_ADDR': '192.0.2.2'})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)
        with app.test_request_context(headers={'CF-Connecting-IP': 'invalid, spoofed'},
                                      environ_base={'REMOTE_ADDR': '192.0.2.1'}):
            self.assertEqual(client_address(), '192.0.2.1')

    def test_database_tls_accepts_provider_pem_or_ca_file(self):
        for values, expected in [
                ({'DB_SSL_CA_PEM': 'provider certificate'}, {'cadata': 'provider certificate'}),
                ({'DB_SSL_CA': '/run/secrets/ca.pem'}, {'cafile': '/run/secrets/ca.pem'})]:
            with self.subTest(values=values), \
                    patch('app.database.dotenv_values', return_value={}), \
                    patch.dict(os.environ, {'DB_USER': 'test', **values}, clear=True), \
                    patch('app.database.ssl.create_default_context') as context:
                config = settings()
                context.assert_called_once_with(**expected)
                self.assertIs(config['ssl'], context.return_value)

    def app(self, **values):
        environment = {
            'APP_ENV': 'development',
            'RATE_LIMIT_STORAGE_URI': 'memory://',
            **{key: str(value) for key, value in values.items()},
        }
        with patch.dict(os.environ, environment, clear=False):
            return create_app()

    def test_liveness_does_not_touch_database_and_sets_security_headers(self):
        client = self.app().test_client()
        with patch('app.connect') as database:
            response = client.get('/health/live')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {'status': 'ok'})
        self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(response.headers['X-Frame-Options'], 'DENY')
        database.assert_not_called()

    def test_production_requires_shared_rate_limit_storage(self):
        with patch.dict(os.environ, {
                'APP_ENV': 'production', 'RATE_LIMIT_STORAGE_URI': 'memory://'}, clear=False):
            with self.assertRaisesRegex(RuntimeError, 'shared RATE_LIMIT_STORAGE_URI'):
                create_app()

    def test_export_rate_limit_and_database_row_ceiling(self):
        client = self.app(EXPORT_RATE_LIMIT='1 per minute', EXPORT_MAX_ROWS=1).test_client()
        remote = {'REMOTE_ADDR': '192.0.2.10'}
        with patch('app.routes.traffic.query', return_value=[{}, {}]) as query:
            response = client.get('/api/export/overview.csv', environ_overrides=remote)
            self.assertEqual(response.status_code, 400)
            self.assertIn('Narrow the filters', response.get_json()['error'])
            self.assertTrue(query.call_args.args[0].endswith('LIMIT %s'))
            self.assertEqual(query.call_args.args[1], [2])
            limited = client.get('/api/export/overview.csv', environ_overrides=remote)
        self.assertEqual(limited.status_code, 429)
        self.assertEqual(limited.headers['X-RateLimit-Limit'], '1')
        self.assertEqual(limited.headers['Retry-After'], '60')

    def test_vehicles_rate_limit_etag_cache_and_compression(self):
        client = self.app(VEHICLES_RATE_LIMIT='2 per minute').test_client()
        remote = {'REMOTE_ADDR': '192.0.2.20', 'HTTP_ACCEPT_ENCODING': 'gzip'}
        analysis = {'locations': [{'name': 'ถนนทดสอบ', 'values': list(range(1000))}]}
        with patch('app.routes.traffic.query', return_value=[]), \
                patch('app.routes.traffic.analyze_vehicles', return_value=analysis):
            first = client.get('/api/vehicles', environ_overrides=remote)
            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.headers['Content-Encoding'], 'gzip')
            self.assertIn('max-age=60', first.headers['Cache-Control'])
            etag = first.headers['ETag']
            cached = client.get('/api/vehicles', headers={'If-None-Match': etag},
                                environ_overrides=remote)
            self.assertEqual(cached.status_code, 304)
            limited = client.get('/api/vehicles', environ_overrides=remote)
        self.assertEqual(limited.status_code, 429)


if __name__ == '__main__':
    unittest.main()
