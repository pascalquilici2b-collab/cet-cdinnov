"""Real PDF regression tests: text, glyphs, layout bounds and long pagination.

Run from facturx-service with ``python -m pytest tests/test_document_pdf.py``.
The optional ``--qa-output PATH`` script mode writes synthetic fixtures for
visual review. It does not contain or contact any live customer data.
"""

from __future__ import annotations

import argparse
from copy import deepcopy
from io import BytesIO
from pathlib import Path
import re
import unittest
from unittest.mock import patch

import pymupdf as fitz
from pypdf import PdfReader

from cdi_facturx.document_pdf import DocumentPDFError, render_document


def fixture(kind: str = "invoice") -> tuple[dict, dict]:
    party = {"name": "CDInnov Démonstration", "addressLine1": "12, rue de l'Énergie", "addressLine2": "Bâtiment A", "postalCode": "69000", "city": "Lyon", "country": "FR", "siren": "123456789", "siret": "12345678900012", "vatId": "FR12123456789", "email": "facturation@example.invalid", "legal": "SAS de démonstration - Capital : 10 000 €", "electronicAddress": "123456789", "electronicScheme": "0002"}
    buyer = {**party, "name": "Ateliers Réunis - Client de démonstration", "addressLine1": "8, avenue de la République", "postalCode": "75000", "city": "Paris", "legal": "Coordonnées de démonstration"}
    line = {"id": "10000000-0000-4000-8000-000000000001", "description": "Étude & développement <prototype> - cœur du système", "quantity": "2.5", "unitCode": "DAY", "unitPrice": "200", "discountPercent": "10", "vatRate": "20", "vatCategory": "S", "exemptionReason": ""}
    document = {"schemaVersion": 2, "kind": kind, "title": "Accompagnement technique - octobre 2026", "currency": "EUR", "issueDate": "2026-10-20", "dueDate": "2026-11-19", "validUntil": "2026-11-20", "clientId": "client-demo", "seller": party, "buyer": buyer, "lines": [line], "references": {"businessCode": "AFF-2026-0042", "marketId": "id-interne-non-commercial", "marketReference": "MARCHÉ-2026-15", "orderReference": "BC-000142", "project": "Prototype à faible énergie", "serviceCode": "SERVICE-45", "engagement": "EJ-2026-412"}, "paymentTerms": "Règlement à trente jours par virement.", "iban": "FR76 0000 0000 0000 0000 0000 000", "bic": "DEMOFR00XXX", "notes": "Données fictives destinées uniquement aux tests de présentation.", "paymentMeans": "58", "vatDue": "payment", "legalNotes": {"recovery": "Indemnité forfaitaire de recouvrement : 40 €.", "penalties": "Pénalités selon les conditions commerciales applicables.", "discount": "Pas d'escompte pour paiement anticipé."}}
    document["businessProcess"] = "S1"
    totals = {"lines": [{"id": line["id"], "netMinor": "45000", "discountMinor": "5000"}], "taxes": [{"category": "S", "rate": "20", "baseMinor": "45000", "taxMinor": "9000"}], "netMinor": "45000", "taxMinor": "9000", "grossMinor": "54000", "discountMinor": "5000"}
    return document, totals


def long_fixture() -> tuple[dict, dict]:
    document, _ = fixture("quote")
    template = document["lines"][0]
    document["lines"] = [{**template, "id": f"10000000-0000-4000-8000-{index:012}", "description": f"PRESTATION-{index:03} : Conseil technique, suivi et contrôle des éléments de production.", "quantity": "1", "unitPrice": "100", "discountPercent": "0"} for index in range(1, 201)]
    # One designation is taller than an entire page; it must split inside a row.
    document["lines"][42]["description"] = "LONGUE-DESIGNATION-DEBUT " + "Analyse détaillée des composants et vérification des interfaces. " * 60 + " LONGUE-DESIGNATION-FIN"
    document["notes"] = "NOTES-DEBUT " + "Chaque intervention inclut un compte rendu et une vérification des résultats. " * 110 + " NOTES-FIN"
    document["legalNotes"]["penalties"] = "MENTION-DEBUT " + "Les modalités contractuelles de règlement restent applicables. " * 30 + " MENTION-FIN"
    totals = {"lines": [{"id": row["id"], "netMinor": "10000", "discountMinor": "0"} for row in document["lines"]], "taxes": [{"category": "S", "rate": "20", "baseMinor": "2000000", "taxMinor": "400000"}], "netMinor": "2000000", "taxMinor": "400000", "grossMinor": "2400000", "discountMinor": "0"}
    return document, totals


def many_taxes_fixture() -> tuple[dict, dict]:
    document, _ = fixture()
    template = document["lines"][0]
    document["lines"] = [{**template, "id": f"20000000-0000-4000-8000-{index:012}", "description": f"TVA-GROUPE-{index:03}", "quantity": "1", "unitPrice": "100", "discountPercent": "0", "vatRate": f"{index // 100}.{index % 100:02}"} for index in range(1, 121)]
    totals = {"lines": [{"id": row["id"], "netMinor": "10000", "discountMinor": "0"} for row in document["lines"]], "taxes": [{"category": "S", "rate": row["vatRate"], "baseMinor": "10000", "taxMinor": str(index)} for index, row in enumerate(document["lines"], 1)], "netMinor": "1200000", "taxMinor": "7260", "grossMinor": "1207260", "discountMinor": "0"}
    return document, totals


def extract(pdf: bytes) -> str:
    return "\n".join(page.extract_text() for page in PdfReader(BytesIO(pdf)).pages)


class DocumentPDFTests(unittest.TestCase):
    def assert_page_layout(self, pdf: bytes) -> int:
        with fitz.open(stream=pdf, filetype="pdf") as opened:
            for page_index, page in enumerate(opened):
                self.assertAlmostEqual(page.rect.width, 595.2756, places=2)
                self.assertAlmostEqual(page.rect.height, 841.8898, places=2)
                self.assertIn(f"Page {page_index + 1} / {len(opened)}", page.get_text())
                spans = [span for block in page.get_text("dict")["blocks"] if "lines" in block for line in block["lines"] for span in line["spans"] if span["text"].strip()]
                for span in spans:
                    box = fitz.Rect(span["bbox"])
                    self.assertGreaterEqual(box.x0, 42.5, (page_index, span))
                    self.assertLessEqual(box.x1, page.rect.width - 42.5, (page_index, span))
                    self.assertGreater(box.y0, 34, (page_index, span))
                    self.assertLess(box.y1, page.rect.height - 15, (page_index, span))
                    # The body must never run through the footer rule.
                    if box.y0 > 90 and box.y0 < page.rect.height - 44:
                        self.assertLessEqual(box.y1, page.rect.height - 45, (page_index, span))
                for left_index, left in enumerate(spans):
                    lbox = fitz.Rect(left["bbox"])
                    for right in spans[left_index + 1:]:
                        rbox = fitz.Rect(right["bbox"])
                        overlap = lbox & rbox
                        self.assertFalse(overlap.width > 2 and overlap.height > 2, (page_index, left["text"], right["text"], tuple(overlap)))
            return len(opened)

    def test_complete_invoice_exact_amounts_accents_and_schema2_fields(self):
        document, totals = fixture()
        pdf = render_document(document, totals, number="FA-2026-00042", issued=True)
        text = re.sub(r"\s+", " ", extract(pdf))
        for value in ("FACTURE", "FA-2026-00042", "DOCUMENT ÉMIS", "20/10/2026", "19/11/2026", "450,00 €", "90,00 €", "540,00 €", "50,00 €", "Étude & développement <prototype>", "cœur du système", "AFF-2026-0042", "MARCHÉ-2026-15", "BC-000142", "SERVICE-45", "EJ-2026-412", "TVA exigible sur les encaissements", "Virement SEPA", "SIREN : 123456789", "Adresse électronique : 123456789 (0002)", "Indemnité forfaitaire de recouvrement : 40 €.", "Pas d'escompte pour paiement anticipé."):
            self.assertIn(value, text)
        self.assertNotIn("BROUILLON", text)
        self.assertNotIn(document["references"]["marketId"], text)
        self.assert_page_layout(pdf)
        with fitz.open(stream=pdf, filetype="pdf") as opened:
            self.assertTrue(any("DejaVuSans" in font[3] for page in opened for font in page.get_fonts()))
            self.assertTrue(all(font[1] == "ttf" for page in opened for font in page.get_fonts()))

    def test_quote_draft_dates_signature_and_no_misleading_totals(self):
        document, _ = fixture("quote")
        document["lines"][0]["unitPrice"] = ""
        pdf = render_document(document, None)
        text = extract(pdf)
        for value in ("DEVIS", "BROUILLON", "20/11/2026", "Bon pour accord", "Date, nom et signature du client", "Totaux indisponibles", "À calculer", "À compléter"):
            self.assertIn(value, text)
        self.assertNotIn("0,00 €", text)
        self.assertNotIn("19/11/2026", text)
        self.assert_page_layout(pdf)

    def test_200_rows_giant_description_and_long_terms_keep_all_content(self):
        document, totals = long_fixture()
        pdf = render_document(document, totals)
        text = extract(pdf)
        for index in range(1, 201):
            if index != 43:
                self.assertEqual(text.count(f"PRESTATION-{index:03}"), 1)
        for value in ("LONGUE-DESIGNATION-DEBUT", "LONGUE-DESIGNATION-FIN", "NOTES-DEBUT", "NOTES-FIN", "MENTION-DEBUT", "MENTION-FIN", "24 000,00 €", "Bon pour accord"):
            self.assertIn(value, text)
        self.assertGreater(self.assert_page_layout(pdf), 10)
        self.assertGreater(text.count("Désignation"), 5)

    def test_many_vat_groups_paginate_without_overflow(self):
        document, totals = many_taxes_fixture()
        pdf = render_document(document, totals, number="FA-2026-00043", issued=True)
        text = extract(pdf)
        self.assertEqual(text.count("TVA - "), 120)
        self.assertIn("12 072,60 €", text)
        self.assertGreater(self.assert_page_layout(pdf), 6)
        self.assertGreater(text.count("Catégorie / taux"), 3)

    def test_long_party_addresses_and_no_whitespace_tokens_are_wrapped(self):
        document, totals = fixture()
        document["seller"]["name"] = "SOCIETE" * 42
        document["seller"]["addressLine1"] = "Adresse particulièrement détaillée et descriptive " * 6
        document["seller"]["electronicAddress"] = "IDENTIFIANT" * 29
        document["buyer"]["legal"] = "Mentions publiques du client. " * 30 + " FIN-CLIENT"
        document["title"] = "Intitulé du document très détaillé " * 8
        document["lines"][0]["description"] = "LONG-TOKEN-" + "X" * 3900 + "-FIN-TOKEN"
        pdf = render_document(document, totals, number="F" * 80, issued=True)
        self.assertIn("FIN-CLIENT", extract(pdf))
        self.assertIn("FIN-TOKEN", extract(pdf))
        self.assert_page_layout(pdf)

    def test_vat_due_labels_match_actual_contract_values(self):
        document, totals = fixture()
        for key, label in (("invoice", "TVA exigible sur les débits"), ("payment", "TVA exigible sur les encaissements"), ("delivery", "TVA exigible à la livraison")):
            with self.subTest(key=key):
                document["vatDue"] = key
                self.assertIn(label, extract(render_document(document, totals)))

    def test_large_six_decimal_quantities_and_prices_do_not_split_numbers(self):
        document, _ = fixture()
        template = document["lines"][0]
        document["lines"] = [{**template, "quantity": "9999999999.999999", "unitPrice": "0.000001", "discountPercent": "0"}, {**template, "id": "10000000-0000-4000-8000-000000000002", "quantity": "0.000001", "unitPrice": "9999999999.999999", "discountPercent": "0"}]
        totals = {"lines": [{"id": line["id"], "netMinor": "1000000", "discountMinor": "0"} for line in document["lines"]], "taxes": [{"category": "S", "rate": "20", "baseMinor": "2000000", "taxMinor": "400000"}], "netMinor": "2000000", "taxMinor": "400000", "grossMinor": "2400000", "discountMinor": "0"}
        pdf = render_document(document, totals)
        text = extract(pdf)
        self.assertEqual(text.count("9999999999,999999"), 2)
        self.assertIn("24 000,00 €", text)
        self.assert_page_layout(pdf)

    def test_business_process_labels_match_contract_without_inventing_other_codes(self):
        document, totals = fixture()
        for key, label in (("S1", "Prestations de services"), ("B1", "Livraison de biens"), ("M1", "Biens et services"), ("S9", "S9")):
            with self.subTest(key=key):
                document["businessProcess"] = key
                self.assertIn("Mode de facturation : " + label, extract(render_document(document, totals)))

    def test_untrusted_markup_cannot_read_files_or_fetch_resources(self):
        document, totals = fixture()
        hostile = '<img src="https://example.invalid/private.png"/><link href="file:///secret">&</link>'
        document["notes"] = hostile
        with patch("urllib.request.urlopen", side_effect=AssertionError("Unexpected network request")):
            pdf = render_document(document, totals)
        text = re.sub(r"\s+", "", extract(pdf))
        self.assertIn(re.sub(r"\s+", "", hostile), text)
        with fitz.open(stream=pdf, filetype="pdf") as opened:
            self.assertTrue(all(not page.get_images() and not page.get_links() for page in opened))

    def test_unsupported_glyphs_controls_and_unshaped_scripts_fail_explicitly(self):
        for char in ("🧾", "漢", "\x00", "\u202e", "ا", "\ud800"):
            document, totals = fixture()
            document["notes"] += char
            with self.subTest(char=repr(char)), self.assertRaisesRegex(DocumentPDFError, "non pris en charge"):
                render_document(document, totals)
        document, totals = fixture()
        document["notes"] = "Cafe\u0301 - Noe\u0308l"
        self.assertIn("Café - Noël", extract(render_document(document, totals)))

    def test_invalid_totals_never_render_a_plausible_amount(self):
        document, totals = fixture()
        variants = []
        for path, value in (("netMinor", "45001"), ("grossMinor", "54001"), ("discountMinor", "4999"), ("taxMinor", "-1")):
            row = deepcopy(totals)
            row[path] = value
            variants.append(row)
        missing_line = deepcopy(totals)
        missing_line["lines"] = []
        variants.append(missing_line)
        duplicate_group = deepcopy(totals)
        duplicate_group["taxes"] *= 2
        variants.append(duplicate_group)
        for variant in variants:
            with self.subTest(totals=variant), self.assertRaises(DocumentPDFError):
                render_document(document, variant)
        with self.assertRaises(DocumentPDFError):
            render_document(document, None, number="FA-2026-1", issued=True)
        with self.assertRaises(DocumentPDFError):
            render_document(document, totals, issued=True)

    def test_render_is_deterministic_and_does_not_mutate_input(self):
        document, totals = fixture()
        original = deepcopy((document, totals))
        pdf = render_document(document, totals, number="FA-2026-00042", issued=True)
        self.assertEqual(pdf, render_document(document, totals, number="FA-2026-00042", issued=True))
        self.assertEqual((document, totals), original)

    def test_limit_and_structure_errors_are_explicit(self):
        document, totals = fixture()
        for replacement in ({"currency": "USD"}, {"kind": "unknown"}, {"seller": []}, {"legalNotes": []}, {"references": []}, {"lines": [{"id": {}}]}, {"lines": [document["lines"][0]] * 201}):
            with self.subTest(replacement=replacement), self.assertRaises(DocumentPDFError):
                render_document({**document, **replacement}, totals)


def write_qa(output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    fixtures = (("invoice-short", fixture(), "FA-2026-00042", True), ("quote-draft", fixture("quote"), None, False), ("quote-200-lines", long_fixture(), None, False), ("invoice-many-tax-groups", many_taxes_fixture(), "FA-2026-00043", True))
    for name, (document, totals), number, issued in fixtures:
        pdf = render_document(document, totals, number=number, issued=issued)
        path = output / f"{name}.pdf"
        path.write_bytes(pdf)
        with fitz.open(stream=pdf, filetype="pdf") as opened:
            # First/last and the oversized description's middle page are useful
            # visual artifacts; tests inspect bounds on every generated page.
            pages = sorted({0, len(opened) - 1, min(4, len(opened) - 1)})
            for index in pages:
                opened[index].get_pixmap(matrix=fitz.Matrix(1.4, 1.4), alpha=False).save(output / f"{name}-page-{index + 1}.png")
            print(f"{name}: {len(opened)} pages, {len(pdf)} bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--qa-output", type=Path)
    args, remaining = parser.parse_known_args()
    if args.qa_output:
        write_qa(args.qa_output)
    else:
        unittest.main(argv=[__file__, *remaining])
