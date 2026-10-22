import type {BillingDraft,BillingParty} from './billing-contracts';
import {normalizeDraft,inspectBillingReadiness,calculateBilling} from './billing-domain.ts';

const optional=(v:string)=>v.trim()||null;
const compact=(v:string)=>v.replace(/\s/g,'').toUpperCase()||null;
const decimal=(v:string)=>{const [whole,fraction='']=v.trim().replace(',','.').split('.'),tail=fraction.replace(/0+$/,'');return whole.replace(/^0+(?=\d)/,'')+(tail?'.'+tail:'');};
const money=(minor:string)=>{const n=BigInt(minor);return String(n/100n)+'.'+String(n%100n).padStart(2,'0');};
const party=(p:BillingParty)=>({name:p.name.trim(),street:[p.addressLine1,p.addressLine2].filter(v=>v.trim()).join('\n'),
  postal_code:p.postalCode.trim(),city:p.city.trim(),country:p.country,siren:compact(p.siren),siret:compact(p.siret),
  vat_number:compact(p.vatId),contact_email:optional(p.email),electronic_address:optional(p.electronicAddress),electronic_scheme:optional(p.electronicScheme)});

/** Lossless adapter into the existing converter. Its Invoice/XSD/Schematron gates remain mandatory. */
export function invoiceForFacturX(raw:BillingDraft,number:string) {
  const d=normalizeDraft(raw),issues=inspectBillingReadiness(d);
  if(d.kind!=='invoice')issues.push({path:'kind',message:'Le Factur-X concerne une facture.'});
  if(typeof number!=='string'||!number.trim()||number.length>35||/[\x00-\x1f\x7f]/.test(number))issues.push({path:'number',message:'Un numéro de facture de 1 à 35 caractères est requis.'});
  if(issues.length)throw Object.assign(new Error('La facture doit être complétée avant son export Factur-X.'),{status:422,issues});
  return facturXSeed(d,number);
}
/** Incomplete electronic metadata is deliberately allowed when opening the converter. */
export function facturXSeed(raw:BillingDraft,number:string){
  const d=normalizeDraft(raw);
  const totals=calculateBilling(d);
  const description=[d.title,d.creditNote&&'Motif de l’avoir : '+d.creditNote.reason,d.notes,
    d.seller.legal&&'Mentions de l’émetteur : '+d.seller.legal,d.buyer.legal&&'Mentions du client : '+d.buyer.legal,
    d.references.businessCode&&'Code affaire : '+d.references.businessCode,d.references.project&&'Projet : '+d.references.project,
    d.references.engagement&&'Engagement : '+d.references.engagement].filter(Boolean).join('\n\n');
  return {number:number.trim(),issue_date:d.issueDate,type_code:d.creditNote?'381' as const:'380' as const,currency:d.currency,business_process:d.businessProcess,seller:party(d.seller),buyer:party(d.buyer),
    ...(d.creditNote?{preceding_invoice:d.creditNote.invoiceNumber.trim(),preceding_invoice_date:d.creditNote.invoiceDate}:{}),
    lines:d.lines.map(l=>({description:l.description.trim(),quantity:decimal(l.quantity),unit_price:decimal(l.unitPrice),discount_percent:decimal(l.discountPercent),unit:l.unitCode,vat_category:l.vatCategory,vat_rate:decimal(l.vatRate),exemption_reason:optional(l.exemptionReason)})),
    payment:{means_code:d.paymentMeans,due_date:optional(d.dueDate),terms:optional(d.paymentTerms),iban:compact(d.iban),bic:compact(d.bic),prepaid:'0.00',vat_due:d.vatDue||null},
    totals:{net:money(totals.netMinor),vat:money(totals.taxMinor),gross:money(totals.grossMinor),due:money(totals.grossMinor),rounding:'0.00'},
    notes:{recovery:d.legalNotes.recovery.trim(),penalties:d.legalNotes.penalties.trim(),discount:d.legalNotes.discount.trim(),description:optional(description)},
    buyer_reference:optional(d.references.serviceCode),order_reference:optional(d.references.orderReference),contract_reference:optional(d.references.marketReference)};
}
