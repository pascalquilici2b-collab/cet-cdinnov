import type { Workspace } from "./budget-model.ts";
import { EPCIC_ACCOUNTS } from "./epcic-accounts.ts";
const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[’']/g," ");
export const accountingPlan=()=>EPCIC_ACCOUNTS.map(({code,label})=>({code,label}));
export type AccountTarget={kind:"line"|"sub"|"expense";id:string;lineId?:string;label:string;category:string;account?:string;comments?:string};
export function accountTargets(ws:Workspace,projectId:string):AccountTarget[]{
 return [...ws.budgetLines.filter(b=>b.projectId===projectId).flatMap(b=>[{kind:"line" as const,id:b.id,label:b.description,category:b.category,account:b.account,comments:b.comments},...b.subExpenses.map(s=>({kind:"sub" as const,id:s.id,lineId:b.id,label:s.label,category:b.category,account:s.account}))]),...ws.expenses.filter(e=>e.projectId===projectId).map(e=>({kind:"expense" as const,id:e.id,label:e.label,category:ws.budgetLines.find(b=>b.id===e.budgetLineId)?.category||"",account:e.account}))];
}
const hints:Array<{pattern:RegExp;code:string;score:number}>= [
 {pattern:/assistance|\bamo\b|consulenz|consultant|honoraire|traduct|traduz|interpret|coordination|coordinamento/,code:"622680",score:.86},
 {pattern:/comptabil|comptable|contabil/,code:"628510",score:.94},
 {pattern:/traiteur|catering|restauration|reception|repas/,code:"625700",score:.90},
 {pattern:/location.{0,15}salle|affitto.{0,15}sala/,code:"613230",score:.97},
 {pattern:/location.{0,15}vehicule|noleggio.{0,15}auto/,code:"613531",score:.94},
 {pattern:/location.{0,15}(sono|audio)|noleggio.{0,15}audio/,code:"613550",score:.94},
 {pattern:/deplacement.{0,12}personnel|viaggi.{0,12}personale/,code:"625111",score:.93},
 {pattern:/mission|voyage|viaggio|deplacement|hebergement|soggiorno|mobilite|mobilita/,code:"625180",score:.69},
 {pattern:/seminaire|seminario|congres/,code:"625601",score:.78},
 {pattern:/colloque|conference|convegno/,code:"618500",score:.76},
 {pattern:/publicit|promotion|communication|comunicazione/,code:"623103",score:.82},
 {pattern:/impression|stampa|imprimes/,code:"611300",score:.90},
 {pattern:/plateforme|site.{0,8}(web|internet)|developpement.{0,12}informati|chatbot|portail|piattaforma/,code:"611101",score:.92},
 {pattern:/charte graphique|graphisme|identite visuelle/,code:"623103",score:.93},
 {pattern:/redaction|livrable|appui technique|accompagnement/,code:"622680",score:.78},
 {pattern:/etude|recherche|benchmark|studio|ricerca/,code:"617000",score:.86},
 {pattern:/formation.{0,18}(intervenant|formateur)|formatore|honoraires.{0,15}formation/,code:"606251",score:.97},
 {pattern:/formation|formazione/,code:"606251",score:.78},
 {pattern:/workshop|atelier|laboratorio/,code:"618500",score:.65},
 {pattern:/evenement|evento|comite de pilotage/,code:"625700",score:.66},
 {pattern:/bureau et administration|ufficio e amministrazione/,code:"60122",score:.65},
 {pattern:/fournitures.{0,12}bureau|cancelleria/,code:"606421",score:.92},
 {pattern:/fournitures.{0,12}informati|consommables.{0,12}informati/,code:"606424",score:.96},
 {pattern:/equipement.{0,15}(it|informatique)|ordinateur|computer|attrezzature.{0,12}informatic/,code:"861830",score:.92},
 {pattern:/logiciel|software/,code:"860500",score:.93},
 {pattern:/mobilier|arredi/,code:"861840",score:.91},
 {pattern:/salaire|remuneration|stipendi|personnel|personale|ressources humaines/,code:"60140",score:.82},
 {pattern:/charges sociales|oneri sociali/,code:"60145",score:.95},
 {pattern:/infrastruct|amenagement|construction|costruzion/,code:"861350",score:.78},
 {pattern:/prestation|external|externe|esterni/,code:"611880",score:.50},
];
export function accountCandidates(ws:Workspace,clientId:string,target:AccountTarget){
 const projects=ws.projects.filter(p=>p.clientId===clientId).map(p=>p.id);
 const history=projects.flatMap(id=>accountTargets(ws,id)).filter(t=>t.account&&t.id!==target.id);
 const label=normalize(target.label),context=normalize(target.label+" "+(target.comments||""));
 const staffLine=target.kind==="line"&&/personnel|personale|staff costs|ressources humaines/.test(normalize(target.category));
 const words=(s:string)=>new Set(normalize(s).match(/[a-z]{4,}/g)?.filter(w=>!["frais","autres","pour","dans","projet","progetto","services","costi","couts"].includes(w))||[]);
 const candidates=EPCIC_ACCOUNTS.filter(a=>a.kind!=="produit"&&(!staffLine||["60140","60145"].includes(a.code))).map(a=>{
   let score=0,reason="Libellé EPCIC : "+a.label;
   if(staffLine&&a.code==="60140"){score=.85;reason="Catégorie JEMS : frais de personnel"}
   const targetWords=words(target.label),referenceWords=words(a.label);
   const shared=[...referenceWords].filter(w=>targetWords.has(w)).length;
   // A single shared word must not outrank the actual nature of the service.
   if(shared)score=normalize(a.label)===label ? .95 : Math.min(.49,shared/Math.max(1,referenceWords.size)*.49);
   for(const hint of hints.filter(h=>h.code===a.code)){
     const value=hint.pattern.test(label)?hint.score:hint.pattern.test(context)?hint.score*.65:0;
     if(value>score){score=value;reason="Correspondance avec « "+target.label+" »"}
   }
   for(const prior of history.filter(t=>t.account===a.code)){
     if(normalize(prior.label)===label){score=1;reason="Même libellé déjà affecté pour ce client";break}
   }
   return {code:a.code,label:a.label,score,reason,confidence:score>=.85?"Forte":"À vérifier"};
 }).filter(c=>c.score>=.35).sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code));
 return candidates.slice(0,5);
}
export function suggestAccount(ws:Workspace,clientId:string,target:AccountTarget){
 const candidates=accountCandidates(ws,clientId,target),top=candidates[0];
 return top&&top.score>=.5&&(!candidates[1]||top.score-candidates[1].score>=.06)?top:null;
}
export function accountProposal(ws:Workspace,clientId:string,target:AccountTarget){
 if(target.account)return {code:target.account,label:accountingPlan().find(a=>a.code===target.account)?.label||"Compte affecté",status:"Affecté",reason:"Compte retenu",certain:true};
 const candidates=accountCandidates(ws,clientId,target),top=candidates[0];
 if(!top)return {code:"",label:"Prestation à préciser",status:"À préciser",reason:"Ajoutez une précision sur la prestation.",certain:false};
 const certain=top.score>=.8&&(!candidates[1]||top.score-candidates[1].score>=.06);
 return {...top,status:certain?"Proposé":"Proposé · à confirmer",certain};
}
export function applyAccountChoices(ws:Workspace,projectId:string,choices:Record<string,string>):Workspace{
 const allowed=new Set(EPCIC_ACCOUNTS.map(a=>a.code));
 const choose=(key:string,prior?:string)=>Object.hasOwn(choices,key)&&(choices[key]===""||allowed.has(choices[key]))?choices[key]:prior;
 return {...ws,budgetLines:ws.budgetLines.map(b=>b.projectId===projectId?{...b,account:choose("line:"+b.id,b.account),subExpenses:b.subExpenses.map(s=>({...s,account:choose("sub:"+s.id,s.account)}))}:b),expenses:ws.expenses.map(e=>e.projectId===projectId?{...e,account:choose("expense:"+e.id,e.account)||""}:e)};
}
