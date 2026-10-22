import type {BillingDraft,BillingKind,BillingLine,BillingParty,BillingReferences,BillingTotals,BillingIssue,VatCategory,BillingSettingsData,BillingLegalNotes,BillingPaymentMeans,BillingVatDue,BillingBusinessProcess} from './billing-contracts';

const uuid=()=>crypto.randomUUID();
export const billingId=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const blankParty=():BillingParty=>({name:'',addressLine1:'',addressLine2:'',postalCode:'',city:'',country:'FR',siren:'',siret:'',vatId:'',email:'',legal:'',electronicAddress:'',electronicScheme:''});
const blankLegal=():BillingLegalNotes=>({recovery:'',penalties:'',discount:''});
export const blankDocumentDetails=():NonNullable<BillingDraft['details']>=>({marketObject:'',period:'',personInCharge:'',fundingProgramme:'',validityMonths:'',returnEmail:'',interventions:[]});
export const defaultFundingProgrammes=['Interreg Italie-France Maritime','Interreg Euro-Med','Horizon Europe','Interreg Next-Med'];
export function addBillingMonths(date:string,months:string){
 if(!validBillingDate(date)||!/^\d{1,2}$/.test(months)||Number(months)<1||Number(months)>36)return '';
 const [y,m,d]=date.split('-').map(Number),last=new Date(Date.UTC(y,m-1+Number(months)+1,0)),day=Math.min(d,last.getUTCDate());
 return new Date(Date.UTC(last.getUTCFullYear(),last.getUTCMonth(),day)).toISOString().slice(0,10);
}
export const billingBusinessProcesses:BillingBusinessProcess[]=['','S1','B1','M1','B2','S2','M2','S3','B4','S4','M4','S5','S6','B7','S7','B8','S8','M8','B9','S9','M9'];
export const defaultPaymentTerms='Règlement par virement bancaire à l’échéance indiquée sur la facture.';
export const blankSettings=():BillingSettingsData=>({schemaVersion:1,seller:blankParty(),paymentTerms:defaultPaymentTerms,iban:'',bic:'',paymentMeans:'30',vatDue:'',legalNotes:blankLegal(),businessProcess:''});
export const newLine=():BillingLine=>({id:uuid(),description:'',quantity:'1',unitCode:'DAY',unitPrice:'',discountPercent:'0',vatRate:'20',vatCategory:'S',exemptionReason:''});
export function blankDraft(kind:BillingKind,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date())):BillingDraft {
  return {schemaVersion:2,kind,title:'',currency:'EUR',issueDate:today,dueDate:'',validUntil:'',clientId:'',seller:blankParty(),buyer:blankParty(),lines:[newLine()],references:{businessCode:'',marketId:'',marketReference:'',orderReference:'',project:'',serviceCode:'',engagement:''},paymentTerms:'',iban:'',bic:'',notes:'',paymentMeans:'30',vatDue:'',legalNotes:blankLegal(),businessProcess:''};
}
/** Settings are copied, never linked: later edits cannot rewrite an existing document. */
export function draftWithSettings(kind:BillingKind,settings:BillingSettingsData):BillingDraft {
  const {schemaVersion,fundingProgrammes,returnEmail,...defaults}=structuredClone(settings);
  return {...blankDraft(kind),...defaults,paymentMeans:'30',paymentTerms:defaults.paymentTerms||defaultPaymentTerms,details:{...blankDocumentDetails(),returnEmail:kind==='invoice'?(returnEmail??'cdi@cdinnov.com'):''}};
}
const fail=(message:string):never=>{throw Object.assign(new Error(message),{status:422});};
function object(value:unknown,allowed:string[],name:string):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))return fail(name+' : objet attendu.');
  for(const key of Object.keys(value))if(!allowed.includes(key))fail(name+' : champ non reconnu « '+key+' ».');
  return value as Record<string,unknown>;
}
function textField(obj:Record<string,unknown>,key:string,max:number):string {
  const value=obj[key];
  if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))return fail(key+' : texte invalide ou trop long ('+max+' caractères maximum).');
  return value.normalize('NFC');
}
const partyKeys=['name','addressLine1','addressLine2','postalCode','city','country','siren','siret','vatId','email','legal','electronicAddress','electronicScheme'];
function party(raw:unknown,legacy=false):BillingParty {
  if(legacy){const old=object(raw,partyKeys.filter(k=>!['siren','electronicAddress','electronicScheme'].includes(k)),'Coordonnées');raw={...old,siren:'',electronicAddress:'',electronicScheme:''};}
  const value=object(raw,partyKeys,'Coordonnées');
  return Object.fromEntries(partyKeys.map(k=>[k,textField(value,k,k==='legal'?1000:k==='country'?2:k==='siret'?30:k==='vatId'?40:300)])) as unknown as BillingParty;
}
function legalNotes(raw:unknown):BillingLegalNotes {
  const value=object(raw,['recovery','penalties','discount'],'Mentions de paiement');
  return {recovery:textField(value,'recovery',2000),penalties:textField(value,'penalties',2000),discount:textField(value,'discount',2000)};
}
export const normalizeBillingParty=(raw:unknown):BillingParty=>party(raw);
function commercial(value:Record<string,unknown>){
  if(typeof value.paymentMeans!=='string'||!['30','58','10','48'].includes(value.paymentMeans)||typeof value.vatDue!=='string'||!['','invoice','payment','delivery'].includes(value.vatDue))fail('Mode de paiement ou exigibilité TVA non pris en charge.');
  if(!billingBusinessProcesses.includes(value.businessProcess as BillingBusinessProcess))fail('Mode de facturation non pris en charge.');
  return {paymentMeans:value.paymentMeans as BillingPaymentMeans,vatDue:value.vatDue as BillingVatDue,legalNotes:legalNotes(value.legalNotes),businessProcess:value.businessProcess as BillingBusinessProcess};
}
export function normalizeSettings(raw:unknown):BillingSettingsData {
  const v=object(raw,['schemaVersion','seller','paymentTerms','iban','bic','paymentMeans','vatDue','legalNotes','businessProcess','fundingProgrammes','returnEmail'],'Paramètres de facturation');
  if(v.schemaVersion!==1)fail('Version des paramètres non prise en charge.');
  if(Object.hasOwn(v,'fundingProgrammes')&&(!Array.isArray(v.fundingProgrammes)||v.fundingProgrammes.length>100||v.fundingProgrammes.some(p=>typeof p!=='string'||p.length>160||/[\x00-\x1f]/.test(p))))fail('Liste des programmes invalide.');
  return {schemaVersion:1,seller:party(v.seller),paymentTerms:textField(v,'paymentTerms',4000),iban:textField(v,'iban',50),bic:textField(v,'bic',20),...commercial(v),...(Object.hasOwn(v,'fundingProgrammes')?{fundingProgrammes:[...new Set((v.fundingProgrammes as string[]).map(p=>p.trim()).filter(Boolean))]}:{}),...(Object.hasOwn(v,'returnEmail')?{returnEmail:textField(v,'returnEmail',300)}:{})};
}
function documentDetails(raw:unknown):NonNullable<BillingDraft['details']>{
 const keys=Object.keys(blankDocumentDetails()),v=object(raw,keys,'Informations du document');
 if(!['','S1','S2'].includes(v.period as string))fail('Période concernée invalide.');
 if(!Array.isArray(v.interventions)||v.interventions.length>200)fail('Relevé d’intervention invalide.');
 const seen=new Set<string>();const interventions=(v.interventions as unknown[]).map(row=>{
  const r=object(row,['id','priceId','label','description','days'],'Intervention');
  if(!billingId(r.id)||seen.has(r.id as string))fail('Identifiant d’intervention invalide.');seen.add(r.id as string);
  return {id:r.id as string,priceId:textField(r,'priceId',80),label:textField(r,'label',300),description:textField(r,'description',4000),days:textField(r,'days',40)};
 });
 return {marketObject:textField(v,'marketObject',500),period:v.period as ''|'S1'|'S2',personInCharge:textField(v,'personInCharge',300),fundingProgramme:textField(v,'fundingProgramme',160),validityMonths:textField(v,'validityMonths',3),returnEmail:textField(v,'returnEmail',300),interventions};
}
const referenceKeys=['businessCode','marketId','marketReference','orderReference','project','serviceCode','engagement'];
const lineKeys=['id','description','quantity','unitCode','unitPrice','discountPercent','vatRate','vatCategory','exemptionReason'];
const categories:VatCategory[]=['S','Z','E','AE','O'];
/** Validate the storage boundary, independently of whether an unfinished draft can be issued. */
export function normalizeDraft(raw:unknown):BillingDraft {
  const legacy=!!raw&&typeof raw==='object'&&'schemaVersion' in raw&&raw.schemaVersion===1;
  const credit=!!raw&&typeof raw==='object'&&'schemaVersion' in raw&&raw.schemaVersion===3;
  const value=object(raw,['schemaVersion','kind','title','currency','issueDate','dueDate','validUntil','clientId','seller','buyer','lines','references','paymentTerms','iban','bic','notes','details',...(legacy?[]:['paymentMeans','vatDue','legalNotes','businessProcess']),...(credit?['creditNote']:[])],'Document');
  if((value.schemaVersion!==1&&value.schemaVersion!==2&&value.schemaVersion!==3)||!['invoice','quote'].includes(String(value.kind))||value.currency!=='EUR'||(credit&&value.kind!=='invoice'))fail('Type, version ou devise de document non pris en charge.');
  let creditNote:BillingDraft['creditNote'];
  if(credit){
    const c=object(value.creditNote,['invoiceId','invoiceVersion','invoiceNumber','invoiceDate','reason'],'Facture corrigée');
    if(!billingId(c.invoiceId)||!Number.isSafeInteger(c.invoiceVersion)||Number(c.invoiceVersion)<1)fail('Référence de la facture corrigée invalide.');
    const invoiceNumber=textField(c,'invoiceNumber',35),invoiceDate=textField(c,'invoiceDate',10);
    if(!invoiceNumber.trim()||/[\x00-\x1f\x7f]/.test(invoiceNumber)||!validBillingDate(invoiceDate))fail('Numéro et date de la facture corrigée requis.');
    creditNote={invoiceId:(c.invoiceId as string).toLowerCase(),invoiceVersion:c.invoiceVersion as number,invoiceNumber,invoiceDate,reason:textField(c,'reason',2000)};
  }
  if(!Array.isArray(value.lines)||value.lines.length>200)fail('Un document accepte au maximum 200 lignes.');
  const seen=new Set<string>();
  const lines=(value.lines as unknown[]).map(rawLine=>{
    const row=object(rawLine,lineKeys,'Ligne');
    if(!billingId(row.id))fail('Identifiant de ligne invalide ou en double.');
    const id=(row.id as string).toLowerCase();
    if(seen.has(id))fail('Identifiant de ligne invalide ou en double.');
    seen.add(id);
    if(!categories.includes(row.vatCategory as VatCategory))fail('Catégorie de TVA non reconnue.');
    return {...Object.fromEntries(lineKeys.map(k=>[k,textField(row,k,k==='description'?4000:k==='exemptionReason'?1000:k==='id'?36:k==='unitCode'?3:40)])),id} as unknown as BillingLine;
  });
  const references=object(value.references,[...referenceKeys,'projectId','orderId','quoteNumber'],'Références');
  return {
    schemaVersion:credit?3:2,kind:value.kind as BillingKind,currency:'EUR',...(creditNote?{creditNote}:{}),
    ...(Object.hasOwn(value,'details')?{details:documentDetails(value.details)}:{}),
    title:textField(value,'title',300),issueDate:textField(value,'issueDate',10),dueDate:textField(value,'dueDate',10),validUntil:textField(value,'validUntil',10),clientId:textField(value,'clientId',200),
    seller:party(value.seller,legacy),buyer:party(value.buyer,legacy),lines,
    references:Object.fromEntries([...referenceKeys,...['projectId','orderId','quoteNumber'].filter(k=>Object.hasOwn(references,k))].map(k=>[k,textField(references,k,300)])) as unknown as BillingReferences,
    paymentTerms:textField(value,'paymentTerms',4000),iban:textField(value,'iban',50),bic:textField(value,'bic',20),notes:textField(value,'notes',10000),
    ...commercial(legacy?{paymentMeans:'30',vatDue:'',legalNotes:blankLegal(),businessProcess:''}:value)
  };
}

/** Unsigned decimal -> fixed integer. Empty, exponent, negative and excessive precision fail explicitly. */
export function billingDecimal(value:string,places:number,label:string):bigint {
  const s=value.trim().replace(',','.');
  if(!new RegExp('^\\d{1,10}(?:\\.\\d{1,'+places+'})?$').test(s))return fail(label+' : nombre positif, avec au plus '+places+' décimales.');
  const [whole,fraction='']=s.split('.');
  return BigInt(whole)*10n**BigInt(places)+BigInt(fraction.padEnd(places,'0'));
}
const round=(value:bigint,denominator:bigint)=>(value+denominator/2n)/denominator;
const decimalRate=(n:bigint)=>String(n/100n)+(n%100n?'.'+String(n%100n).padStart(2,'0').replace(/0$/,''):'');
const totalLimit=99999999999999n;
function lineAmounts(line:BillingLine,index:number){
  const label='Ligne '+(index+1);
  const fieldFail=(key:keyof BillingLine,message:string):never=>{throw Object.assign(new Error(message),{status:422,path:'lines.'+index+'.'+key});};
  const decimal=(key:keyof BillingLine,places:number,name:string)=>{if(!line[key].trim())return fieldFail(key,label+' : '+name+' à renseigner.');try{return billingDecimal(line[key],places,label+' : '+name);}catch(error){return fieldFail(key,(error as Error).message);}};
  const quantity=decimal('quantity',6,'quantité'),price=decimal('unitPrice',6,'prix unitaire'),rate=decimal('vatRate',2,'TVA'),discount=decimal('discountPercent',2,'remise');
  if(rate>10000n)fieldFail('vatRate',label+' : le taux de TVA doit rester entre 0 et 100 %.');
  if(discount>10000n)fieldFail('discountPercent',label+' : la remise doit rester entre 0 et 100 %.');
  if(line.vatCategory==='S'&&rate===0n)fieldFail('vatRate',label+' : une TVA standard doit avoir un taux positif.');
  if(line.vatCategory!=='S'&&rate!==0n)fieldFail('vatRate',label+' : cette catégorie de TVA exige un taux nul.');
  // Round the exact discounted line once, then calculate tax on the sum of bases per category/rate.
  const base=quantity*price,net=round(base*(10000n-discount),100000000000000n),undiscounted=round(base,10000000000n);
  if(net>totalLimit||undiscounted>totalLimit)fail(label+' : montant trop élevé.');
  return {net,discount:undiscounted-net,rate,quantity};
}
export function calculateBilling(d:BillingDraft):BillingTotals {
  let net=0n,discount=0n;
  const groups=new Map<string,{category:VatCategory;rate:bigint;base:bigint;reason:string}>();
  const lines=d.lines.map((line,index)=>{
    const a=lineAmounts(line,index);net+=a.net;discount+=a.discount;
    const key=line.vatCategory+':'+a.rate,reason=line.exemptionReason.trim(),previous=groups.get(key);
    if(previous&&previous.reason!==reason)fail('Un même groupe de TVA doit avoir le même motif d’exonération.');
    groups.set(key,{category:line.vatCategory,rate:a.rate,base:(previous?.base||0n)+a.net,reason});
    return {id:line.id,netMinor:String(a.net),discountMinor:String(a.discount)};
  });
  let tax=0n;
  const taxes=[...groups.values()].sort((a,b)=>a.category.localeCompare(b.category)||Number(a.rate-b.rate)).map(group=>{
    const amount=round(group.base*group.rate,10000n);tax+=amount;
    return {category:group.category,rate:decimalRate(group.rate),baseMinor:String(group.base),taxMinor:String(amount)};
  });
  if(net+tax>totalLimit)fail('Le total du document dépasse la limite autorisée.');
  return {lines,taxes,netMinor:String(net),taxMinor:String(tax),grossMinor:String(net+tax),discountMinor:String(discount)};
}
export const validBillingDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number(s.slice(0,4))>=1900&&Number(s.slice(0,4))<=9999&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
/** Guidance for incomplete drafts. Issuance and legal qualification require additional server gates. */
export function inspectDraft(d:BillingDraft):BillingIssue[] {
  const issues:BillingIssue[]=[],add=(path:string,message:string)=>issues.push({path,message});
  if(d.details?.validityMonths&&(!/^\d{1,2}$/.test(d.details.validityMonths)||Number(d.details.validityMonths)<1||Number(d.details.validityMonths)>36))add('details.validityMonths','Choisissez une durée de 1 à 36 mois.');
  if(d.kind==='quote'&&d.details?.validityMonths&&d.validUntil!==addBillingMonths(d.issueDate,d.details.validityMonths))add('validUntil','La date doit correspondre à la durée de validité.');
  if(d.details?.returnEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.details.returnEmail))add('details.returnEmail','Vérifiez l’adresse de retour.');
  d.details?.interventions.forEach((r,i)=>{if(!r.description.trim())add('details.interventions.'+i+'.description','Décrivez le travail effectué.');try{billingDecimal(r.days,6,'Nombre de jours');}catch{add('details.interventions.'+i+'.days','Renseignez un nombre de jours positif.');}});
  if(!validBillingDate(d.issueDate))add('issueDate','Renseignez une date valide.');
  if(d.creditNote){
    if(d.issueDate<d.creditNote.invoiceDate)add('issueDate','La date de l’avoir ne peut pas précéder la facture corrigée.');
    if(!d.creditNote.reason.trim())add('creditNote.reason','Précisez le motif de l’avoir.');
  }
  if(d.kind==='quote'&&!validBillingDate(d.validUntil))add('validUntil','Renseignez la date de validité du devis.');
  if(d.validUntil&&(!validBillingDate(d.validUntil)||d.validUntil<d.issueDate)&&!issues.some(i=>i.path==='validUntil'))add('validUntil','La validité doit suivre la date du devis.');
  if(d.dueDate&&(!validBillingDate(d.dueDate)||d.dueDate<d.issueDate))add('dueDate','L’échéance doit suivre la date du document.');
  if(d.kind==='invoice'&&!d.dueDate&&!d.paymentTerms.trim())add('paymentTerms','Précisez une échéance ou les conditions de paiement.');
  for(const [key,label] of [['seller','Émetteur'],['buyer','Client']] as const){
    const p=d[key];
    for(const field of ['name','addressLine1','postalCode','city'] as const)if(!p[field].trim())add(key+'.'+field,label+' : '+({name:'nom',addressLine1:'adresse',postalCode:'code postal',city:'ville'}[field])+' à compléter.');
    if(!/^[A-Z]{2}$/.test(p.country))add(key+'.country',label+' : code pays sur deux lettres requis.');
    if(p.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))add(key+'.email',label+' : adresse e-mail invalide.');
    if(p.siret&&!/^\d{14}$/.test(p.siret.replace(/\s/g,'')))add(key+'.siret',label+' : le SIRET comporte 14 chiffres.');
    if(p.siren&&!/^\d{9}$/.test(p.siren.replace(/\s/g,'')))add(key+'.siren',label+' : le SIREN comporte 9 chiffres.');
    if(p.siren&&p.siret&&!p.siret.replace(/\s/g,'').startsWith(p.siren.replace(/\s/g,'')))add(key+'.siret',label+' : le SIRET doit correspondre au SIREN.');
    if(!!p.electronicAddress!==!!p.electronicScheme)add(key+(p.electronicAddress?'.electronicScheme':'.electronicAddress'),label+' : précisez ensemble l’adresse électronique de facturation et son schéma.');
  }
  if(!d.lines.length)add('lines','Ajoutez au moins une prestation.');
  d.lines.forEach((line,i)=>{
    const path='lines.'+i;
    if(!line.description.trim())add(path+'.description','Ligne '+(i+1)+' : désignation à compléter.');
    if(!/^[A-Z0-9]{2,3}$/.test(line.unitCode))add(path+'.unitCode','Ligne '+(i+1)+' : unité invalide.');
    try{if(lineAmounts(line,i).quantity===0n)add(path+'.quantity','Ligne '+(i+1)+' : la quantité doit être supérieure à zéro.');}catch(error){add((error as Error&{path?:string}).path||path,(error as Error).message);}
    if(['E','AE','O'].includes(line.vatCategory)&&!line.exemptionReason.trim())add(path+'.exemptionReason','Précisez le motif pour cette catégorie de TVA.');
    if(['S','Z'].includes(line.vatCategory)&&line.exemptionReason.trim())add(path+'.exemptionReason','La TVA standard ou à taux zéro ne comporte pas de motif d’exonération.');
  });
  if(d.lines.some(l=>l.vatCategory==='S')&&!d.seller.vatId.trim())add('seller.vatId','Renseignez le numéro de TVA de l’émetteur.');
  if(d.lines.some(l=>l.vatCategory==='AE')&&!d.buyer.vatId.trim())add('buyer.vatId','Renseignez le numéro de TVA du client pour l’autoliquidation.');
  if(d.lines.some(l=>l.vatCategory==='O')&&(d.lines.some(l=>l.vatCategory!=='O')||d.seller.vatId||d.buyer.vatId))add('lines','Hors champ : ne mélangez pas les catégories ni les identifications TVA.');
  try{calculateBilling(d);}catch(error){if(!issues.some(i=>i.message===(error as Error).message))add('lines',(error as Error).message);}
  return issues;
}
/** Electronic routing is completed in the converter, after the ordinary PDF is frozen. */
export function inspectDocumentReadiness(d:BillingDraft):BillingIssue[]{
  return inspectDraft(d).filter(issue=>!/^\b(seller|buyer)\.electronic(Address|Scheme)$/.test(issue.path));
}
/** Actionable draft guidance shared by the editor and the Factur-X adapter.
 * Passing this check does not replace the native preflight or the numbering gates. */
export function inspectBillingReadiness(d:BillingDraft):BillingIssue[] {
  const issues=inspectDraft(d);
  if(d.kind!=='invoice')return issues;
  const add=(path:string,message:string)=>{if(!issues.some(i=>i.path===path))issues.push({path,message});};
  for(const key of ['seller','buyer'] as const){
    if(d[key].country==='FR'&&!d[key].siren.trim()&&!d[key].siret.trim())add(key+'.siren','Renseignez le SIREN ou le SIRET de cette entreprise française.');
    if(!d[key].electronicAddress.trim())add(key+'.electronicAddress','Renseignez l’adresse de facturation électronique.');
    if(!d[key].electronicScheme.trim())add(key+'.electronicScheme','Précisez le type d’adresse de facturation électronique.');
  }
  if(!d.businessProcess)add('businessProcess','Précisez le mode de facturation.');
  d.lines.forEach((line,index)=>{if((line.quantity.trim().replace(',','.').split('.')[1]||'').replace(/0+$/,'').length>4)add('lines.'+index+'.quantity','L’export Factur-X France accepte au maximum quatre décimales significatives pour la quantité. Ajustez la quantité explicitement.');});
  for(const key of ['recovery','penalties','discount'] as const)if(!d.legalNotes[key].trim())add('legalNotes.'+key,'Complétez les mentions de paiement.');
  if(['30','58'].includes(d.paymentMeans)&&!d.iban.trim())add('iban','L’IBAN est requis pour un virement.');
  return issues;
}
export function formatMinor(value:string):string {
  const n=BigInt(value),absolute=n<0n?-n:n;
  return (n<0n?'−':'')+(absolute/100n).toLocaleString('fr-FR')+','+String(absolute%100n).padStart(2,'0')+' €';
}
