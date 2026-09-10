/* Preview-only demo transport. Server remains the environment gate. */
(function(){'use strict';
if(new URLSearchParams(location.search).get('demo')!=='1')return;
const nativeFetch=window.fetch.bind(window);
window.fetch=(input,init)=>{
 if(typeof input==='string'){
  try{const u=new URL(input,location.origin);if(u.origin===location.origin&&(u.pathname==='/api/academy'||u.pathname==='/api/payments')){u.searchParams.set('demo','1');input=u.pathname+u.search+u.hash;}}catch{}
 }
 return nativeFetch(input,init);
};
document.documentElement.dataset.demo='true';
const badge=document.createElement('div');badge.textContent='PREVIEW · DEMO MODE';badge.setAttribute('aria-label','Preview demo mode');Object.assign(badge.style,{position:'fixed',right:'14px',bottom:'14px',zIndex:'99999',padding:'8px 11px',border:'1px solid rgba(230,0,18,.55)',borderRadius:'999px',background:'rgba(6,6,7,.88)',backdropFilter:'blur(12px)',color:'#ff5964',font:'600 10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace',letterSpacing:'.12em',boxShadow:'0 8px 28px rgba(0,0,0,.35)'});document.body.appendChild(badge);
})();
