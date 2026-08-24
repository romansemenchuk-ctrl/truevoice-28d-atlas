/* ========================================================================
   TrueVoice Academy — Ambient Canvas FX Engine
   StarField Parallax · VoiceSpine Telemetry Oscillogram
   High-performance Canvas 2D, sprite-cached layers, battery-friendly rAF clamp.
   ======================================================================== */

class AmbientFXManager {
  constructor() {
    this.starCanvas = null;
    this.spineCanvas = null;
    this.starRaf = null;
    this.spineRaf = null;
    this.accentColor = '#E60012';
    this.enabled = true;
    this.spineEnabled = true;
    this.reducedMotion = false;

    this.checkReducedMotion();
  }

  checkReducedMotion() {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = mq.matches;
    mq.addEventListener?.('change', e => {
      this.reducedMotion = e.matches;
      if (this.reducedMotion) {
        this.stop();
      } else {
        this.start();
      }
    });
  }

  init(starCanvasEl, spineCanvasEl) {
    this.starCanvas = starCanvasEl;
    this.spineCanvas = spineCanvasEl;

    if (this.starCanvas && !this.reducedMotion) {
      this.initStarField();
    }
    if (this.spineCanvas && !this.reducedMotion) {
      this.initVoiceSpine();
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stop();
      } else {
        this.start();
      }
    });
  }

  setAccent(color) {
    this.accentColor = color;
  }

  setSpineVisible(visible) {
    this.spineEnabled = visible;
    const spineEl = document.querySelector('.tv-spine');
    if (spineEl) spineEl.style.display = visible ? 'flex' : 'none';
  }

  /* ── 1. StarField with Inertial Parallax & Twinkle ───────────────────── */
  initStarField() {
    const canvas = this.starCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });

    let W = 0, H = 0, DPR = 1;
    let sprites = [];
    let targetScroll = 0, easedScroll = 0;

    const LAYERS = [
      { count: 180, minR: 0.4, maxR: 0.8, baseA: 0.55, parallax: 0.05, tw: 0.5 },
      { count: 90,  minR: 0.8, maxR: 1.3, baseA: 0.42, parallax: 0.12, tw: 0.4 },
      { count: 45,  minR: 1.2, maxR: 1.8, baseA: 0.32, parallax: 0.22, tw: 0.3 }
    ];

    const bakeLayer = (layer, stars, phase) => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.floor(W * DPR));
      c.height = Math.max(1, Math.floor(H * DPR));
      const g = c.getContext('2d');
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      g.fillStyle = '#F5F5F2';
      for (const s of stars) {
        const t = 0.55 + 0.45 * Math.sin(s.phase + phase);
        g.globalAlpha = layer.baseA * (1 - layer.tw + layer.tw * t);
        g.beginPath();
        g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        g.fill();
      }
      return c;
    };

    const buildSprites = () => {
      sprites = LAYERS.map(layer => {
        const stars = Array.from({ length: layer.count }, () => ({
          x: Math.random() * W,
          y: Math.random() * H,
          r: layer.minR + Math.random() * (layer.maxR - layer.minR),
          phase: Math.random() * Math.PI * 2
        }));
        return { a: bakeLayer(layer, stars, 0), b: bakeLayer(layer, stars, Math.PI) };
      });
    };

    const resize = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      buildSprites();
    };

    const onScroll = () => {
      targetScroll = window.scrollY || 0;
    };

    const frame = now => {
      easedScroll += (targetScroll - easedScroll) * 0.085;
      const t = now * 0.001;

      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < sprites.length; i++) {
        const layer = LAYERS[i], sp = sprites[i];
        if (!sp) continue;
        let off = (-easedScroll * layer.parallax) % H;
        if (off > 0) off -= H;

        const mix = this.reducedMotion ? 1 : 0.5 + 0.5 * Math.sin(t * 0.6 + i * 1.7);
        for (let pass = 0; pass < 2; pass++) {
          const img = pass === 0 ? sp.a : sp.b;
          const alpha = pass === 0 ? mix : 1 - mix;
          if (alpha <= 0.01) continue;
          ctx.globalAlpha = alpha;
          ctx.drawImage(img, 0, off, W, H);
          ctx.drawImage(img, 0, off + H, W, H);
        }
      }
      ctx.globalAlpha = 1;
      this.starRaf = requestAnimationFrame(frame);
    };

    resize();
    onScroll();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    this.starRaf = requestAnimationFrame(frame);
  }

  /* ── 2. VoiceSpine Telemetry Oscillogram ──────────────────────────────── */
  initVoiceSpine() {
    const canvas = this.spineCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });

    let W = 0, H = 0, DPR = 1;
    let scrollY = 0, totalScroll = 1;

    const resize = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 1.75);
      W = canvas.clientWidth || 32;
      H = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };

    const onScroll = () => {
      scrollY = window.scrollY || 0;
      totalScroll = Math.max(1, (document.documentElement.scrollHeight || 0) - window.innerHeight);
    };

    const hexToRGBA = (hex, a) => {
      const h = hex.replace('#', '');
      const r = parseInt(h.length === 3 ? h[0]+h[0] : h.slice(0,2), 16);
      const g = parseInt(h.length === 3 ? h[1]+h[1] : h.slice(2,4), 16);
      const b = parseInt(h.length === 3 ? h[2]+h[2] : h.slice(4,6), 16);
      return `rgba(${r},${g},${b},${a})`;
    };

    const frame = now => {
      const t = now * 0.001;
      ctx.clearRect(0, 0, W, H);

      const axisX = W * 0.5;

      // Base central axis
      ctx.strokeStyle = 'rgba(245,245,242,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(axisX, 0);
      ctx.lineTo(axisX, H);
      ctx.stroke();

      // Oscillogram continuous wave
      ctx.beginPath();
      const segs = Math.max(50, Math.floor(H / 8));
      for (let i = 0; i <= segs; i++) {
        const f = i / segs;
        const y = f * H;
        const amp =
            Math.sin(t * 1.1 + f * 12) * 2.8
          + Math.sin(t * 2.2 + f * 24) * 1.4
          + Math.sin(t * 0.4 + f * 3)  * 2.0;
        const x = axisX + amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(201,162,39,0.28)'; // Soft gold wave
      ctx.lineWidth = 1;
      ctx.stroke();

      // Scroll Progress Head
      const prog = Math.min(1, Math.max(0, scrollY / totalScroll));
      const headY = prog * H;

      // Radial Glow Halo
      const grd = ctx.createRadialGradient(axisX, headY, 0, axisX, headY, 32);
      grd.addColorStop(0, hexToRGBA(this.accentColor, 0.65));
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(axisX - 32, headY - 32, 64, 64);

      // Core Dot
      ctx.fillStyle = hexToRGBA(this.accentColor, 0.95);
      ctx.beginPath();
      ctx.arc(axisX, headY, 2.8, 0, Math.PI * 2);
      ctx.fill();

      // Crosshair tick
      ctx.strokeStyle = hexToRGBA(this.accentColor, 0.85);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(axisX - 7, headY);
      ctx.lineTo(axisX + 7, headY);
      ctx.stroke();

      // Reference calibration marks
      for (let k = 0; k <= 10; k++) {
        const y = (k / 10) * H;
        ctx.strokeStyle = 'rgba(245,245,242,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const len = k % 5 === 0 ? 5 : 3;
        ctx.moveTo(axisX - len, y);
        ctx.lineTo(axisX + len, y);
        ctx.stroke();
      }

      this.spineRaf = requestAnimationFrame(frame);
    };

    resize();
    onScroll();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    this.spineRaf = requestAnimationFrame(frame);
  }

  stop() {
    if (this.starRaf) { cancelAnimationFrame(this.starRaf); this.starRaf = null; }
    if (this.spineRaf) { cancelAnimationFrame(this.spineRaf); this.spineRaf = null; }
  }

  start() {
    if (!this.starRaf && this.starCanvas && !this.reducedMotion) {
      this.initStarField();
    }
    if (!this.spineRaf && this.spineCanvas && !this.reducedMotion) {
      this.initVoiceSpine();
    }
  }
}

window.AmbientFXManager = AmbientFXManager;
window.ambientFX = new AmbientFXManager();
