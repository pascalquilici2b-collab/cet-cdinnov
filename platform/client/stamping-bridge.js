let stampingMounted=null,stampingEpoch=0,stampingInitialBatchId='';
function openRhStampingBatch(id){
 if(typeof id!=='string'||!/^[-a-f0-9]{36}$/i.test(id))return;
 stampingInitialBatchId=id;stampingForget();setView('tamponnage');
}
window.openRhStampingBatch=openRhStampingBatch;
function stampingForget(){stampingEpoch++;stampingMounted?.dispose();stampingMounted=null;}
function renderStamping(){
 if(stampingMounted&&document.getElementById('stampingRoot'))return;
 stampingForget();const epoch=++stampingEpoch,user=AUTH_USER;
 if(!user||!canAccess('tamponnage')){$('#content').innerHTML='<div class="card card-pad">Le tamponnage est réservé à la direction.</div>';return;}
 if(!document.getElementById('stampingStyle')){const css=document.createElement('link');css.id='stampingStyle';css.rel='stylesheet';css.href='platform/stamping.css?v=rh-documents-20261105';document.head.append(css);}
 $('#content').innerHTML='<div id="stampingRoot">'+loadingMarkup('Chargement du tamponnage…')+'</div>';
 const element=document.getElementById('stampingRoot'),active=()=>epoch===stampingEpoch&&AUTH_USER===user&&currentView==='tamponnage'&&element.isConnected;
 import('./platform/stamping.js?v=rh-documents-20261105').then(module=>{if(active()){const initialBatchId=stampingInitialBatchId;stampingInitialBatchId='';stampingMounted=module.mountStamping(element,{baseUrl:budgetsApi().replace(/\/budgets\/?$/,''),getToken:async()=>(await budgetsEnsureSession()).token,isActive:active,initialBatchId,creator:owner=>({name:agendaName(owner),photo:agendaPortrait(owner)})});}}).catch(()=>{if(active())element.innerHTML='<div role="alert">Chargement impossible. Revenez dans le module pour réessayer.</div>';});
}
