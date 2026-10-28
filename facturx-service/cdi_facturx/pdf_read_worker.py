"""Disposable reader: limits are applied before importing native PDF parsers."""
import base64
import json
import sys


def apply_limits():
    if sys.platform == 'linux':
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (384 * 1024 * 1024, 384 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_CPU, (25, 30))
        resource.setrlimit(resource.RLIMIT_FSIZE, (6 * 1024 * 1024, 6 * 1024 * 1024))


def main():
    apply_limits()
    try:
        from .pdf_import import MAX_BYTES, _inspect_pdf, _preview_pdf
        data = sys.stdin.buffer.read(MAX_BYTES + 1)
        if sys.argv[1] == 'inspect':
            result = _inspect_pdf(data)
        elif sys.argv[1] == 'preview':
            result = base64.b64encode(_preview_pdf(data, int(sys.argv[2]))).decode('ascii')
        else:
            raise ValueError('Invalid reader operation')
        response = {'ok': True, 'result': result}
    except Exception:
        # Parser diagnostics can contain embedded document content or paths.
        response = {'ok': False}
    sys.stdout.buffer.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))


if __name__ == '__main__':
    main()
