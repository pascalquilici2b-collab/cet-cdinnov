import { addCalendarMonths } from "./project-dates.ts";
export type Period = { id: string; label: string; start: string; end: string };
export type Account = { code: string; label: string };
export type Client = { id: string; name: string; accounts: Account[]; logo?: string; aliases?: string[] };
export type Project = {
  id: string; clientId: string; acronym: string; name: string; start: string; end: string; periods: Period[];
  eligibleBudget: number; federRate: number; durationMonths?:number; logo?:string;
  jems?: { projectId:string; partnerId:string; partnerName:string; periodIds:string[]; exportTitle:string;partnerAbbreviation?:string;country?:string;programme?:string;version?:string;federAmount?:number };
  advance: { requested: boolean; received: boolean; rate: number; receivedDate?: string; recoveryPeriod: string; firstRecoveryRate: number };
  rules: { realRate: number; hrMode: "réel" | "forfait"; hrRate: number; missionMode: "réel" | "forfait"; missionRate: number; officeMode: "réel" | "forfait"; officeRate: number };
};
export type TimelineBlock={id:string;start:string;end:string;amount:number;color?:string};
export type Planning={schedule?:TimelineBlock[];scheduledPeriodIds?:string[];color?:string};
export type SubExpense = Planning & { id: string; label: string; amount: number; allocations?: Record<string, number>; account?: string };
export type JemsDetails = { comments?:string; procurement?:string; investment?:string; lumpSum?:string; unitType?:string; unitCount?:number; unitPrice?:number; unitCost?:string; flatRate?:number; costMode?:"réel"|"forfait"|"montant forfaitaire"; partnerId?:string; sourceRow?:number; jemsLabelSource?:"description"|"comments"|"category" };
export type BudgetLine = JemsDetails & Planning & { id: string; projectId: string; externalKey: string; category: string; description: string; amount: number; allocations: Record<string, number>; subExpenses: SubExpense[]; sourceVersion: number; account?: string; reference?: {description:string; category:string; amount:number; allocations:Record<string,number>} };
export type Payment = { id: string; amount: number; plannedDate: string; paidDate?: string };
export type Expense = { id: string; projectId: string; budgetLineId: string; label: string; vendor: string; account: string; planned: number; committed: number; payments: Payment[]; declaredPeriod?: string };
export type RecoveryChoice="none"|"first"|"balance"|"full";
export type DR = { id:string; projectId:string; periodId:string; certificateDate?:string; receiptDate?:string; recovery:number; recoveryOverride?:boolean; recoveryChoice?:RecoveryChoice; realHr?:number; realMission?:number; realOffice?:number; overrideDeclared?:number };
export type ImportRecord = { id:string; projectId:string; file:string; sheet:string; range:string; version:number; date:string; added:number; updated:number; before?:BudgetLine[]; after?:BudgetLine[] };
export type ReportExpenseAllocation = { budgetLineId:string; amount:number };
export type ReportExpense = { id:string; category:string; description:string; internalReference:string; paymentDate?:string; invoiceAmount:number; declared:number; currency:string; sourcePage:number; budgetLineId?:string; association?:"manual"|"automatic"; budgetAllocations?:ReportExpenseAllocation[];
  databaseId?:string; invoiceNumber?:string; invoiceDate?:string; procurement?:string; certified?:number; deducted?:number; verified?:number; parked?:boolean; verificationParked?:boolean; sourceRow?:number; translations?:Partial<Record<"fr"|"it",ExpenditureText>>; descriptionSource?:string;
};
export type ExpenditureText = { description:string; comment:string; procurement:string; controlComment:string; verificationComment:string };
export type GlobalExpenditure = ReportExpense & { databaseId:string; reportDatabaseId:string; reportNumber:number; periodNumber:number; firstMonth:number; lastMonth:number; reportStatus:"certified"|"submitted"|"draft"; applicationVersion:string; sourceRow:number; text:ExpenditureText };
export type GlobalExpenditureFile = { file:string; hash:string; exportedAt:string; exportLanguage:"fr"|"it"; dataLanguage:"fr"|"it"; externalProjectId:string; partnerId:string; partnerDatabaseId:string; partnerName:string; rows:GlobalExpenditure[] };
export type GlobalExpenditureImport = { projectId:string; importedAt:string; files:GlobalExpenditureFile[] };
export type ReportExpenseLink = { projectId:string; partnerDatabaseId:string; databaseId:string; expenseId:string; budgetLineId:string; budgetAllocations?:ReportExpenseAllocation[] };
export type ReportExpenseDescription = { projectId:string; externalProjectId:string; partnerId:string; expenseId:string; description:string };
export type ReportCaptureDescription = ReportExpenseDescription & { file:string; hash:string; importedAt:string };
export type ReportCategory = { category:string; budget:number; previous:number; current:number; cumulative:number; remaining:number; previouslyValidated:number; flatRate?:number };
export type PartnerReport = {
  id:string; projectId:string; externalProjectId:string; partnerId:string; partnerName:string; number:number;
  periodNumber:number; periodId:string; start:string; end:string; status:"certified"|"submitted";
  file:string; hash:string; exportedAt:string; importedAt:string; applicationVersion:string;
  declared:number; accepted?:number; previous:number; cumulative:number; budget:number;
  categories:ReportCategory[]; expenses:ReportExpense[]; warnings:string[];
  sourceKind?:"global"; financialOverview?:boolean; overviewMatches?:boolean; coveredPeriodIds?:string[];
};
export type Workspace = { reportPeriodCoverages?:Array<{projectId:string;externalProjectId:string;partnerId:string;number:number;firstPeriodId:string}>; clients:Client[]; projects:Project[]; budgetLines:BudgetLine[]; expenses:Expense[]; drs:DR[]; imports:ImportRecord[]; partnerReports?:PartnerReport[]; globalExpenditureImports?:GlobalExpenditureImport[]; reportExpenseLinks?:ReportExpenseLink[]; reportExpenseDescriptions?:ReportExpenseDescription[]; reportCaptureDescriptions?:ReportCaptureDescription[]; demo:boolean };

export const newId = () => crypto.randomUUID();
export const round = (n:number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function parseAmount(raw:unknown):number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return round(raw);
  const text=String(raw??"").trim().replace(/[\s\u00a0\u202f€]/g,"").replace(",",".");
  if (!text) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error("Saisissez un montant positif avec au plus deux décimales.");
  const result=Number(text);
  if (!Number.isFinite(result)) throw new Error("Montant invalide.");
  return round(result);
}
export const currency=(value:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:2}).format(value);
export const sum=(values:number[])=>round(values.reduce((a,b)=>a+b,0));
export const allocated=(allocations:Record<string,number>={})=>sum(Object.values(allocations));
export function projectPeriods(start:string,end:string):Period[]{
  const out:Period[]=[];let current=new Date(start+"T00:00:00Z");const finish=new Date(end+"T00:00:00Z");
  if(!Number.isFinite(+current)||!Number.isFinite(+finish)||current>finish)return out;
  while(current<=finish&&out.length<120){
    const next=new Date(addCalendarMonths(start,(out.length+1)*6)+"T00:00:00Z");
    const last=new Date(Math.min(+finish,+next-86400000));
    const id="P"+(out.length+1);
    out.push({id,label:id,start:current.toISOString().slice(0,10),end:last.toISOString().slice(0,10)});
    current=new Date(+last+86400000);
  }
  return out;
}
export function paymentAllocations(expense:Expense, periods:Period[]) {
  const result:Record<string,number>={};
  for(const payment of expense.payments){
    const date=payment.paidDate||payment.plannedDate;
    const period=periods.find(p=>date>=p.start&&date<=p.end);
    if(period)result[period.id]=round((result[period.id]||0)+payment.amount);
  }
  return result;
}
// Calendar geometry is independent of local time zone, and does not allocate money.
export function dayIndex(date:string){return Date.parse(date+"T00:00:00Z")/86400000}
export function calendarAxis(project:Pick<Project,"start"|"end">){
  const start=dayIndex(project.start),end=dayIndex(project.end)+1;
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return {days:1,months:[],years:[]};
  const months:{label:string; start:number; span:number; year:number}[]=[];
  let date=new Date(project.start+"T00:00:00Z");date.setUTCDate(1);
  while(date.getTime()/86400000<end){
    const current=date.getTime()/86400000;const next=new Date(date);next.setUTCMonth(next.getUTCMonth()+1);
    const left=Math.max(start,current),right=Math.min(end,next.getTime()/86400000);
    months.push({label:new Intl.DateTimeFormat("fr-FR",{month:"short",timeZone:"UTC"}).format(date),start:left-start,span:right-left,year:date.getUTCFullYear()});
    date=next;
  }
  const years:{label:string;start:number;span:number}[]=[];
  for(const month of months){const last=years[years.length-1];if(last?.label===String(month.year))last.span+=month.span;else years.push({label:String(month.year),start:month.start,span:month.span})}
  return {days:end-start,months,years};
}
export function setAllocation(line:BudgetLine,subId:string|undefined,periodId:string,value:number):BudgetLine {
  if(!Number.isFinite(value)||value<0)throw new Error("Montant invalide.");
  if(subId)return {...line,subExpenses:line.subExpenses.map(s=>s.id===subId?{...s,allocations:{...s.allocations,[periodId]:round(value)}}:s)};
  return {...line,allocations:{...line.allocations,[periodId]:round(value)}};
}
export type IncomingLine=JemsDetails & {key:string;category:string;description:string;amount:number;allocations:Record<string,number>; row:number};
export type ImportChoice={incoming:IncomingLine;target:string;replacePlanning:boolean};
export function readBudgetRows(selected:unknown[][],mapping:Record<string,string>,periods:Period[],firstRow:number,hasHeader:boolean):IncomingLine[]{
  const text=(v:unknown)=>String(v??"").trim();
  const output:IncomingLine[]=[];let category="";
  selected.forEach((row,index)=>{
    if(hasHeader&&index===0)return;
    const cell=(key:string)=>mapping[key]&&mapping[key]!=="none"?row[Number(mapping[key])]:"";
    category=text(cell("category"))||category;
    const description=text(cell("description"));
    if(!description||/^total\b|^sous[ -]total\b/i.test(description)||text(cell("amount"))==="")return;
    try{
      const amount=parseAmount(cell("amount"));const allocations:Record<string,number>={};
      for(const p of periods)if(mapping[p.id]&&mapping[p.id]!=="none"&&text(cell(p.id))!=="")allocations[p.id]=parseAmount(cell(p.id));
      output.push({description,category:category||"À classer",amount,allocations,key:text(cell("key")),row:firstRow+index});
    }catch{throw new Error("Montant invalide à la ligne Excel "+(firstRow+index)+". Vérifiez la plage et les colonnes sélectionnées.")}
  });
  return output;
}
export function matchImport(line:IncomingLine,existing:BudgetLine[]):string {
  const canonical=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/\s+/g," ").toLowerCase();
  const byKey=line.key?existing.filter(b=>b.externalKey===line.key):[];
  if(byKey.length===1)return byKey[0].id;
  if(byKey.length>1)return "skip";
  const byLabel=existing.filter(b=>canonical(b.description)===canonical(line.description)&&canonical(b.category)===canonical(line.category));
  return byLabel.length===1?byLabel[0].id:byLabel.length>1?"skip":"new";
}
export function mergeImport(all:BudgetLine[],projectId:string,choices:ImportChoice[],version:number){
  const keys=choices.filter(c=>c.target!=="skip"&&c.incoming.key).map(c=>c.incoming.key);
  if(new Set(keys).size!==keys.length)throw new Error("Identifiants JEMS en double dans la sélection.");
  const targets=choices.filter(c=>c.target!=="new"&&c.target!=="skip").map(c=>c.target);
  if(new Set(targets).size!==targets.length)throw new Error("Deux lignes ciblent la même enveloppe. Corrigez le rapprochement.");
  let added=0,updated=0; const result=[...all];
  for(const choice of choices){
    if(choice.target==="skip")continue;
    const incoming=choice.incoming;
    const {key:sourceKey,row:sourceRow,...details}=incoming;
    const reference={category:incoming.category,description:incoming.description,amount:incoming.amount,allocations:{...incoming.allocations}};
    if(choice.target==="new"){
      result.push({id:newId(),projectId,externalKey:sourceKey||"manual-match-"+newId(),...details,sourceRow,...reference,reference,subExpenses:[],sourceVersion:version});added++;continue;
    }
    const index=result.findIndex(b=>b.id===choice.target&&b.projectId===projectId);
    if(index<0)throw new Error("La ligne cible n’existe plus dans ce projet.");
    const old=result[index];
    result[index]={...old,...details,sourceRow,reference,externalKey:incoming.key||old.externalKey,sourceVersion:version,schedule:choice.replacePlanning?undefined:old.schedule,scheduledPeriodIds:choice.replacePlanning?undefined:old.scheduledPeriodIds,allocations:choice.replacePlanning?{...incoming.allocations}:old.allocations};
    updated++;
  }
  return {lines:result,added,updated};
}
