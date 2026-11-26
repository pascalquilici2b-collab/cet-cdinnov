"""Keep the complete entered subjects in invoice/quote previews and exports."""

from copy import deepcopy
import re

import pymupdf as fitz
import pytest

from cdi_facturx.document_pdf import render_document
from tests import test_document_pdf as pdf_checks


def subject_fixture(kind: str, case: str = "words") -> tuple[dict, dict]:
    document, totals = pdf_checks.fixture(kind)
    document["seller"].update(
        siren="322556580", siret="32255658000000",
        name="Conseil Développement Innovation",
    )
    if case == "words":
        sentence = "Étude & accompagnement <Corse> : coordination des partenaires européens. "
        title = ("OBJET-DÉBUT " + sentence * 8)[:289] + " OBJET-FIN."
        market_object = ("MARCHÉ-DÉBUT " + sentence * 8)[:488] + " MARCHÉ-FIN."
    elif case == "unbroken":
        title = "T" * 289 + "-OBJET-FIN."
        market_object = "M" * 488 + "-MARCHÉ-FIN."
    else:
        # Together, the subjects exceed a page at the normal font size.
        title = "\n".join(f"Titre{i:02}" for i in range(36)) + " FIN"
        market_object = "\n".join(f"Ligne{i:02}" for i in range(62)) + " FIN"
    assert len(title) <= 300 and len(market_object) <= 500
    document["title"] = title
    document["details"] = {"marketObject": market_object}
    return document, totals


def body_text(pdf: bytes) -> str:
    """Remove repeating page furniture without discarding any subject line."""
    with fitz.open(stream=pdf, filetype="pdf") as opened:
        return "\n".join(
            span["text"]
            for page in opened
            for block in page.get_text("dict")["blocks"] if "lines" in block
            for line in block["lines"]
            for span in line["spans"]
            if 90 <= span["bbox"][1] < page.rect.height - 48
            and abs(span["size"] - 6.8) > 0.01
            and not re.fullmatch(r"Page \d+ / \d+", span["text"])
        )


@pytest.mark.parametrize("kind", ["invoice", "quote"])
@pytest.mark.parametrize("issued", [False, True], ids=["preview", "export"])
@pytest.mark.parametrize("case", ["words", "unbroken", "newlines"])
def test_complete_subjects_wrap_and_paginate_in_preview_and_export(kind, issued, case):
    document, totals = subject_fixture(kind, case)
    before = deepcopy(document)
    pdf = render_document(
        document, totals, number="TEST-SUBJECT-001" if issued else None,
        issued=issued, editable=not issued,
    )
    text = body_text(pdf)
    compact = lambda value: re.sub(r"\s+", "", value)
    for label, value in (
        ("Objet du document", document["title"]),
        ("Objet du marché", document["details"]["marketObject"]),
    ):
        assert text.count(label + " :") == 1
        assert compact(value) in compact(text)
    assert "Étude & développement <prototype>" in text
    assert "540,00 €" in text
    pages = pdf_checks.DocumentPDFTests().assert_page_layout(pdf)
    if case == "newlines":
        assert pages > 1
    with fitz.open(stream=pdf, filetype="pdf") as opened:
        links = [link.get("uri", "") for page in opened for link in page.get_links()]
        if issued:
            assert not links
        else:
            assert any(link.endswith("/title") for link in links)
            assert any(link.endswith("/details.marketObject") for link in links)
    assert document == before


@pytest.mark.parametrize("kind", ["invoice", "quote"])
def test_empty_subjects_do_not_print_empty_labels(kind):
    document, totals = pdf_checks.fixture(kind)
    document["title"] = ""
    document["details"] = {"marketObject": ""}
    text = body_text(render_document(document, totals))
    assert "Objet du document" not in text
    assert "Objet du marché" not in text
