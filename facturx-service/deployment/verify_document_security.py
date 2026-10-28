"""Local reader/guard smoke test. Synthetic bytes only; no network or secrets."""
import io
import json
import subprocess
import sys

from pypdf import PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject

from cdi_facturx.pdf_import import inspect_pdf, preview_pdf
from cdi_facturx.stamping_pdf import StampError, open_source


def main():
    writer = PdfWriter()
    page = writer.add_blank_page(width=595, height=842)
    output = io.BytesIO()
    writer.write(output)
    raw = output.getvalue()
    assert inspect_pdf(raw) == ('', 1)
    assert preview_pdf(raw).startswith(b'\xff\xd8\xff')
    page[NameObject('/Annots')] = ArrayObject([DictionaryObject({NameObject('/A'): DictionaryObject({NameObject('/S'): NameObject('/SubmitForm')})})])
    output = io.BytesIO()
    writer.write(output)
    try:
        open_source(output.getvalue())
    except StampError as error:
        assert error.code == 'ACTIVE_PDF'
    else:
        raise AssertionError('Active PDF accepted')
    if sys.platform == 'linux':
        subprocess.run([sys.executable, '-c',
            'from cdi_facturx.pdf_read_worker import apply_limits; import resource; apply_limits(); '
            'assert resource.getrlimit(resource.RLIMIT_AS)==(384*1024*1024,384*1024*1024); '
            'assert resource.getrlimit(resource.RLIMIT_CPU)==(25,30); '
            'assert resource.getrlimit(resource.RLIMIT_FSIZE)==(6*1024*1024,6*1024*1024)'],
            check=True, timeout=10, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(json.dumps({'document_security': 'passed', 'reader_subprocess': True, 'active_pdf_rejected': True,
                      'linux_resource_limits': sys.platform == 'linux'}))


if __name__ == '__main__':
    main()
