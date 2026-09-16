"""Start only a configured server; never expose an unprotected converter."""
import os
from pathlib import Path
import sys


def validate_environment():
    if len(os.environ.get('FACTURX_API_KEY', '')) < 32:
        raise RuntimeError('Configure FACTURX_API_KEY (at least 32 characters) as a server secret.')
    if not os.environ.get('FACTURX_ALLOWED_HOSTS', '').strip() and os.environ.get('RENDER_EXTERNAL_HOSTNAME'):
        os.environ['FACTURX_ALLOWED_HOSTS'] = os.environ['RENDER_EXTERNAL_HOSTNAME']
    if not os.environ.get('FACTURX_ALLOWED_HOSTS', '').strip():
        raise RuntimeError('Configure FACTURX_ALLOWED_HOSTS for the server hostname.')
    origins = os.environ.get('FACTURX_ALLOWED_ORIGINS', 'https://app.cdinnov.eu').split(',')
    if any(not value.startswith('https://') or '*' in value for value in origins):
        raise RuntimeError('Server origins must be explicit HTTPS origins.')
    port = int(os.environ.get('PORT', '8080'))
    if not 1 <= port <= 65535:
        raise RuntimeError('Invalid server port.')
    return port


if __name__ == '__main__':
    port = validate_environment()
    os.environ['FACTURX_DEPLOYMENT'] = 'server'
    os.chdir(Path(__file__).resolve().parents[1])
    os.execv(sys.executable, [sys.executable, '-m', 'uvicorn', 'cdi_facturx.api:app',
                            '--host', '0.0.0.0', '--port', str(port), '--workers', '1',
                            '--no-access-log', '--no-proxy-headers'])
