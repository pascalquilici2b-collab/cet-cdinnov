from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated, Literal
import re

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator
from stdnum.fr import siren, siret, tva
from stdnum import iban
from stdnum.eu import vat

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
Money = Annotated[Decimal, Field(ge=0, max_digits=16, decimal_places=2, allow_inf_nan=False)]
SignedMoney = Annotated[Decimal, Field(max_digits=16, decimal_places=2, allow_inf_nan=False)]
Quantity = Annotated[Decimal, Field(gt=0, max_digits=16, decimal_places=6, allow_inf_nan=False)]
Price = Annotated[Decimal, Field(ge=0, max_digits=16, decimal_places=6, allow_inf_nan=False)]


def money(value: Decimal) -> Decimal:
    return value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


class Model(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Party(Model):
    name: Text
    street: Text
    postal_code: Text
    city: Text
    country: Annotated[str, Field(pattern=r'^[A-Z]{2}$')] = 'FR'
    siren: str | None = None
    siret: str | None = None
    vat_number: str | None = None
    electronic_address: str | None = None
    electronic_scheme: str | None = None
    contact_email: Annotated[str, Field(pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')] | None = None

    @field_validator('siren', 'siret', 'vat_number', mode='before')
    @classmethod
    def compact(cls, value):
        return re.sub(r'\s', '', value).upper() or None if isinstance(value, str) else value

    @model_validator(mode='after')
    def identifiers(self):
        if self.siret and not siret.is_valid(self.siret):
            raise ValueError('SIRET invalide (14 chiffres et clé de contrôle).')
        if self.siret:
            if self.siren and self.siren != self.siret[:9]:
                raise ValueError('Le SIRET ne correspond pas au SIREN.')
            self.siren = self.siret[:9]
        if self.siren and not siren.is_valid(self.siren):
            raise ValueError('SIREN invalide (9 chiffres et clé de contrôle).')
        if self.country == 'FR' and not self.siren:
            raise ValueError('SIREN ou SIRET requis pour une entreprise française.')
        if self.vat_number:
            if self.vat_number.startswith('FR'):
                if not tva.is_valid(self.vat_number):
                    raise ValueError('Numéro de TVA français invalide.')
                if self.siren and self.vat_number[-9:] != self.siren:
                    raise ValueError('Le numéro de TVA ne correspond pas au SIREN.')
            elif not vat.is_valid(self.vat_number):
                raise ValueError('Cette version accepte les identifiants TVA de l’Union européenne.')
        if bool(self.electronic_address) != bool(self.electronic_scheme):
            raise ValueError('Adresse électronique de facturation et schéma doivent être renseignés ensemble.')
        if self.electronic_scheme == '0225' and (not re.fullmatch(r'\d{9}(?:_[A-Za-z0-9_-]+)?',self.electronic_address or '') or (self.siren and not self.electronic_address.startswith(self.siren))):
            raise ValueError('Le code 0225 nécessite le SIREN de cette entreprise, éventuellement suivi d’un suffixe. Pour une adresse e-mail, utilisez EM.')
        if self.electronic_scheme == 'EM' and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',self.electronic_address or ''):
            raise ValueError('Le code EM nécessite une adresse e-mail valide.')
        return self


class Line(Model):
    description: Text
    quantity: Quantity
    unit_price: Price
    unit: Annotated[str, Field(pattern=r'^[A-Z0-9]{2,3}$')] = 'C62'
    vat_category: Literal['S', 'Z', 'E', 'AE', 'O'] = 'S'
    vat_rate: Annotated[Decimal, Field(ge=0, le=100, max_digits=5, decimal_places=2)] = Decimal('20')
    exemption_reason: Text | None = None

    @model_validator(mode='after')
    def tax(self):
        if self.vat_category == 'S' and self.vat_rate <= 0:
            raise ValueError('Une TVA standard nécessite un taux strictement positif.')
        if self.vat_category != 'S' and self.vat_rate != 0:
            raise ValueError('Le taux doit être nul pour cette catégorie de TVA.')
        if self.vat_category in ('E', 'AE', 'O') and not self.exemption_reason:
            raise ValueError('Précisez le motif d’exonération, d’autoliquidation ou de hors champ.')
        if self.vat_category in ('S', 'Z') and self.exemption_reason:
            raise ValueError('Pas de motif d’exonération pour une TVA standard ou à taux zéro.')
        return self


class Payment(Model):
    means_code: Literal['30', '58', '10', '48'] = '30'
    due_date: date | None = None
    terms: Text | None = None
    iban: str | None = None
    bic: str | None = None
    prepaid: Money = Decimal('0')
    vat_due: Literal['invoice', 'payment', 'delivery'] | None = None

    @field_validator('iban', 'bic', mode='before')
    @classmethod
    def compact(cls, value):
        return re.sub(r'\s', '', value).upper() or None if isinstance(value, str) else value

    @model_validator(mode='after')
    def account(self):
        if self.means_code in ('30', '58') and not self.iban:
            raise ValueError('IBAN requis pour un paiement par virement.')
        if self.iban and not iban.is_valid(self.iban):
            raise ValueError('IBAN invalide.')
        if self.bic and not re.fullmatch(r'[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?', self.bic):
            raise ValueError('BIC invalide.')
        return self


class Totals(Model):
    net: Money
    vat: Money
    gross: Money
    due: Money
    rounding: SignedMoney = Decimal('0')


class Notes(Model):
    recovery: Text
    penalties: Text
    discount: Text
    description: Text | None = None


class Invoice(Model):
    number: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=35)]
    issue_date: date
    type_code: Literal['380', '381'] = '380'
    currency: Literal['EUR'] = 'EUR'
    seller: Party
    buyer: Party
    lines: Annotated[list[Line], Field(min_length=1, max_length=500)]
    payment: Payment
    totals: Totals
    notes: Notes
    buyer_reference: Text | None = None
    order_reference: Text | None = None
    contract_reference: Text | None = None
    preceding_invoice: Text | None = None
    preceding_invoice_date: date | None = None
    business_process: Text | None = None

    def calculated(self):
        groups = {}
        for line in self.lines:
            key = (line.vat_category, line.vat_rate)
            group = groups.setdefault(key, {'base': Decimal('0'), 'reason': line.exemption_reason})
            if group['reason'] != line.exemption_reason:
                raise ValueError('Un même groupe de TVA doit avoir un motif d’exonération unique.')
            group['base'] += money(line.quantity * line.unit_price)
        net = sum((g['base'] for g in groups.values()), Decimal('0'))
        taxes = sum((money(g['base'] * key[1] / 100) for key, g in groups.items()), Decimal('0'))
        gross = net + taxes
        return {'net': net, 'vat': taxes, 'gross': gross, 'due': gross + self.totals.rounding - self.payment.prepaid}, groups

    @model_validator(mode='after')
    def consistency(self):
        computed, _ = self.calculated()
        for key, expected in computed.items():
            if getattr(self.totals, key) != expected:
                raise ValueError(f'Total {key} incohérent : saisi {getattr(self.totals, key):.2f}, calculé {expected:.2f}.')
        if self.payment.due_date and self.payment.due_date < self.issue_date:
            raise ValueError('La date d’échéance précède la date de facture.')
        if self.totals.due>0 and not self.payment.due_date and not self.payment.terms:
            raise ValueError('Précisez une échéance ou les conditions de paiement.')
        if self.type_code == '381' and (not self.preceding_invoice or not self.preceding_invoice_date):
            raise ValueError('Un avoir doit référencer le numéro et la date de la facture corrigée ; ses montants sont positifs.')
        if self.preceding_invoice_date and self.preceding_invoice_date > self.issue_date:
            raise ValueError('La date de la facture corrigée ne peut pas être postérieure au document.')
        if any(l.vat_category == 'S' for l in self.lines) and not self.seller.vat_number:
            raise ValueError('Numéro de TVA vendeur requis pour la TVA standard.')
        if any(l.vat_category == 'AE' for l in self.lines) and not self.buyer.vat_number:
            raise ValueError('Numéro de TVA acheteur requis pour l’autoliquidation.')
        if any(l.vat_category == 'O' for l in self.lines):
            if any(l.vat_category != 'O' for l in self.lines) or self.seller.vat_number or self.buyer.vat_number:
                raise ValueError('Hors champ : aucune autre catégorie ni identification TVA ne doit être présente.')
        return self


class GenerationRequest(Model):
    profile: Literal['en16931', 'basic', 'basicwl'] = 'en16931'
    invoice: Invoice
    source_sha256: Annotated[str, Field(pattern=r'^[a-f0-9]{64}$')]
    reviewed: Literal[True]
    source_corrections: list[Literal['number','issue_date','totals.net','totals.vat','totals.gross','totals.rounding','totals.due','seller.siret','payment.iban']] = Field(default_factory=list, max_length=9)
