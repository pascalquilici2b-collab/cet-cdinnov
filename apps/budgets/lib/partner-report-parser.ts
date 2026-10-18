import type { PartnerReport, ReportCategory, ReportExpense } from "./budget-model.ts";
import { round, sum } from "./budget-model.ts";
import { costCategory } from "./cost-categories.ts";

export type PdfText = {text:string;x:number;y:number;width:number;height:number};
export type PdfPage = {number:number;width:number;height:number;items:PdfText[]};
const norm=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const order=(a:PdfText,b:PdfText)=>Math.abs(a.y-b.y)>2?a.y-b.y:a.x-b.x;
const words=(items:PdfText[])=>[...items].sort(order).map(i=>i.text).join(" ").replace(/\s+/g," ").trim();
const isMoney=(s:string)=>/^-?\d[\d.\s\u00a0\u202f]*,\d{2}$/.test(s.trim());
const amount=(s:string)=>{if(!isMoney(s))throw new Error("Montant illisible dans le PDF : "+s);return round(Number(s.replace(/[.\s\u00a0\u202f]/g,"").replace(",",".")))};
const moneyAt=(page:PdfPage,y:number)=>page.items.filter(i=>Math.abs(i.y-y)<2 && isMoney(i.text)).sort((a,b)=>a.x-b.x).map(i=>amount(i.text));
const textPage=(p:PdfPage)=>words(p.items);
const close=(a:number,b:number)=>Math.abs(round(a-b))<=0.01;

function field(page:PdfPage,label:string){
  const key=page.items.find(i=>norm(i.text)===norm(label));
  if(!key)throw new Error("Champ du rapport introuvable : "+label);
  const value=words(page.items.filter(i=>Math.abs(i.y-key.y)<2 && i.x>key.x+key.width+8));
  if(!value)throw new Error("Champ du rapport vide : "+label);
  return value;
}
function validDate(s:string){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}

export function parsePartnerReport(pages:PdfPage[],file:string,hash:string):PartnerReport {
  const identification=pages.find(p=>p.items.some(i=>norm(i.text)==="id du rapport partenaire"));
  if(!identification)throw new Error("Ce PDF n’est pas un export de rapport partenaire JEMS en français, ou son texte n’est pas lisible.");
  const projectText=field(identification,"ID et acronyme du projet");
  const externalProjectId=projectText.match(/^(IF\s+Marittimo\d+)/i)?.[1];
  if(!externalProjectId)throw new Error("Format de projet non reconnu. Cet import prend en charge les rapports JEMS Maritime en français.");
  const number=Number(field(identification,"ID du rapport partenaire").match(/^R\.?\s*(\d+)$/i)?.[1]);
  const partnerId=field(identification,"Numéro du partenaire").match(/^(?:LP|PP)\s*\d+/i)?.[0].replace(/\s/g,"")||"";
  const partnerName=field(identification,"Nom de l'organisme dans la langue d'origine");
  const start=field(identification,"Date de début de la période de reporting"),end=field(identification,"Date de fin de la période de reporting");
  const periodNumber=Number(field(identification,"Période de reporting").match(/Période\s+(\d+)/i)?.[1]);
  if(!number||number>1000||!partnerId||!periodNumber||periodNumber>120||!validDate(start)||!validDate(end)||start>end)throw new Error("Identification ou période du rapport invalide.");
  const statusText=norm(field(identification,"Statut du rapport de partenaire"));
  const status=/^certifie/.test(statusText)?"certified":/^(envoye|soumis|submitted)/.test(statusText)?"submitted":undefined;
  if(!status)throw new Error("Seuls les rapports envoyés et certifiés peuvent être importés. Statut trouvé : "+statusText);
  const stamp=textPage(identification).match(/Version FC\s+([\d.]+),\s*(\d{2})\.(\d{2})\.(\d{4}),\s*(\d{2}):(\d{2})/i);
  if(!stamp)throw new Error("Date d’export du rapport introuvable.");
  const exportedAt=`${stamp[4]}-${stamp[3]}-${stamp[2]}T${stamp[5]}:${stamp[6]}:00`;
  const warnings:string[]=[];
  const expenses:ReportExpense[]=[];
  let inExpenses=false;
  for(const page of pages){
    if(page.items.some(i=>norm(i.text)==="liste des depenses"))inExpenses=true;
    if(inExpenses && page.items.some(i=>/^(contributions|apercu financier)$/.test(norm(i.text))))inExpenses=false;
    if(!inExpenses)continue;
    const header=page.items.find(i=>i.text==="ID" && i.x<page.width*.2);
    if(!header)throw new Error(`Page ${page.number} : colonnes de dépenses non reconnues.`);
    const headers=page.items.filter(i=>Math.abs(i.y-header.y)<22);
    const x=(text:string)=>{const found=headers.find(i=>norm(i.text)===norm(text));if(!found)throw new Error(`Page ${page.number} : colonne ${text} introuvable.`);return found.x};
    const categoryX=x("Catégorie de"),contractX=x("Nom du contrat"),referenceX=x("référence"),dateX=x("paiement");
    const anchors=page.items.filter(i=>Math.abs(i.x-header.x)<3 && i.y>header.y+15 && /^R\s*\.?\s*\d+\s*\.\s*\d*$/.test(i.text)).sort((a,b)=>a.y-b.y);
    for(let index=0;index<anchors.length;index++){
      const anchor=anchors[index];
      const row=page.items.filter(i=>i.y>=anchor.y-2 && i.y<(anchors[index+1]?.y ?? page.height-30)-2);
      const cell=(left:number,right:number)=>words(row.filter(i=>i.x>=left-2&&i.x<right-2));
      const id=cell(header.x,categoryX).replace(/\s/g,"").replace(/^R\./,"R");
      if(!/^R\d+\.\d+$/.test(id))throw new Error(`Page ${page.number} : identifiant de dépense illisible.`);
      const category=cell(categoryX,contractX),description=cell(contractX,referenceX),internalReference=cell(referenceX,dateX);
      const paymentText=words(row.filter(i=>Math.abs(i.x-dateX)<3)).replace(/\s/g,"");
      if(paymentText && !validDate(paymentText))throw new Error(`${id} : date de paiement illisible.`);
      const amounts=row.filter(i=>i.x>dateX+30 && isMoney(i.text)).sort((a,b)=>a.x-b.x);
      if(amounts.length<4)throw new Error(`${id} : montants incomplets.`);
      const currency=row.find(i=>/^[A-Z]{3}$/.test(i.text))?.text;
      if(currency!=="EUR")throw new Error(`${id} : cet import PDF prend en charge les dépenses en EUR.`);
      expenses.push({id,category,description,internalReference,paymentDate:paymentText||undefined,invoiceAmount:amount(amounts[0].text),declared:amount(amounts.at(-1)!.text),currency,sourcePage:page.number});
    }
  }
  if(new Set(expenses.map(e=>e.id)).size!==expenses.length)throw new Error("Le PDF contient des identifiants de dépenses répétés. Vérifiez les dépenses reportées avant l’import.");
  const summary=pages.find(p=>norm(textPage(p)).includes("depenses du partenaire - resume"));
  const categoryPage=pages.find(p=>norm(textPage(p)).includes("ventilation par categorie de couts"));
  if(!summary||!categoryPage)throw new Error("Aperçu financier incomplet : résumé et ventilation par catégorie requis.");
  const total=summary.items.find(i=>i.text==="Total"&&i.x<summary.width*.2);
  if(!total)throw new Error("Total de l’aperçu financier introuvable.");
  const totals=moneyAt(summary,total.y);
  if(totals.length!==(status==="certified"?7:6) && !(status==="submitted"&&totals.length===7))throw new Error("Colonnes du résumé financier non reconnues.");
  const [budget,previous,declared,cumulative]=totals;
  const accepted=status==="certified"?totals[6]:undefined;
  const categories:ReportCategory[]=[];
  const moneyRows=[...new Set(categoryPage.items.filter(i=>isMoney(i.text)).map(i=>Math.round(i.y*10)/10))].sort((a,b)=>a-b);
  for(let i=0;i<moneyRows.length;i++){
    const y=moneyRows[i],values=moneyAt(categoryPage,y);
    if(values.length!==6)throw new Error("Colonnes de ventilation par catégorie non reconnues.");
    const left=categoryPage.items.filter(t=>t.x<categoryPage.width*.2 && Math.abs(t.y-y)<12 && t.y>(moneyRows[i-1]??0)+3 && t.y<(moneyRows[i+1]??Infinity)-3);
    const category=words(left);
    if(category==="Total")continue;
    if(!category)throw new Error("Libellé de catégorie illisible.");
    const percent=categoryPage.items.find(t=>t.x<categoryPage.width*.28 && Math.abs(t.y-y)<2 && /^\d+(?:,\d+)?%$/.test(t.text));
    categories.push({category,budget:values[0],previous:values[1],current:values[2],cumulative:values[3],remaining:values[4],previouslyValidated:values[5],flatRate:percent?Number(percent.text.replace("%","").replace(",",".")):undefined});
  }
  if(!close(sum(categories.map(c=>c.current)),declared)||!close(sum(categories.map(c=>c.budget)),budget)||!close(previous+declared,cumulative))throw new Error("Les totaux financiers extraits ne concordent pas. Aucun montant n’a été enregistré.");
  for(const c of categories){
    const detail=sum(expenses.filter(e=>costCategory(e.category).id===costCategory(c.category).id).map(e=>e.declared));
    if(c.flatRate){if(detail!==0)throw new Error(`Forfait ${c.category} également présent dans la liste : vérification nécessaire.`)}
    else if(!close(detail,c.current))throw new Error(`La liste des dépenses (${detail.toFixed(2)} €) diffère de l’aperçu financier (${c.current.toFixed(2)} €) pour ${c.category}. Vérifiez le PDF ou utilisez un export complet.`);
  }
  if(!close(sum(expenses.map(e=>e.declared))+sum(categories.filter(c=>c.flatRate).map(c=>c.current)),declared))throw new Error("La liste des dépenses et les forfaits ne correspondent pas au total déclaré.");
  if(accepted!==undefined && !close(accepted,declared))warnings.push(`Écart après contrôle : ${round(declared-accepted).toFixed(2)} €. Ce PDF ne donne pas les montants certifiés par dépense ; l’écart reste à rapprocher.`);
  if(previous>0)warnings.push("Les cumuls antérieurs sont conservés pour contrôle. Ils ne remplacent pas l’import des rapports précédents.");
  if(expenses.some(e=>e.paymentDate && (e.paymentDate<start||e.paymentDate>end)))warnings.push("Certaines dates de paiement sont hors de la période du rapport. Le rattachement déclaratif suit la période JEMS ; les dates de paiement sont conservées.");
  return {id:"",projectId:"",externalProjectId,partnerId,partnerName,number,periodNumber,periodId:`P${periodNumber}`,start,end,status,file,hash,exportedAt,importedAt:"",applicationVersion:stamp[1],budget,previous,declared,cumulative,accepted,categories,expenses,warnings};
}
