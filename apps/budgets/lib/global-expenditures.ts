import { round, type GlobalExpenditure, type GlobalExpenditureFile, type Project, type Workspace } from "./budget-model.ts";
import { costCategory } from "./cost-categories.ts";
import { addCalendarMonths } from "./project-dates.ts";

const norm=(s:unknown)=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const str=(s:unknown)=>String(s??"").trim();
const empty=(v:unknown)=>v===null||v===undefined||v==="";
const headers={
  project:["ID du projet","Id progetto"],partnerDatabase:["ID du partenaire","ID partner"],partner:["Numéro du partenaire","Numero del partner"],name:["Nom de l'organisation dans la langue originale","Nome dell'organizzazione in lingua originale","Nome dell'organizzazione nella lingua originaria"],
  reportDatabase:["ID du rapport du partenaire de la base de données","ID del report del partner dal database"],report:["ID du rapport du partenaire","ID del report del partner"],status:["Statut du rapport du partenaire","Status del report del partner"],version:["Version FC du rapport du partenaire liée","Versione AF collegata al report del partner"],period:["Rapport du partenaire Période de reporting","Periodo di rendicontazione del report del partner"],
  database:["ID de la base de données","ID dal database"],id:["ID de la poste","ID voce"],category:["Catégorie de coût","Categoria di costo"],procurement:["Marché public","Appalto"],reference:["N° de référence interne.","N. riferimento interno"],invoice:["N° de facture","N. fattura"],invoiceDate:["Date de la facture","Data fattura"],payment:["Date de paiement","Data pagamento"],description:["Description","Descrizione"],comment:["Commentaire (partenaire)","Commento (partner)"],invoiceAmount:["Montant totale facture","Valore totale della fattura"],currency:["Devise","Valuta"],declared:["Montant déclaré en EUR","Importo dichiarato (in EUR)"],deducted:["Montant déduit en EUR par contrôle","Importo dedotto da controllo (in EUR)"],certified:["Montant certifié en EUR par contrôle","Importo certificato da controllo (in EUR)"],parked:["Poste préenregistrée par contrôle","Voce preregistrata da controllo"],controlComment:["Commentaire par contrôle","Commento da controllo"],verified:["Montant après vérification","Importo post-verifica"],verificationParked:["Postes préenregistrées par SC/AG (vérification du rapport de projet)","Voce preregistrata da SC/AdG (verifica del report di progetto)"],verificationComment:["Commentaire (vérification du rapport de projet)","Commento (verifica del report di progetto)"]
} as const;
type Field=keyof typeof headers;
function numeric(value:unknown,label:string,optional=false):number|undefined {
  if(empty(value)){if(optional)return undefined;throw new Error(`${label} : montant absent.`)}
  if(typeof value!=="number"||!Number.isFinite(value))throw new Error(`${label} : une valeur numérique Excel est attendue.`);
  return round(value);
}
function date(value:unknown):string|undefined {
  if(empty(value))return undefined;
  if(value instanceof Date)return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
  if(typeof value==="number")return new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10);
  const result=str(value).match(/^(\d{4}-\d{2}-\d{2})(?:\s|T|$)/)?.[1];
  if(!result||!Number.isFinite(Date.parse(result))||new Date(result).toISOString().slice(0,10)!==result)throw new Error("Date de facture ou de paiement illisible.");
  return result;
}
function flag(value:unknown):boolean {
  const n=norm(value);if(["","non","no","false","0"].includes(n))return false;
  if(["oui","si","yes","true","1"].includes(n))return true;
  throw new Error(`Indicateur de dépense mise en attente inconnu : ${str(value)}.`);
}
function status(value:unknown):GlobalExpenditure["reportStatus"] {
  const n=norm(value);
  if(["certifie","certificato","certified"].includes(n))return "certified";
  if(["envoye","soumis","inviato","submitted","incontrol","encontrole","incontrollo"].includes(n))return "submitted";
  if(["brouillon","bozza","draft","reouvert","riaperto","reopened"].includes(n))return "draft";
  throw new Error(`Statut du rapport non reconnu : ${str(value)}.`);
}
export function parseGlobalExpenditureRows(rows:unknown[][],file:string,hash:string):GlobalExpenditureFile {
  if(rows.length>20003)throw new Error("L’export dépasse 20 000 dépenses.");
  const title=str(rows[0]?.[0]);
  const metadata=title.match(/Expenditures data\s*-\s*Export language:\s*(fr|it)\s*-\s*Data language:\s*(fr|it)\s*-\s*PartnerID:\s*(\d+)\s*-\s*(\d{4})\.(\d{2})\.(\d{2})\s*-\s*(\d{2}:\d{2}:\d{2})/i);
  if(!metadata)throw new Error("Sélectionnez un export Global List of Expenditures JEMS, avec langue d’export et langue de saisie français ou italien.");
  const [,exportLanguage,dataLanguage,partnerDatabaseId,y,m,d,time]=metadata;
  const columns={} as Record<Field,number>,labels=(rows[1]||[]).map(norm);
  for(const field of Object.keys(headers) as Field[]){
    const aliases=headers[field].map(norm),indices=labels.flatMap((v,i)=>aliases.includes(v)?[i]:[]);
    if(indices.length!==1)throw new Error(`Colonne absente ou ambiguë : ${headers[field][0]}. Utilisez l’export global détaillé de JEMS.`);
    columns[field]=indices[0];
  }
  const parsed:GlobalExpenditure[]=[];
  let externalProjectId="",partnerId="",partnerName="";
  for(let index=2;index<rows.length;index++){
    const row=rows[index];if(row.every(empty))continue;
    const cell=(key:Field)=>row[columns[key]],sourceRow=index+1;
    const databaseId=str(cell("database")),reportDatabaseId=str(cell("reportDatabase"));
    const reportNumber=Number(str(cell("report")).match(/^R\.?\s*(\d+)$/i)?.[1]);
    const p=str(cell("period")).match(/(?:Période|Periodo)\s*(\d+).*?(?:mois|mese)\s*(\d+)\s*-\s*(\d+)/i);
    const id=str(cell("id")).replace(/\s/g,"").replace(/^R\./i,"R");
    if(!/^\d+$/.test(databaseId)||!/^\d+$/.test(reportDatabaseId)||!/^R\d+\.\d+$/.test(id)||!reportNumber||!p)throw new Error(`Ligne ${sourceRow} : identifiant ou période JEMS illisible.`);
    if(str(cell("partnerDatabase"))!==partnerDatabaseId)throw new Error(`Ligne ${sourceRow} : partenaire différent du titre de l’export.`);
    if(parsed.length && (norm(externalProjectId)!==norm(cell("project"))||norm(partnerId)!==norm(cell("partner"))||norm(partnerName)!==norm(cell("name"))))throw new Error("Un export doit concerner un seul projet et un seul partenaire.");
    externalProjectId=str(cell("project"));partnerId=str(cell("partner"));partnerName=str(cell("name"));
    const category=costCategory(str(cell("category")));
    if(category.id==="other")throw new Error(`Ligne ${sourceRow} : catégorie de coût non reconnue (${str(cell("category"))}).`);
    const text={description:str(cell("description")),comment:str(cell("comment")),procurement:str(cell("procurement")),controlComment:str(cell("controlComment")),verificationComment:str(cell("verificationComment"))};
    const reportStatus=status(cell("status")),parked=flag(cell("parked"));
    const declared=numeric(cell("declared"),`Ligne ${sourceRow}, déclaré`)!;
    const certified=numeric(cell("certified"),`Ligne ${sourceRow}, certifié`,true),deducted=numeric(cell("deducted"),`Ligne ${sourceRow}, déduit`,true);
    if(reportStatus==="certified"&&!parked&&certified===undefined)throw new Error(`Ligne ${sourceRow} : montant certifié manquant pour un rapport certifié.`);
    if(reportStatus==="certified"&&!parked&&deducted!==undefined&&Math.abs(round(declared-deducted-certified!))>0.02)throw new Error(`Ligne ${sourceRow} : incohérence entre montants déclaré, déduit et certifié.`);
    parsed.push({id,databaseId,reportDatabaseId,reportNumber,periodNumber:Number(p[1]),firstMonth:Number(p[2]),lastMonth:Number(p[3]),reportStatus,applicationVersion:str(cell("version")),category:category.value,description:text.description,internalReference:str(cell("reference")),invoiceNumber:str(cell("invoice")),invoiceDate:date(cell("invoiceDate")),paymentDate:date(cell("payment")),invoiceAmount:numeric(cell("invoiceAmount"),`Ligne ${sourceRow}, facture`)!,declared,currency:"EUR",certified:reportStatus==="certified"?certified:undefined,deducted,verified:numeric(cell("verified"),`Ligne ${sourceRow}, après vérification`,true),parked,verificationParked:flag(cell("verificationParked")),sourcePage:0,sourceRow,text,procurement:text.procurement});
  }
  if(!parsed.length)throw new Error("Cet export ne contient aucune dépense.");
  if(new Set(parsed.map(e=>e.databaseId)).size!==parsed.length||new Set(parsed.map(e=>e.id)).size!==parsed.length)throw new Error("Identifiants de dépenses en double dans un même export. Vérifiez le fichier dans JEMS.");
  const reports=new Map<number,GlobalExpenditure>();
  for(const row of parsed){const prior=reports.get(row.reportNumber);if(prior&&["reportDatabaseId","periodNumber","firstMonth","lastMonth","reportStatus"].some(key=>prior[key as keyof GlobalExpenditure]!==row[key as keyof GlobalExpenditure]))throw new Error(`R.${row.reportNumber} : informations de période ou de statut contradictoires.`);reports.set(row.reportNumber,row)}
  return {file,hash,exportedAt:`${y}-${m}-${d}T${time}`,exportLanguage:exportLanguage.toLowerCase() as "fr"|"it",dataLanguage:dataLanguage.toLowerCase() as "fr"|"it",externalProjectId,partnerId,partnerDatabaseId,partnerName,rows:parsed};
}

export function validateGlobalProject(file:GlobalExpenditureFile,project:Project){
  if(!project.jems)throw new Error("Importez d’abord le budget JEMS du partenaire.");
  const number=(v:string)=>v.match(/^(?:PP|LP)\s*(\d+)$/i)?.[1];
  if(norm(file.externalProjectId)!==norm(project.jems.projectId)||!number(file.partnerId)||number(file.partnerId)!==number(project.jems.partnerId)||norm(file.partnerName)!==norm(project.jems.partnerName))throw new Error("Cet export appartient à un autre projet ou partenaire JEMS.");
  for(const row of file.rows){
    const period=project.periods.find(p=>p.id===`P${row.periodNumber}`);
    const start=addCalendarMonths(project.start,row.firstMonth-1),end=new Date(Date.parse(addCalendarMonths(project.start,row.lastMonth))+(-86400000)).toISOString().slice(0,10);
    if(!period||!project.periods.some(p=>p.start===start&&p.start<=period.start)||period.end!==(end>project.end?project.end:end)||row.firstMonth<1||row.lastMonth<row.firstMonth)throw new Error(`R.${row.reportNumber} : les mois de P${row.periodNumber} ne correspondent pas au calendrier du projet.`);
  }
}

// Only translated free text may differ between the two exports. An inconsistent
// pair is rejected atomically so amounts from different JEMS snapshots cannot mix.
const financialKeys=["id","databaseId","reportDatabaseId","reportNumber","periodNumber","firstMonth","lastMonth","reportStatus","category","internalReference","invoiceNumber","invoiceDate","paymentDate","invoiceAmount","declared","certified","deducted","verified","parked","verificationParked","applicationVersion"] as const;
export function mergeGlobalFiles(files:GlobalExpenditureFile[]){
  if(!files.length)return [];
  const base=files[0],rows=new Map(base.rows.map(row=>[row.databaseId,{...row,translations:{[base.dataLanguage]:row.text}}]));
  for(const file of files.slice(1)){
    if(norm(file.externalProjectId)!==norm(base.externalProjectId)||file.partnerDatabaseId!==base.partnerDatabaseId||norm(file.partnerId)!==norm(base.partnerId))throw new Error("Les exports concernent des projets ou partenaires différents.");
    if(file.rows.length!==rows.size)throw new Error("Les exports ne contiennent pas les mêmes dépenses. Réexportez les deux langues après la dernière modification dans JEMS.");
    for(const row of file.rows){
      const prior=rows.get(row.databaseId);
      if(!prior||financialKeys.some(key=>prior[key]!==row[key]))throw new Error(`${row.id} : les montants, le statut ou la période diffèrent entre les exports. Réexportez les deux langues depuis la même version JEMS.`);
      const existing=prior.translations[file.dataLanguage];
      if(existing&&JSON.stringify(existing)!==JSON.stringify(row.text))throw new Error(`${row.id} : deux versions différentes de la même langue de saisie. Gardez l’export le plus récent.`);
      rows.set(row.databaseId,{...prior,translations:{...prior.translations,[file.dataLanguage]:row.text}});
    }
  }
  return [...rows.values()].map(row=>({...row,description:row.translations.fr?.description||row.translations.it?.description||"",procurement:row.translations.fr?.procurement||row.translations.it?.procurement||""}));
}

export function replaceGlobalExpenditures(ws:Workspace,projectId:string,files:GlobalExpenditureFile[]){
  const project=ws.projects.find(p=>p.id===projectId);if(!project)throw new Error("Projet introuvable.");
  if(!files.length||files.length>2)throw new Error("Sélectionnez un ou deux exports globaux.");
  files.forEach(file=>validateGlobalProject(file,project));
  const merged=mergeGlobalFiles(files),old=ws.globalExpenditureImports?.find(i=>i.projectId===projectId);
  const previous=mergeGlobalFiles(old?.files||[]);
  if(previous.some(prior=>prior.reportStatus==="certified"&&merged.some(row=>row.databaseId===prior.databaseId&&row.reportStatus!=="certified")))throw new Error("La mise à jour ferait régresser une dépense certifiée. Vérifiez les exports JEMS.");
  // Same data-language with translated headings is one source, never a bilingual pair.
  const chosen=[...files].sort((a,b)=>b.exportedAt.localeCompare(a.exportedAt)).filter((f,i,all)=>all.findIndex(x=>x.dataLanguage===f.dataLanguage)===i);
  if(chosen.some(f=>{const prior=old?.files.find(x=>x.dataLanguage===f.dataLanguage);return prior&&f.exportedAt<prior.exportedAt}))throw new Error("Cet export est antérieur aux données actuellement importées. Utilisez les nouveaux exports JEMS.");
  const newIds=new Set(merged.map(e=>e.databaseId)),oldIds=new Set(previous.map(e=>e.databaseId));
  return {workspace:{...ws,demo:false,globalExpenditureImports:[...(ws.globalExpenditureImports||[]).filter(i=>i.projectId!==projectId),{projectId,importedAt:new Date().toISOString(),files:chosen}]} as Workspace,added:merged.filter(e=>!oldIds.has(e.databaseId)).length,retained:merged.filter(e=>oldIds.has(e.databaseId)).length,removed:previous.filter(e=>!newIds.has(e.databaseId)).length,rows:merged,missingLanguages:(["fr","it"] as const).filter(lang=>!chosen.some(f=>f.dataLanguage===lang)),duplicateLanguage:chosen.length<files.length};
}
export function removeGlobalExpenditures(ws:Workspace,projectId:string):Workspace {
  return {...ws,globalExpenditureImports:(ws.globalExpenditureImports||[]).filter(i=>i.projectId!==projectId)};
}
