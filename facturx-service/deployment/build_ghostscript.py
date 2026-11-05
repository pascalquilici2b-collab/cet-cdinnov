"""Build exact Debian sources with the two official Artifex security backports.

Used only in the Docker builder stage. Debian's configuration and tests remain
unchanged. A hash mismatch, rejected patch, failed build or missing proof fails
the image; there is deliberately no fallback to the vulnerable distribution gs.
"""
import hashlib
import json
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path


LOCK_DIR = Path(__file__).with_name('ghostscript')


def read_lock():
    return json.loads((LOCK_DIR / 'lock.json').read_text(encoding='utf-8'))


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def require_hash(path, expected):
    if digest(path) != expected:
        raise RuntimeError(f'Ghostscript integrity check failed: {Path(path).name}')


def verify_sources(source, lock):
    require_hash(source / 'debian/rules', lock['debian_rules_sha256'])
    for name, expected in lock['patched_sources'].items():
        require_hash(source / name, expected)


def prepare(work):
    lock = read_lock()
    work.mkdir(parents=True, exist_ok=True)
    source = work / 'source'
    if source.exists():
        raise RuntimeError('Ghostscript source preparation requires a new directory.')
    for name, expected in lock['source_files'].items():
        destination = work / name
        with urllib.request.urlopen(lock['source_base_url'] + name, timeout=120) as response, destination.open('wb') as output:
            shutil.copyfileobj(response, output)
        require_hash(destination, expected)
    descriptor = next(work.glob('*.dsc'))
    subprocess.run(['dpkg-source', '-x', str(descriptor), str(source)], check=True)
    require_hash(source / 'debian/rules', lock['debian_rules_sha256'])
    for name, patch in lock['patches'].items():
        patch_path = LOCK_DIR / name
        require_hash(patch_path, patch['sha256'])
        # Check the unchanged official patch without offset/context relaxation.
        subprocess.run(['patch', '--dry-run', '--fuzz=0', '--batch', '--forward', '-p1', '-i', str(patch_path)],
                       cwd=source, check=True)
        shutil.copyfile(patch_path, source / 'debian/patches' / name)
        with (source / 'debian/patches/series').open('a', encoding='utf-8', newline='\n') as series:
            series.write(name + '\n')
    # Keep the patched source available for the post-build provenance check.
    with (source / 'debian/source/local-options').open('a', encoding='utf-8', newline='\n') as options:
        options.write('\nno-unapply-patches\n')
    subprocess.run(['dpkg-source', '--before-build', str(source)], check=True)
    verify_sources(source, lock)
    changelog = source / 'debian/changelog'
    previous = changelog.read_text(encoding='utf-8')
    entry = (f"ghostscript ({lock['package_version']}) trixie; urgency=high\n\n"
             "  * Local rebuild of Debian security u3 with unmodified Artifex fixes\n"
             "    for CVE-2026-110133 and CVE-2026-112922.\n\n"
             " -- CDInnov build <build@localhost>  Thu, 05 Nov 2026 00:00:00 +0000\n\n")
    changelog.write_text(entry + previous, encoding='utf-8', newline='\n')
    print('GHOSTSCRIPT PATCHED SOURCES VERIFIED: ' + json.dumps(lock['patched_sources'], sort_keys=True), flush=True)


def collect(work):
    lock = read_lock()
    verify_sources(work / 'source', lock)
    output = work / 'output'
    output.mkdir(exist_ok=True)
    extracted = work / 'runtime-files'
    packages = {}
    for name in lock['runtime_packages']:
        files = list(work.glob(f"{name}_{lock['package_version']}_*.deb"))
        if len(files) != 1:
            raise RuntimeError(f'Exactly one rebuilt package is required: {name}')
        deb = files[0]
        version = subprocess.check_output(['dpkg-deb', '-f', str(deb), 'Version'], text=True).strip()
        if version != lock['package_version']:
            raise RuntimeError('Unexpected rebuilt Ghostscript package version.')
        packages[name] = {'version': version, 'sha256': digest(deb)}
        shutil.copyfile(deb, output / deb.name)
        subprocess.run(['dpkg-deb', '-x', str(deb), str(extracted)], check=True)
    libraries = [p for p in (extracted / 'usr/lib').glob('*/libgs.so.*') if p.is_file() and not p.is_symlink()]
    if len(libraries) != 1:
        raise RuntimeError('Exactly one rebuilt Ghostscript shared library is required.')
    binary_files = [extracted / 'usr/bin/gs', libraries[0], extracted / 'usr/share/color/icc/ghostscript/srgb.icc']
    manifest = {**lock, 'packages': packages,
                'runtime_files': {'/' + p.relative_to(extracted).as_posix(): digest(p) for p in binary_files}}
    (output / 'ghostscript-provenance.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print('GHOSTSCRIPT REBUILT PACKAGES VERIFIED: ' + json.dumps(packages, sort_keys=True), flush=True)


if __name__ == '__main__':
    action, directory = sys.argv[1:]
    {'prepare': prepare, 'collect': collect}[action](Path(directory).resolve())
