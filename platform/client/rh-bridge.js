let rhMounted=null,rhEpoch=0;
function rhForget(){rhEpoch++;rhMounted?.dispose();rhMounted=null;}
function rhLeave(){return rhMounted?.canLeave?.()!==false;}
function renderRh(){
 if(rhMounted&&document.getElementById('rhRoot'))return;
 rhForget();const epoch=++rhEpoch,user=AUTH_USER;
 if(!user||!canAccess('facturier')){$('#content').innerHTML='<div class="card card-pad">Accès aux documents RH requis.</div>';return;}
 if(!document.getElementById('rhStyle')){const css=document.createElement('link');css.id='rhStyle';css.rel='stylesheet';css.href='platform/rh.css?v=rh-20261105';document.head.append(css);}
 $('#content').innerHTML='<div id="rhRoot">'+loadingMarkup('Chargement des documents RH…')+'</div>';
 const element=document.getElementById('rhRoot'),active=()=>epoch===rhEpoch&&AUTH_USER===user&&currentView==='rh'&&element.isConnected;
 import('./platform/rh.js?v=rh-20261105').then(module=>{if(active())rhMounted=module.mountRh(element,{baseUrl:budgetsApi().replace(/\/budgets\/?$/,''),getSession:async()=>(await budgetsEnsureSession()).sessionId,isActive:active,onStamping:()=>setView('tamponnage'),onStampBatch:id=>openRhStampingBatch(id)});}).catch(()=>{if(active())element.innerHTML='<div role="alert">Chargement impossible. Revenez dans le module pour réessayer.</div>';});
}
