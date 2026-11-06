let rhMounted=null,rhEpoch=0,rhInitialDocumentId='';
function openRhPaymentDocument(id){
 if(typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,128}$/.test(id))return;
 if(currentView==='rh'){if(!rhLeave())return;rhForget();rhInitialDocumentId=id;renderRh();return;}
 rhInitialDocumentId=id;setView('rh');if(currentView!=='rh')rhInitialDocumentId='';
}
function rhForget(){rhInitialDocumentId='';rhEpoch++;rhMounted?.dispose();rhMounted=null;}
function rhLeave(){return rhMounted?.canLeave?.()!==false;}
function renderRh(){
 if(rhMounted&&document.getElementById('rhRoot'))return;
 const initialDocumentId=rhInitialDocumentId;rhForget();const epoch=++rhEpoch,user=AUTH_USER;
 if(!user||!canAccess('facturier')){$('#content').innerHTML='<div class="card card-pad">Accès aux documents RH requis.</div>';return;}
 if(!document.getElementById('rhStyle')){const css=document.createElement('link');css.id='rhStyle';css.rel='stylesheet';css.href='platform/rh.css?v=rh-workspace-20261106';document.head.append(css);}
 $('#content').innerHTML='<div id="rhRoot">'+loadingMarkup('Chargement des documents RH…')+'</div>';
 const element=document.getElementById('rhRoot'),active=()=>epoch===rhEpoch&&AUTH_USER===user&&currentView==='rh'&&element.isConnected;
 import('./platform/rh.js?v=rh-workspace-20261106').then(module=>{if(active()){rhMounted=module.mountRh(element,{initialDocumentId,baseUrl:budgetsApi().replace(/\/budgets\/?$/,''),getSession:async()=>(await budgetsEnsureSession()).sessionId,isActive:active,onStamping:()=>setView('tamponnage'),onStampBatch:id=>openRhStampingBatch(id)});}}).catch(()=>{if(active())element.innerHTML='<div role="alert">Chargement impossible. Revenez dans le module pour réessayer.</div>';});
}
