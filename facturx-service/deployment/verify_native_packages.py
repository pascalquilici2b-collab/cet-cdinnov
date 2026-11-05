"""Verify Debian revisions and the exact source-backed Ghostscript rebuild.

The +cdi1 package is a local rebuild, not an official Debian security release.
Its version alone is insufficient: require the source/patch provenance and
hash the installed executable, corrected shared library and colour profile.
"""
import hashlib
import json
import os
import platform
import subprocess
from pathlib import Path


LOCK = json.loads(Path(__file__).with_name('ghostscript').joinpath('lock.json').read_text(encoding='utf-8'))
PROVENANCE = Path('/usr/share/cdi-native-security/ghostscript.json')
GHOSTSCRIPT_PACKAGES = {name: LOCK['package_version'] for name in LOCK['runtime_packages']}
MINIMUM_PACKAGES = {
    'openjdk-21-jre-headless': '21.0.13+9-1~deb13u2',
    'tesseract-ocr': '5.5.0-1',
}


def verify_ghostscript_provenance():
    manifest = json.loads(PROVENANCE.read_text(encoding='utf-8'))
    if any(manifest.get(name) != value for name, value in LOCK.items()):
        raise RuntimeError('Ghostscript source/patch provenance does not match the reviewed build.')
    if set(manifest.get('packages', {})) != set(GHOSTSCRIPT_PACKAGES):
        raise RuntimeError('Ghostscript rebuilt package provenance is incomplete.')
    for package in manifest['packages'].values():
        if package.get('version') != LOCK['package_version']:
            raise RuntimeError('Ghostscript rebuilt package provenance has an unexpected version.')
    files = manifest.get('runtime_files', {})
    libraries = [name for name in files if name.startswith('/usr/lib/') and '/libgs.so.' in name]
    required = {'/usr/bin/gs', '/usr/share/color/icc/ghostscript/srgb.icc'}
    if len(libraries) != 1 or set(files) != required | set(libraries):
        raise RuntimeError('Ghostscript executable/library provenance is incomplete.')
    for name, expected in files.items():
        with Path(name).open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != expected:
                raise RuntimeError(f'Ghostscript installed file integrity failed: {name}')
    if os.environ.get('FACTURX_GHOSTSCRIPT', '/usr/bin/gs') != '/usr/bin/gs':
        raise RuntimeError('The converter must use the verified Ghostscript executable.')
    return {'package_version': LOCK['package_version'], 'patches': LOCK['patches'],
            'source_sha256': LOCK['patched_sources'], 'installed_files_verified': True}


def verify():
    release = platform.freedesktop_os_release()
    if release.get('ID') != 'debian' or release.get('VERSION_CODENAME') != 'trixie':
        raise RuntimeError('The native runtime requires Debian trixie.')
    required = {**GHOSTSCRIPT_PACKAGES, **MINIMUM_PACKAGES}
    result = subprocess.run(['dpkg-query', '-W', '-f=${Package}\t${Version}\t${Status}\n', *required],
                            capture_output=True, text=True, check=True, timeout=10)
    versions = {}
    for line in result.stdout.splitlines():
        name, version, status = line.split('\t')
        if name in required and status == 'install ok installed':
            versions[name] = version
    if set(versions) != set(required):
        raise RuntimeError('A required native package is missing or not installed.')
    for name, expected in GHOSTSCRIPT_PACKAGES.items():
        if versions[name] != expected:
            raise RuntimeError(f'Native package {name} is not the verified patched rebuild {expected}.')
    for name, minimum in MINIMUM_PACKAGES.items():
        comparison = subprocess.run(['dpkg', '--compare-versions', versions[name], 'ge', minimum],
                                    capture_output=True, check=False, timeout=10)
        if comparison.returncode != 0:
            raise RuntimeError(f'Native package {name} is below the required security baseline {minimum}.')
    ghostscript = verify_ghostscript_provenance()
    return {'native_security_baseline': 'passed', 'debian': 'trixie', 'packages': versions,
            'ghostscript_backport': ghostscript}


if __name__ == '__main__':
    print(json.dumps(verify(), sort_keys=True))
