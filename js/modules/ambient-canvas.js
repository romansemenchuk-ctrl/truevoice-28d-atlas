/* One animation loop and one listener set. Decorative wave, not live voice telemetry. */
class AmbientFXManager {
  constructor(){this.starCanvas=null;this.spineCanvas=null;this.raf=null;this.enabled=true;this.spineEnabled=true;this.accentColor='#E60012';this.last=0;this.initialized=false;this.motion=matchMedia('(prefers-reduced-motion: reduce)');this.reducedMotion=this.motion.matches;}
  init(star,spine){
    if(this.initialized)return;this.initialized=true;this.starCanvas=star;this.spineCanvas=spine;
    this.stars=Array.from({length:130},()=>({x:Math.random(),y:Math.random(),r:0.4+Math.random(),p:Math.random()*6.28}));
    this.resize=()=>{for(const c of [this.starCanvas,this.spineCanvas]){if(!c)continue;const d=Math.min(devicePixelRatio||1,1.5);c.width=Math.max(1,Math.round(c.clientWidth*d));c.height=Math.max(1,Math.round(c.clientHeight*d));}this.draw(performance.now());};
    window.addEventListener('resize',this.resize,{passive:true});
    document.addEventListener('visibilitychange',()=>document.hidden?this.stop():this.start());
    this.motion.addEventListener('change',e=>{this.reducedMotion=e.matches;this.stop();this.draw(0);if(!e.matches)this.start();});
    window.addEventListener('pagehide',()=>this.stop());this.resize();this.start();
  }
  setAccent(c){if(/^#[0-9a-f]{6}$/i.test(c))this.accentColor=c;this.draw(0);}
  setSpineVisible(v){this.spineEnabled=!!v;const e=document.querySelector('.tv-spine');if(e)e.style.display=v?'flex':'none';this.resize?.();this.sync();}
  setStarfieldVisible(v){this.enabled=!!v;if(this.starCanvas)this.starCanvas.style.display=v?'block':'none';this.sync();}
  sync(){this.stop();if(this.enabled||this.spineEnabled)this.start();}
  start(){if(this.raf!==null||document.hidden||this.reducedMotion||!(this.enabled||this.spineEnabled))return;const frame=t=>{this.raf=null;if(document.hidden||this.reducedMotion)return;if(t-this.last>=33){this.draw(t);this.last=t;}this.raf=requestAnimationFrame(frame);};this.raf=requestAnimationFrame(frame);}
  stop(){cancelAnimationFrame(this.raf);this.raf=null;}
  draw(now){
    const t=this.reducedMotion?0:now/1000;
    if(this.starCanvas&&this.enabled){const c=this.starCanvas,g=c.getContext('2d');if(g){g.clearRect(0,0,c.width,c.height);g.fillStyle='#f5efe8';for(const s of this.stars){g.globalAlpha=.16+.17*(1+Math.sin(t*.4+s.p));g.beginPath();g.arc(s.x*c.width,s.y*c.height,s.r,0,Math.PI*2);g.fill();}g.globalAlpha=1;}}
    if(this.spineCanvas&&this.spineEnabled){const c=this.spineCanvas,g=c.getContext('2d');if(!g)return;const w=c.width,h=c.height,x=w/2;g.clearRect(0,0,w,h);g.strokeStyle='#c9a22766';g.lineWidth=1;g.beginPath();for(let y=0;y<=h;y+=6){const a=Math.sin(y*.025+t)*3+Math.sin(y*.008-t)*2;y===0?g.moveTo(x+a,y):g.lineTo(x+a,y);}g.stroke();const p=Math.max(0,Math.min(1,scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight)));g.fillStyle=this.accentColor;g.beginPath();g.arc(x,Math.max(4,Math.min(h-4,p*h)),3,0,Math.PI*2);g.fill();}
  }
}
window.AmbientFXManager=AmbientFXManager;window.ambientFX=new AmbientFXManager();
