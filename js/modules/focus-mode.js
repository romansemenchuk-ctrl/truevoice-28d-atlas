/* Monotonic clocks. Hidden tabs pause practice; they never finish it silently. */
const atlasClocks=new Set();
class PracticeClock{
 constructor(seconds,onTick=()=>{},onComplete=()=>{}){this.total=Math.max(1,Number(seconds)||300);this.remaining=this.total;this.running=false;this.finished=false;this.onTick=onTick;this.onComplete=onComplete;this.frame=null;atlasClocks.add(this);}
 value(now=performance.now()){return this.running?Math.max(0,this.remaining-(now-this.anchor)/1000):this.remaining;}
 start(){if(this.running||this.finished)return;this.running=true;this.anchor=performance.now();this.loop();}
 loop(){if(!this.running)return;const left=this.value();this.onTick(Math.ceil(left),true);if(left<=0){this.remaining=0;this.running=false;this.finished=true;this.frame=null;this.onComplete();return;}this.frame=requestAnimationFrame(()=>this.loop());}
 pause(){if(this.running)this.remaining=this.value();this.running=false;cancelAnimationFrame(this.frame);this.frame=null;this.onTick(Math.ceil(this.remaining),false);}
 reset(){this.pause();this.remaining=this.total;this.finished=false;this.onTick(Math.ceil(this.remaining),false);}
 destroy(){this.pause();atlasClocks.delete(this);}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)atlasClocks.forEach(c=>c.pause());});
window.addEventListener('pagehide',()=>atlasClocks.forEach(c=>c.pause()));
window.PracticeClock=PracticeClock;
class FocusPracticeManager{
 constructor(){this.modalEl=null;this.lesson=null;this.currentStepIdx=0;this.isRunning=false;this.clock=null;this.returnFocus=null;}
 init(el){this.modalEl=el;}
 startSession(lesson,stepIndex=0,onComplete){if(!this.modalEl||!lesson?.practice?.length)return;this.returnFocus=document.activeElement;this.lesson=lesson;this.onCompleteCallback=onComplete;this.modalEl.classList.add('open');this.loadStep(stepIndex);this.modalEl.querySelector('#focus-close-btn')?.focus();}
 loadStep(idx){this.clock?.destroy();this.currentStepIdx=Math.max(0,Math.min(this.lesson.practice.length-1,idx));const step=this.lesson.practice[this.currentStepIdx];this.clock=new PracticeClock(window.atlasSeconds(step.d),(seconds,running)=>{this.remainingSeconds=seconds;this.isRunning=running;this.updateTimerDisplay();this.updatePlayBtn(running);},()=>this.stepCompleted());this.remainingSeconds=this.clock.total;this.isRunning=false;this.updateDOM();this.startTimer();}
 startTimer(){if(this.clock?.finished)this.clock.reset();this.clock?.start();}
 stopTimer(){this.clock?.pause();this.isRunning=false;}
 toggleTimer(){this.clock?.running?this.stopTimer():this.startTimer();}
 stepCompleted(){this.isRunning=false;this.remainingSeconds=0;this.updateDOM();window.audioEngine?.playCompletionChime();this.onCompleteCallback?.(this.currentStepIdx);const b=this.modalEl?.querySelector('#focus-play-btn');if(b){b.textContent='↻ Повторити крок';b.setAttribute('aria-pressed','false');}const m=this.modalEl?.querySelector('.focus-step-meta');if(m)m.textContent=this.currentStepIdx===this.lesson.practice.length-1?'ПРАКТИКУ ЗАВЕРШЕНО ✓':'КРОК ЗАВЕРШЕНО ✓ · ПЕРЕЙДИ ДО НАСТУПНОГО';}
 nextStep(){if(this.currentStepIdx<this.lesson.practice.length-1)this.loadStep(this.currentStepIdx+1);}
 prevStep(){if(this.currentStepIdx>0)this.loadStep(this.currentStepIdx-1);}
 close(){
  const wasOpen=this.modalEl?.classList.contains('open');this.clock?.destroy();this.clock=null;this.isRunning=false;this.modalEl?.classList.remove('open');
  if(wasOpen&&!document.querySelector('.modal-backdrop.open,.tweaks-drawer.open')){document.body.classList.remove('atlas-dialog-open');for(const e of document.body.children)e.inert=false;}
  if(wasOpen&&this.returnFocus?.isConnected)this.returnFocus.focus({preventScroll:true});
 }
 formatTime(sec){const n=Math.max(0,Math.ceil(sec));return `${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toString().padStart(2,'0')}`;}
 updateTimerDisplay(){const e=this.modalEl?.querySelector('.focus-timer');if(e)e.textContent=this.formatTime(this.remainingSeconds);}
 updatePlayBtn(running){const e=this.modalEl?.querySelector('#focus-play-btn');if(e){e.textContent=running?'Ⅱ Пауза':'▷ Продовжити';e.setAttribute('aria-pressed',String(running));}}
 updateDOM(){if(!this.modalEl||!this.lesson)return;const step=this.lesson.practice[this.currentStepIdx];const set=(q,t)=>{const e=this.modalEl.querySelector(q);if(e)e.textContent=t;};set('.focus-step-meta',`КРОК ${this.currentStepIdx+1} З ${this.lesson.practice.length} · ТИЖДЕНЬ ${this.lesson.w}`);set('.focus-step-title',step.n);set('.focus-step-desc',step.t);this.updateTimerDisplay();this.updatePlayBtn(this.isRunning);this.modalEl.querySelector('#focus-prev-btn').disabled=this.currentStepIdx===0;this.modalEl.querySelector('#focus-next-btn').disabled=this.currentStepIdx===this.lesson.practice.length-1;}
}
window.FocusPracticeManager=FocusPracticeManager;window.focusMode=new FocusPracticeManager();
