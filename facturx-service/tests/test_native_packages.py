from types import SimpleNamespace

import pytest

from deployment import verify_native_packages as native


@pytest.fixture
def trixie(monkeypatch):
    monkeypatch.setattr(native.platform, 'freedesktop_os_release', lambda: {'ID': 'debian', 'VERSION_CODENAME': 'trixie'})


def package_lines(exclude=None, ghostscript_version=None):
    return '\n'.join(f'{name}\t{(ghostscript_version if name == "ghostscript" and ghostscript_version else version)}\tinstall ok installed'
                     for name, version in {**native.GHOSTSCRIPT_PACKAGES, **native.MINIMUM_PACKAGES}.items() if name != exclude)


def test_image_cannot_silently_keep_bookworm(monkeypatch):
    monkeypatch.setattr(native.platform, 'freedesktop_os_release', lambda: {'ID': 'debian', 'VERSION_CODENAME': 'bookworm'})
    with pytest.raises(RuntimeError, match='trixie'):
        native.verify()


def test_missing_library_fails_before_accepting_the_image(trixie, monkeypatch):
    monkeypatch.setattr(native.subprocess, 'run', lambda *a, **k: SimpleNamespace(stdout=package_lines(exclude='libgs10'), returncode=0))
    with pytest.raises(RuntimeError, match='missing'):
        native.verify()


@pytest.mark.parametrize('version', ['10.0.0~dfsg-11+deb12u8', '10.05.1~dfsg-1+deb13u3', '10.05.1~dfsg-1+deb13u4'])
def test_unproven_ghostscript_fails_even_if_other_packages_are_current(trixie, monkeypatch, version):
    def run(args, **kwargs):
        if args[0] == 'dpkg-query':
            return SimpleNamespace(stdout=package_lines(ghostscript_version=version), returncode=0)
        raise AssertionError('Unproven Ghostscript must be refused first.')
    monkeypatch.setattr(native.subprocess, 'run', run)
    with pytest.raises(RuntimeError, match='ghostscript'):
        native.verify()


def test_all_packages_must_pass_the_debian_revision_comparison(trixie, monkeypatch):
    comparisons = []
    def run(args, **kwargs):
        if args[0] == 'dpkg-query':
            return SimpleNamespace(stdout=package_lines(), returncode=0)
        comparisons.append(args)
        return SimpleNamespace(returncode=0)
    monkeypatch.setattr(native.subprocess, 'run', run)
    monkeypatch.setattr(native, 'verify_ghostscript_provenance', lambda: {'installed_files_verified': True})
    result = native.verify()
    assert result['packages'] == {**native.GHOSTSCRIPT_PACKAGES, **native.MINIMUM_PACKAGES}
    assert len(comparisons) == len(native.MINIMUM_PACKAGES)
    assert all(args[:2] == ['dpkg', '--compare-versions'] and args[3] == 'ge' for args in comparisons)


def test_current_package_numbers_are_insufficient_without_source_proof(trixie, monkeypatch, tmp_path):
    monkeypatch.setattr(native.subprocess, 'run', lambda *a, **k: SimpleNamespace(stdout=package_lines(), returncode=0))
    monkeypatch.setattr(native, 'PROVENANCE', tmp_path / 'missing-provenance.json')
    with pytest.raises(FileNotFoundError):
        native.verify()


def test_a_different_source_or_patch_cannot_claim_the_backport(monkeypatch, tmp_path):
    import json
    manifest = {**native.LOCK, 'patched_sources': {}}
    proof = tmp_path / 'proof.json'
    proof.write_text(json.dumps(manifest), encoding='utf-8')
    monkeypatch.setattr(native, 'PROVENANCE', proof)
    with pytest.raises(RuntimeError, match='source/patch'):
        native.verify_ghostscript_provenance()


def test_a_changed_official_patch_fails_before_build(tmp_path):
    from deployment.build_ghostscript import require_hash
    patch = tmp_path / 'CVE-2026-110133.patch'
    patch.write_bytes(b'This is not the upstream correction.')
    with pytest.raises(RuntimeError, match='integrity'):
        require_hash(patch, native.LOCK['patches'][patch.name]['sha256'])


def test_vendored_artifex_patches_match_reviewed_hashes():
    from deployment.build_ghostscript import LOCK_DIR, require_hash
    for name, patch in native.LOCK['patches'].items():
        require_hash(LOCK_DIR / name, patch['sha256'])


@pytest.mark.parametrize('changed', [False, True])
def test_installed_shared_library_is_checked_not_just_package_label(monkeypatch, tmp_path, changed):
    import hashlib
    import json
    from pathlib import Path
    payloads = {'/usr/bin/gs': b'fictional executable',
                '/usr/lib/x86_64-linux-gnu/libgs.so.10.05': b'fictional patched library',
                '/usr/share/color/icc/ghostscript/srgb.icc': b'fictional ICC'}
    files = {}
    for index, (name, contents) in enumerate(payloads.items()):
        files[name] = tmp_path / str(index)
        files[name].write_bytes(contents)
    manifest = {**native.LOCK,
                'packages': {name: {'version': version, 'sha256': '0' * 64} for name, version in native.GHOSTSCRIPT_PACKAGES.items()},
                'runtime_files': {name: hashlib.sha256(contents).hexdigest() for name, contents in payloads.items()}}
    proof = tmp_path / 'proof.json'
    proof.write_text(json.dumps(manifest), encoding='utf-8')
    monkeypatch.setattr(native, 'PROVENANCE', proof)
    monkeypatch.setattr(native, 'Path', lambda path: files[path] if path in files else Path(path))
    monkeypatch.setenv('FACTURX_GHOSTSCRIPT', '/usr/bin/gs')
    if changed:
        files['/usr/lib/x86_64-linux-gnu/libgs.so.10.05'].write_bytes(b'unpatched library under the same version')
        with pytest.raises(RuntimeError, match='installed file integrity'):
            native.verify_ghostscript_provenance()
    else:
        assert native.verify_ghostscript_provenance()['installed_files_verified']
