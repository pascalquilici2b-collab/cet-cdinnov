"""Fail the image build if its native Debian security baseline is not met.

Check Debian revisions, not `gs --version`: Debian backports fixes without
changing the upstream version. Newer stable-security revisions remain allowed.
This baseline does not claim that every published CVE is fixed or reachable.
"""
import json
import platform
import subprocess


MINIMUM_PACKAGES = {
    'ghostscript': '10.05.1~dfsg-1+deb13u3',
    'libgs10': '10.05.1~dfsg-1+deb13u3',
    'openjdk-21-jre-headless': '21.0.13+9-1~deb13u2',
    'tesseract-ocr': '5.5.0-1',
}


def verify():
    release = platform.freedesktop_os_release()
    if release.get('ID') != 'debian' or release.get('VERSION_CODENAME') != 'trixie':
        raise RuntimeError('The native runtime requires Debian trixie.')
    result = subprocess.run(['dpkg-query', '-W', '-f=${Package}\t${Version}\t${Status}\n', *MINIMUM_PACKAGES],
                            capture_output=True, text=True, check=True, timeout=10)
    versions = {}
    for line in result.stdout.splitlines():
        name, version, status = line.split('\t')
        if name in MINIMUM_PACKAGES and status == 'install ok installed':
            versions[name] = version
    if set(versions) != set(MINIMUM_PACKAGES):
        raise RuntimeError('A required native package is missing or not installed.')
    for name, minimum in MINIMUM_PACKAGES.items():
        comparison = subprocess.run(['dpkg', '--compare-versions', versions[name], 'ge', minimum],
                                    capture_output=True, check=False, timeout=10)
        if comparison.returncode != 0:
            raise RuntimeError(f'Native package {name} is below the required security baseline {minimum}.')
    return {'native_security_baseline': 'passed', 'debian': 'trixie', 'packages': versions}


if __name__ == '__main__':
    print(json.dumps(verify(), sort_keys=True))
