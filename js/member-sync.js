/* Per-lesson revision sync; sessionStorage drafts are scoped to the verified user. */
(function(){'use strict';
const fields=r=>({completed:r?.completed===true,steps:r?.steps||[],notes:r?.notes||'',bookmarked:r?.bookmarked===true});
window.createAcademySync=function(account,api){
 const versions=new Map(account.lessons.map(r=>[r.lesson_key,r.version])),base=new Map(account.lessons.map(r=>[r.lesson_key,JSON.stringify(fields(r))]));
 const pending=new Map(),conflicts=new Map(),inflight=new Set();let timer=null,running=null,error=false,closed=false;
 const draftKey='truevoice:draft:'+account.user.id,$=s=>document.querySelector(s);
 function persist(){try{if(pending.size)sessionStorage.setItem(draftKey,JSON.stringify([...pending].map(([key,data])=>({key,data,version:versions.get(key)||0}))));else sessionStorage.removeItem(draftKey);}catch{error=true;}}
 function status(){const text=conflicts.size?'Є інша версія нотаток у хмарі. Обери, яку зберегти.':error?'Не синхронізовано. Експортуй чернетку або повтори спробу.':pending.size?'Синхронізація…':'Синхронізовано з кабінетом';
  for(const q of ['#sync-message','#notes-save-status'])if($(q))$(q).textContent=text;
  $('#sync-retry').hidden=!error;$('#conflict-local').hidden=!conflicts.size;$('#conflict-remote').hidden=!conflicts.size;$('#export-draft').hidden=!pending.size;
 }
 function snapshot(key){const s=window.atlasStorage.state;return{completed:s.done[key]?.lesson===true,steps:s.done[key]?.steps||[],notes:s.notes[key]||'',bookmarked:s.bookmarks.includes(key)};}
 function mark(){if(closed||!window.atlasStorage)return;
  for(const l of window.LESSONS_DATA){const key=`${l.w}-${l.n}`,v=snapshot(key);if(JSON.stringify(v)!==(base.get(key)||JSON.stringify(fields(null)))||inflight.has(key)||conflicts.has(key))pending.set(key,JSON.parse(JSON.stringify(v)));else pending.delete(key);}
  persist();status();clearTimeout(timer);timer=setTimeout(()=>flush(),450);
 }
 async function flush(){clearTimeout(timer);if(running)return running;if(closed)return false;
  running=(async()=>{error=false;
   for(const [key,data]of [...pending]){if(closed)break;if(conflicts.has(key))continue;inflight.add(key);
    try{const row=await api('lesson',{lesson:key,version:versions.get(key)||0,data});if(closed)break;versions.set(key,row.version);base.set(key,JSON.stringify(fields(row)));if(JSON.stringify(pending.get(key))===JSON.stringify(data))pending.delete(key);}
    catch(e){if(e.status===409)conflicts.set(key,e.data.current);else{error=true;break;}}finally{inflight.delete(key);}
   }return !pending.size;
  })().finally(()=>{running=null;persist();status();if(pending.size&&!error&&!conflicts.size&&!closed)timer=setTimeout(()=>flush(),100);});return running;
 }
 function install(key,r){const s=window.atlasStorage.state;s.done[key]={lesson:r.completed,steps:r.steps};s.notes[key]=r.notes;s.bookmarks=s.bookmarks.filter(k=>k!==key);if(r.bookmarked)s.bookmarks.push(key);}
 $('#sync-retry').onclick=()=>flush();
 $('#conflict-local').onclick=()=>{const [key,row]=conflicts.entries().next().value||[];if(!key||!confirm('Замінити хмарну версію цього уроку твоєю чернеткою? Спершу можна експортувати обидві версії.'))return;versions.set(key,row.version);conflicts.delete(key);flush();};
 $('#conflict-remote').onclick=()=>{const [key,row]=conflicts.entries().next().value||[];if(!key||!confirm('Використати хмарну версію замість твоєї чернетки цього уроку?'))return;versions.set(key,row.version);base.set(key,JSON.stringify(fields(row)));install(key,row);pending.delete(key);conflicts.delete(key);persist();status();window.atlasApp?.navigate(window.atlasStorage.state.idx);};
 $('#export-draft').onclick=()=>{const u=URL.createObjectURL(new Blob([JSON.stringify({drafts:[...pending],cloudVersions:[...conflicts]},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='truevoice-drafts.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
 window.addEventListener('beforeunload',e=>{if(pending.size){persist();e.preventDefault();e.returnValue='';}});window.addEventListener('online',()=>flush());
 return{mark,flush,status,pending,conflicts,stop(){closed=true;clearTimeout(timer);},restore(){let draft=[];try{draft=JSON.parse(sessionStorage.getItem(draftKey)||'[]');}catch{}
  if(!Array.isArray(draft)||!draft.length||!confirm('Відновити незбережені чернетки твого акаунту з цієї вкладки?'))return;
  for(const r of draft){if(!/^[1-4]-[1-7]$/.test(r.key)||typeof r.data?.notes!=='string'||r.data.notes.length>30000||!Array.isArray(r.data.steps))continue;const l=window.LESSONS_DATA.find(x=>`${x.w}-${x.n}`===r.key);if(!l||r.data.steps.some(n=>!Number.isInteger(n)||n<0||n>=l.practice.length))continue;
   install(r.key,fields(r.data));pending.set(r.key,fields(r.data));if(r.version!==(versions.get(r.key)||0))conflicts.set(r.key,account.lessons.find(x=>x.lesson_key===r.key)||{...fields(null),version:0});}
  mark();
 }};
};})();
