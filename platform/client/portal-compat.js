/* Server-authorised bridge for the remaining portal controllers. No credential
   verifier is downloaded or persisted by this client. Built into the classic shell. */
let portalVersion=0,portalClean='',portalSending=null,portalEpoch=0,portalLoginAttempt=0;
const portalBlobs=new Map();
window.addEventListener('storage',event=>{
  if(event.key!==AUTH_SESSION_KEY||!AUTH_USER)return;
  let email;try{email=JSON.parse(event.newValue)?.email;}catch{}
  if(email===AUTH_USER)return;
  if(portalClean&&JSON.stringify(state)!==portalClean)portalRemember();
  dashboardForget();financeForget();billingForget();stampingForget();personnelForget();closeModal();nfDraft=null;marchesForget();agendaForget();budgetsForget();facturxForgetAuth();
  AUTH_USER=null;movAccess=null;salariesUnlocked=false;portalClear();document.body.classList.remove('authed');renderUserChip();authBack();
});
function load(){return freshState();}
function cloudURL(){return CLOUD_ENDPOINT.replace(/\/+$/,'')+'/api/v1/portal';}
function isAdmin(email){
  email=normEmail(email);const account=state.auth?.accounts?.[email];
  return account?.role!==undefined?account.role==='admin':!cloudEnabled()&&AUTH_ADMINS.includes(email);
}
function accountModules(email=AUTH_USER){return CDIPlatform.accountAccess(state.auth?.accounts?.[email]?.access,isAdmin(email));}
function canAccess(view){
 if(!AUTH_USER)return false;
 if(view==='parametres'||view==='cet')return isAdmin(AUTH_USER);
 const key=({marches:'facturier',conges:'agenda'})[view]||view;
 return accountModules()[key]===true;
}
function applyAccessNavigation(){
 document.querySelectorAll('.nav-item[data-view]').forEach(n=>{n.hidden=!canAccess(n.dataset.view);n.style.display=n.hidden?'none':'';});
 const sheets=document.getElementById('cdiSheetsLink');if(sheets){sheets.hidden=!canAccess('sheets');sheets.style.display=sheets.hidden?'none':'';}
 document.querySelectorAll('.sidebar>.nav-label').forEach(label=>{let next=label.nextElementSibling,visible=false;while(next&&!next.classList.contains('nav-label')&&!next.classList.contains('spacer')){if(next.classList.contains('nav-item')&&!next.hidden)visible=true;next=next.nextElementSibling;}label.hidden=!visible;});
}
function firstAllowedView(){return CDIPlatform.accessModules.find(m=>m.key!=='sheets'&&canAccess(m.key))?.key||'access';}
function renderAccessHome(){
 $('#topAction').style.display='none';$('#pageTitle').textContent='Votre espace';$('#pageSub').textContent='';
 $('#content').innerHTML='<section class="card card-pad" style="max-width:480px;margin:48px auto;text-align:center">'+(canAccess('sheets')?'<a class="btn btn-primary" href="./feuilles/">Ouvrir CDInnovSheets</a>':'Aucune rubrique n’est activée pour ce compte.')+'</section>';
}
async function authSetAccess(email,access){
 if(!isAdmin(AUTH_USER))throw new Error('Accès réservé à un administrateur.');
 if(!await cloudPush())throw new Error('Enregistrez les modifications en attente avant de modifier les droits.');
 try{
  await portalFetch(cloudURL()+'/accounts',{method:'POST',headers:{'Content-Type':'application/json','If-Match':String(portalVersion)},body:JSON.stringify({email,action:'access',access})});
  if(!await cloudLoad({discard:true}))throw new Error('Accès enregistrés. Actualisez pour les afficher.');
  toastSaved('Accès enregistrés');
 }catch(e){if(e.status===409)await cloudLoad({discard:true});throw e;}
}
async function portalFetch(url,options={}){
  const session=await budgetsEnsureSession();
  const response=await fetch(url,{...options,cache:'no-store',headers:{...options.headers,Authorization:'Bearer '+session.token}});
  if(!response.ok){let message;try{message=(await response.json()).error;}catch{}throw Object.assign(new Error(message||'Accès au portail impossible (HTTP '+response.status+').'),{status:response.status});}
  return response;
}
async function portalRead(options={}){return (await portalFetch(cloudURL(),options)).json();}
function portalRemember(){try{localStorage.removeItem(STORE_KEY);if(AUTH_USER)localStorage.setItem(STORE_KEY+':draft:'+AUTH_USER,JSON.stringify(state));}catch{}}
function save(){
  if(typeof budgetsClientsChanged==='function')budgetsClientsChanged();
  try{if(isAdmin(AUTH_USER))reconcileCetMovements();agendaState.leaves=null;}catch{}
  state.majAt=new Date().toISOString();state.majBy=AUTH_USER||'';
  portalRemember();renderMajPill();cloudSave();
}
async function cloudLoad(options={}){
  if(!cloudEnabled()){setSync('local','Local');return true;}
  const user=AUTH_USER,epoch=portalEpoch;if(!user)return false;
  if(portalClean&&JSON.stringify(state)!==portalClean&&!options.discard){setSync('err','Modifications à enregistrer');return false;}
  setSync('busy','Chargement…');
  try{
    const previousAccess=JSON.stringify(accountModules(user)),wasAdmin=isAdmin(user),data=await portalRead();if(AUTH_USER!==user||portalEpoch!==epoch)return false;
    state={...freshState(),...data.workspace,params:data.workspace.params||structuredClone(PARAMS_DEFAULT)};
    for(const person of state.salaries)if(person.email)AUTH_USER_MAT[normEmail(person.email)]=person.matricule;
    portalVersion=data.version;portalClean=JSON.stringify(state);currentYear=Number(state.params.anneeSuivi)||currentYear;
    await portalLoadPhotos();if(AUTH_USER!==user||portalEpoch!==epoch)return false;
    setSync('ok','Synchronisé');
    if(document.body.classList.contains('authed')&&(wasAdmin!==isAdmin(user)||previousAccess!==JSON.stringify(accountModules(user)))){
      dashboardForget();financeForget();billingForget();stampingForget();personnelForget();marchesForget();agendaForget();budgetsForget();facturxForgetAuth();closeModal();nfDraft=null;
      currentView=firstAllowedView();unlockApp(user);
    }else render();
    return true;
  }catch(e){if(AUTH_USER===user)setSync('err',e.status===401?'Connexion expirée':'Chargement impossible');return false;}
}
function cloudSave(){if(!cloudEnabled()||!AUTH_USER)return;clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>cloudPush(),700);}
async function cloudPush(){
  if(!cloudEnabled())return true;
  if(portalSending)return portalSending;
  clearTimeout(cloudTimer);const user=AUTH_USER,epoch=portalEpoch;
  if(!user||!portalVersion)return false;
  const pending=(async()=>{
    try{
      while(AUTH_USER===user&&portalEpoch===epoch&&JSON.stringify(state)!==portalClean){
        const snapshot=JSON.stringify(state);setSync('busy','Envoi…');
        const changes=CDIPlatform.recordChanges(JSON.parse(portalClean),JSON.parse(snapshot)).filter(c=>!['majAt','majBy'].includes(c.path[0]));
        const response=await portalFetch(cloudURL(),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({changes})});
        const result=await response.json();if(AUTH_USER!==user||portalEpoch!==epoch)return false;
        portalVersion=result.version;portalClean=snapshot;
      }
      try{localStorage.removeItem(STORE_KEY+':draft:'+user);}catch{}
      if(AUTH_USER===user)setSync('ok','Synchronisé');return true;
    }catch(e){if(AUTH_USER===user&&portalEpoch===epoch){portalRemember();setSync('err',e.status===409?'Conflit : copie locale conservée':'Non enregistré');toast(e.message);}return false;}
  })();portalSending=pending;
  try{return await pending;}finally{if(portalSending===pending)portalSending=null;}
}
async function cloudSyncNow(){
  if(!cloudEnabled())return toast('Synchronisation cloud désactivée');
  if(portalClean&&JSON.stringify(state)!==portalClean){
    if(!confirm('Des modifications locales ne sont pas enregistrées. Télécharger leur copie puis recharger les données du serveur ?'))return;
    dl('CDInnov-modifications-locales.json',JSON.stringify(state,null,2),'application/json');
  }
  await cloudLoad({discard:true});
}
function notify(subject,html,to){
  if(!cloudEnabled()||!AUTH_USER)return;
  const user=AUTH_USER;
  cloudPush().then(ok=>{if(ok&&AUTH_USER===user)return portalFetch(CLOUD_ENDPOINT.replace(/\/+$/,'')+'/notify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject,html,...(to?{to}:{})})});}).catch(()=>toast('Notification non envoyée. Les données restent enregistrées.'));
}
function isRemoteFileURL(src){try{const url=new URL(src);return url.origin===new URL(CLOUD_ENDPOINT).origin&&url.pathname.startsWith('/files/');}catch{return false;}}
function safePrivateFileURL(src){
  if(typeof src!=='string'||!src)throw new Error('Adresse de pièce jointe non autorisée.');
  if(isRemoteFileURL(src)){const url=new URL(src);if(!url.username&&!url.password)return src;}
  if(/^data:(?:application\/pdf|image\/(?:png|jpeg|webp|gif));base64,[A-Za-z0-9+/]+={0,2}$/.test(src))return src;
  throw new Error('Adresse de pièce jointe non autorisée.');
}
async function privateFileFetch(src){safePrivateFileURL(src);return isRemoteFileURL(src)?portalFetch(src):fetch(src);}
async function privateFileURL(src){
  safePrivateFileURL(src);
  if(!isRemoteFileURL(src))return src;
  if(portalBlobs.has(src))return portalBlobs.get(src);
  const user=AUTH_USER,epoch=portalEpoch,response=await privateFileFetch(src),blob=await response.blob();
  if(AUTH_USER!==user||portalEpoch!==epoch)throw new Error('La session a changé.');
  const url=URL.createObjectURL(blob);portalBlobs.set(src,url);return url;
}
function photoURL(src){return isRemoteFileURL(src)?portalBlobs.get(src)||'':src;}
async function portalLoadPhotos(){await Promise.all((state.salaries||[]).map(s=>s.photo&&isRemoteFileURL(s.photo)?privateFileURL(s.photo).catch(()=>null):null));}
async function uploadFileToR2(file,keyPrefix){
  if(file.size>20*1024*1024)throw new Error('Fichier trop volumineux (20 Mo maximum).');
  const ext=(file.name||'').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,10);
  const key=(keyPrefix||'f')+'-'+crypto.randomUUID()+(ext?'.'+ext:'');
  const url=filesBase()+encodeURIComponent(key);await portalFetch(url,{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
  if(file.type.startsWith('image/'))await privateFileURL(url);return url;
}
function deleteFileFromR2(url){if(isRemoteFileURL(url))cloudPush().then(ok=>ok?portalFetch(url,{method:'DELETE'}):null).catch(()=>{});}
async function toU8Async(src){if(!src)return new Uint8Array();if(String(src).startsWith('data:'))return dataURLtoU8(src);const r=await privateFileFetch(src);if(!r.ok)throw new Error('Lecture du fichier impossible.');return new Uint8Array(await r.arrayBuffer());}
async function toDataURLAsync(src){if(!src)return null;if(String(src).startsWith('data:'))return src;const r=await privateFileFetch(src);if(!r.ok)throw new Error('Lecture du fichier impossible.');return fileToDataURL(await r.blob());}
function portalClear(){
  portalEpoch++;portalLoginAttempt++;clearTimeout(cloudTimer);portalVersion=0;portalClean='';portalSending=null;
  for(const url of portalBlobs.values())URL.revokeObjectURL(url);portalBlobs.clear();
  try{localStorage.removeItem(STORE_KEY);}catch{}state=freshState();
}
function authContinue(){
  authMsg('');const email=normEmail($('#authEmail').value);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){authMsg('Entrez une adresse e-mail valide.');return;}
  _authEmailPending=email;$('#authLoginWho').textContent=email;authShowStep('Login');setTimeout(()=>$('#authPw').focus(),30);
}
async function portalLogin(email,password){
  const attempt=++portalLoginAttempt;const session=await budgetsSignIn(email,password,false);
  if(attempt!==portalLoginAttempt)throw new Error('La demande de connexion a changé.');
  setSession(email);localStorage.setItem(AUTH_SESSION_KEY,JSON.stringify({...getSession(),budgets:session}));AUTH_USER=email;
  if(cloudEnabled()&&!await cloudLoad({discard:true})){AUTH_USER=null;clearSession();throw new Error('Impossible de charger vos données. Réessayez.');}
  if(attempt!==portalLoginAttempt)throw new Error('La demande de connexion a changé.');
  unlockApp(email);await authSaveCredential(email,password);facturxWarmLogin(email,password);
}
async function authDoLogin(){
  const pw=$('#authPw').value;if(!pw)return authMsg('Entrez votre mot de passe.');
  const button=$('#authLogin');button.disabled=true;authMsg('');authSetLoading(true);
  try{await portalLogin(_authEmailPending,pw);$('#authPw').value='';authMsg('');}catch(e){authMsg(e.message||'Connexion impossible.');}finally{button.disabled=false;authSetLoading(false);}
}
async function authDoCreate(){
  const name=$('#authName').value.trim(),p1=$('#authPw1').value,p2=$('#authPw2').value;
  if(!name||p1.length<8||p1!==p2)return authMsg('Indiquez votre nom et deux mots de passe identiques de 8 caractères minimum.');
  const token=window.cdiInvitation?.token,email=window.cdiInvitation?.email;
  if(!token||!email)return authMsg('Utilisez le lien d’invitation fourni par un administrateur.');
  $('#authCreate').disabled=true;authSetLoading(true);
  try{
    const salt=randHex(16),iter=150000,hash=await pbkdf2(p1,salt,iter);
    const response=await fetch(cloudURL()+'/enrol',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,token,name,salt,iter,hash})});
    if(!response.ok)throw new Error((await response.json()).error||'Création impossible.');
    delete window.cdiInvitation;await portalLogin(email,p1);authMsg('');
  }catch(e){authMsg(e.message);}finally{$('#authCreate').disabled=false;authSetLoading(false);}
}
async function authCreateAccount(){throw new Error('Utilisez une invitation délivrée par un administrateur.');}
async function authVerify(){throw new Error('La vérification du compte se fait sur le serveur.');}
async function authAccountAction(email,action){
  if(!isAdmin(AUTH_USER))return;
  if(!await cloudPush())return;
  try{
    const result=await(await portalFetch(cloudURL()+'/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,action})})).json();
    await cloudLoad({discard:true});
    if(result.token){
      const url=new URL(location.href);url.search='';url.hash=new URLSearchParams({invitation:result.token,email:result.email}).toString();
      modal('<div class="modal-head"><h3>Lien d’activation du compte</h3></div><div class="modal-body"><p>Transmettez ce lien à la personne concernée. Il est utilisable une seule fois, pendant 24 heures.</p><input class="inp" id="accountInviteLink" readonly value="'+esc(url.href)+'" aria-label="Lien d’activation"><p class="hint">Le lien permet de choisir un mot de passe. Il doit rester confidentiel.</p></div><div class="modal-foot"><button class="btn" onclick="navigator.clipboard.writeText(document.getElementById(\'accountInviteLink\').value).then(()=>toast(\'Lien copié\'))">Copier le lien</button><button class="btn btn-primary" onclick="closeModal()">Fermer</button></div>');
    }else toastSaved('Accès retiré');
  }catch(e){toast(e.message);}
}
async function authSetRole(email,role){
  if(!isAdmin(AUTH_USER))throw new Error('Accès réservé à un administrateur.');
  if(!await cloudPush())throw new Error('Enregistrez les modifications en attente avant de modifier les droits.');
  try{
    await portalFetch(cloudURL()+'/accounts',{method:'POST',headers:{'Content-Type':'application/json','If-Match':String(portalVersion)},body:JSON.stringify({email,action:'role',role})});
    if(!await cloudLoad({discard:true}))throw new Error('Droits enregistrés. Actualisez la page pour les afficher.');
    toastSaved('Droits mis à jour');
  }catch(e){if(e.status===409)await cloudLoad({discard:true});throw e;}
}
async function authAddAllowed(){const email=normEmail($('#newAllowedEmail').value);await authAccountAction(email,'invite');}
async function authRemoveAllowed(email){if(confirm('Retirer l’accès de '+email+' ?'))await authAccountAction(normEmail(email),'remove');}
async function authResetAccount(email){if(confirm('Révoquer le mot de passe actuel et créer un lien de réinitialisation pour '+email+' ?'))await authAccountAction(normEmail(email),'reset');}
async function backupJSON(){try{const data=cloudEnabled()?await(await portalFetch(cloudURL()+'/backup')).json():state;dl('CET_CDInnov_sauvegarde_'+ymd(new Date())+'.json',JSON.stringify(data,null,2),'application/json');toast('Sauvegarde téléchargée');}catch(e){toast(e.message);}}
async function bootAuth(){
  authSetLoading(true);
  if(!cloudEnabled()){ensureAuthSeed();const sx=getSession();if(sx&&budgetsCurrentSession(sx.email))unlockApp(sx.email);else authBack();return;}
  portalClear();
  const fragment=new URLSearchParams(location.hash.slice(1));
  if(fragment.has('invitation')){
    window.cdiInvitation={token:fragment.get('invitation'),email:normEmail(fragment.get('email'))};history.replaceState(null,'',location.pathname+location.search);_authEmailPending=window.cdiInvitation.email;clearSession();authShowStep('Create');return;
  }
  const session=getSession();if(!session||!budgetsCurrentSession(session.email)){authBack();return;}
  AUTH_USER=session.email;
  try{await portalFetch(CLOUD_ENDPOINT.replace(/\/$/,'')+'/api/v1/session');if(!await cloudLoad({discard:true}))throw new Error('Chargement impossible');unlockApp(session.email);}
  catch{AUTH_USER=null;clearSession();authBack();}
}
