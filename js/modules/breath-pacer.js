/* TrueVoice: monotonic, pausable breath guide. Visual pacing, not a medical protocol. */
class BreathPacer {
  constructor() {
    this.PATTERNS = {
      coherent: {name:'Без затримок · 5 / 5', counts:[5,0,5,0]},
      box4: {name:'Квадрат · 4 / 4 / 4 / 4', counts:[4,4,4,4]},
      box6: {name:'Самаврітті · 6 / 6 / 6 / 6', counts:[6,6,6,6]},
      relax478: {name:'Ритм · 4 / 7 / 8', counts:[4,7,8,0]}
    };
    this.currentPattern = [5,0,5,0];
    this.phaseLabels = ['ВДИХ','ПАУЗА ПІСЛЯ ВДИХУ','ВИДИХ','ПАУЗА ПІСЛЯ ВИДИХУ'];
    this.phaseClasses = ['inhale','hold','exhale','hold'];
    this.currentPhase=0; this.currentCount=5; this.elapsed=0; this.isRunning=false;
    this.activeEl=null; this.timer=null; this.lastPhase=-1; this.cycle=0;
    this.motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.stop();});
    window.addEventListener('pagehide',()=>this.stop());
  }
  setPattern(key) {
    const p=this.PATTERNS[key]; if(!p)return false;
    this.currentPattern=[...p.counts]; this.reset(); return true;
  }
  setCounts(counts) {
    if(!Array.isArray(counts)||counts.length!==4||!counts.every(n=>Number.isFinite(n)&&n>=0&&n<=60)||counts[0]<=0||counts[2]<=0)return false;
    this.currentPattern=[...counts];this.reset();return true;
  }
  start(el) {
    if(el)this.activeEl=el;
    if(this.isRunning||!this.activeEl?.isConnected)return;
    this.isRunning=true;this.anchor=performance.now();this.lastPhase=-1;
    window.audioEngine?.ensureContext();this.tick(this.anchor);this.syncButton();
  }
  stop() {
    if(this.isRunning)this.elapsed+=performance.now()-this.anchor;
    this.isRunning=false;cancelAnimationFrame(this.timer);this.timer=null;
    this.activeEl?.classList.add('is-paused');this.updateDOM(this.elapsed);this.syncButton();
  }
  reset() {this.stop();this.elapsed=0;this.currentPhase=0;this.currentCount=this.currentPattern[0];this.lastPhase=-1;this.updateDOM(0);}
  toggle(el) {if(this.isRunning)this.stop();else this.start(el);return this.isRunning;}
  position(ms) {
    const total=this.currentPattern.reduce((a,b)=>a+b,0)*1000;
    let at=((ms%total)+total)%total;this.cycle=Math.floor(ms/total);
    for(let i=0;i<4;i++){const d=this.currentPattern[i]*1000;if(d>0&&at<d)return {phase:i,progress:at/d,remaining:Math.max(1,Math.ceil((d-at)/1000))};at-=d;}
    return {phase:0,progress:0,remaining:this.currentPattern[0]};
  }
  tick(now) {
    if(!this.isRunning)return;
    if(!this.activeEl?.isConnected||document.hidden){this.stop();return;}
    this.updateDOM(this.elapsed+now-this.anchor);
    this.timer=requestAnimationFrame(t=>this.tick(t));
  }
  updateDOM(ms=this.elapsed) {
    if(!this.activeEl)return;
    const s=this.position(ms);this.currentPhase=s.phase;this.currentCount=s.remaining;
    const label=this.activeEl.querySelector('.pacer-phase-label');
    const count=this.activeEl.querySelector('.pacer-counter');
    const circle=this.activeEl.querySelector('.pacer-circle');
    if(count&&count.textContent!==String(s.remaining))count.textContent=s.remaining;
    if(label&&label.textContent!==this.phaseLabels[s.phase])label.textContent=this.phaseLabels[s.phase];
    const expansion=s.phase===0?s.progress:s.phase===1?1:s.phase===2?1-s.progress:0;
    this.activeEl.dataset.breathPhase=String(s.phase);
    this.activeEl.dispatchEvent(new CustomEvent('atlas:breath-frame',{detail:{phase:s.phase,progress:s.progress,expansion,remaining:s.remaining,running:this.isRunning,reduced:this.motion.matches}}));
    this.activeEl.style.setProperty('--breath',this.motion.matches?0.5:expansion.toFixed(4));
    this.activeEl.style.setProperty('--phase-progress',`${(s.progress*100).toFixed(2)}%`);
    this.activeEl.classList.toggle('is-paused',!this.isRunning);
    if(circle)circle.dataset.phase=this.phaseClasses[s.phase];
    this.activeEl.querySelectorAll('.bs-seg,.bs-dot').forEach(e=>e.classList.toggle('is-current',Number(e.dataset.i)===s.phase));
    const n=this.activeEl.querySelector('.bs-num'), l=this.activeEl.querySelector('.bs-phase');
    if(n)n.textContent=s.remaining;if(l)l.textContent=this.phaseLabels[s.phase];
    if(this.lastPhase!==s.phase){
      if(this.isRunning)window.audioEngine?.playBreathCue(this.phaseClasses[s.phase]);
      this.lastPhase=s.phase;
    }
  }
  syncButton(){const b=this.activeEl?.querySelector('[data-pacer-toggle]');if(b){b.textContent=this.isRunning?'Ⅱ Пауза':'▷ Почати / продовжити';b.setAttribute('aria-pressed',String(this.isRunning));}}
}
window.BreathPacer=BreathPacer;window.breathPacer=new BreathPacer();
