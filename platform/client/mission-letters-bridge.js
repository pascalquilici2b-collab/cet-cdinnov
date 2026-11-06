let missionLettersMounted=null,missionLettersEpoch=0;
function missionLettersForget(){missionLettersEpoch++;missionLettersMounted?.dispose();missionLettersMounted=null;}
function missionLettersLeave(){return missionLettersMounted?.canLeave?.()!==false;}
function renderMissionLetters(){
 if(missionLettersMounted&&document.getElementById('missionLettersRoot'))return;
 missionLettersForget();const epoch=++missionLettersEpoch,user=AUTH_USER;
 if(!user||!canAccess('missions')){$('#content').innerHTML='<div class="card card-pad" role="alert">Accès aux lettres de mission requis.</div>';return;}
 if(!document.getElementById('missionLettersStyle')){const css=document.createElement('link');css.id='missionLettersStyle';css.rel='stylesheet';css.href='platform/mission-letters.css?v=rh-workspace-20261106';document.head.append(css);}
 $('#content').innerHTML='<div id="missionLettersRoot">'+loadingMarkup('Chargement des lettres de mission…')+'</div>';
 const element=document.getElementById('missionLettersRoot'),active=()=>epoch===missionLettersEpoch&&AUTH_USER===user&&currentView==='missions'&&element.isConnected;
 import('./platform/mission-letters.js?v=rh-workspace-20261106').then(module=>{if(active())missionLettersMounted=module.mountMissionLetters(element,{baseUrl:budgetsApi().replace(/\/budgets\/?$/,''),getSession:async()=>(await budgetsEnsureSession()).sessionId,isActive:active,onPaymentDocument:id=>openRhPaymentDocument(id)});}).catch(()=>{if(active())element.innerHTML='<div role="alert">Chargement impossible. Revenez dans le module pour réessayer.</div>';});
}
