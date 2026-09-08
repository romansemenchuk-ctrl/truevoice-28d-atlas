/* TrueVoice Atlas v3: progressive enhancement, local-only personal data. */
(async function(){
 'use strict';
 const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const storage=window.atlasStorage,audio=window.audioEngine,ambient=window.ambientFX,pacer=window.breathPacer,focus=window.focusMode,recorder=window.voiceRecorder;
 const lessons=window.LESSONS_DATA,weeks=window.WEEKS_DATA,schemas=window.SCHEMAS_REGISTRY;
 const clocks=new Map();let viewer=null,AnatomyViewer=null,query='',chip=null,voiceLesson=null,voiceEpoch=0,urls=[],returnFocus=null;
 const current=()=>lessons[storage.state.idx]||lessons[0];
 const key=(l,i)=>`${storage.getLessonKey(l)}:${i}`;
 const time=n=>`${Math.floor(Math.max(0,Math.ceil(n))/60)}:${(Math.max(0,Math.ceil(n))%60).toString().padStart(2,'0')}`;
 const minutes=l=>Math.round(l.practice.reduce((n,p)=>n+window.atlasSeconds(p.d),0)/60);
 const text=(q,t)=>{const e=$(q);if(e)e.textContent=t;};
 const on=(q,fn)=>{const e=$(q);if(e)e.onclick=fn;};
 const link=document.createElement('link');link.rel='stylesheet';link.href='css/atlas-upgrade.css?v=3.0.0';document.head.append(link);
 try{({AnatomyViewer}=await import('./modules/anatomy-viewer.js?v=3.0.0'));}catch(e){console.error('Atlas viewer unavailable',e);}
 if(document.readyState==='loading')await new Promise(r=>document.addEventListener('DOMContentLoaded',r,{once:true}));
 function toast(message){const e=document.createElement('div');e.className='toast';e.textContent=message;$('#toast-container')?.append(e);setTimeout(()=>e.remove(),3600);}
 function refreshHUD(){const n=storage.getTotalCompletedCount(lessons);text('#hud-done-val',`${n} / ${lessons.length}`);text('#hud-pct-val',`${Math.round(n/lessons.length*100)}%`);text('#hud-mins-val',`${storage.getTotalMinutesPracticed(lessons)} хв`);text('#hud-streak-val',`${storage.state.streak} дн`);}
 function renderNavigation(){
  const l=current();
  $('#weeks').innerHTML=weeks.map(w=>{const n=storage.getWeekCompletedCount(w.id,lessons),selected=w.id===l.w;return `<button class="week-tab" role="tab" data-w="${w.id}" id="tab-w${w.id}" aria-selected="${selected}" aria-controls="pane" tabindex="${selected?0:-1}"><div class="week-head"><span class="week-n">ТИЖДЕНЬ ${w.id}</span><span class="week-count mono">${n}/7 ✓</span></div><span class="week-t">${esc(w.title)}</span><span class="week-bar"><i style="width:${n/7*100}%"></i></span></button>`;}).join('');
  const w=weeks.find(w=>w.id===l.w);
  $('#rail').innerHTML=`<div class="rail-head"><div class="rail-title">${esc(w.title)}</div><div class="rail-subtitle">${esc(w.sub)}</div></div>`+lessons.filter(x=>x.w===l.w).map(x=>{const i=lessons.indexOf(x),done=storage.isLessonDone(x);return `<button class="lesson-btn${done?' done':''}" data-idx="${i}" aria-current="${i===storage.state.idx?'page':'false'}"><span class="lesson-num">${x.w}.${x.n}</span><span class="lesson-content"><span class="lesson-t">${esc(x.title)}</span><span class="lesson-dur mono">${minutes(x)} хв ${storage.isBookmarked(x)?'★':''}</span></span><span class="tick">${done?'✓':''}</span></button>`;}).join('');
  $('#mobile-pick').innerHTML=lessons.map((x,i)=>`<option value="${i}" ${i===storage.state.idx?'selected':''}>${x.w}.${x.n} · ${esc(x.title)} ${storage.isLessonDone(x)?'✓':''}</option>`).join('');
 }
 function refreshProgress(){
  refreshHUD();renderNavigation();const l=current(),r=storage.getLessonRecord(l);
  const b=$('#btn-mark-done');if(b){b.textContent=r.lesson?'✓ Урок пройдено':'Позначити пройденим';b.setAttribute('aria-pressed',String(r.lesson));}
  const mark=$('#btn-bookmark');if(mark){mark.textContent=storage.isBookmarked(l)?'★ В обраному':'☆ Зберегти';mark.setAttribute('aria-pressed',String(storage.isBookmarked(l)));}
  $$('[data-step]').forEach(b=>{const i=Number(b.dataset.step),done=r.steps.includes(i);b.textContent=done?'✓':'○';b.setAttribute('aria-pressed',String(done));b.setAttribute('aria-label',`${done?'Зняти відмітку':'Позначити виконаним'}: ${l.practice[i].n}`);b.closest('.step-card').classList.toggle('done',done);});
 }
 function timerUI(l,i){
  if(storage.getLessonKey(l)!==storage.getLessonKey(current()))return;
  const c=clocks.get(key(l,i)),e=$(`#timer-display-${i}`),b=$(`[data-timer-toggle="${i}"]`);if(!e||!b)return;
  e.textContent=c?.finished?'Готово ✓':time(c?c.value():window.atlasSeconds(l.practice[i].d));e.classList.toggle('running',!!c?.running);
  b.textContent=c?.running?'Ⅱ Пауза':c?.finished?'↻ Повторити':c&&c.remaining<c.total?'▷ Продовжити':'▷ Старт таймера';b.setAttribute('aria-pressed',String(!!c?.running));
 }
 function toggleTimer(l,i){
  let c=clocks.get(key(l,i));if(!c){c=new window.PracticeClock(window.atlasSeconds(l.practice[i].d),()=>timerUI(l,i),()=>{storage.setStepDone(l,i,true);audio.playCompletionChime();timerUI(l,i);refreshProgress();toast('Крок завершено ✓');});clocks.set(key(l,i),c);}
  if(c.running)c.pause();else{if(c.finished)c.reset();audio.ensureContext();c.start();}timerUI(l,i);
 }
 function clearClocks(){clocks.forEach(c=>c.destroy());clocks.clear();}
 function renderLesson(){
  viewer?.destroy();viewer=null;const l=current(),r=storage.getLessonRecord(l),internal=storage.state.mode==='internal';
  const extra=(l.s||[]).map(k=>{const s=schemas[k];if(!s)return '';return `<figure class="schema${s.wide?' wide':''}">${s.h()}<figcaption>${esc(s.c)}</figcaption>${k==='sq'||k==='sq66'?`<button class="btn" data-breath-pattern="${k==='sq66'?'box6':'box4'}">Запустити цей ритм у тренажері ↑</button>`:''}</figure>`;}).join('');
  $('#pane').innerHTML=`<article><header class="pane-head"><div class="meta-row"><span class="eyebrow">ТИЖДЕНЬ ${l.w} · УРОК ${l.n}</span><span class="dot-sep"></span><span class="eyebrow mono">${minutes(l)} ХВ ПРАКТИКИ</span><span class="atlas-version mono">ATLAS / 03</span></div><h1 class="lesson-title">${esc(l.title)}</h1><div class="sense-quote"><p>${esc(l.sense)}</p></div><div class="actions-row"><button class="btn primary" id="btn-mark-done" aria-pressed="${r.lesson}">Позначити пройденим</button><button class="btn gold" id="btn-focus-mode">▷ Режим практики</button><button class="btn" id="btn-bookmark" aria-pressed="false">☆ Зберегти</button><button class="btn" id="btn-voice-rec">🎙 Запис голосу</button><button class="btn" id="btn-print-lesson">Друк</button></div></header><div id="anatomy-explorer"></div>${internal&&l.pain?`<section class="section"><div class="section-head"><span class="eyebrow">Авторська методологія</span></div><div class="pain-box"><p>${esc(l.pain)}</p></div></section>`:''}<section class="section"><div class="section-head"><span class="eyebrow">Теорія уроку</span><span class="count mono">${l.theory.length} блоки</span></div><div class="cards-grid${l.theory.length>2?' two':''}">${l.theory.map(t=>`<div class="theory-card"><h3>${esc(t.l)}</h3><p>${esc(t.t)}</p></div>`).join('')}</div></section>${extra?`<details class="section atlas-legacy"><summary>Авторські карти й схеми практик цього уроку</summary><p class="atlas-safety">Традиційні моделі та символічні відповідності відокремлені від анатомії. Звукові кнопки відтворюють синтетичні тони, не «частоти органів» і не записи голосних.</p><div class="schemas-grid">${extra}</div></details>`:''}<section class="section"><div class="section-head"><span class="eyebrow">Покрокова практика</span><span class="count mono">${minutes(l)} хв</span></div><div class="cards-grid">${l.practice.map((p,i)=>`<div class="step-card${r.steps.includes(i)?' done':''}" id="step-card-${i}"><button class="step-check-btn" data-step="${i}" aria-pressed="${r.steps.includes(i)}" aria-label="Позначити виконаним: ${esc(p.n)}">○</button><div class="step-body"><div class="step-top"><span class="step-name">${esc(p.n)}</span><span class="step-dur-badge mono">${esc(p.d)}</span></div><p>${esc(p.t)}</p><div class="step-timer-row"><span class="timer-pill mono" id="timer-display-${i}">${esc(p.d)}</span><button class="timer-btn" data-timer-toggle="${i}" aria-pressed="false">▷ Старт таймера</button><button class="timer-btn" data-timer-reset="${i}">Скинути</button></div></div></div>`).join('')}</div></section><section class="section"><div class="section-head"><span class="eyebrow">Завдання на день</span></div><div class="hw-box">${esc(l.hw)}</div></section><section class="section"><div class="section-head"><span class="eyebrow">Особистий щоденник</span></div><div class="notes-box"><label for="lesson-notes-input" class="sr-only">Нотатки до уроку</label><textarea class="notes-textarea" id="lesson-notes-input" maxlength="100000" placeholder="Що змінилося в подиху, тілі та звучанні?">${esc(storage.getLessonNotes(l))}</textarea><div class="notes-footer"><span>Лише в цьому браузері. Експортуй резервну копію.</span><span class="mono" id="notes-save-status">${storage.available?'Збережено':'Сховище недоступне'}</span></div></div></section><nav class="pager" aria-label="Навігація по уроках"><button class="btn" id="btn-prev-lesson" ${storage.state.idx===0?'disabled':''}>← Попередній</button><span class="pager-pos mono">${storage.state.idx+1} / ${lessons.length}</span><button class="btn" id="btn-next-lesson" ${storage.state.idx===lessons.length-1?'disabled':''}>Наступний →</button></nav></article>`;
  if(AnatomyViewer)viewer=new AnatomyViewer($('#anatomy-explorer'),l);else text('#anatomy-explorer','Анатомічний модуль недоступний. Урок і практики працюють нижче.');
  $('#pane').setAttribute('aria-labelledby',`tab-w${l.w}`);
  on('#btn-mark-done',()=>{const done=storage.toggleLessonDone(l);if(done)audio.playCompletionChime();refreshProgress();});
  on('#btn-bookmark',()=>{storage.toggleBookmark(l);refreshProgress();});
  on('#btn-focus-mode',()=>{clocks.forEach(c=>c.pause());pacer.stop();focus.startSession(l,0,i=>{storage.setStepDone(l,i,true);refreshProgress();});lockBackground();});
  on('#btn-voice-rec',()=>openVoice(l));on('#btn-print-lesson',()=>window.print());
  on('#btn-prev-lesson',()=>navigate(storage.state.idx-1));on('#btn-next-lesson',()=>navigate(storage.state.idx+1));
  $('#lesson-notes-input').oninput=e=>{const ok=storage.saveLessonNotes(l,e.target.value);text('#notes-save-status',ok?'Збережено':'Не збережено. Зроби експорт.');};
  $$('[data-step]').forEach(b=>b.onclick=()=>{storage.toggleStepDone(l,Number(b.dataset.step));refreshProgress();});
  $$('[data-timer-toggle]').forEach(b=>b.onclick=()=>toggleTimer(l,Number(b.dataset.timerToggle)));
  $$('[data-timer-reset]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.timerReset);clocks.get(key(l,i))?.reset();timerUI(l,i);});
  $$('[data-breath-pattern]').forEach(b=>b.onclick=()=>{if(!viewer)return;pacer.stop();pacer.activeEl=viewer.root;pacer.setPattern(b.dataset.breathPattern);$('#atlas-breath-pattern').value=b.dataset.breathPattern;viewer.root.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});pacer.start(viewer.root);});
  $$('.sound-play-btn,.interactive-zone').forEach(b=>{b.setAttribute('role','button');b.setAttribute('tabindex','0');b.setAttribute('aria-label',`Прослухати синтетичний тон: ${b.dataset.sound||''}`);const play=()=>{audio.playResonanceTone(b.dataset.sound);toast('Синтетичний тон — лише слуховий орієнтир.');};b.onclick=play;b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();play();}};});
  l.practice.forEach((_,i)=>timerUI(l,i));refreshProgress();
  $('#m-int').setAttribute('aria-pressed',String(internal));$('#m-stu').setAttribute('aria-pressed',String(!internal));
 }
 function render(){refreshHUD();renderNavigation();renderLesson();}
 function navigate(index,push=true){
  if(!Number.isInteger(index)||index<0||index>=lessons.length)return;
  clocks.forEach(c=>c.pause());focus.close();closeDialog('#search-modal-backdrop');closeVoice();
  storage.state.idx=index;storage.save();render();const l=current();
  if(push)history.pushState(null,'',`#lesson-${l.w}-${l.n}`);
  document.title=`${l.w}.${l.n} · ${l.title} — TRUEVOICE ATLAS`;
  $('#pane').focus({preventScroll:true});window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 }
 function hashIndex(){const m=location.hash.match(/^#lesson-([1-4])-([1-7])$/);return m?lessons.findIndex(l=>l.w===Number(m[1])&&l.n===Number(m[2])):-1;}
 function modal(){return $$('.modal-backdrop.open,.focus-modal.open,.tweaks-drawer.open').at(-1);}
 function lockBackground(){const open=modal();document.body.classList.toggle('atlas-dialog-open',!!open);for(const e of document.body.children){if(['SCRIPT','STYLE','LINK'].includes(e.tagName)||e.id==='toast-container'||e.classList.contains('tv-ambient-layer'))continue;e.inert=!!open&&!e.contains(open)&&e!==open;}}
 function openDialog(selector){const el=$(selector);if(!el)return;returnFocus=document.activeElement;el.classList.add('open');el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');lockBackground();(el.querySelector('input:not([type=hidden]),button')||el).focus();}
 function closeDialog(selector){const el=$(selector);if(!el?.classList.contains('open'))return;el.classList.remove('open');lockBackground();if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});}
 function search(){
  const q=query.trim().toLocaleLowerCase('uk-UA');const hits=lessons.map((l,i)=>{const pool=[l.title,l.sense,l.hw,l.pain||'',...l.theory.flatMap(t=>[t.l,t.t]),...l.practice.flatMap(p=>[p.n,p.t])].join(' ');if(chip&&!pool.toLowerCase().includes(chip.toLowerCase()))return null;const at=q?pool.toLocaleLowerCase('uk-UA').indexOf(q):0;if(at<0)return null;return {l,i,fragment:pool.slice(Math.max(0,at-45),at+140)};}).filter(Boolean);
  $('#search-results').innerHTML=hits.length?hits.map(h=>`<button class="search-hit" data-search-index="${h.i}"><span class="hit-tag">ТИЖДЕНЬ ${h.l.w} · УРОК ${h.l.n}</span><span class="hit-title">${esc(h.l.title)}</span><span class="hit-snippet">${esc(h.fragment)}</span></button>`).join(''):'<p class="atlas-empty">Нічого не знайдено. Спробуй коротший корінь слова.</p>';
 }
 function openSearch(){openDialog('#search-modal-backdrop');$('#search-modal-input').value=query;search();$('#search-modal-input').focus();}
 function releaseURLs(){urls.forEach(u=>URL.revokeObjectURL(u));urls=[];}
 async function refreshRecordings(epoch){
  try{const list=await recorder.getSamplesForLesson(storage.getLessonKey(voiceLesson));if(epoch!==voiceEpoch||!$('#voice-modal-backdrop').classList.contains('open'))return;releaseURLs();const target=$('#recordings-history-list');
   target.innerHTML=list.length?list.map(r=>{const u=URL.createObjectURL(r.blob);urls.push(u);const ext=r.blob.type.includes('mp4')?'m4a':r.blob.type.includes('ogg')?'ogg':'webm';return `<div class="recording-item"><div><span>${esc(new Date(r.date).toLocaleString('uk-UA'))}</span><audio controls preload="metadata" src="${u}" aria-label="Голосовий зразок"></audio></div><div class="recording-actions"><a class="btn" href="${u}" download="truevoice-${esc(r.lessonKey)}-${esc(r.id)}.${ext}" aria-label="Завантажити запис">↓</a><button class="btn" data-delete-rec="${esc(r.id)}" aria-label="Видалити запис">✕</button></div></div>`;}).join(''):'<p class="atlas-empty">Поки немає записів цього уроку.</p>';
   target.querySelectorAll('[data-delete-rec]').forEach(b=>b.onclick=async()=>{try{await recorder.deleteSample(b.dataset.deleteRec);await refreshRecordings(epoch);}catch(e){toast('Не вдалося видалити запис.');}});
  }catch(e){if(epoch===voiceEpoch)text('#recordings-history-list','Локальне сховище записів недоступне: '+e.message);}
 }
 async function openVoice(l){
  voiceLesson=l;const epoch=++voiceEpoch;audio.stopAmbientDrone();pacer.stop();clocks.forEach(c=>c.pause());openDialog('#voice-modal-backdrop');text('#voice-modal-title',`Запис голосу · Урок ${l.w}.${l.n}`);
  const b=$('#modal-record-btn');b.disabled=false;b.classList.remove('recording');b.textContent='🎙 Почати запис';
  b.onclick=async()=>{
   b.disabled=true;
   try{if(!recorder.isRecording){b.textContent='Доступ до мікрофона…';const ok=await recorder.startRecording($('#voice-wave-canvas'),storage.getLessonKey(l));if(epoch!==voiceEpoch)return;if(ok){b.classList.add('recording');b.textContent='⏹ Зупинити й зберегти';}else{b.textContent='🎙 Почати запис';if(recorder.lastError)toast(recorder.lastError);}}
   else{b.textContent='Збереження…';const saved=await recorder.stopRecording(storage.getLessonKey(l));if(epoch!==voiceEpoch)return;b.classList.remove('recording');b.textContent='🎙 Почати запис';if(saved)toast('Голосовий зразок збережено в цьому браузері.');await refreshRecordings(epoch);}}
   catch(e){b.classList.remove('recording');b.textContent='🎙 Почати запис';toast(recorder.lastError||e.message);}
   finally{if(epoch===voiceEpoch)b.disabled=false;}
  };await refreshRecordings(epoch);
 }
 async function closeVoice(){
  const wasOpen=$('#voice-modal-backdrop')?.classList.contains('open');if(!wasOpen&&!recorder.isRecording&&!recorder.isStarting)return;
  const l=voiceLesson;++voiceEpoch;recorder.cancelPending();closeDialog('#voice-modal-backdrop');releaseURLs();
  if(recorder.isRecording||recorder.stopPromise){try{const saved=await recorder.stopRecording(l?storage.getLessonKey(l):recorder.lessonKey);if(saved)toast('Запис збережено. Мікрофон вимкнено.');}catch(e){toast('Не вдалося зберегти запис. Мікрофон вимкнено.');}}
 }
 function applySettings(){
  document.documentElement.dataset.theme=storage.state.theme;
  $$('.color-swatch').forEach(e=>{const selected=e.dataset.theme===storage.state.theme;e.classList.toggle('active',selected);e.setAttribute('aria-pressed',String(selected));e.setAttribute('aria-label',e.title);if(selected)ambient.setAccent(e.dataset.color);});
  audio.setVolume(storage.state.volume);audio.setSoundEffects(storage.state.soundFX);ambient.setSpineVisible(storage.state.showSpine);ambient.setStarfieldVisible(storage.state.showStarfield);
  $('#toggle-spine').checked=storage.state.showSpine;$('#toggle-sound-fx').checked=storage.state.soundFX;if($('#toggle-starfield'))$('#toggle-starfield').checked=storage.state.showStarfield;if($('#atlas-volume'))$('#atlas-volume').value=storage.state.volume;
 }
 function initSettings(){
  $('#toggle-spine').closest('.tweak-group').insertAdjacentHTML('beforeend','<label class="toggle-switch"><span>Зоряне тло</span><input type="checkbox" id="toggle-starfield"/></label><label class="atlas-volume-label" for="atlas-volume">Гучність <input id="atlas-volume" type="range" min="0" max="1" step="0.05"/></label>');
  on('#btn-open-tweaks',()=>openDialog('#tweaks-drawer'));on('#btn-close-tweaks',()=>closeDialog('#tweaks-drawer'));
  $$('.color-swatch').forEach(e=>e.onclick=()=>{storage.state.theme=e.dataset.theme;storage.save();applySettings();});
  for(const [id,k] of [['toggle-spine','showSpine'],['toggle-sound-fx','soundFX'],['toggle-starfield','showStarfield']])$('#'+id).onchange=e=>{storage.state[k]=e.target.checked;storage.save();applySettings();};
  $('#atlas-volume').oninput=e=>{storage.state.volume=Number(e.target.value);audio.setVolume(storage.state.volume);storage.save();};
  on('#btn-export-data',()=>{storage.exportDataJSON();toast('Експорт містить прогрес і нотатки. Аудіозаписи завантажуються окремо.');});
  on('#btn-import-data',()=>$('#file-import-input').click());
  $('#file-import-input').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>8*1024*1024)throw new Error('Файл завеликий.');if(!storage.importDataJSON(await f.text()))throw new Error('Некоректна резервна копія або недоступне сховище.');clearClocks();applySettings();render();toast('Прогрес і нотатки відновлено.');}catch(err){toast(err.message);}finally{e.target.value='';}};
  on('#btn-reset-data',()=>{if(confirm('Скинути прогрес, нотатки та закладки? Аудіозаписи залишаться. Спершу можна зробити експорт.')){clearClocks();storage.resetProgress();render();toast('Прогрес скинуто.');}});
 }
 function initEvents(){
  for(const [q,mode] of [['#m-int','internal'],['#m-stu','student']])on(q,()=>{clocks.forEach(c=>c.pause());storage.state.mode=mode;storage.save();render();});
  on('#btn-ambient-drone',()=>{const ok=audio.toggleAmbientDrone();toast(ok?'Фоновий синтетичний тон увімкнено.':'Фоновий тон вимкнено.');});
  window.addEventListener('atlas:audio-state',e=>{const b=$('#btn-ambient-drone');b.setAttribute('aria-pressed',String(e.detail.playing));b.classList.toggle('active',e.detail.playing);});
  $('#weeks').onclick=e=>{const b=e.target.closest('[data-w]');if(b)navigate(lessons.findIndex(l=>l.w===Number(b.dataset.w)));};
  $('#weeks').onkeydown=e=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const w=current().w,n=e.key==='Home'?1:e.key==='End'?4:e.key==='ArrowRight'?w%4+1:(w+2)%4+1;navigate(lessons.findIndex(l=>l.w===n));$(`#tab-w${n}`)?.focus();};
  $('#rail').onclick=e=>{const b=e.target.closest('[data-idx]');if(b)navigate(Number(b.dataset.idx));};
  $('#mobile-pick').onchange=e=>navigate(Number(e.target.value));$('#mobile-pick').setAttribute('aria-label','Обери урок');
  on('#search-input-header',openSearch);on('#mobile-search-btn',openSearch);on('#search-modal-close',()=>closeDialog('#search-modal-backdrop'));
  $('#search-modal-input').setAttribute('aria-label','Пошук по уроках');$('#search-modal-backdrop').setAttribute('aria-label','Пошук по атласу');$('#search-modal-backdrop').removeAttribute('aria-labelledby');
  $('#search-modal-input').oninput=e=>{query=e.target.value;search();};
  $$('.search-chip').forEach(b=>b.onclick=()=>{chip=chip===b.dataset.tag?null:b.dataset.tag;$$('.search-chip').forEach(x=>{x.classList.toggle('active',x.dataset.tag===chip);x.setAttribute('aria-pressed',String(x.dataset.tag===chip));});search();});
  $('#search-results').onclick=e=>{const b=e.target.closest('[data-search-index]');if(b)navigate(Number(b.dataset.searchIndex));};
  on('#voice-modal-close',closeVoice);
  for(const id of ['search-modal-backdrop','voice-modal-backdrop'])$('#'+id).addEventListener('click',e=>{if(e.target===e.currentTarget)id.startsWith('voice')?closeVoice():closeDialog('#'+id);});
  focus.init($('#focus-modal'));on('#focus-close-btn',()=>{focus.close();lockBackground();});on('#focus-play-btn',()=>focus.toggleTimer());on('#focus-prev-btn',()=>focus.prevStep());on('#focus-next-btn',()=>focus.nextStep());
  document.addEventListener('keydown',e=>{
   if(e.defaultPrevented)return;const open=modal();
   if(e.key==='Escape'){if(viewer?.root.classList.contains('atlas-expanded')){viewer.root.classList.remove('atlas-expanded');return;}if(open?.id==='focus-modal'){focus.close();lockBackground();}else if(open?.id==='voice-modal-backdrop')closeVoice();else if(open)closeDialog('#'+open.id);return;}
   if(open){if(e.key==='Tab'){const els=[...open.querySelectorAll('button:not([disabled]),input:not([disabled]),select,textarea,a[href],audio[controls],[tabindex="0"]')].filter(x=>x.getClientRects().length);if(!els.length)return;const first=els[0],last=els.at(-1);if(e.shiftKey&&(document.activeElement===first||!open.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!open.contains(document.activeElement))){e.preventDefault();first.focus();}}
    if(open.id==='focus-modal'&&!/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(e.target.tagName)&&e.code==='Space'){e.preventDefault();focus.toggleTimer();}return;
   }
   if(e.metaKey||e.ctrlKey||e.altKey||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)||e.target.isContentEditable)return;
   if(e.key==='/'){e.preventDefault();openSearch();return;}
   if(/^(BUTTON|A)$/.test(e.target.tagName))return;
   if(e.key==='ArrowRight')navigate(storage.state.idx+1);if(e.key==='ArrowLeft')navigate(storage.state.idx-1);
   if(e.key.toLowerCase()==='m')$('#btn-ambient-drone').click();if(e.key.toLowerCase()==='f')$('#btn-focus-mode').click();
  });
  window.addEventListener('hashchange',()=>{const i=hashIndex();if(i>=0&&i!==storage.state.idx)navigate(i,false);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&(recorder.isRecording||recorder.isStarting))closeVoice();});
 }
 document.body.insertAdjacentHTML('afterbegin',window.SVG_DEFS||'');
 // The sidebar waveform is decorative, never a microphone measurement.
 $$('.tv-spine-label').forEach((e,i)=>e.textContent=i?'SCROLL / ∞':'DECORATIVE / VOX');
 ambient.init($('#starfield-canvas'),$('#spine-canvas'));initSettings();applySettings();initEvents();
 const initial=hashIndex();if(initial>=0)storage.state.idx=initial;render();
 if(!storage.available)toast('Локальне сховище недоступне. Зберігай резервну копію через експорт.');
 window.atlasApp={version:'3.0.0',navigate};
})();
