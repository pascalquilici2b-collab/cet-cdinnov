function loadingMarkup(label='Chargement…',compact=false){
  return '<div class="cdi-loading'+(compact?' cdi-loading--compact':'')+'" role="status"><span class="cdi-bolt" aria-hidden="true"></span><span class="cdi-loading-label">'+esc(label)+'</span></div>';
}
function authSetLoading(loading){
  const gate=document.getElementById('authGate');
  if(!gate)return;
  gate.dataset.loading=String(loading);
  gate.setAttribute('aria-busy',String(loading));
}
