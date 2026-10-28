export type Numeric = number|string|null;
export interface Employee {matricule:string;nom:string;prenom:string;photo?:string|null;}
export interface Client {name:string;aliases?:string[];logo?:string;}
export interface BusinessCode {id:string;code1:Numeric;code2:Numeric;pilote?:string;label?:string;client?:string;montantHT?:Numeric;progress?:Numeric;[field:string]:unknown;}
export interface Invoice {id:string;number?:string;code?:string;client?:string;ht?:Numeric;ttc?:Numeric;dateFacture?:string|null;dateEnvoi?:string|null;datePaiement?:string|null;pdfSource?:{name:string;[field:string]:unknown};validFacturx?:boolean;[field:string]:unknown;}
export interface ExpenseLine {id:string;date?:string;categorie:string;description?:string;montant?:Numeric;vehicule?:string;cv?:string;km?:Numeric;elec?:boolean;depart?:string;arrivee?:string;allerRetour?:boolean;justificatif?:string;justName?:string;justType?:string;[field:string]:unknown;}
export interface Expense {id:string;numero:Numeric;matricule:string;projectId?:string;projectName?:string;objet?:string;affaire?:string;codeAffaire?:string;codeCompta?:string;lieu?:string;dateDepart?:string;dateRetour?:string;duree?:Numeric;dateNote?:string;statut?:string;avance?:Numeric;faitA?:string;signature?:string|null;lignes:ExpenseLine[];[field:string]:unknown;}
export interface Filters {tab:'codes'|'factures';codeQ:string;factQ:string;year:string;month:string;codePage:number;codePer:number;factPage:number;factPer:number;expenseQ:string;expensePerson:string;expenseStatus:string;expensePage:number;expensePer:number;}
export interface Snapshot {view:'facturier'|'notesfrais';admin:boolean;matricule:string|null;codes:BusinessCode[];invoices:Invoice[];expenses:Expense[];employees:Employee[];clients:Client[];clientStatus:string;clientError:boolean;filters:Filters;}
export const number=(value:unknown)=>Number(value)||0;
export const codeLabel=(c:BusinessCode)=>[c.code1,c.code2].filter(v=>v!==''&&v!=null).join(' ');
export const codeKey=(c:BusinessCode)=>String(c.code1??'')+String(c.code2??'');
export const expenseStatus=(status?:string)=>['Soumis','Soumise','Validé','Validée'].includes(status||'')?'Envoyé':status||'Brouillon';
export const expenseTotal=(n:Expense)=>Math.round((n.lignes||[]).reduce((total,line)=>total+number(line.montant),0)*100)/100;
export const expenseRefund=(n:Expense)=>Math.round((expenseTotal(n)-number(n.avance))*100)/100;
export const money=(n:unknown)=>number(n).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
export const dateLabel=(d?:string|null)=>d?d.slice(0,10).split('-').reverse().join('/'):'—';
export const monthNames=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
export const yearOf=(d?:string|null)=>d?Number(d.slice(0,4)):0;
export function codesFiltered(codes:BusinessCode[],query:string){const q=query.toLowerCase().trim();return codes.filter(c=>!q||[codeLabel(c),c.pilote,c.label,c.client].join(' ').toLowerCase().includes(q)).sort((a,b)=>number(b.code1)-number(a.code1)||number(b.code2)-number(a.code2));}
export function invoicesFiltered(invoices:Invoice[],query:string,year:string,month:string){const q=query.toLowerCase().trim();return invoices.filter(f=>(year==='all'||yearOf(f.dateFacture)===Number(year))&&(month==='all'||!!f.dateFacture&&new Date(f.dateFacture+'T00:00:00').getMonth()===Number(month))&&(!q||[f.code,f.number,f.client].join(' ').toLowerCase().includes(q))).sort((a,b)=>(b.dateFacture||'').localeCompare(a.dateFacture||''));}
export function expensesFiltered(snapshot:Snapshot){
  const f=snapshot.filters,q=f.expenseQ.toLowerCase();
  const people=new Map(snapshot.employees.map(p=>[p.matricule,p]));
  return snapshot.expenses.filter(n=>{
    if(!snapshot.admin&&(!snapshot.matricule||n.matricule!==snapshot.matricule))return false;
    if(f.expensePerson&&n.matricule!==f.expensePerson)return false;
    if(f.expenseStatus&&expenseStatus(n.statut)!==f.expenseStatus)return false;
    const p=people.get(n.matricule);return !q||((n.objet||'')+' '+(n.lieu||'')+' N'+(n.numero||'')+' '+(p?.nom||'')+' '+(p?.prenom||'')).toLowerCase().includes(q);
  }).sort((a,b)=>(b.dateNote||'').localeCompare(a.dateNote||'')||number(b.numero)-number(a.numero));
}
export function paginate<T>(items:T[],requested:number,per:number){const pages=Math.max(1,Math.ceil(items.length/per)),page=Math.min(Math.max(1,requested),pages);return {page,pages,total:items.length,items:items.slice((page-1)*per,page*per)};}
export function codeInput(form:HTMLFormElement){
  const get=(key:string)=>String(new FormData(form).get(key)||'').trim();
  const d={code1:get('caC1')!==''?Number(get('caC1')):null,code2:get('caC2')!==''?Number(get('caC2')):null,pilote:get('caPil'),label:get('caLabel'),client:get('caClient'),montantHT:number(get('caHT')),progress:Math.max(0,Math.min(100,number(get('caProg'))))};
  if(d.code1==null&&d.code2==null&&!d.label)throw new Error('Renseignez au moins un code ou un nom.');return d;
}
export function invoiceInput(form:HTMLFormElement){
  const fields=new FormData(form),get=(key:string)=>String(fields.get(key)||'').trim();
  const d={dateFacture:get('fvDate'),number:get('fvNum'),code:get('fvCode'),client:get('fvClient'),ht:number(get('fvHT')),ttc:number(get('fvTTC')),dateEnvoi:get('fvSent')||null,datePaiement:get('fvPay')||null};
  if(!d.dateFacture&&!d.number)throw new Error('Date ou numéro de facture requis.');return d;
}
export type Command='section'|'clients'|'clientsRetry'|'newCode'|'editCode'|'deleteCode'|'newInvoice'|'editInvoice'|'deleteInvoice'|'uploadPdf'|'originalPdf'|'createFacturx'|'finalFacturx'|'removePdf'|'removeFacturx'|'importSql'|'exportCodes'|'exportInvoices'|'newExpense'|'editExpense'|'deleteExpense'|'duplicateExpense'|'expensePdf';
