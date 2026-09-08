/* Authorized account state. Only visual preferences live in localStorage; no automatic v3 import. */
const isRecord=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const lessonKeyOK=k=>/^[1-4]-[1-7]$/.test(k);
window.atlasSeconds=value=>{const s=String(value||'').replace(',','.'),m=s.match(/(\d+(?:\.\d+)?)\s*хв/i),n=s.match(/(\d+(?:\.\d+)?)\s*(?:сек|с(?:\s|$))/i);return !m&&!n?300:Math.max(1,Math.round((m?Number(m[1])*60:0)+(n?Number(n[1]):0)));};
class AtlasStorageManager{
 constructor(){this.state=this.defaults();this.available=true;this.load();}
 defaults(){return{idx:0,mode:'student',theme:'default',showSpine:true,showStarfield:true,soundFX:true,volume:.6,done:{},notes:{},bookmarks:[],lastVisit:new Date().toISOString(),streak:1};}
 normalize(input,strict=false){
  if(!isRecord(input)||strict&&(!isRecord(input.done)||!isRecord(input.notes)||!Array.isArray(input.bookmarks)))throw Error('Некоректна резервна копія.');
  const out=this.defaults();
  if(Number.isInteger(input.idx))out.idx=Math.min(27,Math.max(0,input.idx));
  out.mode=window.ATLAS_MEMBER?.role==='admin'&&input.mode==='internal'?'internal':'student';
  if(['default','crimson','gold','sage'].includes(input.theme))out.theme=input.theme;
  for(const k of ['showSpine','showStarfield','soundFX'])if(typeof input[k]==='boolean')out[k]=input[k];
  if(Number.isFinite(input.volume))out.volume=Math.max(0,Math.min(1,input.volume));
  if(isRecord(input.done))for(const [key,rec] of Object.entries(input.done)){
   const lesson=(window.LESSONS_DATA||[]).find(l=>this.getLessonKey(l)===key);
   if(!lesson||!isRecord(rec)||!Array.isArray(rec.steps)){if(strict)throw Error('Некоректний прогрес.');continue;}
   out.done[key]={lesson:rec.lesson===true,steps:rec.lesson===true?lesson.practice.map((_,i)=>i):[...new Set(rec.steps.filter(i=>Number.isInteger(i)&&i>=0&&i<lesson.practice.length))].sort((a,b)=>a-b)};
  }
  if(isRecord(input.notes))for(const[key,text]of Object.entries(input.notes)){if(lessonKeyOK(key)&&typeof text==='string'&&text.length<=30000)out.notes[key]=text;else if(strict)throw Error('Некоректні нотатки або більше 30 000 символів.');}
  if(Array.isArray(input.bookmarks))out.bookmarks=[...new Set(input.bookmarks.filter(lessonKeyOK))];return out;
 }
 load(){this.state=this.normalize({...this.defaults(),...window.ATLAS_SEED});this.state.mode='student';try{const settings=JSON.parse(localStorage.getItem('truevoice:settings:'+window.ATLAS_MEMBER.id)||'{}');for(const k of ['theme','volume','showSpine','showStarfield','soundFX'])if(settings[k]!==undefined)this.state[k]=settings[k];this.state=this.normalize(this.state);}catch{}}
 save(){try{const prefs=Object.fromEntries(['theme','volume','showSpine','showStarfield','soundFX'].map(k=>[k,this.state[k]]));localStorage.setItem('truevoice:settings:'+window.ATLAS_MEMBER.id,JSON.stringify(prefs));}catch{}
  window.academySync?.mark();return true;
 }
 getLessonKey(l){return `${l.w}-${l.n}`;}
 getLessonRecord(l){const k=this.getLessonKey(l);return this.state.done[k]||(this.state.done[k]={lesson:false,steps:[]});}
 isLessonDone(l){return this.getLessonRecord(l).lesson;}
 toggleLessonDone(l){const r=this.getLessonRecord(l);r.lesson=!r.lesson;if(r.lesson)r.steps=l.practice.map((_,i)=>i);this.save();return r.lesson;}
 isStepDone(l,i){return this.getLessonRecord(l).steps.includes(i);}
 setStepDone(l,i,done=true){if(!Number.isInteger(i)||!l.practice[i])return false;const r=this.getLessonRecord(l),set=new Set(r.steps);done?set.add(i):set.delete(i);r.steps=[...set].sort((a,b)=>a-b);r.lesson=r.steps.length===l.practice.length;this.save();return done;}
 toggleStepDone(l,i){return this.setStepDone(l,i,!this.isStepDone(l,i));}
 getLessonNotes(l){return this.state.notes[this.getLessonKey(l)]||'';}
 saveLessonNotes(l,t){this.state.notes[this.getLessonKey(l)]=String(t).slice(0,30000);return this.save();}
 isBookmarked(l){return this.state.bookmarks.includes(this.getLessonKey(l));}
 toggleBookmark(l){const k=this.getLessonKey(l),i=this.state.bookmarks.indexOf(k);i<0?this.state.bookmarks.push(k):this.state.bookmarks.splice(i,1);this.save();return this.isBookmarked(l);}
 getWeekCompletedCount(w,ls){return ls.filter(l=>l.w===w&&this.isLessonDone(l)).length;}
 getTotalCompletedCount(ls){return ls.filter(l=>this.isLessonDone(l)).length;}
 getTotalMinutesPracticed(ls){return Math.round(ls.reduce((n,l)=>n+l.practice.reduce((m,p,i)=>m+(this.isStepDone(l,i)?window.atlasSeconds(p.d):0),0),0)/60);}
 exportDataJSON(){const u=URL.createObjectURL(new Blob([JSON.stringify(this.state,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='truevoice-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 importDataJSON(text){try{const next=this.normalize(JSON.parse(text),true);if(!confirm('Імпортувати ці нотатки та прогрес у поточний акаунт? Наявні дані буде замінено.'))return false;this.state=next;this.state.mode='student';return this.save();}catch{return false;}}
 resetProgress(){this.state.done={};this.state.notes={};this.state.bookmarks=[];return this.save();}
}
window.AtlasStorageManager=AtlasStorageManager;window.atlasStorage=new AtlasStorageManager();
