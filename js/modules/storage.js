/* TrueVoice Atlas: compatible, validated local progress. */
const STORAGE_KEY='truevoice:atlas:v2';
const isRecord=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const lessonKeyOK=k=>/^[1-4]-[1-7]$/.test(k);
const dayNumber=value=>{const d=new Date(value);return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000;};
window.atlasSeconds=value=>{
 const s=String(value||'').replace(',','.');const min=s.match(/(\d+(?:\.\d+)?)\s*хв/i),sec=s.match(/(\d+(?:\.\d+)?)\s*(?:сек|с(?:\s|$))/i);
 if(!min&&!sec)return 300;
 return Math.max(1,Math.round((min?Number(min[1])*60:0)+(sec?Number(sec[1]):0)));
};
class AtlasStorageManager{
 constructor(){this.state=this.defaults();this.available=true;this.load();}
 defaults(){return{idx:0,mode:'student',theme:'default',showSpine:true,showStarfield:true,soundFX:true,volume:.6,done:{},notes:{},bookmarks:[],lastVisit:new Date().toISOString(),streak:1};}
 normalize(input,strict=false){
  if(!isRecord(input))throw new Error('Очікується об’єкт резервної копії.');
  if(strict&&(!isRecord(input.done)||!isRecord(input.notes)||!Array.isArray(input.bookmarks)))throw new Error('Це не резервна копія атласу.');
  const out=this.defaults();
  if(Number.isInteger(input.idx))out.idx=Math.max(0,Math.min(27,input.idx));
  if(['student','internal'].includes(input.mode))out.mode=input.mode;
  if(['default','crimson','gold','sage'].includes(input.theme))out.theme=input.theme;
  for(const k of ['showSpine','showStarfield','soundFX'])if(typeof input[k]==='boolean')out[k]=input[k];
  if(Number.isFinite(input.volume))out.volume=Math.max(0,Math.min(1,input.volume));
  if(Number.isInteger(input.streak)&&input.streak>0)out.streak=Math.min(input.streak,100000);
  if(typeof input.lastVisit==='string'&&Number.isFinite(Date.parse(input.lastVisit)))out.lastVisit=input.lastVisit;
  if(isRecord(input.done))for(const[key,rec]of Object.entries(input.done)){
   if(!lessonKeyOK(key)||!isRecord(rec)||!Array.isArray(rec.steps)){if(strict)throw new Error('Пошкоджений запис прогресу.');continue;}
   const lesson=(window.LESSONS_DATA||[]).find(l=>this.getLessonKey(l)===key),max=lesson?lesson.practice.length:100;
   out.done[key]={lesson:rec.lesson===true,steps:[...new Set(rec.steps.filter(n=>Number.isInteger(n)&&n>=0&&n<max))]};
  }
  if(isRecord(input.notes))for(const[key,value]of Object.entries(input.notes)){if(lessonKeyOK(key)&&typeof value==='string')out.notes[key]=value.slice(0,100000);else if(strict)throw new Error('Пошкоджені нотатки.');}
  if(Array.isArray(input.bookmarks))out.bookmarks=[...new Set(input.bookmarks.filter(k=>typeof k==='string'&&lessonKeyOK(k)))];
  return out;
 }
 load(){try{const raw=localStorage.getItem(STORAGE_KEY);if(raw)this.state=this.normalize(JSON.parse(raw));this.calculateStreak();}catch(e){this.available=false;console.warn('Atlas: local state unavailable',e);}}
 save(){try{this.state.lastVisit=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(this.state));this.available=true;return true;}catch(e){this.available=false;console.warn('Atlas: state not persisted',e);return false;}}
 getLessonKey(l){return `${l.w}-${l.n}`;}
 getLessonRecord(l){const k=this.getLessonKey(l);return this.state.done[k]||(this.state.done[k]={lesson:false,steps:[]});}
 isLessonDone(l){return this.getLessonRecord(l).lesson;}
 toggleLessonDone(l){const r=this.getLessonRecord(l);r.lesson=!r.lesson;if(r.lesson)r.steps=l.practice.map((_,i)=>i);this.save();return r.lesson;}
 isStepDone(l,i){return this.getLessonRecord(l).steps.includes(i);}
 setStepDone(l,i,done=true){if(!Number.isInteger(i)||!l.practice[i])return false;const r=this.getLessonRecord(l),set=new Set(r.steps);done?set.add(i):set.delete(i);r.steps=[...set].sort((a,b)=>a-b);r.lesson=r.steps.length===l.practice.length;this.save();return done;}
 toggleStepDone(l,i){return this.setStepDone(l,i,!this.isStepDone(l,i));}
 getLessonNotes(l){return this.state.notes[this.getLessonKey(l)]||'';}
 saveLessonNotes(l,t){this.state.notes[this.getLessonKey(l)]=String(t).slice(0,100000);return this.save();}
 isBookmarked(l){return this.state.bookmarks.includes(this.getLessonKey(l));}
 toggleBookmark(l){const k=this.getLessonKey(l),i=this.state.bookmarks.indexOf(k);i<0?this.state.bookmarks.push(k):this.state.bookmarks.splice(i,1);this.save();return this.isBookmarked(l);}
 getWeekCompletedCount(w,ls){return ls.filter(l=>l.w===w&&this.isLessonDone(l)).length;}
 getTotalCompletedCount(ls){return ls.filter(l=>this.isLessonDone(l)).length;}
 getTotalMinutesPracticed(ls){return Math.round(ls.reduce((n,l)=>n+l.practice.reduce((m,p,i)=>m+(this.isStepDone(l,i)?window.atlasSeconds(p.d):0),0),0)/60);}
 calculateStreak(){const diff=dayNumber(Date.now())-dayNumber(this.state.lastVisit);if(diff===1)this.state.streak++;else if(diff>1||diff<0)this.state.streak=1;this.save();}
 exportDataJSON(){const url=URL.createObjectURL(new Blob([JSON.stringify(this.state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`truevoice-atlas-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 importDataJSON(text){const previous=this.state;try{const next=this.normalize(JSON.parse(text),true);this.state=next;if(!this.save()){this.state=previous;return false;}return true;}catch(e){this.state=previous;return false;}}
 resetProgress(){this.state.done={};this.state.notes={};this.state.bookmarks=[];this.state.streak=1;return this.save();}
}
window.AtlasStorageManager=AtlasStorageManager;window.atlasStorage=new AtlasStorageManager();
