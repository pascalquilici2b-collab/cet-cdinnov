"""Draft storage contract, independent of the stricter issued Invoice contract.

The renderer never accepts caller-provided totals. Integer arithmetic follows the
portal's billing-domain.ts: round each discounted line once, then VAT per group.
"""
import re
import unicodedata
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator, model_serializer
from datetime import date
from .document_annotations import DocumentAnnotation, validate_annotations


def text(maximum):
    return Annotated[str, StringConstraints(max_length=maximum)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

    @field_validator('*', mode='before')
    @classmethod
    def safe_text(cls, value):
        if isinstance(value, str):
            if re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', value):
                raise ValueError('Caractère de contrôle non autorisé.')
            return unicodedata.normalize('NFC', value)
        return value


class DraftParty(StrictModel):
    name: text(300)
    addressLine1: text(300)
    addressLine2: text(300)
    postalCode: text(300)
    city: text(300)
    country: text(2)
    siren: text(300)
    siret: text(30)
    vatId: text(40)
    email: text(300)
    legal: text(1000)
    electronicAddress: text(300)
    electronicScheme: text(300)


class DraftLine(StrictModel):
    id: Annotated[str, Field(pattern=r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')]
    description: text(4000)
    quantity: text(40)
    unitCode: text(3)
    unitPrice: text(40)
    discountPercent: text(40)
    vatRate: text(40)
    vatCategory: Literal['S', 'Z', 'E', 'AE', 'O']
    exemptionReason: text(1000)

    @field_validator('id')
    @classmethod
    def normalized_id(cls, value):
        return value.lower()


class DraftReferences(StrictModel):
    businessCode: text(300)
    marketId: text(300)
    marketReference: text(300)
    orderReference: text(300)
    project: text(300)
    serviceCode: text(300)
    engagement: text(300)
    projectId: text(300) = ""
    orderId: text(300) = ""
    quoteNumber: text(300) = ""

    @model_serializer(mode='wrap')
    def original_shape(self, handler):
        value = handler(self)
        for key in ("projectId", "orderId", "quoteNumber"):
            if key not in self.model_fields_set:
                value.pop(key, None)
        return value


class DraftLegalNotes(StrictModel):
    recovery: text(2000)
    penalties: text(2000)
    discount: text(2000)


def decimal(value: str, places: int) -> int:
    value = value.strip().replace(',', '.')
    if not re.fullmatch(r'[0-9]{1,10}(?:\.[0-9]{1,' + str(places) + '})?', value):
        raise ValueError('Nombre décimal incomplet ou invalide.')
    whole, _, fraction = value.partition('.')
    return int(whole) * 10 ** places + int(fraction.ljust(places, '0'))


def rounded(value: int, denominator: int) -> int:
    return (value + denominator // 2) // denominator


class CreditReference(StrictModel):
    invoiceId: Annotated[str, Field(pattern=r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')]
    invoiceVersion: Annotated[int, Field(ge=1, le=9007199254740991)]
    invoiceNumber: text(35)
    invoiceDate: text(10)
    reason: text(2000)

    @field_validator('invoiceId')
    @classmethod
    def normalized_id(cls, value):
        return value.lower()

    @model_validator(mode='after')
    def identity(self):
        if not self.invoiceNumber.strip() or re.search(r'[\x00-\x1f\x7f]', self.invoiceNumber) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', self.invoiceDate) or date.fromisoformat(self.invoiceDate).year < 1900:
            raise ValueError('Numéro et date de la facture corrigée requis.')
        return self


class DraftIntervention(StrictModel):
    id: text(36)
    priceId: text(80)
    label: text(300)
    description: text(4000)
    days: text(40)


class DraftDetails(StrictModel):
    marketObject: text(500)
    period: Literal['', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']
    periods: Annotated[list[Literal['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']], Field(max_length=8)] = Field(default_factory=list)
    personInCharge: text(300)
    fundingProgramme: text(160)
    validityMonths: text(3)
    returnEmail: text(300)
    interventions: Annotated[list[DraftIntervention], Field(max_length=200)]

    @model_serializer(mode='wrap')
    def preserve_legacy_period(self, handler):
        result = handler(self)
        if 'periods' not in self.model_fields_set:
            result.pop('periods', None)
        return result


class DraftDocument(StrictModel):
    annotations: Annotated[list[DocumentAnnotation], Field(max_length=80)] = Field(default_factory=list)
    description: text(4000) = ''
    details: DraftDetails | None = None
    schemaVersion: Literal[2, 3]
    creditNote: CreditReference | None = None
    kind: Literal['invoice', 'quote']
    title: text(300)
    currency: Literal['EUR']
    issueDate: text(10)
    dueDate: text(10)
    validUntil: text(10)
    clientId: text(200)
    seller: DraftParty
    buyer: DraftParty
    lines: Annotated[list[DraftLine], Field(max_length=200)]
    references: DraftReferences
    paymentTerms: text(4000)
    iban: text(50)
    bic: text(20)
    notes: text(10000)
    paymentMeans: Literal['30', '58', '10', '48']
    vatDue: Literal['', 'invoice', 'payment', 'delivery']
    businessProcess: Literal['', 'B1', 'S1', 'M1', 'B2', 'S2', 'M2', 'S3', 'B4', 'S4', 'M4', 'S5', 'S6', 'B7', 'S7', 'B8', 'S8', 'M8', 'B9', 'S9', 'M9']
    legalNotes: DraftLegalNotes

    @model_validator(mode='after')
    def unique_lines(self):
        validate_annotations([a.model_dump() for a in self.annotations])
        if self.schemaVersion == 2 and 'creditNote' in self.model_fields_set:
            raise ValueError('Les documents v2 ne comportent pas de référence d’avoir.')
        if self.schemaVersion == 3 and (self.kind != 'invoice' or self.creditNote is None):
            raise ValueError('Le document v3 doit être un avoir rattaché à une facture.')
        if len({line.id for line in self.lines}) != len(self.lines):
            raise ValueError('Identifiant de ligne en double.')
        return self

    @model_serializer(mode='wrap')
    def preserve_versioned_shape(self, handler):
        result = handler(self)
        if self.schemaVersion == 2:
            result.pop('creditNote', None)
        if 'details' not in self.model_fields_set:
            result.pop('details', None)
        if 'annotations' not in self.model_fields_set:
            result.pop('annotations', None)
        if 'description' not in self.model_fields_set:
            result.pop('description', None)
        return result

    def calculated(self):
        groups, lines = {}, []
        net = discount = 0
        limit = 99999999999999
        for line in self.lines:
            quantity, price = decimal(line.quantity, 6), decimal(line.unitPrice, 6)
            rate, reduction = decimal(line.vatRate, 2), decimal(line.discountPercent, 2)
            if rate > 10000 or reduction > 10000:
                raise ValueError('Taux au-delà de 100 %.')
            if (line.vatCategory == 'S' and rate == 0) or (line.vatCategory != 'S' and rate != 0):
                raise ValueError('Taux incompatible avec la catégorie de TVA.')
            base = quantity * price
            line_net = rounded(base * (10000 - reduction), 100000000000000)
            undiscounted = rounded(base, 10000000000)
            if line_net > limit or undiscounted > limit:
                raise ValueError('Montant trop élevé.')
            line_discount = undiscounted - line_net
            key, reason = (line.vatCategory, rate), line.exemptionReason.strip()
            previous = groups.get(key)
            if previous and previous['reason'] != reason:
                raise ValueError('Motifs différents pour un même groupe de TVA.')
            groups[key] = {'base': (previous['base'] if previous else 0) + line_net, 'reason': reason}
            lines.append({'id': line.id, 'netMinor': str(line_net), 'discountMinor': str(line_discount)})
            net += line_net
            discount += line_discount
        tax, taxes = 0, []
        for (category, rate), group in sorted(groups.items()):
            amount = rounded(group['base'] * rate, 10000)
            rate_text = str(rate // 100) + ('.' + str(rate % 100).zfill(2).rstrip('0') if rate % 100 else '')
            taxes.append({'category': category, 'rate': rate_text, 'baseMinor': str(group['base']), 'taxMinor': str(amount)})
            tax += amount
        if net + tax > limit:
            raise ValueError('Total trop élevé.')
        return {'lines': lines, 'taxes': taxes, 'netMinor': str(net), 'taxMinor': str(tax), 'grossMinor': str(net + tax), 'discountMinor': str(discount)}

    def draft_totals(self):
        try:
            return self.calculated()
        except ValueError:
            return None


class InterventionReportRequest(StrictModel):
    document: DraftDocument
    number: str = Field(min_length=1, max_length=80)
    reportDate: str = Field(pattern=r'^\d{4}-\d{2}-\d{2}$')


class PreviewRequest(StrictModel):
    document: DraftDocument
    editable: bool = False
    number: str | None = Field(default=None, max_length=35, pattern=r'^[A-Za-z0-9_/-]+$')
