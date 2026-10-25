// Embedded conversions follow the portal's theme, including changes while open.
(()=>{
 const media=matchMedia('(prefers-color-scheme: dark)');
 const apply=()=>{let theme=media.matches?'dark':'light';try{if(parent!==window)theme=parent.document.documentElement.dataset.theme||theme;}catch{}document.documentElement.dataset.theme=theme;};
 apply();media.addEventListener('change',apply);
 try{if(parent!==window)new MutationObserver(apply).observe(parent.document.documentElement,{attributes:true,attributeFilter:['data-theme']});}catch{}
})();
