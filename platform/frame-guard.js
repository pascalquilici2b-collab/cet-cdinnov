// Same-origin modules may be embedded by the portal. An unrelated parent must
// never display authenticated controls. This is a fallback for static hosting;
// HTTP frame-ancestors remains the preferred, additional boundary.
(()=>{
 let allowed=window.top===window.self;
 if(!allowed){try{allowed=window.top.location.origin===window.location.origin;}catch{allowed=false;}}
 if(allowed){document.getElementById('cdi-frame-guard')?.remove();return;}
 window.stop();
 const body=document.createElement('body'),link=document.createElement('a');
 link.href=window.location.href;link.target='_blank';link.rel='noopener noreferrer';
 link.textContent='Ouvrir CDInnov';body.append(link);
 document.documentElement.replaceChildren(body);
})();
