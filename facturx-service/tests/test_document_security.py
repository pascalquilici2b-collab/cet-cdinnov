"""Security regressions use synthetic local bytes; no external request is made."""
import io
import subprocess
from unittest.mock import patch

import pytest
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject, TextStringObject

from cdi_facturx.pdf_import import inspect_pdf, preview_pdf
from cdi_facturx.stamping_pdf import StampError, canonical, evidence_lines, open_source


def pdf_with_action(kind, *, next_action=False, in_outline=False, uri='https://example.invalid/fictitious'):
    writer = PdfWriter()
    page = writer.add_blank_page(width=595, height=842)
    action = DictionaryObject({NameObject('/S'): NameObject(kind), NameObject('/URI'): TextStringObject(uri)})
    if next_action:
        action[NameObject('/Next')] = ArrayObject([DictionaryObject({NameObject('/S'): NameObject('/SubmitForm')})])
    owner = DictionaryObject({NameObject('/A'): action})
    if in_outline:
        owner[NameObject('/Title')] = TextStringObject('Fictitious bookmark')
        writer._root_object[NameObject('/Outlines')] = DictionaryObject({NameObject('/First'): writer._add_object(owner)})
    else:
        owner.update({NameObject('/Type'): NameObject('/Annot'), NameObject('/Subtype'): NameObject('/Link')})
        page[NameObject('/Annots')] = ArrayObject([writer._add_object(owner)])
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


@pytest.mark.parametrize('kind', ['/Launch', '/SubmitForm', '/ImportData', '/GoToR', '/GoToE', '/JavaScript', '/Rendition', '/Unknown'])
def test_active_annotation_is_rejected_before_copying(kind):
    with pytest.raises(StampError):
        open_source(pdf_with_action(kind))


@pytest.mark.parametrize('kind', ['/Launch', '/SubmitForm', '/ImportData', '/GoToR', '/JavaScript'])
def test_invoice_import_and_conversion_source_check_reject_active_actions(kind):
    with pytest.raises(ValueError):
        inspect_pdf(pdf_with_action(kind))


@pytest.mark.parametrize('outline', [False, True])
def test_safe_link_cannot_hide_a_chained_external_action(outline):
    with pytest.raises(StampError) as failure:
        open_source(pdf_with_action('/URI', next_action=True, in_outline=outline))
    assert failure.value.code == 'ACTIVE_PDF'


@pytest.mark.parametrize('uri', ['file:///fictitious.pdf', 'javascript:void(0)', 'data:text/html,fictitious'])
def test_link_schemes_cannot_invoke_local_or_active_content(uri):
    with pytest.raises(StampError):
        open_source(pdf_with_action('/URI', uri=uri))


def test_ordinary_web_link_is_preserved_without_following_it():
    reader = open_source(pdf_with_action('/URI'))
    _, copied = canonical(reader)
    annotation = PdfReader(io.BytesIO(copied)).pages[0]['/Annots'][0].get_object()
    assert annotation['/A']['/URI'] == 'https://example.invalid/fictitious'


def test_tagged_document_attributes_are_not_confused_with_actions():
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    writer._root_object[NameObject('/StructTreeRoot')] = DictionaryObject({NameObject('/K'): DictionaryObject({
        NameObject('/Type'): NameObject('/StructElem'), NameObject('/A'): DictionaryObject({NameObject('/O'): NameObject('/Layout')})})})
    output = io.BytesIO()
    writer.write(output)
    assert open_source(output.getvalue())


def test_pdf_resource_named_a_is_not_an_action():
    writer = PdfWriter()
    page = writer.add_blank_page(width=595, height=842)
    page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({
        NameObject('/A'): DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})})})
    output = io.BytesIO()
    writer.write(output)
    assert open_source(output.getvalue())


@pytest.mark.parametrize('bank', ['FR7600000000000000000000000', 'FR76 0000 0000 0000 0000 0000 000', 'fr76\u202f0000\u202f0000\u202f0000\u202f0000\u202f0000\u202f000'])
def test_unlabelled_bank_identifiers_do_not_leave_the_local_reader(bank):
    assert evidence_lines('Fournisseur : FICTIF ' + bank) == []


@pytest.mark.parametrize('identifier', ['1 00 01 00 000 000 00', '1-00-01-2A-000-000-00', '2.00.01.2B.000.000.00'])
def test_unlabelled_social_identifiers_are_redacted(identifier):
    result = evidence_lines('Matricule : TEST ' + identifier)
    assert result and identifier not in result[0]['text'] and '[identifiant retiré]' in result[0]['text']


def test_non_sensitive_identifiers_remain_available_to_the_matcher():
    assert evidence_lines('Matricule : SAL-FICTIF\nPériode : 2026-01') == [
        {'line': 0, 'text': 'Matricule : SAL-FICTIF'}, {'line': 1, 'text': 'Période : 2026-01'}]


def test_pdf_inspection_and_preview_work_in_disposable_processes():
    raw = pdf_with_action('/URI')
    assert inspect_pdf(raw) == ('', 1)
    assert preview_pdf(raw).startswith(b'\xff\xd8\xff')


def test_reader_timeout_is_bounded_and_does_not_expose_parser_details():
    with patch('cdi_facturx.pdf_import.subprocess.run', side_effect=subprocess.TimeoutExpired('private command', 35)) as run:
        with pytest.raises(ValueError, match='délai autorisé'):
            inspect_pdf(pdf_with_action('/URI'))
    assert run.call_args.kwargs['timeout'] == 35
    assert run.call_args.args[0][1:3] == ['-m', 'cdi_facturx.pdf_read_worker']


def test_invalid_pdf_child_error_does_not_leak_embedded_content():
    with pytest.raises(ValueError) as failure:
        inspect_pdf(b'%PDF-1.7\nSYNTHETIC-PRIVATE-CONTENT')
    assert 'SYNTHETIC-PRIVATE-CONTENT' not in str(failure.value)
