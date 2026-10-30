"""Offline-oracle regression using three synthetic guesses and a synthetic key."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import types

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / 'facturx-service'))
from cdi_facturx import server_auth

email, password = 'synthetic-audit@example.invalid', 'Synthetic-only password 2026'
salt, iterations = 'cd' * 16, 150_000
def record(value):
    return {'salt': salt, 'iter': iterations, 'hash': hashlib.pbkdf2_hmac('sha256', value.encode(), bytes.fromhex(salt), iterations).hex()}

os.environ['FACTURX_API_KEY'] = 'synthetic-key-only-' * 4
os.environ['FACTURX_USERS_JSON'] = json.dumps({email: record(password)})
previous = types.ModuleType('baseline_server_auth')
source = subprocess.run(['git', 'show', '493f91b:facturx-service/cdi_facturx/server_auth.py'], cwd=root, capture_output=True, check=True, text=True).stdout
exec(compile(source, '493f91b/server_auth.py', 'exec'), previous.__dict__)

def claims(module):
    token = module.login(email, password)['token']
    payload = token.split('.')[0]
    return token, json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))

old_token, old = claims(previous)
new_token, new = claims(server_auth)
candidates = [record(guess) for guess in ['not-it', password, 'also-not-it']]
fingerprints = [hashlib.sha256(':'.join([r['salt'], str(r['iter']), r['hash']]).encode()).hexdigest() for r in candidates]
proof = {'revision': '493f91b -> working-tree', 'synthetic': True, 'requiresKnownSaltAndIterations': True,
         'baselineOfflineMatches': sum(value == old['account'] for value in fingerprints),
         'fixedOfflineMatches': sum(value == new['account'] for value in fingerprints),
         'legacySessionRejected': server_auth.verify(old_token) is None,
         'newSessionAccepted': server_auth.verify(new_token) == email, 'externalRequests': 0}
assert proof['baselineOfflineMatches'] == 1 and proof['fixedOfflineMatches'] == 0
assert proof['legacySessionRejected'] and proof['newSessionAccepted']
output = root / 'platform/.private/security-audit-20261030/render-session-proof.json'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(proof, indent=2) + '\n', encoding='utf-8')
print(json.dumps(proof))
