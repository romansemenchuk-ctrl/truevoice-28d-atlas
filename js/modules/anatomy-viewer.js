/* Anatomical art is illustrative. Functional schematics are deliberately simplified. */
const PLATES={
 tract:{label:'Голосовий тракт',title:'Від подиху — до звучання',tag:'01 / VOCAL TRACT',zones:[
 ['nose','Носова порожнина',55,16,'Носова порожнина бере участь у формуванні назального резонансу. Її акустичне сполучення з ротоглоткою залежить від положення м’якого піднебіння.'],
 ['mouth','Ротова порожнина',57,25,'Язик, губи та щелепа змінюють форму голосового тракту й допомагають формувати голосні. Це акустичний фільтр, а не окреме джерело голосу.'],
 ['larynx','Гортань',46,36,'Голосові складки розташовані в гортані. Під час фонації повітря з легень підтримує їхні коливання.'],
 ['trachea','Трахея',46,49,'Трахея проводить повітря між гортанню та бронхами. Повітря не проходить крізь діафрагму.']]},
 breath:{label:'Дихання',title:'Простір для подиху',tag:'02 / BREATH MECHANICS',zones:[
 ['lungs','Легені',37,54,'Повітря з легень забезпечує потік для фонації. Дихальні рухи змінюють об’єм грудної порожнини.'],
 ['ribs','Грудна клітка',71,58,'Ребра й дихальні м’язи беруть участь у зміні об’єму грудної клітки. Схема показує лише загальний напрям руху.'],
 ['diaphragm','Діафрагма',49,71,'Діафрагма — куполоподібний дихальний м’яз. Під час вдиху вона скорочується й опускається; повітря при цьому надходить у легені, а не в живіт.'],
 ['larynx','Гортань',49,25,'Потік повітря проходить через гортань. Голос народжується внаслідок коливань голосових складок, не в діафрагмі.']]},
 larynx:{label:'Гортань',title:'Місце народження голосу',tag:'03 / PHONATION',zones:[
 ['tongue','Язик',58,31,'Положення язика змінює форму ротової порожнини та характеристики голосних.'],
 ['pharynx','Глотка',29,35,'Глотка є частиною голосового тракту. Її геометрія впливає на акустичний фільтр голосу.'],
 ['folds','Голосові складки',43,57,'Парні складки в гортані коливаються під час звичайної фонації. Режим «Схема» показує вид зверху та дуже сповільнений умовний рух.'],
 ['trachea','Трахея',43,78,'Трахея лежить нижче гортані. Стравохід проходить позаду неї та належить до травної системи.']]},
 body:{label:'Вісь тіла',title:'Тіло — твій інструмент',tag:'04 / BODY AWARENESS',zones:[
 ['neck','Шия',49,16,'Шия підтримує голову та містить гортань. У практиці шукай зручне положення без навмисного стискання горла.'],
 ['chest','Грудна клітка',49,26,'Грудна клітка пов’язана з дихальною механікою. Відчуття вібрації у грудях не означає, що вони є головним акустичним резонатором голосу.'],
 ['diaphragm','Діафрагма',49,33,'Дихання й фонація потребують координації. Центральна світлова лінія на ілюстрації — образ цієї координації, не нерв чи анатомічний канал.'],
 ['pelvis','Таз та опора',49,47,'Таз і ноги формують опору для положення тіла. Світлові вузли, Сонце та Місяць є символікою TrueVoice, а не анатомічними структурами.']]}
};
const SOURCES=[['NIDCD · How voice is produced','https://www.nidcd.nih.gov/health/taking-care-your-voice'],['NHLBI · How the lungs work','https://www.nhlbi.nih.gov/health/lungs/breathing-benefits']];
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function diagram(view){
 const base='<svg viewBox="0 0 600 750" role="img" aria-label="Спрощена навчальна схема" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="atlas-tissue" x2="1" y2="1"><stop stop-color="#e85d51"/><stop offset="1" stop-color="#65131c"/></linearGradient></defs>';
 const text=(x,y,t)=>`<text x="${x}" y="${y}" text-anchor="middle" fill="#efe6d4" font-size="20" font-family="sans-serif">${t}</text>`;
 if(view==='breath')return base+`<g fill="none" stroke="#a99479" stroke-width="3"><path d="M285 100V250L225 315M315 100V250L375 315"/><path d="M300 80V250"/></g><g class="lung-motion" fill="url(#atlas-tissue)" stroke="#edaa8a" stroke-width="2"><path d="M260 230C215 180 135 230 125 355S140 495 260 460Z"/><path d="M340 230C385 180 465 230 475 355S460 495 340 460Z"/></g><g class="diaphragm-motion"><path data-diaphragm-dome d="M105 515Q300 360 495 515L490 540Q300 400 110 540Z" fill="url(#atlas-tissue)" stroke="#efca91" stroke-width="2"/></g><path data-breath-flow d="M300 175V350" stroke="#eed394" stroke-width="3" stroke-dasharray="9 13"/>${text(300,160,'ТРАХЕЯ')}${text(300,580,'ДІАФРАГМА')}<text data-mechanics-phase x="300" y="650" text-anchor="middle" fill="#efe6d4" font-size="20" font-family="sans-serif">ВДИХ</text>${text(300,691,'Рух синхронізований із тренажером')}</svg>`;
 if(view==='larynx')return base+`<path d="M300 150C135 145 100 325 140 490Q300 620 460 490C500 325 465 145 300 150Z" fill="#321820" stroke="#ba9d7a" stroke-width="5"/><path d="M300 225L240 485Q300 525 360 485Z" fill="#08090b"/><path class="fold fold-left" d="M300 225Q243 335 237 480" fill="none" stroke="#ecd9ba" stroke-width="18" stroke-linecap="round"/><path class="fold fold-right" d="M300 225Q357 335 363 480" fill="none" stroke="#ecd9ba" stroke-width="18" stroke-linecap="round"/><circle cx="231" cy="485" r="23" fill="#bc726c"/><circle cx="369" cy="485" r="23" fill="#bc726c"/>${text(300,100,'ГОРТАНЬ · ВИД ЗВЕРХУ')}${text(300,590,'ГОЛОСОВА ЩІЛИНА')}${text(300,670,'Рух умовний і сильно сповільнений')}</svg>`;
 if(view==='body')return base+`<g fill="#28151b" stroke="#bca785" stroke-width="3"><ellipse cx="300" cy="130" rx="48" ry="62"/><path d="M278 190L250 220L215 235L175 400L200 410L242 285L250 410L245 475L233 650L267 650L297 485L303 485L333 650L367 650L355 475L350 410L358 285L400 410L425 400L385 235L350 220L322 190"/></g><path d="M300 75V680" stroke="#ed8d71" stroke-width="2" stroke-dasharray="5 8"/><path d="M185 680H415" stroke="#baa582" stroke-width="2"/><g fill="#f59577">${[208,285,365,460,675].map(y=>`<circle cx="300" cy="${y}" r="6"/>`).join('')}</g>${text(300,725,'Орієнтир постави, не анатомічний канал')}</svg>`;
 return base+`<g fill="#2b171d" stroke="#b7a087" stroke-width="2"><rect x="120" y="85" width="360" height="110" rx="28"/><rect x="160" y="300" width="280" height="110" rx="28"/><rect x="100" y="515" width="400" height="110" rx="28"/></g><g fill="none" stroke="#f27b63" stroke-width="3" stroke-dasharray="9 9" class="flow-line"><path d="M300 495V430M300 280V215"/></g><g fill="#f27b63"><path d="M290 442L300 425L310 442Z"/><path d="M290 230L300 213L310 230Z"/></g>${text(300,133,'ГЛОТКА · РОТ · НІС')}${text(300,165,'акустичний фільтр')}${text(300,347,'ГОРТАНЬ')}${text(300,380,'джерело коливань')}${text(300,563,'ЛЕГЕНІ ТА ДИХАЛЬНІ М’ЯЗИ')}${text(300,600,'повітряний потік')}${text(300,710,'Модель «джерело — фільтр»')}</svg>`;
}
export class AnatomyViewer{
 constructor(host,lesson){this.host=host;this.lesson=lesson;this.view=lesson.s?.some(k=>k==='body-pv'||k==='fascia')?'body':lesson.s?.some(k=>k==='sq'||k==='sq66'||k==='body-df')?'breath':'tract';this.mode='art';this.zoom=1;this.x=0;this.y=0;this.labels=true;this.motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;this.zone=0;this.render();this.bind();}
 render(){
 this.host.innerHTML=`<section class="atlas-workbench" aria-label="Інтерактивний анатомічний атлас"><header class="atlas-heading"><div><span class="eyebrow">ANATOMY LAB / TRUEVOICE</span><h2>Побач. Відчуй. Зазвучи.</h2></div><span class="atlas-edition mono">4 ПЛАСТИ<br>ОДИН ГОЛОС</span></header><nav class="atlas-tabs" aria-label="Анатомічні ілюстрації">${Object.entries(PLATES).map(([k,p],i)=>`<button type="button" data-plate="${k}" aria-pressed="${k===this.view}"><span class="mono">0${i+1}</span>${p.label}</button>`).join('')}</nav><div class="atlas-layout"><div class="atlas-art-column"><div class="atlas-stage" tabindex="0" role="region" aria-label="Ілюстрація: кнопки плюс і мінус змінюють масштаб, 0 скидає; перетягування після збільшення"><span class="atlas-stage-tag mono"></span><div class="atlas-transform"><img class="atlas-image" width="1122" height="1402" alt="" decoding="async"/><div class="atlas-hotspots"></div></div><div class="atlas-schematic" hidden></div><span class="atlas-scale mono">100%</span></div><div class="atlas-toolbar"><div class="atlas-segment" aria-label="Тип зображення"><button type="button" data-mode="art" aria-pressed="true">Ілюстрація</button><button type="button" data-mode="diagram" aria-pressed="false">Схема</button></div><div class="atlas-zoom-tools"><button type="button" data-zoom="-1" aria-label="Зменшити">−</button><button type="button" data-zoom="0" aria-label="Скинути масштаб">↺</button><button type="button" data-zoom="1" aria-label="Збільшити">+</button><button type="button" data-expand aria-label="Розгорнути атлас" aria-pressed="false">⛶</button></div></div><div class="atlas-display-tools"><button type="button" data-labels aria-pressed="true">Підписи</button><button type="button" data-motion aria-pressed="${this.motion}">Рух схеми: ${this.motion?'увімкнено':'вимкнено'}</button></div><p class="atlas-caption">Художня анатомічна візуалізація. Світлові лінії та небесні символи — метафори, не анатомічні структури. Не клінічний атлас.</p></div><aside class="atlas-sidebar"><span class="eyebrow">ДОСЛІДИ СТРУКТУРУ</span><h3 class="atlas-plate-title"></h3><div class="atlas-zone-list" aria-label="Ділянки для дослідження"></div><div class="atlas-fact" aria-live="polite"><h4></h4><p></p></div><div class="atlas-pacer"><div class="atlas-lab-head"><span class="eyebrow">РИТМ ДИХАННЯ</span><span class="mono">LIVE GUIDE</span></div><label for="atlas-breath-pattern" class="sr-only">Ритм дихання</label><select id="atlas-breath-pattern">${Object.entries(window.breathPacer.PATTERNS).map(([k,p])=>`<option value="${k}">${p.name}</option>`).join('')}</select><div class="pacer-orbit"><div class="pacer-circle"></div><div class="pacer-readout"><span class="pacer-counter mono">5</span><span class="pacer-phase-label">ВДИХ</span></div></div><div class="atlas-pacer-actions"><button type="button" data-pacer-toggle aria-pressed="false">▷ Почати / продовжити</button><button type="button" data-pacer-reset aria-label="Скинути дихальний ритм">↺</button></div><p class="atlas-safety">Комфортний подих без форсування. При дискомфорті зупини практику. У фоновій вкладці ритм стає на паузу.</p></div><details class="atlas-sources"><summary>Про схеми та джерела</summary><p>Навчальні схеми спрощені; вони не відтворюють індивідуальну анатомію та не замінюють діагностику.</p>${SOURCES.map(([n,u])=>`<a href="${u}" target="_blank" rel="noopener noreferrer">${n} ↗</a>`).join('')}</details></aside></div></section>`;
 this.root=this.host.firstElementChild;this.stage=this.root.querySelector('.atlas-stage');this.updatePlate();const p=window.breathPacer;p.activeEl=this.root;p.setPattern('coherent');this.root.classList.toggle('atlas-motion-paused',!this.motion);
 }
 updatePlate(){
 const p=PLATES[this.view],q=s=>this.root.querySelector(s);this.zone=0;this.resetZoom();q('.atlas-stage-tag').textContent=p.tag;q('.atlas-plate-title').textContent=p.title;const img=q('.atlas-image');img.alt=`${p.label}: художня анатомічна ілюстрація TrueVoice`;
 img.onerror=()=>{this.mode='diagram';this.updateMode();q('.atlas-caption').textContent='Ілюстрація недоступна. Показано локальну навчальну схему.';};img.src=`assets/anatomy/${this.view}.webp`;
 q('.atlas-hotspots').innerHTML=p.zones.map((z,i)=>`<button type="button" class="atlas-hotspot" data-zone="${i}" style="left:${z[2]}%;top:${z[3]}%" aria-label="${escapeHTML(z[1])}" aria-pressed="${i===0}"><span>${i+1}</span><em>${escapeHTML(z[1])}</em></button>`).join('');
 q('.atlas-zone-list').innerHTML=p.zones.map((z,i)=>`<button type="button" data-zone="${i}" aria-pressed="${i===0}"><span class="mono">0${i+1}</span>${escapeHTML(z[1])}</button>`).join('');q('.atlas-schematic').innerHTML=diagram(this.view);this.root.querySelectorAll('[data-plate]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.plate===this.view)));this.selectZone(0);this.updateMode();const pacer=window.breathPacer;if(pacer.activeEl===this.root)pacer.updateDOM(pacer.elapsed+(pacer.isRunning?performance.now()-pacer.anchor:0));
 }
 selectZone(i){const z=PLATES[this.view].zones[i];if(!z)return;this.zone=i;this.root.querySelector('.atlas-fact h4').textContent=z[1];this.root.querySelector('.atlas-fact p').textContent=z[4];this.root.querySelectorAll('[data-zone]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.zone)===i)));}
 updateMode(){this.root.querySelector('.atlas-transform').hidden=this.mode!=='art';this.root.querySelector('.atlas-schematic').hidden=this.mode!=='diagram';this.root.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===this.mode)));this.root.querySelectorAll('[data-zoom]').forEach(b=>b.disabled=this.mode!=='art');}
 transform(){const bx=this.stage.clientWidth*(this.zoom-1)/2,by=this.stage.clientHeight*(this.zoom-1)/2;this.x=Math.max(-bx,Math.min(bx,this.x));this.y=Math.max(-by,Math.min(by,this.y));this.root.querySelector('.atlas-transform').style.transform=`translate(${this.x}px,${this.y}px) scale(${this.zoom})`;this.root.querySelector('.atlas-scale').textContent=`${Math.round(this.zoom*100)}%`;this.stage.classList.toggle('is-zoomed',this.zoom>1);}
 resetZoom(){this.zoom=1;this.x=0;this.y=0;if(this.root)this.transform();}
 changeZoom(d){this.zoom=Math.max(1,Math.min(3,this.zoom+d));this.transform();}
 setExpanded(value){this.root.classList.toggle('atlas-expanded',value);this.root.querySelector('[data-expand]').setAttribute('aria-pressed',String(value));if(value){this.oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');}else{document.body.style.overflow=this.oldOverflow||'';this.root.removeAttribute('role');this.root.removeAttribute('aria-modal');}this.resetZoom();}
 updateBreathDrawing(frame){
  this.lastBreathFrame=frame;
  const reduced=frame.reduced||!this.motion;
  const amount=reduced ? 0.5 : Math.max(0,Math.min(1,frame.expansion));
  const dome=this.root.querySelector('[data-diaphragm-dome]');
  if(dome)dome.setAttribute('d',`M105 515Q300 ${360+amount*66} 495 515L490 540Q300 ${400+amount*61} 110 540Z`);
  const lungs=this.root.querySelector('.lung-motion');
  if(lungs)lungs.style.setProperty('--lung-expansion',String(amount));
  const flow=this.root.querySelector('[data-breath-flow]');
  if(flow){
   const moving=frame.phase===0||frame.phase===2;
   flow.dataset.direction=frame.phase===0?'inhale':frame.phase===2?'exhale':'hold';
   flow.style.opacity=moving&&!reduced?'1':'0';
   flow.style.strokeDashoffset=String((frame.phase===0?-1:1)*frame.progress*110);
  }
  const caption=this.root.querySelector('[data-mechanics-phase]');
  const label=['ВДИХ · КУПОЛ ОПУСКАЄТЬСЯ','ПАУЗА ПІСЛЯ ВДИХУ','ВИДИХ · КУПОЛ ПІДНІМАЄТЬСЯ','ПАУЗА ПІСЛЯ ВИДИХУ'][frame.phase];
  if(caption&&caption.textContent!==label)caption.textContent=label;
 }
 bind(){
 this.abort=new AbortController();const opts={signal:this.abort.signal};
 this.root.addEventListener('atlas:breath-frame',e=>this.updateBreathDrawing(e.detail),opts);
 const visibility=()=>this.root.classList.toggle('atlas-document-hidden',document.hidden);
 document.addEventListener('visibilitychange',visibility,opts);visibility();
 const p=window.breathPacer;if(p.activeEl===this.root)p.updateDOM(p.elapsed+(p.isRunning?performance.now()-p.anchor:0));
 this.root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.plate){this.view=b.dataset.plate;this.updatePlate();}
 else if(b.dataset.zone!==undefined)this.selectZone(Number(b.dataset.zone));
 else if(b.dataset.mode){this.mode=b.dataset.mode;this.updateMode();}
 else if(b.dataset.zoom!==undefined){Number(b.dataset.zoom)===0?this.resetZoom():this.changeZoom(Number(b.dataset.zoom)*.25);}
 else if(b.hasAttribute('data-labels')){this.labels=!this.labels;this.root.classList.toggle('hide-labels',!this.labels);b.setAttribute('aria-pressed',String(this.labels));}
 else if(b.hasAttribute('data-motion')){this.motion=!this.motion;this.root.classList.toggle('atlas-motion-paused',!this.motion);b.textContent=`Рух схеми: ${this.motion?'увімкнено':'вимкнено'}`;b.setAttribute('aria-pressed',String(this.motion));if(this.lastBreathFrame)this.updateBreathDrawing(this.lastBreathFrame);}
 else if(b.hasAttribute('data-expand'))this.setExpanded(!this.root.classList.contains('atlas-expanded'));
 else if(b.hasAttribute('data-pacer-toggle'))window.breathPacer.toggle(this.root);
 else if(b.hasAttribute('data-pacer-reset'))window.breathPacer.reset();},opts);
 document.addEventListener('keydown',e=>{if(!this.root.classList.contains('atlas-expanded'))return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.setExpanded(false);this.root.querySelector('[data-expand]').focus();return;}if(e.key==='Tab'){const els=[...this.root.querySelectorAll('button:not([disabled]),select,a[href],[tabindex="0"],summary')].filter(x=>x.getClientRects().length);const first=els[0],last=els.at(-1);if(e.shiftKey&&(document.activeElement===first||!this.root.contains(document.activeElement))){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||!this.root.contains(document.activeElement))){e.preventDefault();first?.focus();}}},{...opts,capture:true});
 this.root.addEventListener('keydown',e=>{if(this.root.classList.contains('atlas-expanded')&&!/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)&&['ArrowRight','ArrowLeft','f','m','/'].includes(e.key))e.preventDefault();},opts);
 this.root.querySelector('select').addEventListener('change',e=>window.breathPacer.setPattern(e.target.value),opts);
 this.stage.addEventListener('pointerdown',e=>{if(this.zoom<=1||this.mode!=='art'||e.target.closest('button'))return;this.drag={px:e.clientX,py:e.clientY,x:this.x,y:this.y};this.stage.setPointerCapture(e.pointerId);},opts);
 this.stage.addEventListener('pointermove',e=>{if(!this.drag)return;this.x=this.drag.x+e.clientX-this.drag.px;this.y=this.drag.y+e.clientY-this.drag.py;this.transform();},opts);
 for(const name of ['pointerup','pointercancel','lostpointercapture'])this.stage.addEventListener(name,()=>this.drag=null,opts);
 this.stage.addEventListener('wheel',e=>{if((e.ctrlKey||e.metaKey)&&this.mode==='art'){e.preventDefault();this.changeZoom(e.deltaY>0?-.15:.15);}},{...opts,passive:false});
 this.stage.addEventListener('keydown',e=>{if(e.target!==this.stage)return;const actions={'+':()=>this.changeZoom(.25),'=':()=>this.changeZoom(.25),'-':()=>this.changeZoom(-.25),'0':()=>this.resetZoom()};if(actions[e.key]){e.preventDefault();e.stopPropagation();actions[e.key]();}else if(this.zoom>1&&e.key.startsWith('Arrow')){e.preventDefault();e.stopPropagation();if(e.key==='ArrowLeft')this.x+=30;if(e.key==='ArrowRight')this.x-=30;if(e.key==='ArrowUp')this.y+=30;if(e.key==='ArrowDown')this.y-=30;this.transform();}},opts);
 this.observer=new IntersectionObserver(es=>this.root.classList.toggle('atlas-offscreen',!es[0].isIntersecting));this.observer.observe(this.root);
 this.motionQuery=matchMedia('(prefers-reduced-motion: reduce)');this.motionQuery.addEventListener('change',e=>{if(e.matches){this.motion=false;this.root.classList.add('atlas-motion-paused');const b=this.root.querySelector('[data-motion]');b.setAttribute('aria-pressed','false');b.textContent='Рух схеми: вимкнено';}},opts);
 }
 destroy(){if(this.root.classList.contains('atlas-expanded'))this.setExpanded(false);window.breathPacer.stop();if(window.breathPacer.activeEl===this.root)window.breathPacer.activeEl=null;this.abort?.abort();this.observer?.disconnect();}
}
