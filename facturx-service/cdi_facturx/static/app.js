const $ = (s) => document.querySelector(s);
const form = $('#invoice-form');
const embedConfig = window.FACTURX_EMBED_CONFIG || null;
const serviceBase = embedConfig ? embedConfig.apiBase.replace(/\/$/, '') : '';
const apiFetch = async (url, options={}) => {
  const headers=new Headers(options.headers);
  if(embedConfig?.token)headers.set('Authorization','Bearer '+embedConfig.token);
  const response=await fetch(serviceBase+url,{...options,headers,signal:options.signal||AbortSignal.timeout(240000)});
  if(response.status===401){
    if(embedConfig)window.parent.postMessage({type:'cdi-facturx-auth-expired',session:embedConfig.session},embedConfig.parentOrigin);
    throw {detail:'Votre session Factur-X a expiré. Conservez la saisie, puis fermez et rouvrez cette fenêtre pour vous reconnecter.'};
  }
  return response;
};
form.noValidate = true;
let sourceFile = null, sourceHash = null, sourceUrl = null, converted = null, busy = false;
let extractedInvoice = {};
let facturierRecord = null;
const partyMemoryKey='cdi_facturx_companies_v1';
let partyMemory={seller:[],buyer:[]},reusedCoordinates=[];
if(!embedConfig){try{partyMemory=JSON.parse(localStorage.getItem(partyMemoryKey)||'{}');}catch{}}
const quickFields=new Map();
function applyRememberedParties(){
  const result=CDIPartyMemory.reuse(invoiceData(),partyMemory);
  reusedCoordinates=[...new Set([...reusedCoordinates,...result.reused])];fillInvoice(prepareInvoice(result.invoice));
}
function prepareInvoice(invoice){
  const inv=structuredClone(invoice),seller=inv.seller;
  if(typeof inv.number==='string'&&/^\d{2}\s+\d{2}\s+\d{1,6}$/.test(inv.number))inv.number=inv.number.replace(/\s/g,'');
  if(seller&&(seller.siren||seller.siret?.slice(0,9))==='322556580'){
    seller.contact_email||='cdi@cdinnov.com';
    if(!seller.electronic_address){seller.electronic_address='322556580';seller.electronic_scheme='0225';}
    seller.electronic_scheme||=seller.electronic_address.includes('@')?'EM':'0225';
  }
  return inv;
}
function fieldCaption(el){
  const label=el.closest('label');
  let caption=label?[...label.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim():el.name;
  if(el.name?.startsWith('seller.'))caption='Émetteur — '+caption;
  if(el.name?.startsWith('buyer.'))caption='Client — '+caption;
  const line=el.closest('.line-form');
  if(line)caption='Ligne '+([...$('#lines').children].indexOf(line)+1)+' — '+caption;
  return caption;
}
function updateQuickReview(inputs,missing){
  $('#quick-review').hidden=false;
  const inv=invoiceData(),recap=$('#invoice-recap');recap.replaceChildren();
  const format=value=>value==null?'À compléter':Number(value).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
  const date=inv.issue_date?inv.issue_date.split('-').reverse().join('/'):'À compléter';
  const lines=inv.lines.length<=3?inv.lines.map(line=>(line.description||'Prestation à compléter')+' · '+(line.quantity||'?')+' × '+format(line.unit_price)+' HT').join(' ; '):inv.lines.length+' lignes — détail consultable ci-dessous';
  const amounts=format(inv.totals?.net)+' HT · '+format(inv.totals?.vat)+' TVA · '+format(inv.totals?.gross)+' TTC'+(Number(inv.totals?.rounding)?' · Arrondi '+format(inv.totals.rounding)+' · À payer '+format(inv.totals.due):'');
  for(const [title,value] of [['Facture',(inv.number||'À compléter')+' · '+date],['Émetteur',inv.seller?.name||'À compléter'],['Client',inv.buyer?.name||'À compléter'],['Prestations',lines],['Montants',amounts]]){
    const row=document.createElement('div'),name=document.createElement('span'),content=document.createElement('strong');name.textContent=title;content.textContent=value;row.append(name,content);recap.append(row);
  }
  for(const [original,entry] of quickFields){
    if(!original.isConnected){entry.label.remove();quickFields.delete(original);continue;}
    if(document.activeElement!==entry.input)entry.input.value=original.value;
    entry.input.required=original.required;
    entry.label.classList.toggle('completed',!!original.value&&original.checkValidity());
  }
  for(const el of inputs){
    if(!el.classList.contains('is-missing')||quickFields.has(el))continue;
    const label=document.createElement('label'),caption=document.createElement('span'),input=el.cloneNode(true);
    input.removeAttribute('name');input.removeAttribute('id');input.removeAttribute('data-key');input.removeAttribute('class');
    input.setAttribute('aria-label',fieldCaption(el));caption.textContent=fieldCaption(el);input.disabled=false;
    input.addEventListener('input',()=>{el.value=input.value;el.dispatchEvent(new Event('input',{bubbles:true}));});
    input.addEventListener('change',()=>{el.value=input.value;el.dispatchEvent(new Event('change',{bubbles:true}));readingSummary();});
    label.append(caption,input);$('#quick-fields').append(label);quickFields.set(el,{input,label});
  }
  $('#missing-panel').hidden=!quickFields.size;
  $('#missing-title').textContent=missing?'À compléter pour cette facture':'Compléments renseignés';
  $('#memory-status').hidden=!reusedCoordinates.length;
  $('#memory-status').textContent=reusedCoordinates.length+' coordonnée(s) reprise(s) des entreprises déjà validées. Les valeurs présentes dans le PDF restent prioritaires.';
  const conflicts=recordConflicts(inv),warning=$('#record-warning');
  warning.hidden=!conflicts.length;
  warning.textContent=conflicts.length?'Écarts avec la fiche du Facturier ('+conflicts.join(', ')+'). Vous pouvez convertir : les données du PDF affichées ci-dessous seront utilisées. La fiche conserve ses valeurs. Vérifiez le PDF puis confirmez la relecture.':'';
  $('#generate').disabled=busy;
  const numberNote=$('#number-note'),printed=extractedInvoice.number;
  numberNote.hidden=!(printed&&printed!==inv.number&&printed.replace(/\s/g,'')===inv.number);
  numberNote.textContent='Numéro transmis : '+inv.number+' ; numéro imprimé : '+printed+'. Les espaces sont retirés pour le format électronique. Vérifiez cette proposition avant de convertir.';
  const contact=$('#issuer-email'),email=inv.seller?.contact_email||'';
  $('#issuer-contact').hidden=(inv.seller?.siren||inv.seller?.siret?.slice(0,9))!=='322556580';
  setInput(contact,email);
}
function recordConflicts(inv){
  if(!facturierRecord)return [];
  return [['number','numéro'],['issue_date','date'],['totals.net','total HT'],['totals.gross','total TTC']].filter(([path])=>{
    const expected=getAt(facturierRecord,path),value=getAt(inv,path);
    if(expected==null||expected===''||value==null||value==='')return false;
    return path.startsWith('totals.')?Math.round(Number(value)*100)!==Math.round(Number(expected)*100):String(value).trim()!==String(expected).trim();
  }).map(([,label])=>label);
}
let previewIndex=0,previewPages=0,previewBusy=false;
function previewControls(){
  $('#preview-page').textContent='Page '+(previewIndex+1)+' / '+previewPages;
  $('#preview-prev').disabled=previewBusy||previewIndex===0;
  $('#preview-next').disabled=previewBusy||previewIndex>=previewPages-1;
}
async function showPreviewPage(index){
  if(previewBusy||!sourceFile||index<0||index>=previewPages)return;
  const selected=sourceFile;previewBusy=true;previewControls();
  const data=new FormData();data.append('pdf',selected);
  try{
    const response=await apiFetch('/api/invoices/preview-pdf?page='+index,{method:'POST',body:data});
    if(!response.ok)throw new Error('Aperçu de cette page indisponible.');
    const blob=await response.blob();if(sourceFile!==selected)return;
    if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=URL.createObjectURL(blob);
    $('#preview').src=sourceUrl;previewIndex=index;
  }catch(e){message(e.message,true);}
  finally{previewBusy=false;previewControls();}
}
$('#preview-prev').onclick=()=>showPreviewPage(previewIndex-1);
$('#preview-next').onclick=()=>showPreviewPage(previewIndex+1);
function mergeInvoice(target,seed) {
  for(const [k,v] of Object.entries(seed||{})){
    if(v==null||v==='')continue;
    if(Array.isArray(v)){if(v.length)target[k]=v;}
    else if(typeof v==='object')target[k]=mergeInvoice(target[k]||{},v);
    else target[k]=v;
  }
  return target;
}
function initialInvoice(pdfInvoice,seed,isDraft,draftMatchesSource=false){
  // A mismatched attachment must not inherit identities, amounts or old draft lines.
  // New drafts are explicitly linked to their source PDF, including accepted record differences.
  if(isDraft&&draftMatchesSource)return mergeInvoice(pdfInvoice,seed);
  if(recordConflicts(extractedInvoice).length)return pdfInvoice;
  return isDraft?mergeInvoice(pdfInvoice,seed):mergeInvoice(structuredClone(seed||{}),pdfInvoice);
}
function sourceCorrections() {
  const current=invoiceData();
  return ['number','issue_date','totals.net','totals.vat','totals.gross','totals.rounding','totals.due','seller.siret','payment.iban'].filter(path=>{
    const before=getAt(extractedInvoice,path),after=getAt(current,path);
    if(before==null||before==='')return false;
    return path.startsWith('totals.')?Number(before)!==Number(after):String(before).trim()!==String(after||'').trim();
  });
}
function readingSummary(mark=false) {
  if(!sourceFile)return;
  const rounded=Number(form.elements.namedItem('totals.rounding').value)!==0;
  for(const option of $('#profile').options)option.disabled=rounded&&option.value!=='en16931';
  if(rounded)$('#profile').value='en16931';
  for(const key of ['seller','buyer']){
    const country=form.elements.namedItem(key+'.country'),siret=form.elements.namedItem(key+'.siret'),siren=form.elements.namedItem(key+'.siren');
    siren.required=country.value==='FR'&&!siret.value.trim();
    const address=form.elements.namedItem(key+'.electronic_address'),scheme=form.elements.namedItem(key+'.electronic_scheme');
    if(address.value.includes('@')&&(!scheme.value||scheme.value==='0225'))scheme.value='EM';
    else if(country.value==='FR'&&!scheme.value&&/^\d{9}(?:_[A-Za-z0-9_-]+)?$/.test(address.value.trim()))scheme.value='0225';
  }
  const categories=[...document.querySelectorAll('[data-key="vat_category"]')].map(el=>el.value);
  form.elements.namedItem('seller.vat_number').required=categories.includes('S')||categories.includes('AE');
  form.elements.namedItem('buyer.vat_number').required=categories.includes('AE');
  form.elements.namedItem('payment.terms').required=!form.elements.namedItem('payment.due_date').value&&Number(form.elements.namedItem('totals.due').value)>0;
  form.elements.namedItem('payment.iban').required=['30','58'].includes(form.elements.namedItem('payment.means_code').value);
  const credit=form.elements.namedItem('type_code').value==='381';
  form.elements.namedItem('preceding_invoice').required=credit;form.elements.namedItem('preceding_invoice_date').required=credit;
  for(const box of document.querySelectorAll('.line-form'))box.querySelector('[data-key="exemption_reason"]').required=['E','AE','O'].includes(box.querySelector('[data-key="vat_category"]').value);
  const inputs=[...form.querySelectorAll('input[name],select[name],textarea[name],input[data-key],select[data-key]')];
  let filled=0,missing=0;
  for(const el of inputs){
    if(mark&&el.value){el.classList.add('is-extracted');filled++;}
    const empty=(el.required&&!el.value)||(!el.disabled&&!el.checkValidity());el.classList.toggle('is-missing',empty);if(empty)missing++;
  }
  for(const detail of $('#parties').querySelectorAll('details')){
    const key=detail.dataset.party,name=getAt(invoiceData(),key+'.name');
    detail.querySelector('summary').textContent=(key==='seller'?'Émetteur':'Client')+(name?' · '+name:'');
    if(mark)detail.open=!!detail.querySelector('.is-missing');
  }
  const info=$('#read-summary');info.hidden=false;
  info.textContent=missing?missing+' information(s) à compléter ci-dessous. Les autres données sont déjà renseignées.':'Rien à saisir : vérifiez le récapitulatif et le PDF, puis lancez la conversion.';
  updateQuickReview(inputs,missing);
  const corrected=sourceCorrections();$('#correction-status').hidden=!corrected.length;
  $('#correction-status').textContent=corrected.length+' valeur(s) différente(s) de la lecture automatique. Vos corrections seront conservées ; confirmez qu’elles correspondent bien au PDF.';
}
const parties = [ ['seller', 'Émetteur'], ['buyer', 'Client'] ];
const partyFields = [['name','Raison sociale'],['siret','SIRET'],['siren','SIREN'],['vat_number','Numéro de TVA'],['street','Adresse'],['postal_code','Code postal'],['city','Ville'],['country','Pays (ISO)'],['contact_email','E-mail de contact'],['electronic_address','Adresse électronique de facturation'],['electronic_scheme','Type d’adresse (0225 : SIREN ; EM : e-mail)']];
for (const [key, label] of parties) {
  const details = document.createElement('details');details.dataset.party=key;
  const summary = document.createElement('summary'); summary.textContent = label; details.append(summary);
  const grid = document.createElement('div'); grid.className = 'form-grid';
  for (const [field, caption] of partyFields) {
    const labelEl = document.createElement('label'); labelEl.textContent = caption;
    if (['name', 'street', 'electronic_address'].includes(field)) labelEl.className = 'wide';
    const input = document.createElement('input'); input.name = key + '.' + field;
    input.required = ['name','street','postal_code','city','country','electronic_address','electronic_scheme'].includes(field);
    if (field === 'country') { input.value = 'FR'; input.maxLength = 2; }
    if (field === 'contact_email') input.type='email';
    if (field === 'electronic_address') input.placeholder = 'Adresse confirmée dans l’annuaire de facturation';
    if (field === 'electronic_scheme') input.placeholder = '0225 pour un SIREN français, EM pour un e-mail';
    labelEl.append(input); grid.append(labelEl);
  }
  details.append(grid);
  const help = document.createElement('p'); help.className = 'help'; help.textContent = 'L’adresse électronique de facturation peut différer d’une adresse e-mail. Saisissez celle confirmée pour cette entreprise.'; details.append(help);
  $('#parties').append(details);
}
$('#issuer-email').oninput=$('#issuer-email').onchange=e=>{
  const input=form.elements.namedItem('seller.contact_email');input.value=e.target.value;input.dispatchEvent(new Event('input',{bubbles:true}));
};

function addLine(data = {}) {
  const box = document.createElement('div'); box.className = 'line-form';
  box.innerHTML = '<div class="line-head"><span>LIGNE DE FACTURATION</span><button type="button" class="remove-line">Supprimer</button></div><label>Description<input data-key="description" required></label><div class="line-grid"><label>Quantité<input data-key="quantity" type="number" min="0.000001" step="0.000001" required value="1"></label><label>Prix unitaire HT<input data-key="unit_price" type="number" min="0" step="0.000001" required></label><label>Unité<select data-key="unit"><option value="C62">Unité / forfait</option><option value="DAY">Jour</option><option value="HUR">Heure</option><option value="MON">Mois</option><option value="KGM">Kilogramme</option></select></label><label>Catégorie TVA<select data-key="vat_category"><option value="S">TVA standard</option><option value="Z">Taux zéro</option><option value="E">Exonération</option><option value="AE">Autoliquidation</option><option value="O">Hors champ</option></select></label><label>Taux TVA (%)<input data-key="vat_rate" type="number" min="0" max="100" step="0.01" required value="20"></label><label class="wide">Motif d’exonération / autoliquidation<input data-key="exemption_reason" placeholder="Si applicable"></label></div>';
  for (const input of box.querySelectorAll('[data-key]')) {
    const value = data[input.dataset.key];
    if (value != null) setInput(input, value);
  }
  if(data.quantity==null)box.querySelector('[data-key="quantity"]').value='';
  if(data.vat_rate==null)box.querySelector('[data-key="vat_rate"]').value='';
  box.querySelector('.remove-line').onclick = () => { if ($('#lines').children.length > 1) { box.remove(); invalidate();readingSummary(); } };
  box.querySelector('[data-key="vat_category"]').onchange = (e) => {
    if (e.target.value !== 'S') box.querySelector('[data-key="vat_rate"]').value = '0';
  };
  $('#lines').append(box);
}
function setInput(el, value) {
  value = value == null ? '' : value;
  if (el.tagName === 'SELECT' && !Array.from(el.options).some(o => o.value === String(value))) {
    const option = document.createElement('option'); option.value = String(value); option.textContent = String(value); el.add(option);
  }
  el.value = value;
}
function setValue(path, value) { const el = form.elements.namedItem(path); if (el) setInput(el, value); }
function getAt(obj, path) { return path.split('.').reduce((value, key) => value?.[key], obj); }
function fillInvoice(inv) {
  quickFields.clear();$('#quick-fields').replaceChildren();
  for (const input of form.querySelectorAll('[name]')) setInput(input, getAt(inv, input.name));
  $('#lines').replaceChildren(); (inv.lines?.length ? inv.lines : [{}]).forEach(addLine); invalidate();
}
function invoiceData() {
  const inv = { currency: 'EUR', lines: [] };
  for (const el of form.querySelectorAll('[name]')) {
    const value = el.value.trim(); if (!value) continue;
    const path = el.name.split('.'); let target = inv;
    for (const k of path.slice(0, -1)) target = target[k] ||= {};
    target[path.at(-1)] = value;
  }
  for (const box of document.querySelectorAll('.line-form')) {
    const line = {}; for (const el of box.querySelectorAll('[data-key]')) if (el.value.trim()) line[el.dataset.key] = el.value.trim();
    inv.lines.push(line);
  }
  return inv;
}
function invalidate() {
  converted = null; $('#reviewed').checked = false; $('#downloads').hidden = true;
  $('#result').replaceChildren(); $('#result-label').textContent = 'EN ATTENTE';
  document.querySelectorAll('#checks li').forEach(el => el.className = '');
}
function message(text, error = false) {
  const el = $('#import-status'); el.hidden = false; el.textContent = text; el.className = error ? 'notice error' : 'notice';
  el.dataset.quiet=String(!error&&text.trim()==='PDF lu automatiquement.');
}
async function request(url, options) {
  const response = await apiFetch(url, options); const body = await response.json();
  if (!response.ok) throw body;
  return body;
}
async function importPdf(file) {
  if (!file || busy) return;
  invalidate(); sourceFile = null; sourceHash = null;extractedInvoice={};reusedCoordinates=[];quickFields.clear();$('#quick-fields').replaceChildren();$('#quick-review').hidden=true;$('#read-summary').hidden=true;$('#correction-status').hidden=true;$('#full-data').open=false;
  // A newly selected PDF must never inherit the preceding invoice's entered data.
  form.reset(); $('#lines').replaceChildren(); addLine();
  $('#preview').hidden = true; $('#preview-empty').hidden = false;
  $('#preview-controls').hidden=true;previewIndex=0;previewPages=0;
  if (sourceUrl) { URL.revokeObjectURL(sourceUrl); sourceUrl = null; }
  if (file.size > 20 * 1024 * 1024) return message('PDF limité à 20 Mo.', true);
  message('Lecture du PDF en cours…');
  const data = new FormData(); data.append('pdf', file);
  busy = true; const controls=[...document.querySelectorAll('input,select,textarea,button')];controls.forEach(el=>el.disabled=true);
  try {
    const imported = await request('/api/facturx/import-pdf', {method:'POST',body:data});
    sourceFile = file; sourceHash = imported.source_sha256;
    previewPages=imported.pages;$('#preview').src=imported.preview_image;$('#preview').hidden=false;$('#preview-empty').hidden=true;$('#preview-controls').hidden=false;previewControls();
    $('#file-label').textContent = file.name;
    $('#extracted-text').textContent = imported.text || 'Aucun texte exploitable (PDF scanné).';
    extractedInvoice=structuredClone(imported.invoice||{});
    fillInvoice(mergeInvoice({payment:{prepaid:'0'}},imported.invoice));
    applyRememberedParties();
    readingSummary(true);
    message('PDF lu automatiquement. ' + imported.warnings.join(' '));
    document.querySelectorAll('.steps span')[1].classList.add('current');
  } catch(e) { $('#file-label').textContent='Choisir une facture PDF'; $('#extracted-text').textContent='Aucun document importé.'; message(typeof e.detail==='string'?e.detail:'Impossible de lire ce PDF.',true); }
  finally { busy=false;controls.forEach(el=>el.disabled=false);$('#generate').disabled=false;previewControls();readingSummary(); }
}
$('#pdf').onchange = e => importPdf(e.target.files[0]);
const drop = $('#dropzone');
drop.ondragover = e => { e.preventDefault(); drop.classList.add('drag'); };
drop.ondragleave = () => drop.classList.remove('drag');
drop.ondrop = e => { e.preventDefault();drop.classList.remove('drag');importPdf(e.dataTransfer.files[0]); };
$('#add-line').onclick = () => { addLine(); invalidate();readingSummary(); };
form.addEventListener('input', e => { if (!['reviewed','remember-parties'].includes(e.target.id)){invalidate();e.target.classList.remove('is-extracted');readingSummary();} });
function download(blob, name) {
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),30000);
}
form.onsubmit = async e => {
  e.preventDefault(); if (busy) return;
  if (!sourceFile || !sourceHash) return message('Importez votre PDF avant de lancer la conversion.',true);
  for (const el of form.querySelectorAll('input,select,textarea')) {
    if (!el.checkValidity()) { let parent=el.parentElement; while(parent) { if(parent.tagName==='DETAILS') parent.open=true; parent=parent.parentElement; } el.reportValidity(); return; }
  }
  const payload={profile:$('#profile').value,invoice:invoiceData(),source_sha256:sourceHash,reviewed:$('#reviewed').checked,source_corrections:sourceCorrections()};
  busy=true; converted=null; $('#downloads').hidden=true; $('#generate').disabled=true; $('#result-label').textContent='CONTRÔLE EN COURS';
  $('#result').textContent='Vérification du XML puis du PDF/A-3 final. Cela peut prendre quelques secondes.';
  document.querySelectorAll('#checks li').forEach(el=>el.className='');
  const data=new FormData();data.append('pdf',sourceFile);data.append('payload',JSON.stringify(payload));
  // Lock data editing so a displayed success cannot refer to an older form state.
  const controls=Array.from(document.querySelectorAll('input,select,textarea,button'));controls.forEach(el=>el.disabled=true);
  try {
    const result=await request('/api/facturx/generate',{method:'POST',body:data});
    converted=result;
    if($('#remember-parties').checked){
      partyMemory=CDIPartyMemory.remember(partyMemory,payload.invoice);
      if(embedConfig)window.parent.postMessage({type:'cdi-facturx-remember',session:embedConfig.session,invoice:payload.invoice,result:{valid:result.valid,checks:result.checks,source_sha256:result.source_sha256}},embedConfig.parentOrigin);
      else{try{localStorage.setItem(partyMemoryKey,JSON.stringify(partyMemory));}catch{message('Conversion réussie. La mémorisation des coordonnées est indisponible dans ce navigateur.',true);}}
    }
    document.querySelectorAll('#checks li').forEach(el=>el.className=result.checks[el.dataset.check]?'pass':'');
    $('#result-label').textContent='CONTRÔLES RÉUSSIS'; $('#result').replaceChildren();
    const p=document.createElement('p'); p.className='success';p.textContent='Le fichier a passé les contrôles XML et PDF/A-3b.';$('#result').append(p);
    if(result.warnings?.length){const p=document.createElement('p');p.textContent=result.warnings.map(w=>w.message).join(' ');$('#result').append(p);}
    $('#downloads').hidden=false;
  } catch(error) {
    $('#result-label').textContent='À CORRIGER'; $('#result').replaceChildren();
    const p=document.createElement('p');p.className='error';p.textContent=error.message || (typeof error.detail==='string'?error.detail:'Le contrôle a échoué. Réessayez.');$('#result').append(p);
    const list=document.createElement('ul');for(const item of error.errors||[]) { const li=document.createElement('li');li.textContent=(item.field||item.code||'')+' : '+item.message;list.append(li); }$('#result').append(list);
    const check=document.querySelector('[data-check="'+({data:'amounts',source:'source_review',pdfa:'pdfa_3b'}[error.stage]||error.stage)+'"]');if(check)check.className='fail';
  } finally { busy=false;controls.forEach(el=>el.disabled=false);$('#generate').disabled=false;previewControls(); }
};
$('#download-pdf').onclick=()=>{if(!converted)return;const binary=atob(converted.pdf_base64);download(new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:'application/pdf'}),converted.filename);};
$('#download-xml').onclick=()=>{if(converted)download(new Blob([converted.xml],{type:'application/xml'}),'factur-x.xml');};
$('#download-report').onclick=()=>{if(!converted)return;const {pdf_base64,xml,verapdf_report,...report}=converted;download(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),'validation.json');};
$('#download-vera').onclick=()=>{if(converted)download(new Blob([converted.verapdf_report],{type:'application/xml'}),'verapdf.xml');};
addLine();
apiFetch('/api/health').then(r=>r.json()).then(h=>{$('#health').textContent=h.ready?'● Moteur de conversion prêt':'● Configuration à terminer';}).catch(()=>{$('#health').textContent='● Moteur indisponible'; if(embedConfig) message('Le service de conversion en ligne est indisponible. Réessayez dans une minute ; le premier réveil peut être plus long.',true);});

if (embedConfig) {
  document.body.classList.add('embedded');
  const saveButton = document.createElement('button'); saveButton.className='primary';saveButton.type='button';saveButton.textContent='Enregistrer le Factur-X dans cette facture';
  $('#downloads').prepend(saveButton);
  saveButton.onclick=()=>{
    if(!converted)return;
    saveButton.disabled=true;saveButton.textContent='Enregistrement en cours…';
    window.parent.postMessage({type:'cdi-facturx-save',session:embedConfig.session,result:converted,invoice:invoiceData()},embedConfig.parentOrigin);
  };
  const draftButton=document.createElement('button');draftButton.type='button';draftButton.className='text-button';draftButton.textContent='Conserver la saisie dans la facture';
  $('#full-data').append(draftButton);
  draftButton.onclick=()=>window.parent.postMessage({type:'cdi-facturx-draft',session:embedConfig.session,invoice:invoiceData(),profile:$('#profile').value},embedConfig.parentOrigin);
  window.addEventListener('message',async event=>{
    if(event.source!==window.parent || event.origin!==embedConfig.parentOrigin || event.data?.session!==embedConfig.session)return;
    if(event.data.type==='cdi-facturx-init'){
      partyMemory=event.data.partyMemory||{seller:[],buyer:[]};
      facturierRecord=event.data.record||null;
      await importPdf(new File([event.data.pdf],event.data.name,{type:'application/pdf'}));
      if(!sourceFile)return;
      fillInvoice(initialInvoice(invoiceData(),event.data.invoice,event.data.invoiceIsDraft,event.data.draftMatchesSource));applyRememberedParties();
      if(event.data.profile)setInput($('#profile'),event.data.profile);
      readingSummary(true);
    }
    if(event.data.type==='cdi-facturx-saved'){
      saveButton.disabled=false;saveButton.textContent='Enregistrer le Factur-X dans cette facture';
      message(event.data.message,!event.data.ok);
    }
  });
  window.parent.postMessage({type:'cdi-facturx-ready',session:embedConfig.session},embedConfig.parentOrigin);
}
