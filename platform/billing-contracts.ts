/** Shared, versioned document model. Decimal amounts are strings on the wire. */
export type BillingKind = 'invoice' | 'quote';
export type VatCategory = 'S' | 'Z' | 'E' | 'AE' | 'O';
export interface BillingParty {
  name:string; addressLine1:string; addressLine2:string; postalCode:string;
  city:string; country:string; siren:string; siret:string; vatId:string; email:string; legal:string;
  electronicAddress:string; electronicScheme:string;
}
export interface BillingLine {
  id:string; description:string; quantity:string; unitCode:string; unitPrice:string;
  discountPercent:string; vatRate:string; vatCategory:VatCategory; exemptionReason:string;
}
export interface BillingReferences {
  businessCode:string; marketId:string; marketReference:string; orderReference:string;
  project:string; serviceCode:string; engagement:string;
}
export interface BillingDraft {
  schemaVersion:2; kind:BillingKind; title:string; currency:'EUR'; issueDate:string;
  dueDate:string; validUntil:string; clientId:string; seller:BillingParty; buyer:BillingParty;
  lines:BillingLine[]; references:BillingReferences; paymentTerms:string; iban:string; bic:string; notes:string;
  paymentMeans:BillingPaymentMeans; vatDue:BillingVatDue; legalNotes:BillingLegalNotes; businessProcess:BillingBusinessProcess;
}
export type BillingBusinessProcess = ''|'B1'|'S1'|'M1'|'B2'|'S2'|'M2'|'S3'|'B4'|'S4'|'M4'|'S5'|'S6'|'B7'|'S7'|'B8'|'S8'|'M8'|'B9'|'S9'|'M9';
export type BillingPaymentMeans = '30'|'58'|'10'|'48';
export type BillingVatDue = ''|'invoice'|'payment'|'delivery';
export interface BillingLegalNotes {recovery:string;penalties:string;discount:string;}
export interface BillingSettingsData {
  schemaVersion:1; seller:BillingParty;paymentMeans:BillingPaymentMeans;vatDue:BillingVatDue;
  paymentTerms:string;iban:string;bic:string;legalNotes:BillingLegalNotes;
  businessProcess:BillingBusinessProcess;
}
export interface BillingSettings {version:number;data:BillingSettingsData;updatedAt:string|null;}
export interface BillingIssue {path:string; message:string;}
export interface BillingLineTotal {id:string; netMinor:string; discountMinor:string;}
export interface BillingTaxTotal {category:VatCategory; rate:string; baseMinor:string; taxMinor:string;}
export interface BillingTotals {
  lines:BillingLineTotal[]; taxes:BillingTaxTotal[];
  netMinor:string; taxMinor:string; grossMinor:string; discountMinor:string;
}
export interface BillingDocument {
  id:string; version:number; status:'draft'|'finalizing'|'issue_failed'|'issued'; data:BillingDraft;
  issuance:BillingIssuanceSummary|null;
  sourceDocumentId:string|null; createdAt:string; updatedAt:string; createdBy:string; updatedBy:string;
  totals:BillingTotals|null; issues:BillingIssue[];
}
export interface BillingIssuanceSummary {id:string;number:string;state:'pending'|'rendering'|'failed'|'ready';attempts:number;errorCode:string|null;createdAt:string;updatedAt:string;files:string[];}
export interface BillingNumberSeries {id:string;issuer_siren:string;kind:BillingKind;prefix:string;width:number;first_value:number;next_value:number;start_date:string;end_date:string;last_issue_date:string|null;version:number;}
export interface BillingPage {documents:BillingDocument[]; total:number; limit:number; offset:number;}
export interface BillingContext {
  clients:{id:string; name:string}[];
  businessCodes:{id:string; code:string; label:string; client:string}[];
  markets:{id:string; title:string; reference:string; clientName:string}[];
  seller:BillingParty;
  settings:BillingSettings;
}
export interface BillingTransport {
  list(query:{kind:BillingKind; q:string; offset:number; limit:number}):Promise<BillingPage>;
  get(id:string):Promise<BillingDocument>;
  create(id:string,data:BillingDraft):Promise<BillingDocument>;
  save(id:string,version:number,data:BillingDraft):Promise<BillingDocument>;
  convert(id:string,version:number,newId:string):Promise<BillingDocument>;
  context():Promise<BillingContext>;
  settings():Promise<BillingSettings>;
  saveSettings(version:number,data:BillingSettingsData):Promise<BillingSettings>;
  previewPDF(id:string,version:number):Promise<Blob>;
  numberSeries():Promise<BillingNumberSeries[]>;
  createNumberSeries(data:{id:string;issuerSiren:string;kind:BillingKind;prefix:string;width:number;firstValue:number;startDate:string;endDate:string}):Promise<BillingNumberSeries>;
  issue(id:string,version:number,attemptId:string,seriesId:string):Promise<BillingDocument>;
  finalize(id:string,version:number):Promise<BillingDocument>;
  issuedFile(id:string,kind:string):Promise<Blob>;
}
