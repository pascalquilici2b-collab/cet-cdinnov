import * as XLSX from "xlsx";
import { allocated, matchImport, mergeImport, newId, parseAmount, projectPeriods, round, sum } from "./budget-model.ts";
import { projectEnd } from "./project-dates.ts";
import type { IncomingLine, Project, Workspace } from "./budget-model.ts";
import { clientMatches } from "./client-directory.ts";
import { canonicalClientName } from "./client-names.mjs";

const text=(v:unknown)=>String(v??"").trim();
export const normalize=(v:unknown)=>text(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[’']/g,"'").replace(/\s+/g," ");
export type JemsPartner={id:string;name:string;abbreviation:string;country?:string;federRate?:number;federAmount?:number;lines:IncomingLine[];rules:Partial<Project["rules"]>;warnings:string[]};
export type JemsBudget={sheet:string;title:string;projectId:string;acronym:string;programme?:string;version?:string;periodIds:string[];partners:JemsPartner[];lastRow:number};
const isTotal=(v:unknown)=>/^(total|totale|grand total|sous.total|subtotal)(\b|$)/.test(normalize(v));
function number(v:unknown,row:number,field:string){
  try{return parseAmount(v)}catch{throw new Error(`Ligne Excel ${row} : ${field} invalide (${text(v)}).`)}
}
function costFamily(category:string):"hr"|"office"|"mission"|undefined {
  const s=normalize(category);
  if(/personnel|personale|staff|human resource/.test(s))return "hr";
  if(/bureau|administrati|ufficio|office/.test(s))return "office";
  if(/deplacement|hebergement|viaggio|soggiorno|travel|accommodation|mission/.test(s))return "mission";
}

/** Budget lines come exclusively from sheet 2. Sheet 1 supplies partner funding metadata only. */
export function readJemsWorkbook(book:XLSX.WorkBook):JemsBudget{
  const sheet=book.SheetNames[1];
  if(!sheet)throw new Error("L’export JEMS doit contenir une deuxième feuille de budget partenaire.");
  const rows=XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheet],{header:1,range:0,defval:"",blankrows:true});
  if(rows.length>20000)throw new Error("L’export dépasse 20 000 lignes. Aucun import partiel n’a été effectué.");
  const h=(rows[2]||[]).map(normalize);
  if(!/partenaire|partner/.test(h[0]||"")||!/origine|original/.test(h[3]||"")||!/categor/.test(h[8]||"")||!/description|descrizione/.test(h[9]||"")||!/forfait|forfett|flat/.test(h[14]||""))
    throw new Error("Format JEMS non reconnu : les en-têtes attendus doivent être en ligne 3 de la deuxième feuille, avec le taux forfaitaire en colonne O.");
  const total=h.findIndex(v=>/^(total|totale)(\s*\(.*\))?$/.test(v));
  const periods=h.flatMap((v,i)=>{const m=v.match(/^(?:periode|periodo|period)\s*(\d+)$/);return m?[{id:"P"+Number(m[1]),col:i}]:[]});
  const prep=h.findIndex(v=>/preparation|preparazione/.test(v)),close=h.findIndex(v=>/cloture|conclusione|closure/.test(v));
  if(total<0||!periods.length||new Set(periods.map(p=>p.id)).size!==periods.length)throw new Error("Colonnes Total ou périodes JEMS manquantes ou répétées.");
  if(periods.some((p,i)=>p.id!=="P"+(i+1)))throw new Error("Les périodes JEMS doivent se suivre à partir de P1.");
  const title=text(rows[0]?.[0]),parts=title.split(" - ");
  const projectId=parts[1]?.trim()||"",acronym=parts[2]?.trim()||"";
  const partners=new Map<string,JemsPartner>(),occurrences=new Map<string,number>();
  rows.slice(3).forEach((r,index)=>{
    const row=index+4,id=text(r[0]),name=text(r[3]),category=text(r[8]);
    if(!r.some(v=>text(v))||isTotal(id))return;
    if(!id||!name||!category){if(text(r[total])&&number(r[total],row,"total")!==0)throw new Error(`Ligne Excel ${row} : partenaire ou catégorie absent. Import interrompu pour éviter de perdre cette ligne.`);return}
    if(isTotal(category))return;
    let partner=partners.get(id);
    if(!partner){partner={id,name,abbreviation:text(r[2]),country:text(r[5]),lines:[],rules:{},warnings:[]};partners.set(id,partner)}
    if(normalize(partner.name)!==normalize(name))throw new Error("Deux organismes différents portent le même numéro de partenaire : "+id);
    const flatRate=number(text(r[14]).replace(/\s*%$/,""),row,"taux forfaitaire");
    if(flatRate>100)throw new Error(`Ligne Excel ${row} : taux forfaitaire supérieur à 100 %.`);
    if(text(r[total])==="")throw new Error(`Ligne Excel ${row} : total absent.`);
    const amount=number(r[total],row,"total");
    const explicitDescription=text(r[9]),comments=text(r[10]);
    const useComments=!!comments&&(!explicitDescription||normalize(explicitDescription)===normalize(category));
    const description=useComments?comments:explicitDescription||category;
    const allocations:Record<string,number>={};
    for(const p of periods)allocations[p.id]=number(r[p.col],row,p.id);
    if(prep>=0&&number(r[prep],row,"préparation"))allocations.PREP=number(r[prep],row,"préparation");
    if(close>=0&&number(r[close],row,"clôture"))allocations.CLOSE=number(r[close],row,"clôture");
    if(Math.abs(round(amount-allocated(allocations)))>0.02)partner.warnings.push(`Ligne ${row} « ${description} » : le total diffère de la ventilation de ${round(amount-allocated(allocations))} €.`);
    const lumpSum=text(r[13]);
    const costMode=flatRate>0?"forfait":lumpSum?"montant forfaitaire":"réel";
    // No stable row ID is exported. Exclude amounts and period columns from identity.
    // Keep the original identity format so fixing a label never duplicates an existing row.
    const signature=JSON.stringify([projectId,id,...[category,text(r[9])||category,r[10],r[11],r[12],r[13],r[16]].map(normalize)]);
    const occurrence=(occurrences.get(signature)||0)+1;occurrences.set(signature,occurrence);
    const unitCount=Number(text(r[17]).replace(",",".")||0),unitPrice=Number(text(r[18]).replace(",",".")||0);
    if(!Number.isFinite(unitCount)||unitCount<0||!Number.isFinite(unitPrice)||unitPrice<0)throw new Error(`Ligne Excel ${row} : quantité ou prix unitaire invalide.`);
    partner.lines.push({key:"jems:"+signature+":"+occurrence,row,partnerId:id,category,description,jemsLabelSource:useComments?"comments":explicitDescription?"description":"category",amount,allocations,comments:text(r[10]),procurement:text(r[11]),investment:text(r[12]),lumpSum,flatRate,costMode,unitCost:text(r[15]),unitType:text(r[16]),unitCount,unitPrice});
  });
  for(const p of partners.values()){
    for(const family of ["hr","office","mission"] as const){
      const lines=p.lines.filter(l=>costFamily(l.category)===family);
      if(!lines.length)continue;
      const modes=new Set(lines.map(l=>l.flatRate? "forfait":"réel")),rates=new Set(lines.map(l=>l.flatRate||0));
      if(modes.size!==1||rates.size!==1)throw new Error(`Modes ou taux contradictoires pour ${p.name} (${family}). Vérifiez l’export.`);
      p.rules[family+"Mode" as "hrMode"|"officeMode"|"missionMode"]=[...modes][0] as "réel"|"forfait";
      p.rules[family+"Rate" as "hrRate"|"officeRate"|"missionRate"]=[...rates][0];
    }
  }
  if(!partners.size)throw new Error("Aucune ligne partenaire trouvée dans la deuxième feuille.");
  const summary=XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]],{header:1,defval:"",blankrows:true});
  const fundingHeader=summary.findIndex(row=>/partenaire|partner/.test(normalize(row[0]))&&row.some(v=>/^(feder|erdf).*(taux|rate|pourcentage|percentage)/.test(normalize(v))));
  if(fundingHeader>=0){
    const h=summary[fundingHeader].map(normalize),rateCol=h.findIndex(v=>/^(feder|erdf).*(taux|rate|pourcentage|percentage)/.test(v)),fundCol=h.findIndex(v=>/^(feder|erdf)$/.test(v));
    const found=new Set<string>();
    for(let index=fundingHeader+1;index<summary.length;index++){
      const row=summary[index],id=text(row[0]);if(!id||isTotal(id))break;
      const partner=partners.get(id);if(!partner)continue;
      if(found.has(id))throw new Error('Partenaire répété dans le tableau de financement : '+id);found.add(id);
      if(text(row[rateCol])){
        const rate=number(text(row[rateCol]).replace(/\s*%$/,""),index+1,'taux FEDER');
        if(rate>100)throw new Error('Taux FEDER supérieur à 100 % pour '+id);
        partner.federRate=rate;
      }
      if(fundCol>=0&&text(row[fundCol]))partner.federAmount=number(row[fundCol],index+1,'montant FEDER');
    }
  }
  return {sheet,title,projectId,acronym,programme:parts[0]?.trim(),version:parts[3]?.trim(),periodIds:periods.map(p=>p.id),partners:[...partners.values()],lastRow:rows.length};
}

export function createJemsProject(ws:Workspace,budget:JemsBudget,partnerId:string,file:string,details:{acronym:string;name:string;start:string;durationMonths:number;federRate:number}):{workspace:Workspace;projectId:string}{
  const partner=budget.partners.find(p=>p.id===partnerId);if(!partner)throw new Error('Choisissez un partenaire du fichier JEMS.');
  if(ws.projects.some(p=>p.jems?.projectId===budget.projectId&&p.jems?.partnerId===partnerId))throw new Error('Ce budget existe déjà. Ouvrez ce projet pour le mettre à jour.');
  const acronym=details.acronym.trim(),name=details.name.trim();
  if(!acronym||!name)throw new Error('Indiquez l’acronyme et le nom du projet.');
  if(!Number.isFinite(details.federRate)||details.federRate<0||details.federRate>100)throw new Error('Le taux FEDER doit être compris entre 0 et 100 %.');
  const end=projectEnd(details.start,details.durationMonths),periods=projectPeriods(details.start,end);
  if(periods.length<budget.periodIds.length)throw new Error('La durée doit couvrir les '+budget.periodIds.length+' périodes du fichier JEMS.');
  const id=newId(),existingClient=ws.clients.find(c=>clientMatches(c,partner.name)||clientMatches(c,partner.abbreviation));
  const project:Project={id,clientId:existingClient?.id||'',acronym,name,start:details.start,end,durationMonths:details.durationMonths,periods,eligibleBudget:0,federRate:partner.federRate??details.federRate,
    advance:{requested:false,received:false,rate:25,recoveryPeriod:periods[Math.min(3,periods.length-1)].id,firstRecoveryRate:60},
    rules:{realRate:partner.federRate??details.federRate,hrMode:'réel',hrRate:0,officeMode:'réel',officeRate:0,missionMode:'réel',missionRate:0}};
  return {workspace:applyJemsImport({...ws,projects:[...ws.projects,project]},id,{...budget,acronym},partnerId,file),projectId:id};
}

export function jemsChoices(ws:Workspace,projectId:string,partner:JemsPartner,replaceManual=false){
  const existing=ws.budgetLines.filter(b=>b.projectId===projectId),used=new Set<string>();
  return partner.lines.map(incoming=>{
    const exact=existing.find(b=>b.externalKey===incoming.key);
    let target=exact?.id||matchImport(incoming,existing.filter(b=>!used.has(b.id)));
    // Identical descriptions can be distinct JEMS rows. Never silently skip one.
    if(target==="skip"||used.has(target))target="new";
    if(target!=="new")used.add(target);
    const old=existing.find(b=>b.id===target);
    const unchanged=!old?.schedule&&old?.reference&&JSON.stringify(Object.entries(old.allocations).sort())===JSON.stringify(Object.entries(old.reference.allocations).sort());
    return {incoming,target,replacePlanning:replaceManual||!!unchanged||!old||!Object.keys(old.allocations).length};
  });
}
export function applyJemsImport(ws:Workspace,projectId:string,budget:JemsBudget,partnerId:string,file:string,replaceManual=false):Workspace{
  const p=ws.projects.find(p=>p.id===projectId),partner=budget.partners.find(p=>p.id===partnerId);
  if(!p||!partner)throw new Error("Projet ou client introuvable.");
  if(p.jems&&(p.jems.projectId!==budget.projectId||p.jems.partnerId!==partner.id))throw new Error("Ce projet est déjà lié à un autre projet ou partenaire JEMS. Créez un projet séparé pour ce budget.");
  const version=Math.max(0,...ws.imports.filter(i=>i.projectId===projectId).map(i=>i.version))+1;
  const merged=mergeImport(ws.budgetLines,projectId,jemsChoices(ws,projectId,partner,replaceManual),version);
  const current=ws.clients.find(c=>c.id===p.clientId);
  const namedClient=ws.clients.find(c=>clientMatches(c,partner.name));
  const client=namedClient||(current&&clientMatches(current,partner.abbreviation)?current:undefined);
  const clientId=client?.id||newId();
  const record={id:newId(),projectId,file,sheet:budget.sheet,range:"4:"+budget.lastRow,version,date:new Date().toISOString(),added:merged.added,updated:merged.updated,before:structuredClone(ws.budgetLines.filter(b=>b.projectId===projectId)),after:structuredClone(merged.lines.filter(b=>b.projectId===projectId))};
  return {...ws,demo:false,clients:client?ws.clients.map(c=>c.id===client.id&&!namedClient?{...c,name:canonicalClientName(partner.name),aliases:[...new Set([...(c.aliases||[]),c.name,partner.name])]}:c):[...ws.clients,{id:clientId,name:canonicalClientName(partner.name),aliases:[partner.name,partner.abbreviation].filter(Boolean),accounts:[]}],
    projects:ws.projects.map(x=>x.id===p.id?{...x,clientId,acronym:budget.acronym||x.acronym,eligibleBudget:sum(partner.lines.map(l=>l.amount)),federRate:partner.federRate??x.federRate,rules:{...x.rules,hrMode:"réel",hrRate:0,officeMode:"réel",officeRate:0,missionMode:"réel",missionRate:0,...partner.rules},jems:{projectId:budget.projectId,partnerId:partner.id,partnerName:partner.name,partnerAbbreviation:partner.abbreviation,country:partner.country,programme:budget.programme,version:budget.version,federAmount:partner.federAmount,periodIds:budget.periodIds,exportTitle:budget.title}}:x),
    budgetLines:merged.lines,imports:[...ws.imports,record]};
}
