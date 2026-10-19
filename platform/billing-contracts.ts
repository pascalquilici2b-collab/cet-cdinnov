/** Shared, versioned document model. Decimal amounts are strings on the wire. */
export type BillingKind = 'invoice' | 'quote';
export type VatCategory = 'S' | 'Z' | 'E' | 'AE' | 'O';
export interface BillingParty {
  name:string; addressLine1:string; addressLine2:string; postalCode:string;
  city:string; country:string; siret:string; vatId:string; email:string; legal:string;
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
  schemaVersion:1; kind:BillingKind; title:string; currency:'EUR'; issueDate:string;
  dueDate:string; validUntil:string; clientId:string; seller:BillingParty; buyer:BillingParty;
  lines:BillingLine[]; references:BillingReferences; paymentTerms:string; iban:string; bic:string; notes:string;
}
export interface BillingIssue {path:string; message:string;}
export interface BillingLineTotal {id:string; netMinor:string; discountMinor:string;}
export interface BillingTaxTotal {category:VatCategory; rate:string; baseMinor:string; taxMinor:string;}
export interface BillingTotals {
  lines:BillingLineTotal[]; taxes:BillingTaxTotal[];
  netMinor:string; taxMinor:string; grossMinor:string; discountMinor:string;
}
export interface BillingDocument {
  id:string; version:number; status:'draft'; data:BillingDraft;
  sourceDocumentId:string|null; createdAt:string; updatedAt:string; createdBy:string; updatedBy:string;
  totals:BillingTotals|null; issues:BillingIssue[];
}
export interface BillingPage {documents:BillingDocument[]; total:number; limit:number; offset:number;}
export interface BillingContext {
  clients:{id:string; name:string}[];
  businessCodes:{id:string; code:string; label:string; client:string}[];
  markets:{id:string; title:string; reference:string; clientName:string}[];
  seller:BillingParty;
}
export interface BillingTransport {
  list(query:{kind:BillingKind; q:string; offset:number; limit:number}):Promise<BillingPage>;
  get(id:string):Promise<BillingDocument>;
  create(id:string,data:BillingDraft):Promise<BillingDocument>;
  save(id:string,version:number,data:BillingDraft):Promise<BillingDocument>;
  convert(id:string,version:number,newId:string):Promise<BillingDocument>;
  context():Promise<BillingContext>;
}
