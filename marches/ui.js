import {TYPES,UNITS,BILLING,emptyMarket,validateMarket,activationBlockers,minor,money} from './domain.mjs';
const labels={draft:'En préparation',validated:'Paramétrage validé',archived:'Archivé'};
const tabs={summary:'Fiche marché',documents:'Pièces',prices:'Tarifs',ceilings:'Plafonds',periods:'Périodes',issues:'Points à confirmer',history:'Historique'};
const kinds={ae:'Acte d’engagement',price:'Bordereau de prix',clauses:'Clauses / CCTP / CCAP',notification:'Notification',amendment:'Avenant',renewal:'Reconduction',offer:'Offre / devis',other:'Autre pièce'};
let s={rows:[],clients:[],current:null,docs:[],tab:'summary',dirty:false,busy:false,error:'',notice:'',loaded:false,history:null,epoch:0,query:''};
const html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el=id=>document.getElementById(id);
const uid=()=>crypto.randomUUID();
const allowed=()=>isAdmin(AUTH_USER);
function error(message){s.error=message;const box=el('marketMessage');if(box){box.innerHTML='<div class="mk-message mk-error" role="alert">'+html(message)+'</div>';box.scrollIntoView({block:'nearest'});}}
async function api(path='',options={}){
 const user=AUTH_USER,epoch=s.epoch,session=await budgetsEnsureSession();
 if(user!==AUTH_USER||epoch!==s.epoch)throw new Error('La session a changé.');
 const response=await fetch(budgetsApi()+'/markets'+path,{...options,headers:{Authorization:'Bearer '+session.token,...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers},cache:'no-store',signal:AbortSignal.timeout(60000)});
 if(user!==AUTH_USER||epoch!==s.epoch)throw new Error('La session a changé.');
 if(options.binary&&response.ok)return response.blob();
 let data;try{data=await response.json();}catch{throw new Error('Service des marchés indisponible. Votre saisie est conservée.');}
 if(!response.ok){if(response.status===401)budgetsClearSession();throw new Error(data.error||'Opération impossible.');}
 return data;
}
function setBusy(b){s.busy=b;document.querySelectorAll('#marketRoot button,#marketRoot input,#marketRoot select,#marketRoot textarea').forEach(e=>{if(b){if(e.dataset.wasDisabled===undefined)e.dataset.wasDisabled=String(e.disabled);e.disabled=true;}else if(e.dataset.wasDisabled!==undefined){e.disabled=e.dataset.wasDisabled==='true';delete e.dataset.wasDisabled;}});}
function dirty(){
 s.dirty=true;s.error='';s.notice='';
 if(el('mkSaveState'))el('mkSaveState').textContent='Modifications à enregistrer';
 if(el('marketMessage'))el('marketMessage').replaceChildren();
}
function safeLeave(){return !s.dirty||confirm('Des modifications de marché ne sont pas enregistrées. Quitter cette fiche ?');}
function forget(){s={rows:[],clients:[],current:null,docs:[],tab:'summary',dirty:false,busy:false,error:'',notice:'',loaded:false,history:null,epoch:s.epoch+1,query:''};}
async function enter(){
 if(!allowed()){render();return;}
 if(s.loaded){render();return;}
 s.busy=true;render();
 const epoch=s.epoch;
 try{const result=await api();if(epoch!==s.epoch)return;s.rows=result.markets;s.clients=result.clients||[];s.loaded=true;s.error='';}
 catch(e){if(epoch===s.epoch)s.error=e.message;}
 finally{if(epoch===s.epoch){s.busy=false;if(currentView==='marches')render();}}
}
async function open(id){
 if(!safeLeave())return;
 setBusy(true);
 const epoch=s.epoch;
 try{const r=await api('/'+id);if(epoch!==s.epoch)return;s.current=r.market;s.docs=r.documents;s.tab='summary';s.dirty=false;s.error='';s.notice='';s.history=null;render();}
 catch(e){if(epoch===s.epoch)error(e.message);}
 finally{if(epoch===s.epoch)setBusy(false);}
}
function newMarket(){
 if(!safeLeave())return;
 s.current={...emptyMarket(),id:uid(),version:0};s.docs=[];s.tab='summary';s.dirty=false;s.error='';s.notice='';s.history=null;render();el('mk-title')?.focus();
}
function field(path,label,value,{type='text',options,wide=false,help='',required=false,placeholder='',min,max,step}={}){
 const id='mk-'+path.replaceAll('.','-');
 const attrs=' id="'+id+'" data-path="'+html(path)+'" '+(required?'required ':'');
 let control;
 if(options)control='<select'+attrs+'>'+Object.entries(options).map(([v,t])=>'<option value="'+html(v)+'" '+(String(value??'')===v?'selected':'')+'>'+html(t)+'</option>').join('')+'</select>';
 else if(type==='textarea')control='<textarea'+attrs+' rows="3">'+html(value)+'</textarea>';
 else if(type==='checkbox')control='<input type="checkbox"'+attrs+' '+(value?'checked':'')+'>';
 else control='<input'+attrs+' type="'+type+'" value="'+html(value)+'" placeholder="'+html(placeholder)+'" '+(min!==undefined?' min="'+min+'"':'')+(max!==undefined?' max="'+max+'"':'')+(step?' step="'+step+'"':'')+'>';
 return '<label class="mk-field '+(wide?'mk-wide ':'')+(type==='checkbox'?'mk-check':'')+'"><span>'+html(label)+(required?' *':'')+'</span>'+control+(help?'<small>'+html(help)+'</small>':'')+'</label>';
}
function sourceFields(prefix,row){
 return '<div class="mk-source">'+field(prefix+'.source.documentId','Pièce source',row.source?.documentId,{options:{'':'Choisir une pièce importée',...Object.fromEntries(s.docs.map(d=>[d.id,d.name]))}})+field(prefix+'.source.locator','Page / article / cellule',row.source?.locator,{placeholder:'Ex. page 2, article 3'})+field(prefix+'.source.note','Observation de lecture',row.source?.note,{wide:true,type:'textarea'})+'</div>';
}
function review(prefix,row){
 return '<label class="mk-review"><input type="checkbox" data-review="'+prefix+'" '+(row.status==='validated'?'checked':'')+'> J’ai vérifié cette règle dans la pièce source</label>';
}
function rowCard(prefix,row,index,fields){
 return '<article class="mk-rule"><div class="mk-rule-top"><span>'+String(index+1).padStart(2,'0')+'</span><strong>'+html(row.label||'Nouvelle règle')+'</strong><button type="button" class="mk-link" data-remove="'+prefix+'">Retirer</button></div><div class="mk-fields">'+fields+'</div><details class="mk-proof" '+(!row.source?.documentId?'open':'')+'><summary>Source et validation '+(row.status==='validated'?'· vérifiée':'· à vérifier')+'</summary>'+sourceFields(prefix,row)+review(prefix,row)+'</details></article>';
}
function summary(){
 const m=s.current;
 const clientNames=[...new Set([...s.clients.map(c=>c.name),...s.rows.map(r=>r.clientName)])];
 return '<div class="mk-section-title"><h2>Identité et règles générales</h2><p>Les règles propres au marché seront utilisées par les commandes et la facturation.</p></div><div class="mk-fields">'+
 field('title','Objet du marché',m.title,{wide:true,required:true})+
 field('reference','Référence du marché',m.reference,{placeholder:'Référence de l’acte d’engagement'})+
 field('clientName','Client contractant',m.clientName,{required:true})+
 field('type','Type de contrat',m.type,{options:TYPES})+
 field('billingMode','Mode de facturation',m.billingMode,{options:BILLING})+
 field('notificationDate','Date portée sur la notification',m.notificationDate,{type:'date',help:'À distinguer de la date de réception et du début d’exécution.'})+
 field('periodBasis','Définition des périodes',m.periodBasis,{options:{unknown:'À confirmer',notification:'Anniversaires de notification / réception',calendar:'Années civiles',custom:'Dates contractuelles spécifiques'}})+
 field('renewalMode','Reconduction',m.renewalMode,{options:{unknown:'À confirmer',none:'Sans reconduction',tacit:'Tacite',express:'Expresse'}})+
 field('renewalCount','Nombre de reconductions prévues',m.renewalCount,{type:'number',min:0,max:20,step:'1'})+
 field('noMinimum','Marché sans minimum confirmé',m.noMinimum,{type:'checkbox'})+
 field('minimumMinor','Minimum contractuel (€ HT)',m.minimumMinor===null?'':(m.minimumMinor/100).toFixed(2),{type:'text',help:'Laisser vide si inconnu. Ne crée aucun droit à facturer.'})+
 field('feesIncluded','Frais de mission et de déplacement inclus',m.feesIncluded,{type:'checkbox',wide:true})+
 field('notes','Notes et conditions particulières',m.notes,{type:'textarea',wide:true})+
 '</div><datalist id="mkClients">'+clientNames.map(n=>'<option value="'+html(n)+'"></option>').join('')+'</datalist>';
}
function prices(){
 return '<div class="mk-section-title"><h2>Grille des tarifs</h2><p>Un prix par prestation, profil, lieu et période de validité. Les quantités estimées du bordereau ne sont pas des jours commandés.</p></div>'+
 s.current.prices.map((r,i)=>{const p='prices.'+i;return rowCard(p,r,i,
 field(p+'.label','Prestation',r.label,{required:true,wide:true})+
 field(p+'.amountMinor','Prix unitaire HT (€)',r.amountMinor===null?'':(r.amountMinor/100).toFixed(2))+
 field(p+'.unit','Unité',r.unit,{options:UNITS})+
 field(p+'.profile','Profil',r.profile,{placeholder:'Tous profils, senior, junior…'})+
 field(p+'.location','Lieu / modalité',r.location,{placeholder:'Corse, étranger, distance…'})+
 field(p+'.startDate','Valable à partir du',r.startDate,{type:'date',help:'Vide : pas de borne spécifique au tarif.'})+
 field(p+'.endDate','Valable jusqu’au',r.endDate,{type:'date'})+
 field(p+'.notes','Précision',r.notes,{wide:true,type:'textarea'}));}).join('')+
 '<button class="mk-secondary" type="button" data-add="prices">+ Ajouter un tarif</button>';
}
function ceilings(){
 return '<div class="mk-section-title"><h2>Plafonds contractuels</h2><p>Les limites sont paramétrées ici. Le disponible sera calculé après reprise des commandes ; aucun solde n’est présumé.</p></div>'+
 s.current.ceilings.map((r,i)=>{const p='ceilings.'+i;return rowCard(p,r,i,
 field(p+'.label','Intitulé',r.label,{required:true,wide:true})+
 field(p+'.amountMinor','Montant maximum (€)',r.amountMinor===null?'':(r.amountMinor/100).toFixed(2))+
 field(p+'.basis','Base du montant',r.basis,{options:{HT:'Hors taxes',TTC:'Toutes taxes comprises'}})+
 field(p+'.scope','Portée du plafond',r.scope,{options:{annual:'Par période annuelle du marché',contract:'Total du contrat',period:'Période spécifique'}})+
 field(p+'.periodId','Période spécifique (si applicable)',r.periodId,{options:{'':'Aucune',...Object.fromEntries(s.current.periods.map(p=>[p.id,p.label]))}})+
 field(p+'.consumptionBasis','Consommation du plafond',r.consumptionBasis,{options:{orders:'Engagements / commandes',invoices:'Factures — seulement si prévu au contrat'}})+
 field(p+'.notes','Précision',r.notes,{type:'textarea',wide:true}));}).join('')+
 '<button class="mk-secondary" type="button" data-add="ceilings">+ Ajouter un plafond</button>';
}
function periods(){
 return '<div class="mk-section-title"><h2>Périodes contractuelles</h2><p>Renseignez les dates effectives et leur justification. Une notification datée ne prouve pas sa date de réception. Aucune reconduction automatique.</p></div>'+
 s.current.periods.map((r,i)=>{const p='periods.'+i;return rowCard(p,r,i,
 field(p+'.label','Période',r.label,{required:true,wide:true})+
 field(p+'.startDate','Début',r.startDate,{type:'date'})+field(p+'.endDate','Fin (incluse)',r.endDate,{type:'date'})+
 field(p+'.decision','Justification de prise d’effet / reconduction',r.decision,{type:'textarea',wide:true}));}).join('')+
 '<button class="mk-secondary" type="button" data-add="periods">+ Ajouter une période</button>';
}
function issues(){
 return '<div class="mk-section-title"><h2>Points à confirmer</h2><p>Conservez les contradictions et la décision retenue. Seuls les points marqués bloquants empêchent de valider le paramétrage.</p></div>'+
 s.current.issues.map((r,i)=>{const p='issues.'+i;return '<article class="mk-rule"><div class="mk-rule-top"><strong>Point '+(i+1)+'</strong><button class="mk-link" data-remove="'+p+'" type="button">Retirer</button></div><div class="mk-fields">'+
 field(p+'.title','Sujet',r.title,{wide:true,required:true})+field(p+'.detail','Constat documentaire',r.detail,{wide:true,type:'textarea'})+
 field(p+'.blocking','Bloque la validation du paramétrage',r.blocking,{type:'checkbox'})+
 field(p+'.status','Traitement',r.status,{options:{open:'À confirmer',resolved:'Résolu'}})+
 field(p+'.resolution','Décision retenue et justification',r.resolution,{wide:true,type:'textarea'})+'</div><details class="mk-proof"><summary>Pièce de référence</summary>'+sourceFields(p,r)+'</details></article>';}).join('')+
 '<button class="mk-secondary" data-add="issues" type="button">+ Ajouter un point à confirmer</button>';
}
function documents(){
 return '<div class="mk-section-title"><h2>Pièces du marché</h2><p>Originaux conservés, empreinte contrôlée et doublons détectés. Maximum 5 Mo par pièce.</p></div>'+
 (!s.current.version?'<div class="mk-message">Enregistrez la fiche pour lui rattacher les pièces du marché.</div>':
 '<div class="mk-upload"><label>Nature de la pièce<select id="mkDocKind">'+Object.entries(kinds).map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('')+'</select></label><label class="mk-file">Importer des pièces<input id="mkFiles" type="file" multiple accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.txt,.csv"></label><p>PDF texte : lecture assistée du plafond. Scans, Word et Excel : rattachement et saisie manuelle. Les propositions restent à vérifier.</p></div>')+
 '<div id="mkUploadStatus" role="status"></div><div id="mkSuggestions"></div>'+
 (s.docs.length?'<div class="mk-doc-list">'+s.docs.map(d=>'<article><div><strong>'+html(d.name)+'</strong><small>'+html(kinds[d.kind]||d.kind)+' · '+(d.size/1024/1024).toFixed(2)+' Mo · '+html(new Date(d.uploadedAt).toLocaleDateString('fr-FR'))+'</small><small>'+ (d.hasText?'Texte disponible pour la lecture assistée':'Texte non extrait — lecture manuelle')+'</small></div><div><button type="button" class="mk-secondary" data-download="'+d.id+'">Télécharger</button>'+(d.hasText?'<button type="button" class="mk-link" data-analyse="'+d.id+'">Lire les propositions</button>':'')+'</div></article>').join('')+'</div>':'<div class="mk-empty">Aucune pièce importée.</div>');
}
function history(){
 return '<div class="mk-section-title"><h2>Historique des versions</h2><p>Chaque enregistrement conserve l’auteur, la date et l’état de la fiche.</p></div>'+
 (!s.current.version?'<div class="mk-empty">La fiche n’a pas encore été enregistrée.</div>':!s.history?'<button type="button" class="mk-secondary" data-action="history">Charger l’historique</button>':
 s.history.map(v=>'<article class="mk-history"><strong>Version '+v.version+' · '+html(labels[v.market.status])+'</strong><span>'+html(new Date(v.updatedAt).toLocaleString('fr-FR'))+' · '+html(v.updatedBy)+'</span><small>'+v.market.prices.length+' tarifs · '+v.market.ceilings.length+' plafonds · '+v.market.periods.length+' périodes · '+v.market.issues.filter(x=>x.status==='open').length+' points à confirmer</small><button class="mk-link" data-version="'+v.version+'" type="button">Exporter cette version</button></article>').join(''));
}
function render(){
 if(currentView!=='marches')return;
 const container=el('content');
 if(!allowed()){container.innerHTML='<div class="mk-empty">Le paramétrage des marchés est réservé à la direction habilitée.</div>';return;}
 const m=s.current;
 container.innerHTML='<section id="marketRoot" class="mk-root">'+
 '<div id="marketMessage">'+(s.error?'<div class="mk-message mk-error" role="alert">'+html(s.error)+'</div>':s.notice?'<div class="mk-message mk-success" role="status">'+html(s.notice)+'</div>':'')+'</div>'+
 (m?'<div class="mk-heading"><div><button type="button" class="mk-link" data-action="back">← Tous les marchés</button><h1>'+html(m.title||'Nouveau marché')+'</h1><p>'+html(m.clientName||'Client à renseigner')+(m.reference?' · '+html(m.reference):'')+'</p></div><span class="mk-status">'+html(labels[m.status])+'</span></div>'+
 '<div class="mk-editbar"><span id="mkSaveState">'+(s.dirty?'Modifications à enregistrer':m.version?'Version '+m.version+' enregistrée':'Nouvelle fiche')+'</span><div><button class="mk-secondary" type="button" data-action="export">Exporter la fiche</button><button class="mk-primary" type="button" data-action="save">Enregistrer</button></div></div>'+
 '<nav class="mk-tabs" aria-label="Rubriques du marché">'+Object.entries(tabs).map(([k,t])=>'<button type="button" data-tab="'+k+'" aria-current="'+(s.tab===k?'page':'false')+'">'+t+(k==='issues'&&m.issues.some(x=>x.status==='open')?' <span>'+m.issues.filter(x=>x.status==='open').length+'</span>':'')+'</button>').join('')+'</nav>'+
 '<form id="mkForm" novalidate><div class="mk-panel">'+({summary,documents,prices,ceilings,periods,issues,history}[s.tab])()+'</div></form>'+
 '<div class="mk-validation"><div><strong>Validation du paramétrage</strong><p>'+html(activationBlockers(m).length?'À compléter : '+activationBlockers(m).join(' ; '):'Les règles indispensables sont renseignées. Vérifiez les sources avant validation.')+'</p><small>Cette validation ne crée ni commande ni facture. La consommation du marché sera suivie à partir des engagements repris.</small></div><div>'+field('status','État de la fiche',m.status,{options:labels})+'</div></div>':
 '<div class="mk-heading"><div><span class="mk-eyebrow">Référentiel contractuel</span><h1>Marchés et contrats</h1><p>Les pièces, les prix et les limites qui encadrent vos missions.</p></div><button class="mk-primary" type="button" data-action="new">+ Nouveau marché</button></div>'+
 '<div class="mk-overview"><div><strong>'+s.rows.filter(r=>r.status!=='archived').length+'</strong><span>marchés suivis</span></div><div><strong>'+s.rows.filter(r=>r.status==='draft').length+'</strong><span>en préparation</span></div><div><strong>'+s.rows.reduce((n,r)=>n+r.issues.filter(x=>x.status==='open').length,0)+'</strong><span>points à confirmer</span></div><p>Le plafond contractualisé et le disponible sont distincts. La reprise des commandes permettra le calcul de consommation.</p></div>'+
 '<div class="mk-list-tools"><label for="mkSearch">Rechercher un marché</label><input id="mkSearch" type="search" value="'+html(s.query)+'" placeholder="Client, référence ou objet"><button class="mk-secondary" data-action="refresh" type="button">Actualiser</button></div><div id="mkMarketList"></div>')+'</section>';
 bind();
 if(!m)renderList();
 if(m&&s.tab==='summary')el('mk-clientName')?.setAttribute('list','mkClients');
 if(s.busy)setBusy(true);
}
function renderList(){
 const q=s.query.toLocaleLowerCase('fr');
 const rows=s.rows.filter(m=>[m.title,m.reference,m.clientName].some(v=>v.toLocaleLowerCase('fr').includes(q)));
 el('mkMarketList').innerHTML=s.busy?'<div class="mk-empty" role="status">Chargement des marchés…</div>':!rows.length?'<div class="mk-empty">'+(s.query?'Aucun marché ne correspond à la recherche.':'Commencez par créer une fiche, puis importez les pièces du marché.')+'</div>':
 '<div class="mk-table-wrap"><table class="mk-table"><thead><tr><th>Marché / client</th><th>Référence</th><th>Plafond renseigné</th><th>État</th><th></th></tr></thead><tbody>'+rows.map(m=>{const c=m.ceilings[0];return '<tr><td><strong>'+html(m.title)+'</strong><small>'+html(m.clientName)+'</small></td><td>'+html(m.reference||'À préciser')+'</td><td>'+html(c?money(c.amountMinor)+' '+c.basis:'À préciser')+(c?'<small>'+html(c.scope==='annual'?'par période annuelle':c.scope==='contract'?'total du contrat':'période spécifique')+' · '+(c.status==='validated'?'vérifié':'à vérifier')+'</small>':'')+'</td><td><span class="mk-status">'+html(labels[m.status])+'</span></td><td><button type="button" class="mk-secondary" data-open="'+m.id+'">Ouvrir</button></td></tr>';}).join('')+'</tbody></table></div>';
}
function assign(path,value){
 const keys=path.split('.');let target=s.current;for(const k of keys.slice(0,-1))target=target[k];target[keys.at(-1)]=value;
}
function inputValue(e){
 const path=e.dataset.path;
 let value=e.type==='checkbox'?e.checked:e.value;
 if(path.endsWith('amountMinor')||path==='minimumMinor')value=minor(value);
 if(path==='renewalCount')value=value===''?null:Number(value);
 assign(path,value);
 if(path==='noMinimum'&&value){s.current.minimumMinor=null;if(el('mk-minimumMinor'))el('mk-minimumMinor').value='';}
 if(path==='clientName')s.current.clientId=s.clients.find(c=>c.name===value)?.id||'';
 const parts=path.split('.');
 if(['prices','ceilings','periods'].includes(parts[0])){s.current[parts[0]][parts[1]].status='proposed';const check=document.querySelector('[data-review="'+parts.slice(0,2).join('.')+'"]');if(check)check.checked=false;}
 dirty();
}
function exportFile(value,name){
 const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function save(){
 const form=el('mkForm');if(form&&!form.reportValidity())return;
 try{const m=validateMarket(s.current,s.docs);setBusy(true);const epoch=s.epoch;const r=await api(s.current.version?'/'+s.current.id:'',{method:s.current.version?'PUT':'POST',headers:s.current.version?{'If-Match':String(s.current.version)}:{},body:JSON.stringify(s.current.version?m:{id:s.current.id,market:m})});if(epoch!==s.epoch)return;s.current=r.market;s.docs=r.documents;s.dirty=false;s.history=null;s.error='';s.notice='Fiche enregistrée · version '+s.current.version;const i=s.rows.findIndex(x=>x.id===s.current.id);if(i>=0)s.rows[i]=s.current;else s.rows.unshift(s.current);s.busy=false;render();}
 catch(e){s.busy=false;setBusy(false);error(e.message);}
}
function add(list){
 const common={id:uid(),status:'proposed',source:{documentId:'',locator:'',note:''}};
 const row=list==='prices'?{...common,label:'',unit:'day',amountMinor:null,profile:'',location:'',startDate:'',endDate:'',notes:''}:
 list==='ceilings'?{...common,label:'',amountMinor:null,basis:'HT',scope:'annual',periodId:'',consumptionBasis:'orders',notes:''}:
 list==='periods'?{...common,label:'',startDate:'',endDate:'',decision:''}:
 {id:uid(),title:'',detail:'',blocking:false,status:'open',resolution:'',source:{documentId:'',locator:'',note:''}};
 s.current[list].push(row);dirty();render();
 const rule=document.querySelector('.mk-rule:last-of-type');rule?.scrollIntoView({block:'center'});rule?.querySelector('input')?.focus();
}
async function extract(file){
 if(/\.pdf$/i.test(file.name)){
  const pdf=await import('./marches/vendor/pdf.mjs');pdf.GlobalWorkerOptions.workerSrc=new URL('marches/vendor/pdf.worker.mjs',location.href).href;
  const document=await pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true}).promise;
  try{let text='';for(let i=1;i<=Math.min(document.numPages,150);i++){const page=await document.getPage(i);const data=await page.getTextContent();text+='[Page '+i+']\n'+data.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('')+'\n';if(text.length>150000)break;}return text.replace(/\[Page \d+\]\s*/g,'').trim()?text.slice(0,150000):'';}finally{await document.destroy();}
 }
 if(/\.(txt|csv)$/i.test(file.name))return (await file.text()).slice(0,150000);
 return '';
}
async function upload(files){
 if(!files.length)return;
 setBusy(true);const epoch=s.epoch;
 let count=0,duplicates=0,scan=0;
 try{
  for(const file of files){
   if(file.size>5*1024*1024)throw new Error(file.name+' dépasse 5 Mo.');
   el('mkUploadStatus').textContent='Lecture et import : '+file.name;
   let text='';try{text=await extract(file);}catch{scan++;}
   const form=new FormData();form.append('file',file);form.append('kind',el('mkDocKind').value);form.append('text',text);
   const r=await api('/'+s.current.id+'/documents',{method:'POST',body:form});
   if(epoch!==s.epoch)return;
   if(r.duplicate)duplicates++;else{count++;s.docs.push(r.document);}
  }
  s.notice=count+' pièce(s) importée(s)'+(duplicates?' · '+duplicates+' doublon(s) déjà présent(s)':'')+(scan?' · Certaines pièces demandent une lecture manuelle.':'');s.error='';s.busy=false;render();
 }catch(e){s.busy=false;render();error(e.message+' Les pièces déjà importées sont conservées.');}
}
async function analyse(id){
 try{setBusy(true);const r=await api('/'+s.current.id+'/documents/'+id+'?analysis=1');const target=el('mkSuggestions');if(!target)return;
 target.innerHTML='<div class="mk-message"><strong>Propositions de lecture à vérifier</strong>'+(!r.suggestions.length?'<p>Aucun plafond reconnu automatiquement. Consultez la pièce et renseignez les règles dans les onglets correspondants.</p>':r.suggestions.map((x,i)=>'<div class="mk-suggestion"><p>'+html(x.excerpt)+'</p><strong>'+html(money(x.value))+' '+html(x.basis||'base à confirmer')+(x.annual?' par an':'')+'</strong><button type="button" data-suggestion="'+i+'" '+(!x.basis?'disabled':'')+'>Reprendre comme plafond à vérifier</button></div>').join(''))+'</div>';
 target.querySelectorAll('[data-suggestion]').forEach(button=>button.onclick=()=>{const x=r.suggestions[Number(button.dataset.suggestion)];s.current.ceilings.push({id:uid(),label:x.annual?'Maximum annuel':'Plafond à confirmer',scope:x.annual?'annual':'contract',periodId:'',amountMinor:x.value,basis:x.basis,consumptionBasis:'orders',notes:'Proposition de lecture à vérifier.',status:'proposed',source:{documentId:id,locator:'',note:x.excerpt}});dirty();s.tab='ceilings';render();});
 }catch(e){error(e.message);}finally{setBusy(false);}
}
function bind(){
 el('mkForm')?.addEventListener('submit',e=>{e.preventDefault();save();});
 el('mkSearch')?.addEventListener('input',e=>{s.query=e.target.value;renderList();});
 el('mkFiles')?.addEventListener('change',e=>upload([...e.target.files]));
 const root=el('marketRoot');
 root.addEventListener('input',e=>{if(e.target.dataset.path){try{inputValue(e.target);e.target.setCustomValidity('');}catch(err){e.target.setCustomValidity(err.message);dirty();}}});
 root.addEventListener('change',e=>{
  if(e.target.dataset.review){const [list,index]=e.target.dataset.review.split('.');s.current[list][index].status=e.target.checked?'validated':'proposed';dirty();}
 });
 root.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||s.busy)return;
  if(b.dataset.open){await open(b.dataset.open);return;}
  if(b.dataset.tab){const invalid=el('mkForm')?.querySelector(':invalid');if(invalid){invalid.reportValidity();return;}s.tab=b.dataset.tab;render();return;}
  if(b.dataset.add){add(b.dataset.add);return;}
  if(b.dataset.remove){const [list,index]=b.dataset.remove.split('.');if(confirm('Retirer cette ligne de la fiche ? Les versions déjà enregistrées restent conservées.')){s.current[list].splice(Number(index),1);dirty();render();}return;}
  if(b.dataset.download){try{setBusy(true);const blob=await api('/'+s.current.id+'/documents/'+b.dataset.download,{binary:true});const d=s.docs.find(d=>d.id===b.dataset.download);const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=d.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}catch(e){error(e.message);}finally{setBusy(false);}return;}
  if(b.dataset.analyse){await analyse(b.dataset.analyse);return;}
  if(b.dataset.version){exportFile(s.history.find(x=>x.version===Number(b.dataset.version)),'marche-version-'+b.dataset.version+'.json');return;}
  if(b.dataset.action==='new')newMarket();
  if(b.dataset.action==='back'&&safeLeave()){s.current=null;s.dirty=false;s.error='';s.notice='';render();}
  if(b.dataset.action==='save')await save();
  if(b.dataset.action==='export')exportFile({market:s.current,documents:s.docs},'marche-'+(s.current.reference||'preparation').replace(/[^a-z0-9_-]/gi,'_')+'.json');
  if(b.dataset.action==='refresh'){s.loaded=false;await enter();}
  if(b.dataset.action==='history'){try{setBusy(true);s.history=(await api('/'+s.current.id+'/history')).versions;s.busy=false;render();}catch(e){error(e.message);}finally{setBusy(false);}}
 });
}
window.addEventListener('beforeunload',e=>{if(s.dirty){e.preventDefault();e.returnValue='';}});
Object.assign(window,{renderMarches:render,marchesEnter:enter,marchesLeave:safeLeave,marchesForget:forget,marchesNew:newMarket});
