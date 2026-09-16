"""Password verification and short-lived signed sessions for the hosted service.

Accounts are provisioned in a Render secret, not read from client-supplied state.
The application PBKDF2 verifiers are compatible; plaintext passwords are never stored.
"""
import base64
from collections import defaultdict, deque
import hashlib
import hmac
import json
import os
import secrets
import threading
import time

SESSION_SECONDS = 8 * 60 * 60
_attempts = defaultdict(deque)
_attempt_lock = threading.Lock()


def users():
    raw = os.getenv('FACTURX_USERS_JSON', '{}')
    result = json.loads(raw)
    if not isinstance(result, dict):
        raise ValueError('Invalid server account configuration.')
    for email, account in result.items():
        if not isinstance(email, str) or email != email.strip().lower() or '@' not in email:
            raise ValueError('Invalid server account address.')
        if not isinstance(account, dict) or not 100_000 <= int(account.get('iter', 150_000)) <= 1_000_000:
            raise ValueError('Invalid server account configuration.')
        if len(bytes.fromhex(account.get('salt', ''))) != 16 or len(bytes.fromhex(account.get('hash', ''))) != 32:
            raise ValueError('Invalid password verifier configuration.')
    return result


def allow_attempt(remote, email):
    now = time.monotonic()
    buckets = ['all', 'ip:' + str(remote), 'user:' + hashlib.sha256(email.encode()).hexdigest()]
    limits = [60, 20, 10]
    with _attempt_lock:
        for key in list(_attempts):
            while _attempts[key] and now - _attempts[key][0] > 300:
                _attempts[key].popleft()
            if not _attempts[key]:
                del _attempts[key]
        if any(len(_attempts[key]) >= limit for key, limit in zip(buckets, limits)):
            return False
        for key in buckets:
            _attempts[key].append(now)
    return True


def fingerprint(account):
    value = ':'.join([account['salt'], str(account.get('iter', 150_000)), account['hash']])
    return hashlib.sha256(value.encode()).hexdigest()


def signing_key():
    key = os.getenv('FACTURX_API_KEY', '')
    if len(key) < 32:
        raise ValueError('Server authentication is not configured.')
    return key.encode()


def sign(payload):
    return hmac.new(signing_key(), b'cdi-facturx-session-v1:' + payload.encode(), hashlib.sha256).hexdigest()


def login(email, password):
    email = email.strip().lower()
    accounts = users()
    account = accounts.get(email)
    # Spend the same PBKDF2 work for unknown users, avoiding a cheap identity oracle.
    actual = account or {'salt': '00' * 16, 'hash': '00' * 32, 'iter': 150_000}
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(actual['salt']), int(actual.get('iter', 150_000))).hex()
    if not account or not secrets.compare_digest(digest, account['hash']):
        return None
    now = int(time.time())
    claims = {'email': email, 'iat': now, 'exp': now + SESSION_SECONDS,
              'account': fingerprint(account), 'nonce': secrets.token_hex(12)}
    payload = base64.urlsafe_b64encode(json.dumps(claims, separators=(',', ':')).encode()).decode().rstrip('=')
    return {'token': payload + '.' + sign(payload), 'expires_at': claims['exp'], 'email': email}


def verify(token):
    try:
        if not isinstance(token, str) or len(token) > 2048:
            return None
        payload, signature = token.split('.')
        if not secrets.compare_digest(sign(payload), signature):
            return None
        claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        now = int(time.time())
        if not isinstance(claims, dict) or not isinstance(claims.get('iat'), int) or not isinstance(claims.get('exp'), int):
            return None
        if not claims['iat'] <= now < claims['exp'] or claims['exp'] - claims['iat'] != SESSION_SECONDS:
            return None
        account = users().get(claims.get('email'))
        if not account or not secrets.compare_digest(fingerprint(account), claims.get('account', '')):
            return None
        return claims['email']
    except (ValueError, TypeError, KeyError, UnicodeError):
        return None
