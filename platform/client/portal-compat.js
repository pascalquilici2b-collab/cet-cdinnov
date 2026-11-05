/* Server-authorised bridge for the remaining portal controllers. No credential
   verifier is downloaded or persisted by this client. Built into the classic shell. */
let portalVersion=0,portalClean='',portalSending=null,portalEpoch=0,portalLoginAttempt=0;
const portalBlobs=new Map();
let portalLogoutPending=false,portalSuspendedUser=null,portalSigninPending=null,portalReconnecting=false;
function portalForgetUser(){
  try{if(AUTH_USER)localStorage.removeItem(STORE_KEY+':draft:'+AUTH_USER);}catch{}
  dashboardForget();financeForget();billingForget();stampingForget();personnelForget();closeModal();nfDraft=null;marchesForget();agendaForget();budgetsForget();facturxForgetAuth();
  AUTH_USER=null;movAccess=null;salariesUnlocked=false;portalClear();document.body.classList.remove('authed');renderUserChip();
}
window.CDISession.configure({
  onExpired(session){
    if(!AUTH_USER||session.email!==AUTH_USER||portalLogoutPending)return;
    portalSuspendedUser=AUTH_USER;portalEpoch++;portalLoginAttempt++;clearTimeout(cloudTimer);budgetsTransport.suspend();
    if(portalClean&&JSON.stringify(state)!==portalClean)portalRemember();
  },
  reconnect:portalReconnect,
  onAccountChange(next){if(AUTH_USER&&AUTH_USER!==next.email){portalForgetUser();portalSuspendedUser=null;}},
  onRestored(next){budgetsSession=next;if(!AUTH_USER&&!portalLogoutPending)bootAuth();},
  onLogout(){portalSuspendedUser=null;if(AUTH_USER)portalForgetUser();authBack();}
});
function getSession(){try{const value=JSON.parse(localStorage.getItem(AUTH_SESSION_KEY)||'null');const session=value?.budgets;return value&&session?.email===value.email&&typeof session.sessionId==='string'&&Number.isFinite(session.expiresAt)?value:null;}catch{return null;}}
function setSession(email){const session=budgetsSession;if(!session||session.email!==normEmail(email))return;localStorage.setItem(AUTH_SESSION_KEY,JSON.stringify({email:session.email,t:session.expiresAt-AUTH_SESSION_MAX,budgets:{email:session.email,expiresAt:session.expiresAt,sessionId:session.sessionId}}));}
function clearSession(){window.CDISession.logout();}
function budgetsApi(){return location.origin+'/budgets';}
function budgetsCurrentSession(email=AUTH_USER){
  const portal=getSession(),candidate=portal?.budgets;
  if(!email||portal?.email!==email||candidate?.email!==email||candidate.expiresAt<=Date.now()||typeof candidate.sessionId!=='string')return null;
  budgetsSession={email:candidate.email,expiresAt:candidate.expiresAt,sessionId:candidate.sessionId};return budgetsSession;
}
function budgetsClearSession(){
  budgetsTransport.clear();budgetsSession=null;
  window.CDISession.expire({reason:'unauthorized'});
  try{sessionStorage.removeItem('cdi-budgets-session');}catch{}
}
function budgetsForget(){
  document.body.classList.remove('cdi-budget-expanded');budgetsTransport.clear();budgetsSession=null;budgetsWarmPromise=null;budgetsDirty=false;
  clearTimeout(budgetsClientsTimer);budgetsClients=[];document.getElementById('cdiClientsList')?.remove();budgetsObservedClientNames=null;budgetsPendingClientNames.clear();document.getElementById('cdiBudgetsFrame')?.remove();
}
async function portalAuthJSON(response){
  const contentType=(response.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
  let responsePath='';try{responsePath=new URL(response.url).pathname;}catch{}
  const failure=(code,message)=>Object.assign(new Error(message),{code,status:response.status,contentType,responsePath,redirected:response.redirected});
  const status=' (HTTP '+response.status+'). Réessayez dans quelques instants.';
  if(!/^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json$/.test(contentType)){
    throw failure('AUTH_RESPONSE_TYPE','Le service de connexion a renvoyé '+(contentType==='text/html'?'une page':'une réponse')+' inattendue'+status);
  }
  let result;
  try{result=await response.json();}catch(error){
    if(error?.name!=='SyntaxError')throw error;
    // JSON parser errors can quote the response body. Keep diagnostics useful
    // without propagating HTML, credentials or other server output to the UI.
    throw failure('AUTH_RESPONSE_JSON','La réponse du service de connexion est illisible'+status);
  }
  if(!result||typeof result!=='object'||Array.isArray(result))throw failure('AUTH_RESPONSE_SHAPE','La réponse du service de connexion est invalide'+status);
  if(!response.ok){
    const message=typeof result.error==='string'&&result.error.trim()&&result.error.length<=500&&!/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result.error)?result.error:'Connexion CDInnov impossible (HTTP '+response.status+').';
    throw failure('AUTH_HTTP_ERROR',message);
  }
  return result;
}
async function budgetsSignIn(email,password,commit=true){
  if(portalLogoutPending)throw new Error('Déconnexion en cours. Réessayez dans un instant.');
  if(portalSigninPending)throw new Error('Une connexion est déjà en cours. Réessayez dans un instant.');
  email=normEmail(email);const generation=portalLoginAttempt;
  const request=async data=>{const response=await fetch(budgetsApi()+'/session',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json','Content-Type':'application/json','X-CDInnov-Request':'1'},body:JSON.stringify({email,...data}),signal:AbortSignal.timeout(30000)});return portalAuthJSON(response);};
  const pending=(async()=>{
    const challenge=await request({action:'challenge'});
    if(!/^[a-f0-9]{32}$/i.test(challenge.salt)||!Number.isInteger(challenge.iter)||challenge.iter<100000||challenge.iter>1000000||typeof challenge.challenge!=='string')throw new Error('Connexion CDInnov indisponible.');
    if(generation!==portalLoginAttempt||portalLogoutPending)throw new Error('La demande de connexion a changé.');
    const derived=await pbkdf2(password,challenge.salt,challenge.iter),key=await crypto.subtle.importKey('raw',_bytes(derived),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const proof=_hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(challenge.challenge)));
    const result=await request({action:'verify',challenge:challenge.challenge,proof});
    if(generation!==portalLoginAttempt||portalLogoutPending){await fetch('/api/v1/session',{method:'DELETE',credentials:'same-origin',headers:{'X-CDInnov-Request':'1'}}).catch(()=>{});throw new Error('La demande de connexion a changé.');}
    if(typeof result.sessionId!=='string'||!Number.isFinite(result.expiresAt))throw new Error('Connexion invalide.');
    const session={email,expiresAt:result.expiresAt,sessionId:result.sessionId};
    if(commit){if(AUTH_USER!==email)throw new Error('La session utilisateur a changé.');budgetsSession=session;setSession(email);window.CDISession.accept(session);}
    return session;
  })();portalSigninPending=pending;
  try{return await pending;}finally{if(portalSigninPending===pending)portalSigninPending=null;}
}
async function budgetsEnsureSession(){
  if(portalLogoutPending||!AUTH_USER)throw new Error('Connectez-vous à votre compte CDInnov.');
  if(budgetsWarmPromise)await budgetsWarmPromise;
  const current=budgetsCurrentSession();if(current&&(!window.CDISession.isExpired()||portalReconnecting))return current;
  window.CDISession.expire({reason:'timeout'});throw Object.assign(new Error('Reconnectez-vous à votre compte CDInnov pour continuer.'),{status:401});
}
async function portalReconnect(email,password){
  const previous=AUTH_USER,session=await budgetsSignIn(email,password,false);portalReconnecting=true;
  try{
  if(previous&&previous!==email){portalForgetUser();portalSuspendedUser=null;}
  budgetsSession=session;setSession(email);AUTH_USER=email;
  // Verify access using the new cookie before revealing any retained editor.
  const response=await fetch('/api/v1/session',{credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json'},signal:AbortSignal.timeout(30000)});
  const access=await portalAuthJSON(response);
  if(access.email!==email)throw new Error('La session utilisateur a changé.');
  if(previous!==email){
    if(!await cloudLoad({discard:true}))throw new Error('Impossible de charger vos données. Réessayez.');unlockApp(email);
  }else if(access.access&&JSON.stringify(CDIPlatform.accountAccess(access.access,!!access.admin))!==JSON.stringify(accountModules(email))){
    // Permissions changed while away: retire retained views before loading the authorised workspace.
    portalForgetUser();AUTH_USER=email;budgetsSession=session;setSession(email);
    if(!await cloudLoad({discard:true}))throw new Error('Impossible de charger vos données. Réessayez.');unlockApp(email);
  }
  portalSuspendedUser=null;return session;
  }finally{portalReconnecting=false;}
}
async function authLogout(){
  if(portalLogoutPending||billingLogoutPending)return;
  if(!billingLeave()||!marchesLeave()||!budgetsLeave())return;
  billingLockForLogout();
  try{
    if(cloudEnabled()&&portalClean&&JSON.stringify(state)!==portalClean&&!await cloudPush()){toast('Enregistrement impossible. Conservez vos modifications avant de vous déconnecter.');return;}
    portalLogoutPending=true;portalLoginAttempt++;portalEpoch++;toggleSidebar(false);window.CDISession.logout();
    if(portalSigninPending)await portalSigninPending.catch(()=>{});
    try{await fetch('/api/v1/session',{method:'DELETE',credentials:'same-origin',headers:{'X-CDInnov-Request':'1'},signal:AbortSignal.timeout(10000)});}catch{}
    const input=$('#authEmail');if(input)input.value='';authBack();
  }finally{portalLogoutPending=false;billingUnlockLogout();}
}
function load(){return freshState();}
function cloudURL(){return location.origin+'/api/v1/portal';}
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
  const session=await budgetsEnsureSession(),epoch=portalEpoch;
  const target=new URL(url,location.href);if(target.origin!==location.origin){if(target.origin!=='https://cet-data.pascalquilici2b.workers.dev')throw new Error('Adresse de service non autorisée.');target.host=location.host;target.protocol=location.protocol;}
  const headers=new Headers(options.headers);headers.delete('Authorization');if(!['GET','HEAD','OPTIONS'].includes((options.method||'GET').toUpperCase()))headers.set('X-CDInnov-Request','1');
  const response=await fetch(target.href,{...options,credentials:'same-origin',cache:'no-store',headers});
  if(epoch!==portalEpoch||getSession()?.budgets?.sessionId!==session.sessionId)throw new Error('La session a changé.');
  if(response.status===401)window.CDISession.expire({sessionId:session.sessionId,reason:'unauthorized'});
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
function filesBase(){return location.origin+'/files/';}
function isRemoteFileURL(src){try{const url=new URL(src,location.href);return [location.origin,'https://cet-data.pascalquilici2b.workers.dev'].includes(url.origin)&&url.pathname.startsWith('/files/');}catch{return false;}}
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
  let attempt=++portalLoginAttempt;email=normEmail(email);const session=await budgetsSignIn(email,password,false);
  if(attempt!==portalLoginAttempt)throw new Error('La demande de connexion a changé.');
  if(AUTH_USER&&AUTH_USER!==email){portalForgetUser();attempt=portalLoginAttempt;}
  budgetsSession=session;setSession(email);AUTH_USER=email;window.CDISession.accept(session);
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
    const response=await fetch(cloudURL()+'/enrol',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CDInnov-Request':'1'},body:JSON.stringify({email,token,name,salt,iter,hash})});
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
  if(fragment.has('invitation')){window.cdiInvitation={token:fragment.get('invitation'),email:normEmail(fragment.get('email'))};history.replaceState(null,'',location.pathname+location.search);_authEmailPending=window.cdiInvitation.email;clearSession();authShowStep('Create');return;}
  const stored=getSession(),session=stored?.budgets;
  if(!session){authBack();return;}
  AUTH_USER=session.email;
  if(!budgetsCurrentSession(session.email)){window.CDISession.expire({sessionId:session.sessionId,reason:'timeout'});authSetLoading(false);return;}
  try{await portalFetch('/api/v1/session');if(!await cloudLoad({discard:true}))throw new Error('Chargement impossible');window.CDISession.accept(session);unlockApp(session.email);}
  catch(error){if(error.status===401||window.CDISession.isExpired()){authSetLoading(false);return;}AUTH_USER=null;authBack();authMsg('Impossible de charger vos données. Réessayez.');}
}

function renderDashboard(){
  $('#pageTitle').textContent=VIEW_META.dashboard.title;$('#pageSub').textContent=VIEW_META.dashboard.sub;
  $('#topAction').style.display='none';document.querySelector('.year-pick').style.display='none';
  if(!AUTH_USER){$('#content').innerHTML='';return;}
  if($('#dashboardRoot'))return;
  const user=AUTH_USER,epoch=++dashboardEpoch;
  $('#content').innerHTML='<div id="dashboardRoot">'+loadingScreenMarkup('Chargement du tableau de bord…')+'</div>';
  const element=$('#dashboardRoot');
  if(!document.getElementById('dashboardStyle')){const css=document.createElement('link');css.id='dashboardStyle';css.rel='stylesheet';css.href='platform/dashboard.css?v=stamping-allocation-20261025';document.head.append(css);}
  dashboardModule ||= import('./platform/dashboard.js?v=stamping-allocation-20261025').catch(error=>{dashboardModule=null;throw error;});
  dashboardModule.then(module=>{
    if(epoch!==dashboardEpoch||AUTH_USER!==user||currentView!=='dashboard'||!element.isConnected)return;
    dashboardDispose=module.mountDashboard(element,{
      portrait:member=>agendaPortrait(member.email||salEmail(member.id)),
      load:async(week,signal)=>{
        const session=await budgetsEnsureSession();
        if(AUTH_USER!==user||signal.aborted)throw new Error('La session a changé.');
        const response=await portalFetch(budgetsApi().replace(/\/budgets\/?$/,'')+'/api/v1/dashboard?week='+encodeURIComponent(week),{headers:{},cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
        const result=await response.json();
        if(!response.ok)throw new Error(result.error||'Chargement impossible. Réessayez.');
        if(AUTH_USER!==user||signal.aborted||getSession()?.budgets?.sessionId!==session.sessionId)throw new Error('La session a changé.');
        return result;
      },
      open:async action=>{
        if(AUTH_USER!==user||currentView!=='dashboard')return;
        if(action.kind==='agenda'){
          Object.assign(agendaState,{panel:'calendar',person:action.memberId?salEmail(action.memberId)||action.memberId.replace(/^email:/,''):'',type:'',kind:'',day:action.date||ymd(new Date()),month:new Date((action.date||ymd(new Date())).slice(0,7)+'-01T12:00:00')});
          setView('agenda');return;
        }
        if(action.kind==='pending'){
          if(!await cloudLoad({readOnly:true}))throw new Error('Actualisation des congés impossible. Réessayez.');
          if(AUTH_USER!==user||currentView!=='dashboard')return;
          agendaState.leaves=null;agendaState.panel='calendar';currentYear=Number(action.date.slice(0,4));
          agendaState.day=action.date;agendaState.month=new Date(action.date.slice(0,7)+'-01T12:00:00');
          setView('agenda');
          if(isAdmin(user))await agendaOpenBalances();else agendaOpenLeavePeriod(action.id);
          return;
        }
        if(action.kind==='invoice'||action.kind==='expense'){
          if(!await cloudLoad({readOnly:true}))throw new Error('Actualisation du document impossible. Réessayez.');
          if(AUTH_USER!==user||currentView!=='dashboard')return;
          const item=(action.kind==='invoice'?factures():notesFrais()).find(x=>x.id===action.id);
          if(!item)throw new Error('Ce document a été supprimé. Actualisez le tableau de bord.');
          if(action.kind==='invoice'&&!canAccess('facturier'))throw new Error('Accès réservé à la direction.');
          if(action.kind==='expense'&&!isAdmin(user)&&item.matricule!==AUTH_USER_MAT[user])throw new Error('Cette note appartient à un autre collaborateur.');
        }
        if(action.kind==='invoice'||action.kind==='invoices'){
          if(!canAccess('facturier'))return;factTab='factures';factYear='all';factMonth='all';factQ='';setView('facturier','factures');if(action.id&&currentView==='facturier'&&billingMode==='legacy')openFacture(action.id);
        }else{nfFilter={sal:'',statut:'',q:''};setView('notesfrais');if(action.id)openNoteFrais(action.id);}
      }
    });
  }).catch(()=>{if(epoch===dashboardEpoch&&element.isConnected)element.innerHTML='<div class="card card-pad" role="alert">Le tableau de bord n’a pas pu être chargé. <button class="btn btn-ghost" onclick="dashboardForget();renderDashboard()">Réessayer</button></div>';});
}

function budgetsSyncClients(){
  if(!AUTH_USER)return Promise.resolve();
  if(budgetsClientsPending)return budgetsClientsPending;
  const user=AUTH_USER;
  budgetsClientsPending=(async()=>{
    const session=await budgetsEnsureSession();if(AUTH_USER!==user)throw new Error('La session a changé.');
    const names=[...budgetsPendingClientNames];
    const response=await portalFetch(budgetsApi()+'/clients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({names}),signal:AbortSignal.timeout(30000)});
    const result=await response.json();if(!response.ok){throw new Error(result.error||'Synchronisation impossible.');}
    if(getSession()?.budgets?.sessionId!==session.sessionId)throw new Error('La session a changé.');
    if(AUTH_USER===user){for(const name of names)budgetsPendingClientNames.delete(name);budgetsRefreshClients(result.clients);}
  })().finally(()=>{budgetsClientsPending=null;});
  return budgetsClientsPending;
}

async function agendaRequest(path='',options={}){
  const user=AUTH_USER,session=await budgetsEnsureSession();
  if(user!==AUTH_USER)throw new Error('La session a changé.');
  const response=await portalFetch(budgetsApi()+path,{...options,headers:{'Content-Type':'application/json',...options.headers},cache:'no-store',signal:AbortSignal.timeout(20000)});
  let data;try{data=await response.json();}catch{throw new Error('Le service Agenda est indisponible. Réessayez dans un instant.');}
  if(user!==AUTH_USER||getSession()?.budgets?.sessionId!==session.sessionId)throw new Error('La session a changé.');
  if(!response.ok){throw new Error(data.error||'Impossible de joindre l’agenda partagé.');}
  return data;
}
