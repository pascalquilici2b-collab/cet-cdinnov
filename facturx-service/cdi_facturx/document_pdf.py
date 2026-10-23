"""Paginated, self-contained commercial PDFs from the portal document model.

This module only lays out already calculated amounts. It neither issues document
numbers nor contacts an external service. Its output is the source PDF for the
existing Factur-X conversion pipeline; it is not itself a PDF/A or Factur-X file.
"""

from __future__ import annotations

from datetime import date
from io import BytesIO
from pathlib import Path
import re
from threading import Lock
from typing import Any
import unicodedata
from xml.sax.saxutils import escape

from .document_annotations import validate_annotations, paint_annotations
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    LongTable,
    PageTemplate,
    PageBreak,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


class DocumentPDFError(ValueError):
    """The document cannot be represented faithfully as a commercial PDF."""


_FONT_NAME = "CDIDejaVuSans"
_FONT_PATH = Path(__file__).parent / "assets" / "fonts" / "DejaVuSans.ttf"
_LOGO_PATH = Path(__file__).parent / "assets" / "brand" / "cdinnov-logo.png"
_FONT_LOCK = Lock()
_FONT_CHARS: frozenset[int] | None = None
_INK = colors.HexColor("#183643")
_MUTED = colors.HexColor("#526874")
_ACCENT = colors.HexColor("#166579")
_PALE = colors.HexColor("#eef5f6")
_RULE = colors.HexColor("#d6e3e6")
_PAGE_W, _PAGE_H = A4
_MARGIN = 43.0
_WIDTH = _PAGE_W - 2 * _MARGIN
_UNITS = {"DAY": "jour", "HUR": "heure", "C62": "unité", "KMT": "km", "KGM": "kg", "MTR": "m", "MTK": "m²", "LTR": "litre", "MON": "mois", "ANN": "année"}
_VAT = {"S": "TVA", "Z": "Taux zéro", "E": "Exonération", "AE": "Autoliquidation", "O": "Hors champ"}
_MEANS = {"30": "Virement", "58": "Virement SEPA", "49": "Prélèvement", "59": "Prélèvement SEPA", "48": "Carte bancaire", "10": "Espèces", "20": "Chèque", "transfer": "Virement", "card": "Carte bancaire", "cheque": "Chèque", "cash": "Espèces", "direct_debit": "Prélèvement"}
_VAT_DUE = {"invoice": "TVA exigible sur les débits", "payment": "TVA exigible sur les encaissements", "delivery": "TVA exigible à la livraison"}
_PROCESS = {"S1": "Prestations de services", "B1": "Livraison de biens", "M1": "Biens et services"}


def _table_style(commands: list[tuple]) -> TableStyle:
    return TableStyle([("FONTNAME", (0, 0), (-1, -1), _FONT_NAME), *commands])


def _font_chars() -> frozenset[int]:
    global _FONT_CHARS
    if _FONT_CHARS is None:
        with _FONT_LOCK:
            if _FONT_CHARS is None:
                font = TTFont(_FONT_NAME, str(_FONT_PATH))
                pdfmetrics.registerFont(font)
                # Use the same embedded face for every weight: no system fallback.
                pdfmetrics.registerFontFamily(_FONT_NAME, normal=_FONT_NAME, bold=_FONT_NAME, italic=_FONT_NAME, boldItalic=_FONT_NAME)
                _FONT_CHARS = frozenset(code for code, glyph in font.face.charToGlyph.items() if glyph)
    return _FONT_CHARS


def _checked_text(value: Any, path: str) -> str:
    if not isinstance(value, str):
        raise DocumentPDFError(f"{path}: une chaîne de caractères est attendue.")
    value = unicodedata.normalize("NFC", value.replace("\r\n", "\n").replace("\r", "\n"))
    chars = _font_chars()
    for char in value:
        if char in "\n\t":
            continue
        # Arabic/RTL scripts need shaping/bidi support. Do not silently emit
        # incorrect order, unshaped glyphs, invisible controls or tofu squares.
        if (ord(char) not in chars or unicodedata.category(char) in {"Cc", "Cf", "Cs", "Mn", "Me", "Zl", "Zp"}
                or unicodedata.bidirectional(char) in {"R", "AL", "AN"}):
            raise DocumentPDFError(f"{path}: caractère U+{ord(char):04X} non pris en charge par le PDF.")
    return value


def _check_tree(value: Any, path: str = "document", depth: int = 0) -> int:
    if depth > 12:
        raise DocumentPDFError("Document trop imbriqué.")
    if isinstance(value, str):
        _checked_text(value, path)
        return len(value)
    if isinstance(value, dict):
        return sum(_check_tree(item, f"{path}.{key}", depth + 1) for key, item in value.items())
    if isinstance(value, list):
        return sum(_check_tree(item, f"{path}[{i}]", depth + 1) for i, item in enumerate(value))
    if value is None or isinstance(value, (int, bool)):
        return 0
    raise DocumentPDFError(f"{path}: type de donnée non pris en charge.")


def _text(value: Any, fallback: str = "") -> str:
    return value if isinstance(value, str) and value.strip() else fallback


def _markup(value: str) -> str:
    # No document content is ever interpreted as ReportLab markup or a URL.
    value = unicodedata.normalize("NFC", value.replace("\r\n", "\n").replace("\r", "\n"))
    return escape(value).replace("\t", "    ").replace("\n", "<br/>")


def _amount(raw: Any) -> int:
    if not isinstance(raw, str) or not re.fullmatch(r"\d{1,14}", raw):
        raise DocumentPDFError("Un montant calculé en centimes est invalide.")
    return int(raw)


def _money(raw: Any) -> str:
    amount = _amount(raw)
    whole, cents = divmod(amount, 100)
    return f"{whole:,}".replace(",", " ") + f",{cents:02d} €"


def _decimal(raw: Any, *, percentage: bool = False) -> str:
    value = _text(raw).strip().replace(".", ",")
    # Invalid/unfinished input in a draft is rendered verbatim, never replaced
    # with a plausible zero. Issued documents have been validated by the caller.
    return (value + (" %" if percentage else "")) if value else "À compléter"


def _date(raw: Any) -> str:
    value = _text(raw)
    if not value:
        return "À compléter"
    try:
        parsed = date.fromisoformat(value)
        return parsed.strftime("%d/%m/%Y")
    except ValueError:
        return value


def _styles() -> dict[str, ParagraphStyle]:
    common = dict(fontName=_FONT_NAME, textColor=_INK, fontSize=9, leading=13, spaceAfter=3, splitLongWords=1, allowWidows=0, allowOrphans=0)
    base = ParagraphStyle("base", **common)
    return {
        "body": base,
        "small": ParagraphStyle("small", parent=base, fontSize=8, leading=11, spaceAfter=1),
        "muted": ParagraphStyle("muted", parent=base, fontSize=8, leading=11, textColor=_MUTED),
        "heading": ParagraphStyle("heading", parent=base, fontSize=10, leading=14, textColor=_ACCENT, spaceBefore=12, spaceAfter=6, keepWithNext=1),
        "title": ParagraphStyle("title", parent=base, fontSize=17, leading=22, spaceAfter=12),
        "cell": ParagraphStyle("cell", parent=base, fontSize=8, leading=11, spaceAfter=0),
        "numeric": ParagraphStyle("numeric", parent=base, fontSize=7.5, leading=10.5, alignment=TA_RIGHT, spaceAfter=0),
        "tablehead": ParagraphStyle("tablehead", parent=base, fontSize=7.2, leading=10, textColor=colors.white, spaceAfter=0),
        "total": ParagraphStyle("total", parent=base, fontSize=14, leading=18, alignment=TA_RIGHT, spaceAfter=0),
        "footer": ParagraphStyle("footer", parent=base, fontSize=6.8, leading=9, alignment=TA_CENTER, textColor=_MUTED),
        "legal": ParagraphStyle("legal", parent=base, fontSize=7, leading=9, textColor=_MUTED),
    }


class _DocumentCanvas(Canvas):
    """Write total page counts without a second document layout pass."""

    def __init__(self, *args: Any, **kwargs: Any):
        self._document_additions = kwargs.pop('document_additions', [])
        kwargs.update(invariant=1, pageCompression=1, initialFontName=_FONT_NAME)
        super().__init__(*args, **kwargs)
        self._saved_pages: list[dict[str, Any]] = []

    def showPage(self) -> None:  # noqa: N802 - ReportLab API
        self._saved_pages.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        count = len(self._saved_pages)
        for state in self._saved_pages:
            self.__dict__.update(state)
            try:
                paint_annotations(self, self._document_additions, count, _FONT_NAME)
            except ValueError as exc:
                raise DocumentPDFError(str(exc)) from exc
            self.saveState()
            self.setFont(_FONT_NAME, 8)
            self.setFillColor(_MUTED)
            self.drawRightString(_PAGE_W - _MARGIN, 24, f"Page {self._pageNumber} / {count}")
            self.restoreState()
            super().showPage()
        super().save()


def _validate_totals(document: dict, totals: dict | None, issued: bool) -> dict[str, dict]:
    if totals is None:
        if issued:
            raise DocumentPDFError("Les totaux validés sont nécessaires pour un document émis.")
        return {}
    if not isinstance(totals, dict) or not isinstance(totals.get("lines"), list) or not isinstance(totals.get("taxes"), list):
        raise DocumentPDFError("La structure des totaux est invalide.")
    if len(totals["taxes"]) > 200:
        raise DocumentPDFError("Le document dépasse 200 groupes de TVA.")
    by_id: dict[str, dict] = {}
    for row in totals["lines"]:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str) or row["id"] in by_id:
            raise DocumentPDFError("Les totaux de lignes sont invalides ou dupliqués.")
        _amount(row.get("netMinor"))
        _amount(row.get("discountMinor"))
        by_id[row["id"]] = row
    ids = [line.get("id") for line in document["lines"]]
    if len(set(ids)) != len(ids) or set(by_id) != set(ids):
        raise DocumentPDFError("Les totaux ne correspondent pas aux lignes du document.")
    for key in ("netMinor", "taxMinor", "grossMinor", "discountMinor"):
        _amount(totals.get(key))
    tax_base = tax_sum = 0
    tax_groups: set[tuple[str, str]] = set()
    for tax in totals["taxes"]:
        if not isinstance(tax, dict) or tax.get("category") not in _VAT or not isinstance(tax.get("rate"), str):
            raise DocumentPDFError("Un groupe de TVA est invalide.")
        group = (tax["category"], tax["rate"])
        if group in tax_groups:
            raise DocumentPDFError("Un groupe de TVA est dupliqué.")
        tax_groups.add(group)
        tax_base += _amount(tax.get("baseMinor"))
        tax_sum += _amount(tax.get("taxMinor"))
    net = _amount(totals["netMinor"])
    tax = _amount(totals["taxMinor"])
    if (sum(_amount(row["netMinor"]) for row in by_id.values()) != net
            or sum(_amount(row["discountMinor"]) for row in by_id.values()) != _amount(totals["discountMinor"])
            or tax_base != net or tax_sum != tax or net + tax != _amount(totals["grossMinor"])):
        raise DocumentPDFError("Les totaux du document sont incohérents.")
    return by_id


def render_document(document: dict, totals: dict | None, number: str | None = None, issued: bool = False, editable: bool = False) -> bytes:
    """Render a draft or issued invoice/quote, using authoritative cent totals.

    ``document`` is the versioned BillingDraft payload, not its storage envelope.
    The caller must validate issuance rules and allocate a number before passing
    ``issued=True``. Missing draft totals are visibly identified as unavailable.
    Unsupported glyphs and incoherent totals fail instead of corrupting content.
    """
    if not isinstance(document, dict) or document.get("kind") not in {"quote", "invoice"}:
        raise DocumentPDFError("Le type de document doit être facture ou devis.")
    if document.get("currency") != "EUR":
        raise DocumentPDFError("Le PDF prend actuellement en charge la devise EUR.")
    if not isinstance(document.get("lines"), list) or len(document["lines"]) > 200 or any(not isinstance(line, dict) for line in document["lines"]):
        raise DocumentPDFError("Le document doit contenir au plus 200 lignes.")
    if any(not isinstance(line.get("id"), str) for line in document["lines"]):
        raise DocumentPDFError("Les identifiants de lignes sont invalides.")
    for party in ("seller", "buyer"):
        if not isinstance(document.get(party), dict):
            raise DocumentPDFError(f"{party}: les coordonnées sont nécessaires.")
    for optional_object in ("references", "legalNotes"):
        if optional_object in document and not isinstance(document[optional_object], dict):
            raise DocumentPDFError(f"{optional_object}: un objet est attendu.")
    if _check_tree(document) + _check_tree(totals, "totals") > 300_000:
        raise DocumentPDFError("Le contenu du document dépasse la taille autorisée.")
    if number is not None:
        number = _checked_text(number, "number").strip()
        if len(number) > 80 or "\n" in number or "\t" in number:
            raise DocumentPDFError("Le numéro du document est invalide.")
    if issued and not number:
        raise DocumentPDFError("Un numéro est nécessaire pour un document émis.")
    by_id = _validate_totals(document, totals, issued)
    style = _styles()

    def p(value: str, variant: str = "body", field: str | None = None) -> Paragraph:
        markup = _markup(value)
        if editable and not issued and field and re.fullmatch(r'[A-Za-z0-9.]+', field):
            markup = f'<link href="https://editor.cdinnov.invalid/field/{field}">{markup}</link>'
        return Paragraph(markup, style[variant])

    def heading(value: str) -> Paragraph:
        return p(value, "heading")

    credit = document.get("creditNote")
    if credit is not None and (document.get("schemaVersion") != 3 or document["kind"] != "invoice" or not isinstance(credit, dict)):
        raise ValueError("Référence d’avoir invalide.")
    kind = "AVOIR" if credit else "FACTURE" if document["kind"] == "invoice" else "DEVIS"
    reference = number or "Numéro en préparation"
    seller = document["seller"]
    cdi = (seller.get("siren") or _text(seller.get("siret"))[:9]) == "322556580"
    footer_p = None
    footer_h = 0
    if cdi:
        footer_lines = [
            _text(seller.get("name")), _text(seller.get("legal")),
            " · ".join(filter(None, [_text(seller.get("addressLine1")), _text(seller.get("addressLine2")),
                                    " ".join(filter(None, [_text(seller.get("postalCode")), _text(seller.get("city"))]))])),
            " · ".join(f"{label}{seller[key]}" for key, label in (("siret", "SIRET "), ("vatId", "TVA "), ("email", "")) if _text(seller.get(key))),
        ]
        footer_p = p("\n".join(filter(None, footer_lines)), "footer")
        _, footer_h = footer_p.wrap(_WIDTH, _PAGE_H)
    bottom = max(48, 47 + footer_h)
    stream = BytesIO()
    pdf = BaseDocTemplate(stream, pagesize=A4, leftMargin=_MARGIN, rightMargin=_MARGIN, topMargin=91, bottomMargin=bottom,
                          title=f"{kind} {number or 'BROUILLON'}", author=_text(document["seller"].get("name")),
                          subject="Document commercial", allowSplitting=1)

    def page_frame(canvas: Canvas, doc: BaseDocTemplate) -> None:
        canvas.saveState()
        canvas.setStrokeColor(_ACCENT)
        canvas.setLineWidth(2)
        canvas.line(_MARGIN, _PAGE_H - 35, _PAGE_W - _MARGIN, _PAGE_H - 35)
        canvas.setFont(_FONT_NAME, 15)
        canvas.setFillColor(_INK)
        if cdi:
            canvas.drawImage(str(_LOGO_PATH), _MARGIN, _PAGE_H - 69, width=162, height=32, mask="auto")
            canvas.drawRightString(_PAGE_W - _MARGIN, _PAGE_H - 54, kind)
        else:
            canvas.drawString(_MARGIN, _PAGE_H - 59, kind)
        label = "DOCUMENT ÉMIS" if issued else "BROUILLON"
        canvas.setFillColor(_ACCENT)
        canvas.setFont(_FONT_NAME, 8)
        canvas.drawRightString(_PAGE_W - _MARGIN, _PAGE_H - (68 if cdi else 56), label)
        # The bounded number can wrap to two short lines without entering body.
        number_p = p(reference, "muted")
        _, number_h = number_p.wrap(_WIDTH - (190 if cdi else 0), 25)
        number_p.drawOn(canvas, _MARGIN + (190 if cdi else 0), _PAGE_H - (72 if cdi else 64) - number_h)
        canvas.setStrokeColor(_RULE)
        canvas.setLineWidth(0.5)
        canvas.line(_MARGIN, bottom - 9, _PAGE_W - _MARGIN, bottom - 9)
        if footer_p:
            footer_p.drawOn(canvas, _MARGIN, 34)
        canvas.setFont(_FONT_NAME, 7)
        canvas.setFillColor(_MUTED)
        footer = "EUR - Tous les montants sont exprimés en euros"
        if not issued:
            footer = "Brouillon - Document non émis"
        canvas.drawString(_MARGIN, 24, footer)
        canvas.restoreState()

    frame = Frame(_MARGIN, bottom, _WIDTH, _PAGE_H - 91 - bottom, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    pdf.addPageTemplates(PageTemplate(id="commercial", frames=[frame], onPage=page_frame))
    story: list[Any] = []

    if _text(document.get("title")):
        story.append(p(document["title"], "title", 'title'))
    meta = [("Date du document", _date(document.get("issueDate")))]
    if credit:
        meta.append(("Facture corrigée", _text(credit.get("invoiceNumber"))))
        meta.append(("Date de la facture corrigée", _date(credit.get("invoiceDate"))))
    if document["kind"] == "quote":
        meta.append(("Valable jusqu'au", _date(document.get("validUntil"))))
    elif not credit or document.get("dueDate"):
        meta.append(("Date prévue de règlement" if credit else "Date d'échéance", _date(document.get("dueDate"))))
    meta_fields={'Date du document':'issueDate',"Valable jusqu'au":'validUntil',"Date d'échéance":'dueDate'}
    metadata = Table([[p(label, "muted"), p(value, "small", meta_fields.get(label))] for label, value in meta], colWidths=[95, _WIDTH / 2 - 117] if cdi else [110, _WIDTH - 110])
    metadata.setStyle(_table_style([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    if not cdi:
        story.extend([metadata, Spacer(1, 12)])
    if credit:
        story.extend([heading("Motif de l’avoir"), p(_text(credit.get("reason"), "Motif à compléter")), Spacer(1, 10)])

    def party_content(party: dict, label: str) -> list[Paragraph]:
        prefix='buyer.' if label=='DESTINATAIRE' else None
        content = [p(label, "muted"), p(_text(party.get("name"), "Nom à compléter"), field=prefix+'name' if prefix else None)]
        for field in ("addressLine1", "addressLine2"):
            if _text(party.get(field)):
                content.append(p(party[field], "small", prefix+field if prefix else None))
        city = " ".join(_text(party.get(field)) for field in ("postalCode", "city")).strip()
        if city:
            content.append(p(city, "small", prefix+'city' if prefix else None))
        if not prefix and _text(party.get("country")):
            content.append(p(party["country"], "small"))
        for field, label in (("siret", "SIRET"), ("siren", "SIREN"), ("vatId", "TVA intracom."), ("email", "Courriel"), ("electronicAddress", "Adresse électronique")):
            if prefix and field in ('siret', 'siren', 'vatId', 'electronicAddress'):
                continue
            if _text(party.get(field)):
                suffix = ""
                if field == "electronicAddress" and _text(party.get("electronicScheme")):
                    suffix = f" ({party['electronicScheme']})"
                content.append(p(f"{label} : {party[field]}{suffix}", "small", prefix+field if prefix else None))
        # Legal information has its own splittable flow below, not a fixed box.
        return content

    parties = LongTable([[metadata if cdi else party_content(seller, "ÉMETTEUR"), party_content(document["buyer"], "DESTINATAIRE")]],
                        colWidths=[_WIDTH / 2, _WIDTH / 2], splitByRow=1, splitInRow=1)
    parties.setStyle(_table_style([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BACKGROUND", (0, 0), (-1, -1), colors.white if cdi else _PALE),
                                ("LEFTPADDING", (0, 0), (-1, -1), 11), ("RIGHTPADDING", (0, 0), (-1, -1), 11),
                                ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10)]))
    story.append(parties)
    references = document.get("references") or {}
    details = document.get("details") or {}
    ref_labels = (("quoteNumber", "Référence devis"), ("businessCode", "Code affaire"), ("marketReference", "Marché / contrat"), ("orderReference", "Commande"), ("project", "Projet"), ("serviceCode", "Service destinataire"), ("engagement", "Engagement"))
    shown_refs = [(label, _text(references.get(key)), 'references.'+key) for key, label in ref_labels if _text(references.get(key)) and (key != 'orderReference' or document['kind'] == 'invoice')]
    shown_refs += [(label, _text(details.get(key)), 'details.'+key) for key, label in (("marketObject", "Objet du marché"), ("personInCharge", "Personne en charge"), ("fundingProgramme", "Programme")) if _text(details.get(key))]
    periods = details.get('periods', [details['period']] if details.get('period') else [])
    numbers = [str(number) for number in range(1, 9) if f'S{number}' in periods]
    if numbers:
        label = ('Semestre ' + numbers[0]) if len(numbers) == 1 else ('Semestres ' + ', '.join(numbers[:-1]) + ' et ' + numbers[-1])
        shown_refs.append(('Périodes concernées' if len(numbers) > 1 else 'Période concernée', label, None))
    if shown_refs:
        story.append(heading("Références"))
        ref_cells = [p(f"{label} : {value}", "small", field) for label, value, field in shown_refs]
        if len(ref_cells) % 2:
            ref_cells.append("")
        ref_table = Table([ref_cells[i:i+2] for i in range(0, len(ref_cells), 2)], colWidths=[_WIDTH/2, _WIDTH/2], splitByRow=1, splitInRow=1)
        ref_table.setStyle(_table_style([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2)]))
        story.append(ref_table)

    story.append(heading("Prestations"))
    if _text(document.get('description')):
        story.extend([p(document['description'], 'body', 'description'), Spacer(1, 9)])
    labels = ("Désignation", "Qté", "Prix unit. HT", "Remise", "Taux TVA", "Montant HT")
    rows: list[list[Any]] = [[p(label, "tablehead") for label in labels]]
    numeric_widths = [43.0, 68.0, 45.0, 54.0, 82.0]
    for index, line in enumerate(document["lines"], 1):
        description = f"{index}. " + _text(line.get("description"), "Désignation à compléter")
        if _text(line.get("exemptionReason")):
            description += "\nMotif TVA : " + line["exemptionReason"]
        category = _text(line.get("vatCategory"))
        vat = _decimal(line.get("vatRate"), percentage=True)
        if category and category != "S":
            vat += "\n" + _VAT.get(category, category)
        quantity = _decimal(line.get("quantity"))
        unit = _text(line.get("unitCode"))
        if unit:
            quantity += "\n" + _UNITS.get(unit, unit)
        line_total = by_id.get(line.get("id"))
        # Expand financial columns for legitimate six-decimal values instead of
        # splitting a number between lines or reducing its font to unreadable size.
        for column, field in ((0, "quantity"), (1, "unitPrice")):
            if re.fullmatch(r"\d{1,10}(?:[.,]\d{1,6})?", _text(line.get(field)).strip()):
                displayed = _decimal(line[field]) + (" €" if field == "unitPrice" else "")
                numeric_widths[column] = max(numeric_widths[column], pdfmetrics.stringWidth(displayed, _FONT_NAME, 7.5) + 15)
        if line_total:
            numeric_widths[4] = max(numeric_widths[4], pdfmetrics.stringWidth(_money(line_total["netMinor"]), _FONT_NAME, 7.5) + 15)
        line_path=f'lines.{index-1}.'
        rows.append([p(description, "cell", line_path+'description'), p(quantity, "numeric", line_path+'quantity'), p(_decimal(line.get("unitPrice")) + " €", "numeric", line_path+'unitPrice'),
                     p(_decimal(line.get("discountPercent"), percentage=True), "numeric", line_path+'discountPercent'), p(vat, "numeric", line_path+'vatRate'),
                     p(_money(line_total["netMinor"]) if line_total else "À calculer", "numeric")])
    if not document["lines"]:
        rows.append([p("Aucune prestation renseignée", "cell"), "", "", "", "", ""])
    lines = LongTable(rows, colWidths=[_WIDTH - sum(numeric_widths), *numeric_widths], repeatRows=1, splitByRow=1, splitInRow=1, hAlign="LEFT")
    lines.setStyle(_table_style([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BACKGROUND", (0, 0), (-1, 0), _ACCENT),
                              ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7fafa")]),
                              ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                              ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                              ("LINEBELOW", (0, 1), (-1, -1), 0.35, _RULE)]))
    story.append(lines)

    if totals is not None:
        single_tax = cdi and len(totals["taxes"]) == 1
        if not single_tax:
            story.append(heading("Détail de la TVA"))
        tax_rows = [[p(label, "tablehead") for label in ("Catégorie / taux", "Base HT", "Montant TVA")]]
        for tax in totals["taxes"]:
            label = f"{_VAT[tax['category']]} - {_decimal(tax['rate'], percentage=True)}"
            tax_rows.append([p(label, "cell"), p(_money(tax["baseMinor"]), "numeric"), p(_money(tax["taxMinor"]), "numeric")])
        tax_table = LongTable(tax_rows, colWidths=[_WIDTH - 220, 110, 110], repeatRows=1, splitByRow=1, splitInRow=1)
        tax_table.setStyle(_table_style([("BACKGROUND", (0, 0), (-1, 0), _ACCENT), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                                      ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                                      ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                                      ("LINEBELOW", (0, 1), (-1, -1), 0.35, _RULE)]))
        if not single_tax:
            story.append(tax_table)
        tax_label = f"{_VAT[totals['taxes'][0]['category']]} {_decimal(totals['taxes'][0]['rate'], percentage=True)}" if single_tax else "Total TVA"
        total_rows = [[p("Total HT"), p(_money(totals["netMinor"]), "numeric")], [p(tax_label), p(_money(totals["taxMinor"]), "numeric")],
                      [p("MONTANT DE L’AVOIR TTC" if credit else "TOTAL TTC"), p(_money(totals["grossMinor"]), "total")]]
        if _amount(totals["discountMinor"]):
            total_rows.insert(0, [p("Remises incluses", "muted"), p(_money(totals["discountMinor"]), "numeric")])
        total_table = Table(total_rows, colWidths=[155, 145], hAlign="RIGHT")
        total_table.setStyle(_table_style([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 9),
                                        ("RIGHTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 6),
                                        ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("BACKGROUND", (0, -1), (-1, -1), _PALE)]))
        story.append(KeepTogether([Spacer(1, 12), total_table]))
    else:
        story.extend([Spacer(1, 12), p("Totaux indisponibles : compléter ou corriger les montants du brouillon.")])

    terms: list[tuple[str, str]] = []
    if _text(document.get("paymentMeans")):
        means = document["paymentMeans"]
        terms.append(("Mode de règlement", _MEANS.get(means, means)))
    if _text(document.get("paymentTerms")):
        terms.append(("Conditions de paiement", document["paymentTerms"]))
    for field, label in (("iban", "IBAN"), ("bic", "BIC")):
        if document['kind'] == 'invoice' and _text(document.get(field)):
            terms.append((label, document[field]))
    legal = document.get("legalNotes") or {}
    legal_terms: list[tuple[str, str]] = []
    if _text(document.get("vatDue")):
        due = document["vatDue"]
        legal_terms.append(("Exigibilité de la TVA", _VAT_DUE.get(due, due)))
    for field, label in (("recovery", "Indemnité de recouvrement"), ("penalties", "Pénalités de retard"), ("discount", "Escompte")):
        if _text(legal.get(field)):
            legal_terms.append((label, legal[field]))
    if terms:
        story.append(Spacer(1, 12))
        for label, value in terms:
            term_path='paymentTerms' if label == 'Conditions de paiement' else None
            story.append(p(f"{label} : {value}", "small", term_path))
            story.append(Spacer(1, 1 if cdi else 4))
    if legal_terms:
        legal_block: list[Any] = [Spacer(1, 4 * style['small'].leading if document['kind'] == 'invoice' and (document.get('iban') or document.get('bic')) else 12)]
        for label, value in legal_terms:
            path={'Indemnité de recouvrement':'legalNotes.recovery','Pénalités de retard':'legalNotes.penalties','Escompte':'legalNotes.discount'}.get(label)
            legal_block.extend([p(f"{label} : {value}", 'legal', path), Spacer(1, 1 if cdi else 4)])
        story.append(KeepTogether(legal_block))
    if _text(document.get("notes")):
        story.extend([heading("Informations complémentaires"), p(document["notes"], "small", 'notes')])
    if details.get('returnEmail'):
        story.append(p('À retourner à : ' + details['returnEmail'], 'small', 'details.returnEmail'))
    for party, label in (("seller", "Informations légales de l'émetteur"), ("buyer", "Informations du destinataire")):
        if party == "seller" and cdi:
            continue
        if _text(document[party].get("legal")):
            story.extend([heading(label), p(document[party]["legal"], "small")])
    if document["kind"] == "quote":
        signature = Table([[p("Bon pour accord", "body")], [p("Date, nom et signature du client", "muted")], [Spacer(1, 35)]], colWidths=[_WIDTH])
        signature.setStyle(_table_style([("BOX", (0, 0), (-1, -1), 0.6, _RULE), ("LEFTPADDING", (0, 0), (-1, -1), 12),
                                      ("TOPPADDING", (0, 0), (-1, 0), 10), ("BOTTOMPADDING", (0, -1), (-1, -1), 8)]))
        story.append(KeepTogether([Spacer(1, 16), signature]))
    if document['kind'] == 'invoice' and details.get('interventions'):
        story.extend([PageBreak(), p('Relevé d’intervention', 'title'), p(reference, 'muted')])
        if references.get('project'):
            story.append(p(references['project'], 'body'))
        report_rows = [[p(v, 'tablehead') for v in ('Prestation BPU', 'Travail effectué', 'Jours')]]
        for i, row in enumerate(details['interventions']):
            path=f'details.interventions.{i}.'
            report_rows.append([p(row['label'], 'cell', path+'label'), p(row['description'], 'cell', path+'description'), p(_decimal(row['days']), 'numeric', path+'days')])
        report = LongTable(report_rows, colWidths=[145, _WIDTH-195, 50], repeatRows=1, splitByRow=1, splitInRow=1)
        report.setStyle(_table_style([('BACKGROUND',(0,0),(-1,0),_ACCENT),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,1),(-1,-1),.35,_RULE)]))
        story.extend([Spacer(1,12),report])
    # ReportLab's safe default for external resources is not relied upon: all
    # paragraphs contain escaped text; font and logo are packaged local assets.
    try:
        additions = validate_annotations(document.get('annotations', []))
    except ValueError as exc:
        raise DocumentPDFError('Ajouts PDF invalides.') from exc
    pdf.build(story, canvasmaker=lambda *args, **kwargs: _DocumentCanvas(*args, document_additions=additions, **kwargs))
    return stream.getvalue()
