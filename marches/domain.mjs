export const TYPES = {framework:'Accord-cadre à bons de commande',fixed:'Marché forfaitaire',quote:'Devis accepté',mixed:'Marché mixte'};
export const UNITS = {day:'Jour',hour:'Heure',flat:'Forfait',unit:'Unité',km:'Kilomètre'};
export const BILLING = {actual:'Au réel',fixed:'Forfait',milestone:'Jalon',schedule:'Échéancier',mixed:'Mixte'};
export const CONDITIONS={payment:'Paiement',billing:'Facturation / échéancier',orders:'Bons de commande',revision:'Révision des prix',expenses:'Frais et déplacements',deliverables:'Livrables',report:'Relevés d’intervention',tax:'TVA',other:'Autre condition'};
export function minor(value) {
  if(value === '' || value === null || value === undefined)return null;
  const s=String(value).trim().replace(/\s/g,'').replace(',','.');
  if(!/^\d{1,10}(\.\d{1,2})?$/.test(s))throw new Error('Montant positif avec deux décimales maximum requis.');
  const [a,b='']=s.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));
  if(!Number.isSafeInteger(n))throw new Error('Montant trop élevé.');
  return n;
}
export const money=(n,currency='EUR')=>n==null?'À préciser':new Intl.NumberFormat('fr-FR',{style:'currency',currency}).format(n/100);
export const dateValid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const key=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const overlaps=(a,b)=> (a.startDate||'0000')<=(b.endDate||'9999') && (b.startDate||'0000')<=(a.endDate||'9999');
function text(v,label,max=500,required=false) {
  if(v==null)v='';
  if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw new Error(label+' : valeur manquante ou trop longue.');
  return v.trim();
}
function choice(v,choices,label){if(!choices.includes(v))throw new Error(label+' : valeur invalide.');return v;}
function amount(v,label) {if(v===null)return null;if(!Number.isSafeInteger(v)||v<0||v>999999999999)throw new Error(label+' : montant invalide.');return v;}
function date(v,label){const s=text(v,label,10);if(s&&!dateValid(s))throw new Error(label+' : date invalide.');return s;}
function source(v={}){return {documentId:text(v?.documentId,'Pièce source',80),locator:text(v?.locator,'Page ou article',120),note:text(v?.note,'Note de lecture',1500)};}
function common(v,documentIds) {
  const r={id:text(v?.id,'Identifiant',80,true),status:choice(v?.status,['proposed','validated'],'Validation'),source:source(v?.source)};
  if(!/^[a-zA-Z0-9_-]+$/.test(r.id))throw new Error('Identifiant invalide.');
  if(r.source.documentId&&!documentIds.has(r.source.documentId))throw new Error('La pièce source ne fait pas partie de ce marché.');
  if(r.status==='validated'&&(!r.source.documentId||!r.source.locator))throw new Error('Pour valider une règle, rattachez sa pièce source et sa page ou son article.');
  return r;
}
export function emptyMarket() {
  return {title:'',reference:'',clientName:'',clientId:'',type:'framework',currency:'EUR',status:'draft',billingMode:'actual',notificationDate:'',startBasis:'',startDate:'',initialDurationMonths:null,maximumMinor:null,periodBasis:'unknown',renewalMode:'unknown',renewalCount:null,noMinimum:false,minimumMinor:null,feesIncluded:false,notes:'',prices:[],ceilings:[],periods:[],issues:[],conditions:[],projects:[]};
}
export function validateProjects(input=[],documentIds=new Set()){
 if(!Array.isArray(input)||input.length>100)throw new Error('Liste de projets invalide (100 maximum).');
 const seen=new Set(),orderIds=new Set();
 const id=(value,all)=>{const v=text(value,'Identifiant projet / commande',80,true);if(!/^[a-zA-Z0-9_-]+$/.test(v)||all.has(v))throw new Error('Identifiant projet / commande invalide ou en double.');all.add(v);return v;};
 return input.map(p=>{
  const project={id:id(p?.id,seen),name:text(p.name,'Nom du projet',180,true),code:text(p.code,'ID du projet',80),...(p.programme!==undefined?{programme:text(p.programme,'Programme du projet',160)}:{}),notes:text(p.notes,'Notes du projet',2000),archived:p.archived===true,orders:[]};
  if(p.startDate!==undefined)project.startDate=date(p.startDate,'Début du projet');
  if(p.endDate!==undefined)project.endDate=date(p.endDate,'Fin du projet');
  if(project.startDate&&project.endDate&&project.endDate<project.startDate)throw new Error('La fin du projet précède son début.');
  if(!Array.isArray(p.orders)||p.orders.length>100)throw new Error('Liste de bons de commande invalide (100 maximum par projet).');
  const refs=new Set();
  project.orders=p.orders.map(o=>{
   const order={id:id(o?.id,orderIds),reference:text(o.reference,'Référence du bon de commande',120,true),date:date(o.date,'Date de commande'),amountMinor:amount(o.amountMinor??null,'Montant du bon de commande'),documentId:text(o.documentId,'Pièce du bon de commande',80),notes:text(o.notes,'Notes de la commande',1500),archived:o.archived===true};
   if(refs.has(key(order.reference)))throw new Error('Deux bons de commande portent la même référence dans ce projet.');
   refs.add(key(order.reference));
   if(order.documentId&&!documentIds.has(order.documentId))throw new Error('La pièce du bon de commande ne fait pas partie de ce marché.');
   return order;
  });
  return project;
 });
}
export function validateMarket(input,documents=[]) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Fiche de marché invalide.');
  const ids=new Set(documents.map(d=>d.id));
  const m={
    title:text(input.title,'Objet du marché',240,true),reference:text(input.reference,'Référence',120),
    clientName:text(input.clientName,'Client contractant',240,true),clientId:text(input.clientId,'Client',80),
    type:choice(input.type,Object.keys(TYPES),'Type de marché'),currency:choice(input.currency,['EUR'],'Devise'),
    status:choice(input.status,['draft','validated','archived'],'État du marché'),
    billingMode:choice(input.billingMode,Object.keys(BILLING),'Facturation'),
    notificationDate:date(input.notificationDate,'Date portée sur la notification'),
    periodBasis:choice(input.periodBasis,['unknown','notification','calendar','custom'],'Périodes'),
    renewalMode:choice(input.renewalMode,['unknown','none','tacit','express'],'Reconduction'),
    renewalCount:input.renewalCount===null?null:Number(input.renewalCount),
    noMinimum:input.noMinimum===true,minimumMinor:amount(input.minimumMinor,'Minimum'),
    feesIncluded:input.feesIncluded===true,notes:text(input.notes,'Notes',6000)
  };
  // Optional fields preserve the wire shape of old contract snapshots.
  if(Object.hasOwn(input,'startBasis'))m.startBasis=choice(input.startBasis,['','notification','first_order','date'],'Démarrage');
  if(Object.hasOwn(input,'startDate'))m.startDate=date(input.startDate,'Date de démarrage');
  if(Object.hasOwn(input,'initialDurationMonths')){
    m.initialDurationMonths=input.initialDurationMonths===null?null:Number(input.initialDurationMonths);
    if(m.initialDurationMonths!==null&&![12,24,36].includes(m.initialDurationMonths))throw new Error('Durée initiale : choisissez 12, 24 ou 36 mois.');
  }
  if(Object.hasOwn(input,'maximumMinor'))m.maximumMinor=amount(input.maximumMinor,'Montant maximum contractuel');
  if(m.startBasis==='date'&&!m.startDate)throw new Error('Renseignez la date de démarrage du marché.');
  if(m.renewalCount!==null&&(!Number.isInteger(m.renewalCount)||m.renewalCount<0||m.renewalCount>20))throw new Error('Nombre de reconductions invalide.');
  if(m.noMinimum&&m.minimumMinor!==null)throw new Error('Le marché sans minimum ne peut pas avoir un montant minimum.');
  for(const list of ['prices','ceilings','periods','issues']){
    if(!Array.isArray(input[list])||input[list].length>150)throw new Error('Liste '+list+' invalide ou trop longue.');
    if(new Set(input[list].map(x=>x?.id)).size!==input[list].length)throw new Error('Identifiants en double dans '+list+'.');
  }
  m.periods=input.periods.map(v=>{
    const r={...common(v,ids),label:text(v.label,'Période',180,true),startDate:date(v.startDate,'Début de période'),endDate:date(v.endDate,'Fin de période'),decision:text(v.decision,'Décision de période',1500)};
    if(r.startDate&&r.endDate&&r.endDate<r.startDate)throw new Error('La fin de période précède son début.');
    if(r.status==='validated'&&(!r.startDate||!r.endDate||!r.decision))throw new Error('Une période validée exige ses deux dates et la justification de sa prise d’effet.');
    return r;
  });
  for(let i=0;i<m.periods.length;i++)for(let j=i+1;j<m.periods.length;j++){
    if(m.periods[i].status==='validated'&&m.periods[j].status==='validated'&&overlaps(m.periods[i],m.periods[j]))throw new Error('Deux périodes contractuelles validées se chevauchent.');
  }
  m.prices=input.prices.map(v=>{
    const r={...common(v,ids),label:text(v.label,'Prestation',240,true),profile:text(v.profile,'Profil',120),location:text(v.location,'Lieu / modalité',120),unit:choice(v.unit,Object.keys(UNITS),'Unité'),amountMinor:amount(v.amountMinor,'Tarif'),startDate:date(v.startDate,'Début du tarif'),endDate:date(v.endDate,'Fin du tarif'),notes:text(v.notes,'Note tarif',1500)};
    if(r.startDate&&r.endDate&&r.endDate<r.startDate)throw new Error('La fin du tarif précède son début.');
    if(r.status==='validated'&&r.amountMinor===null)throw new Error('Un tarif validé doit avoir un montant.');
    return r;
  });
  for(let i=0;i<m.prices.length;i++)for(let j=i+1;j<m.prices.length;j++){
    const a=m.prices[i],b=m.prices[j];
    if(a.status==='validated'&&b.status==='validated'&&['label','profile','location','unit'].every(k=>key(a[k])===key(b[k]))&&overlaps(a,b))throw new Error('Deux tarifs validés sont applicables à la même prestation, au même profil et au même lieu.');
  }
  m.ceilings=input.ceilings.map(v=>{
    const r={...common(v,ids),label:text(v.label,'Plafond',180,true),scope:choice(v.scope,['annual','contract','period'],'Périmètre'),periodId:text(v.periodId,'Période du plafond',80),amountMinor:amount(v.amountMinor,'Plafond'),basis:choice(v.basis,['HT','TTC'],'Base du plafond'),consumptionBasis:choice(v.consumptionBasis,['orders','invoices'],'Base de consommation'),notes:text(v.notes,'Note plafond',1500)};
    if(r.scope==='period'&&!m.periods.some(p=>p.id===r.periodId))throw new Error('Rattachez le plafond à une période existante.');
    if(r.scope!=='period')r.periodId='';
    if(r.status==='validated'&&r.amountMinor===null)throw new Error('Un plafond validé doit avoir un montant.');
    return r;
  });
  m.issues=input.issues.map(v=>{
    const s=source(v.source);
    if(s.documentId&&!ids.has(s.documentId))throw new Error('Pièce de contradiction étrangère au marché.');
    const r={id:text(v.id,'Identifiant',80,true),title:text(v.title,'Point à confirmer',240,true),detail:text(v.detail,'Détail',2500),blocking:v.blocking===true,status:choice(v.status,['open','resolved'],'Résolution'),resolution:text(v.resolution,'Décision',2000),source:s};
    if(r.status==='resolved'&&!r.resolution)throw new Error('Expliquez la résolution du point à confirmer.');
    return r;
  });
  const conditions=input.conditions??[];
  if(!Array.isArray(conditions)||conditions.length>150||new Set(conditions.map(v=>v?.id)).size!==conditions.length)throw new Error('Liste de conditions invalide.');
  m.conditions=conditions.map(v=>({...common(v,ids),category:choice(v.category,Object.keys(CONDITIONS),'Condition'),label:text(v.label,'Intitulé de condition',240,true),value:text(v.value,'Condition contractuelle',4000,true)}));
  if(Object.hasOwn(input,'projects'))m.projects=validateProjects(input.projects,ids);
  if(m.status==='validated'){
    const blockers=activationBlockers(m);
    if(blockers.length)throw new Error('Paramétrage non validable : '+blockers.join(' ; '));
  }
  return m;
}
export function marketTracking(m){
 const orders=(m.projects||[]).flatMap(p=>p.orders||[]).filter(o=>o.reference&&o.date);
 const orderedMinor=orders.reduce((sum,o)=>sum+(o.amountMinor??0),0);
 const maximumMinor=m.maximumMinor??m.ceilings?.find(c=>c.scope==='contract'&&c.basis==='HT')?.amountMinor??null;
 return {orderCount:orders.length,orderedMinor,unknownAmounts:orders.filter(o=>o.amountMinor==null).length,maximumMinor,
  startDate:m.startBasis==='notification'?m.notificationDate:m.startBasis==='first_order'?(orders.map(o=>o.date).sort()[0]||''):m.startDate||''};
}
export function activationBlockers(m) {
  const b=[];
  if(!m.reference)b.push('référence manquante');
  if(!m.prices.some(r=>r.status==='validated'))b.push('aucun tarif validé');
  else if(m.prices.some(r=>r.status!=='validated'))b.push('tarifs encore à vérifier');
  if(!m.periods.some(r=>r.status==='validated'))b.push('aucune période validée');
  if(m.periodBasis==='unknown')b.push('règle de période à préciser');
  if(m.renewalMode==='unknown')b.push('reconduction à préciser');
  if(m.type==='framework'&&!m.ceilings.some(r=>r.status==='validated'))b.push('plafond à valider');
  else if(m.ceilings.some(r=>r.status!=='validated'))b.push('plafonds encore à vérifier');
  if((m.conditions||[]).some(r=>r.status!=='validated'))b.push('conditions contractuelles encore à vérifier');
  if(m.issues.some(r=>r.blocking&&r.status==='open'))b.push('point contractuel bloquant non résolu');
  return b;
}
export function suggestFromText(text) {
  // Suggestions are deliberately narrow; they never become validated rules.
  const suggestions=[];
  const lines=String(text).split(/\n/).map(s=>s.trim()).filter(Boolean);
  for(const line of lines){
    const cap=line.match(/(?:maximum|plafond|montant maximal).*?(\d[\d \u00a0]*[,.]?\d{0,2})\s*(?:€|euros)/i);
    if(cap){try{suggestions.push({kind:'ceiling',value:minor(cap[1]),basis:/\bHT\b|hors taxes/i.test(line)?'HT':/\bTTC\b/i.test(line)?'TTC':null,annual:/annuel|par an|année/i.test(line),excerpt:line.slice(0,500)});}catch{}}
  }
  return suggestions.slice(0,20);
}
