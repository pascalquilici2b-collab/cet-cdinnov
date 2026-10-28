from types import SimpleNamespace

import pytest

from deployment import verify_native_packages as native


@pytest.fixture
def trixie(monkeypatch):
    monkeypatch.setattr(native.platform, 'freedesktop_os_release', lambda: {'ID': 'debian', 'VERSION_CODENAME': 'trixie'})


def package_lines(exclude=None, old_ghostscript=False):
    return '\n'.join(f'{name}\t{("10.0.0~dfsg-11+deb12u8" if name == "ghostscript" and old_ghostscript else version)}\tinstall ok installed'
                     for name, version in native.MINIMUM_PACKAGES.items() if name != exclude)


def test_image_cannot_silently_keep_bookworm(monkeypatch):
    monkeypatch.setattr(native.platform, 'freedesktop_os_release', lambda: {'ID': 'debian', 'VERSION_CODENAME': 'bookworm'})
    with pytest.raises(RuntimeError, match='trixie'):
        native.verify()


def test_missing_library_fails_before_accepting_the_image(trixie, monkeypatch):
    monkeypatch.setattr(native.subprocess, 'run', lambda *a, **k: SimpleNamespace(stdout=package_lines(exclude='libgs10'), returncode=0))
    with pytest.raises(RuntimeError, match='missing'):
        native.verify()


def test_unpatched_ghostscript_fails_even_if_other_packages_are_current(trixie, monkeypatch):
    def run(args, **kwargs):
        if args[0] == 'dpkg-query':
            return SimpleNamespace(stdout=package_lines(old_ghostscript=True), returncode=0)
        assert args == ['dpkg', '--compare-versions', '10.0.0~dfsg-11+deb12u8', 'ge', native.MINIMUM_PACKAGES['ghostscript']]
        return SimpleNamespace(returncode=1)
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
    result = native.verify()
    assert result['packages'] == native.MINIMUM_PACKAGES
    assert len(comparisons) == len(native.MINIMUM_PACKAGES)
    assert all(args[:2] == ['dpkg', '--compare-versions'] and args[3] == 'ge' for args in comparisons)
