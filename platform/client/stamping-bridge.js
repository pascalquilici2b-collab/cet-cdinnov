let stampingMounted=null,stampingEpoch=0;
function stampingForget(){stampingEpoch++;stampingMounted?.dispose();stampingMounted=null;}
function renderStamping(){
 if(stampingMounted&&document.getElementById('stampingRoot'))return;
 stampingForget();const epoch=++stampingEpoch,user=AUTH_USER;
 if(!user||!isAdmin(user)){$('#content').innerHTML='<div class="card card-pad">Le tamponnage est réservé à la direction.</div>';return;}
 if(!document.getElementById('stampingStyle')){const css=document.createElement('link');css.id='stampingStyle';css.rel='stylesheet';css.href='platform/stamping.css?v=stamping-payroll-20261025';document.head.append(css);}
 $('#content').innerHTML='<div id="stampingRoot">'+loadingMarkup('Chargement du tamponnage…')+'</div>';
 const element=document.getElementById('stampingRoot'),active=()=>epoch===stampingEpoch&&AUTH_USER===user&&currentView==='tamponnage'&&element.isConnected;
 import('./platform/stamping.js?v=stamping-payroll-20261025').then(module=>{if(active())stampingMounted=module.mountStamping(element,{baseUrl:budgetsApi().replace(/\/budgets\/?$/,''),getToken:async()=>(await budgetsEnsureSession()).token,isActive:active,creator:owner=>({name:agendaName(owner),photo:agendaPortrait(owner)})});}).catch(()=>{if(active())element.innerHTML='<div role="alert">Chargement impossible. Revenez dans le module pour réessayer.</div>';});
}
