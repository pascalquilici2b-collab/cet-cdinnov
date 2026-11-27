/* The converter shares the portal's HttpOnly session; it never receives an
   independent bearer credential or a collaborator's password. */
function facturxOnline(){return true;}
function facturxAuthSession(){return budgetsCurrentSession();}
function facturxForgetAuth(){
  _facturxAuth=null;_facturxWarmLogin=null;_facturxLoginWait=null;
  try{sessionStorage.removeItem(FACTURX_AUTH_STORAGE);}catch{}
  document.getElementById('facturxLoginDialog')?.close();
}
async function facturxSignIn(){return budgetsEnsureSession();}
function facturxWarmLogin(){facturxForgetAuth();}
async function facturxEnsureAuth(){return budgetsEnsureSession();}
async function facturxApi(path,options={}){
  if(!/^\/api\//.test(path))throw new Error('Action Factur-X indisponible.');
  const session=await budgetsEnsureSession(),headers=new Headers(options.headers),wakeSignal=options.signal||AbortSignal.timeout(75000);
  try{
    const {ensureDocumentEngine}=await import('/platform/document-engine-wake.js');
    await ensureDocumentEngine({baseUrl:'',signal:wakeSignal,sessionId:session.sessionId});
  }catch(error){
    if(error?.status===401){window.CDISession.expire({sessionId:session.sessionId,reason:'unauthorized'});throw new Error('Reconnectez-vous pour poursuivre la conversion. Votre saisie est conservée.');}
    throw error;
  }
  if(AUTH_USER!==session.email||budgetsCurrentSession()?.sessionId!==session.sessionId)throw new Error('La session utilisateur a changé.');
  const signal=options.signal||AbortSignal.timeout(240000);
  headers.delete('Authorization');headers.set('X-CDInnov-Request','1');
  const response=await fetch('/api/v1/facturx/'+path.slice(5),{...options,headers,credentials:'same-origin',cache:'no-store',signal});
  if(response.status===401){window.CDISession.expire({sessionId:session.sessionId,reason:'unauthorized'});throw new Error('Reconnectez-vous pour poursuivre la conversion. Votre saisie est conservée.');}
  if(AUTH_USER!==session.email)throw new Error('La session utilisateur a changé.');
  return response;
}
