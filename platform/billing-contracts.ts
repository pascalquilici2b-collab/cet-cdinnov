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
  projectId?:string; orderId?:string; quoteNumber?:string;
}
export interface BillingDraft {
  annotations?:BillingAnnotation[];
  description?:string;
  details?:BillingDocumentDetails;
  schemaVersion:2|3; kind:BillingKind; title:string; currency:'EUR'; issueDate:string;
  creditNote?:BillingCreditReference;
  dueDate:string; validUntil:string; clientId:string; seller:BillingParty; buyer:BillingParty;
  lines:BillingLine[]; references:BillingReferences; paymentTerms:string; iban:string; bic:string; notes:string;
  paymentMeans:BillingPaymentMeans; vatDue:BillingVatDue; legalNotes:BillingLegalNotes; businessProcess:BillingBusinessProcess;
}
interface BillingAnnotationBox {id:string;page:number;x:number;y:number;width:number;height:number;}
export type BillingAnnotation=(BillingAnnotationBox&{kind:'text';text:string;fontSize:number;color:'ink'|'blue'|'red'})|(BillingAnnotationBox&{kind:'highlight';color:'yellow'|'blue'|'green'});
export interface BillingInterventionReport {version:number;date:string;title:string;periods:BillingPeriod[];rows:BillingIntervention[];}
export interface BillingEngagement {kind:'order'|'signed_quote';filename:string;createdAt:string;}
export interface BillingIntervention {id:string;priceId:string;label:string;description:string;days:string;}
export type BillingPeriod='S1'|'S2'|'S3'|'S4'|'S5'|'S6'|'S7'|'S8';
export interface BillingDocumentDetails {marketObject:string;period:''|BillingPeriod;periods?:BillingPeriod[];personInCharge:string;fundingProgramme:string;validityMonths:string;returnEmail:string;interventions:BillingIntervention[];}
/** Only schema v3 carries a credit reference; old v2 snapshots keep their exact wire shape. */
export interface BillingCreditReference {invoiceId:string;invoiceVersion:number;invoiceNumber:string;invoiceDate:string;reason:string;}
export type BillingBusinessProcess = ''|'B1'|'S1'|'M1'|'B2'|'S2'|'M2'|'S3'|'B4'|'S4'|'M4'|'S5'|'S6'|'B7'|'S7'|'B8'|'S8'|'M8'|'B9'|'S9'|'M9';
export type BillingPaymentMeans = '30'|'58'|'10'|'48';
export type BillingVatDue = ''|'invoice'|'payment'|'delivery';
export interface BillingLegalNotes {recovery:string;penalties:string;discount:string;}
export interface BillingSettingsData {
  fundingProgrammes?:string[];returnEmail?:string;
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
export interface BillingInvoiceRectification {parentId:string|null;parentNumber:string|null;replacementId:string|null;replacementNumber:string|null;replacementState:'draft'|'issued'|null;}
export interface BillingDocument {
  rectification?:BillingInvoiceRectification;
  id:string; version:number; status:'draft'|'finalizing'|'issue_failed'|'issued'; data:BillingDraft;
  issuance:BillingIssuanceSummary|null;
  reservedNumber?:{number:string;date:string;seriesId:string}|null;
  sourceDocumentId:string|null; createdAt:string; updatedAt:string; createdBy:string; updatedBy:string;
  totals:BillingTotals|null; issues:BillingIssue[];
  quote:BillingQuoteSummary|null;
  settlement:BillingSettlementSummary|null;
}
export type BillingPaymentMethod='transfer'|'card'|'cash'|'cheque'|'direct_debit'|'other';
export type BillingSettlementState='unpaid'|'partial'|'paid'|'overpaid';
export interface BillingSettlementSummary {version:number;receivedMinor:string;refundedMinor:string;netPaidMinor:string;dueMinor:string;overpaidMinor:string;state:BillingSettlementState;overdue:boolean;}
export interface BillingPaymentEntry {id:string;version:number;kind:'receipt'|'refund'|'void';amountMinor:string;deltaMinor:string;balanceAfterMinor:string;reason:string;occurredOn:string;method:BillingPaymentMethod;reference:string;note:string;recordedAt:string;recordedBy:string;reversalOf:string|null;reversedBy:string|null;replacementFor:string|null;}
type PaymentInputFields={amount:string;occurredOn:string;method:BillingPaymentMethod;reference:string;note:string};
export type BillingPaymentOperationInput={id:string;documentVersion:number}&(({kind:'receipt'|'refund'}&PaymentInputFields)|{kind:'void';targetId:string;reason:string}|({kind:'replace';targetId:string;reason:string}&PaymentInputFields));
export type BillingQuoteAction='sent'|'accepted'|'refused'|'reopened';
export type BillingQuoteState='prepared'|'sent'|'accepted'|'refused'|'expired';
export type BillingListState='trash'|'all'|'draft'|'finalizing'|'issue_failed'|'issued'|'previous'|'abandoned'|'finalized'|'overdue'|BillingQuoteState|BillingSettlementState;
export interface BillingQuoteRevisionSummary {rootId:string;familyVersion:number;ordinal:number;count:number;parentId:string|null;parentNumber:string|null;reason:string;abandoned:boolean;abandonReason:string|null;currentId:string;currentOrdinal:number;currentNumber:string|null;currentState:BillingDocument['status'];}
export interface BillingQuoteRevisionItem {id:string;ordinal:number;number:string|null;status:BillingDocument['status'];createdAt:string;reason:string;abandonedAt:string|null;abandonReason:string|null;grossMinor:string|null;}
export interface BillingQuoteSummary {engagement?:BillingEngagement|null;version:number;state:BillingQuoteState;occurredOn:string|null;invoice:{id:string;number:string|null;state:BillingDocument['status']}|null;revision:BillingQuoteRevisionSummary;}
export interface BillingQuoteEvent {id:string;version:number;action:BillingQuoteAction;occurredOn:string;note:string;recordedAt:string;recordedBy:string;}
export interface BillingQuoteEventInput {id:string;documentVersion:number;action:BillingQuoteAction;occurredOn:string;note:string;}
export interface BillingIssuanceSummary {id:string;number:string;state:'pending'|'rendering'|'failed'|'ready';attempts:number;errorCode:string|null;createdAt:string;updatedAt:string;files:string[];}
export interface BillingNumberSeries {id:string;issuer_siren:string;kind:BillingKind;prefix:string;width:number;first_value:number;next_value:number;start_date:string;end_date:string;last_issue_date:string|null;version:number;}
export type BillingDirectoryKind='clients'|'services';
export interface BillingClientDetails {
 legalForm:string; legalFormCode:string; representatives:string; shareCapital:string;
 vatNumbers:string[]; source:string; retrievedAt:string;
}
export interface BillingClientContact {id:string;name:string;email:string;role:string;}
export interface BillingClientData {contacts?:BillingClientContact[];schemaVersion:1;party:BillingParty;notes:string;archived:boolean;details?:BillingClientDetails;logoKey?:string;logoData?:string;}
export interface BillingServiceData {schemaVersion:1;reference:string;label:string;description:string;unitCode:string;unitPrice:string;vatRate:string;vatCategory:VatCategory;exemptionReason:string;archived:boolean;}
export type BillingDirectoryData=BillingClientData|BillingServiceData;
export type BillingDirectoryRecord={id:string;version:number;updatedAt:string|null;} & ({kind:'clients';data:BillingClientData;}|{kind:'services';data:BillingServiceData;});
export interface BillingDirectoryPage {records:BillingDirectoryRecord[];total:number;offset:number;limit:number;}
export interface BillingFilterOption {value:string;label:string;}
export interface BillingPage {documents:BillingDocument[]; total:number; limit:number; offset:number; filters?:{clients:BillingFilterOption[];projects:BillingFilterOption[]};}
export interface BillingContext {
  people?:{id:string;name:string;photo?:string}[];
  clientLogos?:{id:string;name:string;siren:string;siret:string;logoKey?:string;logoData?:string}[];
  documentService:{configured:boolean};
  clients:{id:string; name:string}[];
  businessCodes:{id:string; code:string; label:string; client:string}[];
  markets:{id:string;version?:number; title:string; reference:string; clientName:string;clientId?:string;activity?:import('./project-activity').Activity;prices?:import('./client/markets-contracts').Price[];projects?:import('./client/markets-contracts').MarketProject[]}[];
  seller:BillingParty;
  settings:BillingSettings;
}
export interface BillingTransport {
  report(id:string):Promise<BillingInterventionReport>;
  saveReport(id:string,version:number,data:Omit<BillingInterventionReport,'version'>):Promise<BillingInterventionReport>;
  reportPDF(id:string):Promise<Blob>;
  uploadEngagement(id:string,version:number,kind:BillingEngagement['kind'],file:File):Promise<BillingDocument>;
  engagementFile(id:string):Promise<Blob>;
  rectify(id:string,version:number,input:{id:string;notTransmitted:true}):Promise<BillingDocument>;
  session():Promise<{email:string}>;
  emailHistory(id:string):Promise<{deliveries:import('./billing-delivery').EmailDelivery[]}>;
  email(id:string,version:number,input:import('./billing-delivery').EmailInput):Promise<{delivery:import('./billing-delivery').EmailDelivery}>;
  projects():Promise<{projects:import('./projects').SharedProject[];clients?:{id:string;name:string}[]}>;
  saveProject(data:import('./projects').ProjectInput):Promise<{project:import('./projects').SharedProject}>;
  directoryList(kind:BillingDirectoryKind,query:{q:string;offset:number;limit:number;archived:boolean}):Promise<BillingDirectoryPage>;
  directoryGet(kind:BillingDirectoryKind,id:string):Promise<BillingDirectoryRecord>;
  directoryCreate(kind:BillingDirectoryKind,id:string,data:BillingDirectoryData):Promise<BillingDirectoryRecord>;
  directorySave(kind:BillingDirectoryKind,id:string,version:number,data:BillingDirectoryData):Promise<BillingDirectoryRecord>;
  list(query:{kind:BillingKind; q:string; offset:number; limit:number;state?:BillingListState;client?:string;project?:string}):Promise<BillingPage>;
  quoteEvents(id:string,before?:number):Promise<{events:BillingQuoteEvent[];nextBefore:number|null}>;
  quoteEvent(id:string,version:number,data:BillingQuoteEventInput):Promise<BillingDocument>;
  payments(id:string,before?:number):Promise<{entries:BillingPaymentEntry[];nextBefore:number|null}>;
  payment(id:string,version:number,data:BillingPaymentOperationInput):Promise<BillingDocument>;
  quoteVersions(id:string,before?:number):Promise<{versions:BillingQuoteRevisionItem[];nextBefore:number|null}>;
  reviseQuote(id:string,version:number,data:{id:string;familyVersion:number;reason:string}):Promise<BillingDocument>;
  abandonQuoteRevision(id:string,version:number,data:{id:string;familyVersion:number;reason:string}):Promise<BillingDocument>;
  trash(id:string,version:number):Promise<{deleted:true}>;
  restore(id:string,version:number):Promise<BillingDocument>;
  get(id:string):Promise<BillingDocument>;
  create(id:string,data:BillingDraft):Promise<BillingDocument>;
  save(id:string,version:number,data:BillingDraft):Promise<BillingDocument>;
  convert(id:string,version:number,newId:string):Promise<BillingDocument>;
  context():Promise<BillingContext>;
  settings():Promise<BillingSettings>;
  saveSettings(version:number,data:BillingSettingsData):Promise<BillingSettings>;
  previewPDF(id:string,version:number):Promise<Blob>;
  previewDraft(data:BillingDraft,documentId?:string):Promise<Blob>;
  numberSeries():Promise<BillingNumberSeries[]>;
  createNumberSeries(data:{id:string;issuerSiren:string;kind:BillingKind;prefix:string;width:number;firstValue:number;startDate:string;endDate:string}):Promise<BillingNumberSeries>;
  issue(id:string,version:number,attemptId:string,seriesId:string):Promise<BillingDocument>;
  finalize(id:string,version:number):Promise<BillingDocument>;
  issuedFile(id:string,kind:string):Promise<Blob>;
}
