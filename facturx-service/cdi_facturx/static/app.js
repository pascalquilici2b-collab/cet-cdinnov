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
let currentAllowance=null,allowanceRestoreTotals=null,allowanceBasis=null;
const partyMemoryKey='cdi_facturx_companies_v1';
let partyMemory={seller:[],buyer:[]},reusedCoordinates=[];
if(!embedConfig){try{partyMemory=JSON.parse(localStorage.getItem(partyMemoryKey)||'{}');}catch{}}
const quickFields=new Map();
function applyRememberedParties(){
  const result=CDIPartyMemory.reuse(invoiceData(),partyMemory);
  reusedCoordinates=[...new Set([...reusedCoordinates,...result.reused])];fillInvoice(prepareInvoice(result.invoice));
}
function prepareInvoice(invoice){
  const inv=structuredClone(invoice),seller=inv.seller||{};
  if(typeof inv.number==='string'&&/^\d{2}\s+\d{2}\s+\d{1,6}$/.test(inv.number))inv.number=inv.number.replace(/\s/g,'');
  const identifier=String(seller.siren||seller.siret?.replace(/\s/g,'').slice(0,9)||'').replace(/\s/g,'');
  const name=String(seller.name||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const isCDI=identifier==='322556580'||(!identifier&&(!seller.country||seller.country==='FR')&&['','CDI','CONSEILDEVELOPPEMENTINNOVATION','CDICONSEILDEVELOPPEMENTINNOVATION'].includes(name));
  if(isCDI){
    inv.seller=seller;
    const defaults={name:'CONSEIL DEVELOPPEMENT INNOVATION',street:'27 Boulevard Paoli',postal_code:'20200',city:'BASTIA',country:'FR',siren:'322556580',vat_number:'FR80322556580'};
    for(const [key,value] of Object.entries(defaults))if(!String(seller[key]||'').trim())seller[key]=value;
    seller.contact_email||='cdi@cdinnov.com';
    if(!seller.electronic_address){seller.electronic_address='322556580';seller.electronic_scheme='0225';}
    seller.electronic_scheme||=seller.electronic_address.includes('@')?'EM':'0225';
  }
  return inv;
}
function fieldCaption(el){
  const label=el.closest('label');
  const captionNode=label?.querySelector('.field-caption')||label;
  let caption=captionNode?[...captionNode.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim():el.name;
  if(el.name?.startsWith('seller.'))caption='Émetteur — '+caption;
  if(el.name?.startsWith('buyer.'))caption='Client — '+caption;
  const line=el.closest('.line-form');
  if(line)caption='Ligne '+([...$('#lines').children].indexOf(line)+1)+' — '+caption;
  return caption;
}
function syncRequiredMarkers(){
  for(const label of form.querySelectorAll('label')){
    const control=label.querySelector('input,select,textarea');if(!control)continue;
    let caption=label.querySelector('.field-caption');
    if(!caption){
      caption=[...label.children].find(el=>el.tagName==='SPAN');
      if(!caption){
        caption=document.createElement('span');
        const textNodes=[...label.childNodes].filter(n=>n.nodeType===3);
        caption.textContent=textNodes.map(n=>n.textContent).join('').trim();
        textNodes.forEach(n=>n.remove());label.insertBefore(caption,control);
      }
      caption.classList.add('field-caption');
    }
    let marker=caption.querySelector('.required-marker');
    if(control.required&&!marker){
      marker=document.createElement('span');marker.className='required-marker';marker.textContent=' *';marker.setAttribute('aria-hidden','true');caption.append(marker);
    }else if(!control.required&&marker)marker.remove();
  }
}
function updateQuickReview(inputs,missing){
  $('#quick-review').hidden=false;
  const inv=invoiceData(),recap=$('#invoice-recap');recap.replaceChildren();
  const format=value=>value==null?'À compléter':Number(value).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
  const date=inv.issue_date?inv.issue_date.split('-').reverse().join('/'):'À compléter';
  const lines=inv.lines.length<=3?inv.lines.map(line=>(line.description||'Prestation à compléter')+' · '+(line.quantity||'?')+' × '+format(line.unit_price)+' HT').join(' ; '):inv.lines.length+' lignes — détail consultable ci-dessous';
  const amounts=format(inv.totals?.net)+' HT · '+format(inv.totals?.vat)+' TVA · '+format(inv.totals?.gross)+' TTC'+(Number(inv.totals?.rounding)?' · Arrondi '+format(inv.totals.rounding):'')+(Number(inv.totals?.rounding)||Number(inv.totals?.due)!==Number(inv.totals?.gross)?' · À payer '+format(inv.totals?.due):'');
  for(const [title,value] of [['Facture',(inv.number||'À compléter')+' · '+date],['Émetteur',inv.seller?.name||'À compléter'],['Client',inv.buyer?.name||'À compléter'],['Prestations',lines],['Montants',amounts]]){
    const row=document.createElement('div'),name=document.createElement('span'),content=document.createElement('strong');name.textContent=title;content.textContent=value;row.append(name,content);recap.append(row);
  }
  if(inv.allowance){const row=document.createElement('div'),label=document.createElement('span'),value=document.createElement('strong');label.textContent='Remise incluse';value.textContent='− '+format(inv.allowance.amount)+' HT · '+inv.allowance.reason;row.append(label,value);recap.append(row);}
  for(const [original,entry] of quickFields){
    if(!original.isConnected||(!original.required&&!original.value&&original.checkValidity())){entry.label.remove();quickFields.delete(original);continue;}
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
  const conflicts=recordConflicts(inv),warning=$('#record-warning');
  warning.hidden=!conflicts.length;
  warning.textContent=conflicts.length?'Écarts avec la fiche : '+conflicts.join(', ')+'. Conversion avec les données ci-dessous.':'';
  $('#generate').disabled=busy;
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
  for(const id of ['allowance-target','allowance-group','allowance-reason'])$('#'+id).required=$('#use-allowance').checked;
  if(!sourceFile){syncRequiredMarkers();return;}
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
  const info=$('#read-summary');info.hidden=!missing;
  info.textContent=missing?missing+' information(s) à compléter.':'';
  updateQuickReview(inputs,missing);
  renderAllowance(invoiceData());
  syncRequiredMarkers();
}
const parties = [ ['seller', 'Émetteur'], ['buyer', 'Client'] ];
const partyFields = [['name','Raison sociale'],['siret','SIRET'],['siren','SIREN'],['vat_number','Numéro de TVA'],['street','Adresse postale'],['postal_code','Code postal'],['city','Ville'],['country','Pays (ISO)'],['contact_email','E-mail de contact'],['electronic_address','Adresse électronique de facturation'],['electronic_scheme','Type d’adresse (0225 : SIREN ; EM : e-mail)']];
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
    if (field === 'street'&&key==='buyer') input.placeholder='Adresse du client ou adresse de facturation si différente';
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
  if(data.vat_rate==null||String(data.vat_rate).trim()==='')box.querySelector('[data-key="vat_rate"]').value=box.querySelector('[data-key="vat_category"]').value==='S'?'20':'0';
  box.querySelector('.remove-line').onclick = () => { if ($('#lines').children.length > 1) { box.remove(); invalidate();readingSummary(); } };
  box.querySelector('[data-key="vat_category"]').onchange = (e) => {
    box.querySelector('[data-key="vat_rate"]').value=e.target.value==='S'?'20':'0';
    invalidate();readingSummary();
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
function allowanceFingerprint(inv){return JSON.stringify([inv.lines.map(l=>[l.quantity,l.unit_price,l.vat_category,l.vat_rate].map(String)),String(inv.payment?.prepaid||'0')]);}
function allowanceIsCurrent(inv){
  return !!currentAllowance&&allowanceBasis===allowanceFingerprint(inv)&&
    Number($('#allowance-target').value)===Number(inv.totals?.gross)&&
    $('#allowance-reason').value.trim()===currentAllowance.reason&&
    $('#allowance-group').value===currentAllowance.vat_category+':'+Math.round(Number(currentAllowance.vat_rate)*100);
}
function setupAllowance(inv){
  currentAllowance=inv.allowance?structuredClone(inv.allowance):null;
  allowanceBasis=currentAllowance?allowanceFingerprint(invoiceData()):null;
  $('#use-allowance').checked=!!currentAllowance;$('#allowance-settings').hidden=!currentAllowance;
  $('#allowance-reason').value=currentAllowance?.reason||'Remise commerciale';
  const desired=inv.totals?.due!=null?Number(inv.totals.due)+Number(inv.payment?.prepaid||0):Number(inv.totals?.gross);
  $('#allowance-target').value=currentAllowance?inv.totals.gross:Number.isFinite(desired)?desired.toFixed(2):'';
  updateAllowanceGroups(inv,currentAllowance?currentAllowance.vat_category+':'+Math.round(Number(currentAllowance.vat_rate)*100):null);
}
function updateAllowanceGroups(inv,preferred=null){
  const select=$('#allowance-group'),previous=preferred??select.value;
  let groups=[];try{groups=CDIAllowance.groups(inv);}catch{}
  select.replaceChildren();
  if(groups.length!==1){const option=document.createElement('option');option.value='';option.textContent='Choisir un taux';select.append(option);}
  for(const group of groups){const option=document.createElement('option');option.value=group.key;option.textContent=(Number(group.rate)/100).toLocaleString('fr-FR')+' % · '+({S:'TVA standard',Z:'Taux zéro',E:'Exonération',AE:'Autoliquidation',O:'Hors champ'}[group.category]||group.category);select.append(option);}
  if(groups.some(g=>g.key===previous))select.value=previous;
}
function applyAllowance(){
  if(!$('#use-allowance').checked)return;
  const inv=invoiceData();
  try{
    const proposal=CDIAllowance.propose(inv,$('#allowance-target').value,$('#allowance-group').value,$('#allowance-reason').value);
    if(!currentAllowance)allowanceRestoreTotals=structuredClone(inv.totals||{});
    currentAllowance=proposal.allowance;
    for(const [key,value] of Object.entries(proposal.totals))setValue('totals.'+key,value);
    allowanceBasis=allowanceFingerprint(invoiceData());
    invalidate();readingSummary();
  }catch(error){invalidate();readingSummary();$('#allowance-status').textContent=error.message;$('#allowance-status').className='help error';}
}
function allowanceDifferences(inv){
  if(!currentAllowance)return [];
  return [['net','Total HT'],['vat','TVA'],['gross','Total TTC'],['rounding','Arrondi'],['due','À payer']].flatMap(([key,label])=>{
    const before=extractedInvoice.totals?.[key],after=inv.totals?.[key];
    return before!=null&&after!=null&&Number(before)!==Number(after)?[{key,label,before,after}]:[];
  });
}
function renderAllowance(inv){
  const enabled=$('#use-allowance').checked,differences=allowanceDifferences(inv);
  updateAllowanceGroups(inv);
  $('#allowance-settings').hidden=!enabled;
  const current=allowanceIsCurrent(inv),status=$('#allowance-status');
  status.className=current?'help':'help error';
  status.textContent=current?'Remise : '+Number(currentAllowance.amount).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})+' HT.':'Indiquez le TTC souhaité, puis calculez la remise.';
  const warning=$('#allowance-differences');warning.replaceChildren();warning.hidden=!differences.length;
  if(differences.length){
    const heading=document.createElement('strong');heading.textContent='Le PDF est conservé avec ses montants d’origine.';warning.append(heading);
    const table=document.createElement('table'),header=document.createElement('tr');
    for(const value of ['Montant','PDF conservé','Données Factur-X']){const cell=document.createElement('th');cell.textContent=value;header.append(cell);}table.append(header);
    for(const item of differences){const row=document.createElement('tr');for(const value of [item.label,...[item.before,item.after].map(v=>Number(v).toLocaleString('fr-FR',{style:'currency',currency:'EUR'}))]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}table.append(row);}warning.append(table);
  }
  $('#review-label').textContent=differences.length?'J’ai vérifié la remise et j’accepte les écarts affichés entre le PDF conservé et les données Factur-X.':'J’ai vérifié les informations avec le PDF.';
  document.querySelector('[data-check="source_review"]').textContent=differences.length?'Écarts avec le PDF relus et acceptés':'Correspondance avec le PDF';
  if(enabled&&!current)$('#generate').disabled=true;
}
$('#use-allowance').onchange=()=>{
  const inv=invoiceData();
  if($('#use-allowance').checked){updateAllowanceGroups(inv);applyAllowance();}
  else{currentAllowance=null;allowanceBasis=null;for(const [key,value] of Object.entries(allowanceRestoreTotals||extractedInvoice.totals||{}))setValue('totals.'+key,value);allowanceRestoreTotals=null;invalidate();readingSummary();}
};
$('#apply-allowance').onclick=applyAllowance;
$('#allowance-group').onchange=()=>{invalidate();readingSummary();};
function fillInvoice(inv) {
  inv=prepareInvoice(inv);
  quickFields.clear();$('#quick-fields').replaceChildren();
  for (const input of form.querySelectorAll('[name]')) setInput(input, getAt(inv, input.name));
  $('#lines').replaceChildren(); (inv.lines?.length ? inv.lines : [{}]).forEach(addLine); invalidate();
  setupAllowance(inv);
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
  if(currentAllowance)inv.allowance=structuredClone(currentAllowance);
  return inv;
}
function invalidate() {
  converted = null; $('#reviewed').checked = false; $('#downloads').hidden = true;
  $('#conversion-progress').hidden=true;$('#conversion-output').hidden=true;$('#technical-downloads').hidden=true;
  $('#technical-warnings').replaceChildren();$('#validation-details').open=false;
  $('#result').replaceChildren(); $('#result-label').textContent = 'EN ATTENTE';
  document.querySelectorAll('#checks li').forEach(el => el.className = '');
}
function showProgress(event, state='running') {
  const panel=$('#conversion-progress'),bar=$('#progress-bar');
  panel.hidden=false;panel.dataset.state=state;
  $('#progress-label').textContent=event.label;
  if(event.completed==null){bar.removeAttribute('value');$('#progress-count').textContent='';}
  else{bar.value=event.completed;$('#progress-count').textContent=event.completed+' / 6 étapes';}
  bar.setAttribute('aria-valuetext',event.label);
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
  invalidate(); sourceFile = null; sourceHash = null;extractedInvoice={};currentAllowance=null;allowanceRestoreTotals=null;allowanceBasis=null;reusedCoordinates=[];quickFields.clear();$('#quick-fields').replaceChildren();$('#quick-review').hidden=true;$('#read-summary').hidden=true;$('#full-data').open=false;
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
    if(imported.warnings.length)message(imported.warnings.join(' '));else $('#import-status').hidden=true;
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
  if($('#use-allowance').checked&&!allowanceIsCurrent(invoiceData()))return message('Calculez la remise avec les prestations et le TTC actuels avant de convertir.',true);
  for (const el of form.querySelectorAll('input,select,textarea')) {
    if (!el.checkValidity()) { let parent=el.parentElement; while(parent) { if(parent.tagName==='DETAILS') parent.open=true; parent=parent.parentElement; } el.reportValidity(); return; }
  }
  const payload={profile:$('#profile').value,invoice:invoiceData(),source_sha256:sourceHash,reviewed:$('#reviewed').checked,source_corrections:sourceCorrections(),pdf_differences_acknowledged:!!currentAllowance&&allowanceDifferences(invoiceData()).length>0&&$('#reviewed').checked};
  busy=true; converted=null; $('#downloads').hidden=true; $('#generate').disabled=true; $('#result-label').textContent='EN COURS';
  $('#result').replaceChildren();$('#technical-warnings').replaceChildren();$('#technical-downloads').hidden=true;$('#conversion-output').hidden=true;
  showProgress({label:'Envoi de la facture…'});
  $('#conversion-progress').scrollIntoView({block:'nearest'});
  document.querySelectorAll('#checks li').forEach(el=>el.className='');
  const data=new FormData();data.append('pdf',sourceFile);data.append('payload',JSON.stringify(payload));
  // Lock data editing so a displayed success cannot refer to an older form state.
  const controls=Array.from(document.querySelectorAll('input,select,textarea,button'));controls.forEach(el=>el.disabled=true);
  try {
    const response=await apiFetch('/api/facturx/generate?output=stream',{method:'POST',body:data});
    const result=await CDIConversion.readStream(response,event=>showProgress(event));
    showProgress({completed:6,label:'Conversion terminée'},'success');
    converted=result;
    if($('#remember-parties').checked){
      partyMemory=CDIPartyMemory.remember(partyMemory,payload.invoice);
      if(embedConfig)window.parent.postMessage({type:'cdi-facturx-remember',session:embedConfig.session,invoice:payload.invoice,result:{valid:result.valid,checks:result.checks,source_sha256:result.source_sha256}},embedConfig.parentOrigin);
      else{try{localStorage.setItem(partyMemoryKey,JSON.stringify(partyMemory));}catch{message('Conversion réussie. La mémorisation des coordonnées est indisponible dans ce navigateur.',true);}}
    }
    document.querySelectorAll('#checks li').forEach(el=>el.className=result.checks[el.dataset.check]?'pass':'');
    $('#result-label').textContent='PRÊT'; $('#result').replaceChildren();
    if(result.pdf_differences_acknowledged){const p=document.createElement('p');p.textContent='PDF conservé : les écarts de montants figurent dans le rapport.';$('#result').append(p);}
    for(const warning of result.warnings||[]){const p=document.createElement('p');p.textContent=warning.message;$('#technical-warnings').append(p);}
    $('#downloads').hidden=false;$('#technical-downloads').hidden=false;$('#conversion-output').hidden=false;
  } catch(error) {
    showProgress({completed:$('#progress-bar').hasAttribute('value')?$('#progress-bar').value:0,label:'Conversion interrompue'},'error');
    $('#conversion-output').hidden=false;
    $('#result-label').textContent='À CORRIGER'; $('#result').replaceChildren();
    const p=document.createElement('p');p.className='error';p.textContent=error.name==='TimeoutError'?'Le service met trop de temps à répondre. Réessayez.':error instanceof TypeError?'Connexion au service interrompue. Réessayez.':error.message || (typeof error.detail==='string'?error.detail:'Le contrôle a échoué. Réessayez.');$('#result').append(p);
    const list=document.createElement('ul');for(const item of error.errors||[]) { const li=document.createElement('li');li.textContent=(item.field||item.code||'')+' : '+item.message;list.append(li); }$('#result').append(list);
    const check=document.querySelector('[data-check="'+({data:'amounts',source:'source_review',pdfa:'pdfa_3b'}[error.stage]||error.stage)+'"]');if(check)check.className='fail';
  } finally { busy=false;controls.forEach(el=>el.disabled=false);$('#generate').disabled=false;previewControls(); }
};
$('#download-pdf').onclick=()=>{if(!converted)return;const binary=atob(converted.pdf_base64);download(new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:'application/pdf'}),converted.filename);};
$('#download-xml').onclick=()=>{if(converted)download(new Blob([converted.xml],{type:'application/xml'}),'factur-x.xml');};
$('#download-report').onclick=()=>{if(!converted)return;const {pdf_base64,xml,verapdf_report,...report}=converted;download(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),'validation.json');};
$('#download-vera').onclick=()=>{if(converted)download(new Blob([converted.verapdf_report],{type:'application/xml'}),'verapdf.xml');};
addLine();
for(const [key,value] of Object.entries(prepareInvoice({}).seller))setValue('seller.'+key,value);
readingSummary();
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
