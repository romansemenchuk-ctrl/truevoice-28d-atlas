/* Synthetic listening references, not organ frequencies, vowel recordings or treatment. */
class TrueVoiceAudioEngine {
  constructor(){
    this.ctx=null;this.masterGain=null;this.volume=.6;this.soundEffectsEnabled=true;this.isAmbientPlaying=false;this.ambientNodes=[];this.group=null;
    this.TONES={'Мммм':432,'Хааа':136.1,'Аааа':256,'Оооо':194.18,'Уууу':126.22,'Шшш':341.3,'Бррр':210.42,'432Hz':432,'528Hz':528};
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.stopAmbientDrone();});
    window.addEventListener('pagehide',()=>this.stopAmbientDrone());
  }
  init(){
    if(this.ctx)return true;const C=window.AudioContext||window.webkitAudioContext;if(!C)return false;
    try{this.ctx=new C();this.masterGain=this.ctx.createGain();this.masterGain.gain.value=this.volume;this.masterGain.connect(this.ctx.destination);return true;}catch(e){console.warn('Audio unavailable',e);return false;}
  }
  ensureContext(){if(!this.init())return false;if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});return this.ctx.state!=='closed';}
  setVolume(v){this.volume=Math.max(0,Math.min(1,Number(v)||0));if(this.ctx&&this.masterGain)this.masterGain.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.05);}
  setSoundEffects(enabled){this.soundEffectsEnabled=!!enabled;}
  emit(){window.dispatchEvent(new CustomEvent('atlas:audio-state',{detail:{playing:this.isAmbientPlaying}}));}
  startAmbientDrone(){
    if(this.isAmbientPlaying||!this.ensureContext())return false;
    const t=this.ctx.currentTime,g=this.ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.045,t+1.5);g.connect(this.masterGain);
    const nodes=[108,108.8,432].map(f=>{const o=this.ctx.createOscillator();o.type='sine';o.frequency.value=f;o.connect(g);o.start();return o;});
    this.group={gain:g,nodes};this.ambientGain=g;this.ambientNodes=nodes;this.isAmbientPlaying=true;this.emit();return true;
  }
  stopAmbientDrone(){
    if(!this.group)return;const old=this.group;this.group=null;this.isAmbientPlaying=false;this.ambientNodes=[];this.emit();
    const t=this.ctx.currentTime;old.gain.gain.cancelScheduledValues(t);old.gain.gain.setValueAtTime(Math.max(.0001,old.gain.gain.value),t);old.gain.gain.exponentialRampToValueAtTime(.0001,t+.35);
    old.nodes.forEach(o=>{try{o.stop(t+.4);o.onended=()=>o.disconnect();}catch(e){o.disconnect();}});setTimeout(()=>old.gain.disconnect(),500);
  }
  toggleAmbientDrone(){if(this.isAmbientPlaying){this.stopAmbientDrone();return false;}return this.startAmbientDrone();}
  tone(freq,duration=1.5,gain=.08){
    if(!this.soundEffectsEnabled||!this.ensureContext()||document.hidden)return;
    const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.frequency.value=freq;o.type='sine';
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+.025);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(g);g.connect(this.masterGain);o.onended=()=>{o.disconnect();g.disconnect();};o.start(t);o.stop(t+duration+.05);
  }
  playChime(pitch=528,duration=1.5){this.tone(pitch,duration,.07);this.tone(pitch*2.76,duration*.65,.025);}
  playResonanceTone(key,duration=2){this.tone(this.TONES[key]||432,duration,.11);}
  playBreathCue(phase){this.playChime(phase==='inhale'?432:phase==='exhale'?288:528,.7);}
  playCompletionChime(){this.playChime(528,1.5);setTimeout(()=>this.playChime(660,1.6),180);}
}
window.TrueVoiceAudioEngine=TrueVoiceAudioEngine;window.audioEngine=new TrueVoiceAudioEngine();
