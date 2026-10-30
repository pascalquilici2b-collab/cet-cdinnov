"""Synthetic hosted-service accounts; never reads a real account inventory."""
import base64
import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

from cdi_facturx import server_auth as auth
from cdi_facturx.api import app

EMAIL = 'audit@example.invalid'
PASSWORD = 'Synthetic password only! 2026'
KEY = 'synthetic-server-key-' * 3


def account(password=PASSWORD):
    salt, iterations = 'ab' * 16, 150_000
    return {'salt': salt, 'iter': iterations, 'hash': hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), iterations).hex()}


def decoded(token):
    payload = token.split('.')[0]
    return json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))


@pytest.fixture
def configured(monkeypatch):
    accounts = {EMAIL: account()}
    monkeypatch.setenv('FACTURX_API_KEY', KEY)
    monkeypatch.setenv('FACTURX_USERS_JSON', json.dumps(accounts))
    monkeypatch.setenv('FACTURX_DEPLOYMENT', 'server')
    auth._attempts.clear()
    return accounts


def test_readable_claim_no_longer_matches_offline_password_guesses(configured):
    token = auth.login(EMAIL, PASSWORD)['token']
    claims = decoded(token)
    assert claims['v'] == 2 and auth.verify(token) == EMAIL
    guesses = [account(value) for value in ('wrong', PASSWORD, 'other')]
    old = [hashlib.sha256(':'.join([candidate['salt'], str(candidate['iter']), candidate['hash']]).encode()).hexdigest() for candidate in guesses]
    assert claims['account'] not in old
    assert configured[EMAIL]['hash'] not in json.dumps(claims)
    assert configured[EMAIL]['salt'] not in json.dumps(claims)
    assert auth.account_binding(EMAIL, configured[EMAIL]) != auth.account_binding('another@example.invalid', configured[EMAIL])
    assert auth.account_binding(EMAIL, configured[EMAIL]) != auth.sign(json.dumps([EMAIL, configured[EMAIL]]))


def test_legacy_unkeyed_sessions_are_rejected_without_fallback(configured):
    row = configured[EMAIL]
    digest = hashlib.sha256(':'.join([row['salt'], str(row['iter']), row['hash']]).encode()).hexdigest()
    now = int(time.time())
    claims = {'email': EMAIL, 'iat': now, 'exp': now + auth.SESSION_SECONDS, 'account': digest, 'nonce': 'a' * 24}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')
    signature = hmac.new(KEY.encode(), b'cdi-facturx-session-v1:' + payload.encode(), hashlib.sha256).hexdigest()
    assert auth.verify(payload + '.' + signature) is None
    # Even an otherwise correctly signed v2 token cannot carry an old binding.
    claims['v'] = 2
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')
    assert auth.verify(payload + '.' + auth.sign(payload)) is None


def test_password_change_deletion_key_rotation_and_expiry_revoke_sessions(configured, monkeypatch):
    token = auth.login(EMAIL, PASSWORD)['token']
    monkeypatch.setenv('FACTURX_USERS_JSON', json.dumps({EMAIL: account('Changed password')}))
    assert auth.verify(token) is None
    monkeypatch.setenv('FACTURX_USERS_JSON', '{}')
    assert auth.verify(token) is None
    monkeypatch.setenv('FACTURX_USERS_JSON', json.dumps(configured))
    monkeypatch.setenv('FACTURX_API_KEY', KEY + '-rotated')
    assert auth.verify(token) is None
    monkeypatch.setenv('FACTURX_API_KEY', KEY)
    expires = decoded(token)['exp']
    monkeypatch.setattr(auth.time, 'time', lambda: expires)
    assert auth.verify(token) is None


def test_authentication_api_accepts_new_session_and_rejects_invalid_login(configured):
    with TestClient(app) as client:
        response = client.post('/api/auth/login', json={'email': EMAIL.upper(), 'password': PASSWORD})
        assert response.status_code == 200
        token = response.json()['token']
        assert client.get('/api/invoice-schema', headers={'Authorization': 'Bearer ' + token}).status_code == 200
        assert client.get('/api/invoice-schema', headers={'Authorization': 'Bearer ' + token + 'bad'}).status_code == 401
        assert client.post('/api/auth/login', json={'email': EMAIL, 'password': 'wrong'}).status_code == 401
        assert client.post('/api/auth/login', json={'email': 'unknown@example.invalid', 'password': PASSWORD}).status_code == 401
