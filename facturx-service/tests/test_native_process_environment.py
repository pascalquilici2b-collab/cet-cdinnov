from types import SimpleNamespace
from cdi_facturx import service


def test_ghostscript_does_not_inherit_application_secrets_or_option_injection(monkeypatch, tmp_path):
    for name in ('FACTURX_API_KEY', 'FACTURX_USERS_JSON', 'AWS_SECRET_ACCESS_KEY', 'CLOUDFLARE_API_TOKEN', 'GS_OPTIONS', 'LD_PRELOAD', 'PYTHONPATH'):
        monkeypatch.setenv(name, 'synthetic-sensitive-value')
    monkeypatch.setenv('PATH', '/usr/bin:/bin')
    monkeypatch.setenv('LANG', 'C.UTF-8')
    monkeypatch.setenv('TMPDIR', str(tmp_path))
    icc = tmp_path / 'source.icc'
    icc.write_bytes(b'synthetic ICC fixture')
    captured = {}

    def run(args, **kwargs):
        captured.update(args=args, **kwargs)
        (tmp_path / 'archive.pdf').write_bytes(b'%PDF-synthetic-result')
        return SimpleNamespace(returncode=0, stdout=b'', stderr=b'')

    monkeypatch.setattr(service.subprocess, 'run', run)
    result = service.convert_pdfa(b'%PDF-synthetic-input', tmp_path, {'ghostscript': '/usr/bin/gs', 'icc': str(icc)})
    assert result.read_bytes() == b'%PDF-synthetic-result'
    env = captured['env']
    assert env['PATH'] == '/usr/bin:/bin' and env['LANG'] == 'C.UTF-8' and env['TMPDIR'] == str(tmp_path)
    assert 'synthetic-sensitive-value' not in env.values()
    assert not any(key in env for key in ('FACTURX_API_KEY', 'FACTURX_USERS_JSON', 'GS_OPTIONS', 'LD_PRELOAD', 'PYTHONPATH'))
    assert captured['timeout'] == 120
    assert '-dSAFER' in captured['args'] and '-sDEVICE=pdfwrite' in captured['args']
    assert '-dEmbedAllFonts=true' in captured['args']
    assert captured['args'][-2:] == ['pdfa.ps', 'source.pdf']
    assert not captured.get('shell', False)
