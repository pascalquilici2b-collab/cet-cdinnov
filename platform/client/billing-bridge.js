/* Modern billing runs inside the authenticated CDInnov shell. */
let billingMode='modern',billingModulePromise=null,billingMounted=null,billingTransport=null,billingEpoch=0,billingLogoutPending=false;
function billingLockForLogout(){billingLogoutPending=true;$('#content').inert=true;}
function billingUnlockLogout(){billingLogoutPending=false;$('#content').inert=false;}
function billingModule(){
  if(!$('#billingStyle')){const link=document.createElement('link');link.id='billingStyle';link.rel='stylesheet';link.href='platform/billing.css?v=billing1';document.head.append(link);}
  return billingModulePromise ||= import('./platform/billing.js?v=billing1').catch(error=>{billingModulePromise=null;throw error;});
}
function billingLeave(){return billingMounted?.canLeave?.()!==false;}
function billingForget(){
  billingEpoch++;billingTransport?.dispose();billingTransport=null;
  billingMounted?.dispose();billingMounted=null;$('#billingRoot')?.remove();
}
function renderBillingWorkspace(){
  if(!AUTH_USER||currentView!=='facturier'||billingMode!=='modern')return;
  financeForget();
  if(!isAdmin(AUTH_USER)){billingForget();$('#content').innerHTML='<div class="card card-pad" role="alert">La facturation est réservée à la direction.</div>';return;}
  if(billingMounted&&$('#billingRoot'))return;
  const epoch=++billingEpoch,user=AUTH_USER;
  $('#content').innerHTML='<div id="billingRoot"><div class="card card-pad" role="status">Chargement de la facturation…</div></div>';
  const element=$('#billingRoot');
  const active=()=>epoch===billingEpoch&&AUTH_USER===user&&currentView==='facturier'&&billingMode==='modern'&&element.isConnected;
  billingModule().then(module=>{
    if(!active())return;
    billingTransport=module.createBillingTransport({baseUrl:budgetsApi().replace(/\/budgets\/?$/,''),getToken:async()=>(await budgetsEnsureSession()).token,isActive:active});
    billingMounted=module.mountBilling(element,{transport:billingTransport,onLegacy:section=>{
      if(active())setBillingSection(({invoices:'factures',codes:'codes',markets:'marches'})[section]);
    }});
  }).catch(()=>{
    if(!active())return;
    element.innerHTML='<div class="card card-pad" role="alert">Le chargement de la facturation a échoué. <button type="button" class="btn btn-ghost" onclick="billingForget();render()">Réessayer</button></div>';
  });
}
