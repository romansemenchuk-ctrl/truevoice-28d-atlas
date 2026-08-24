/* ========================================================================
   TrueVoice Academy — Web Audio Resonance Engine
   Pure Web Audio API: 432 Hz Ambient Ground Drone, Solfeggio Frequencies,
   Harmonic Tones, and Tibetan Singing Bowl Chimes.
   100% Offline, Zero external assets, instant 60fps synthesis.
   ======================================================================== */

class TrueVoiceAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.ambientGain = null;
    this.isAmbientPlaying = false;
    this.ambientNodes = [];
    this.volume = 0.6;
    this.soundEffectsEnabled = true;

    // Frequencies mapping for TrueVoice sounds and resonance centers
    this.TONES = {
      "Мммм": 432.0,   // Head / Sinuses — 432 Hz Ground
      "Хааа": 136.1,   // Heart / Chest — Earth Year / Om
      "Аааа": 256.0,   // Throat / Open — Middle C Pythagorean
      "Оооо": 194.18,  // Solar Plexus / Mid-body — Earth Day
      "Уууу": 126.22,  // Pelvis / Belly — Sun Tone / Ground
      "Шшш":  341.3,   // Liver / Release — Sub-harmonic
      "Бррр": 210.42,  // Lips / Mask — Synodic Moon
      "432Hz": 432.0,
      "528Hz": 528.0   // Solfeggio Transformation & Miracles
    };
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.ambientGain.connect(this.masterGain);
  }

  ensureContext() {
    if (!this.ctx) this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  setSoundEffects(enabled) {
    this.soundEffectsEnabled = !!enabled;
  }

  /* ── 432 Hz Healing Ground Drone ─────────────────────────────────────── */
  startAmbientDrone() {
    this.ensureContext();
    if (this.isAmbientPlaying) return;
    this.isAmbientPlaying = true;

    const t = this.ctx.currentTime;
    const baseFreq = 108.0; // 432 Hz sub-octave foundation

    // Fundamental Warm Sine (108 Hz)
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(baseFreq, t);

    // Binaural Harmonic (108.8 Hz -> gentle 0.8 Hz soothing theta beat)
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(baseFreq + 0.8, t);

    // 432 Hz Warm Harmonic overtone
    const osc3 = this.ctx.createOscillator();
    osc3.type = 'triangle';
    osc3.frequency.setValueAtTime(432.0, t);

    // Warm Lowpass Filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, t);

    // Subtle LFO for breathing filter modulation
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.12, t); // ~8 sec breathing cycle
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(120, t);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const droneMix = this.ctx.createGain();
    droneMix.gain.setValueAtTime(0.28, t);

    osc1.connect(filter);
    osc2.connect(filter);
    osc3.connect(filter);
    filter.connect(droneMix);
    droneMix.connect(this.ambientGain);

    osc1.start(t);
    osc2.start(t);
    osc3.start(t);
    lfo.start(t);

    this.ambientNodes = [osc1, osc2, osc3, lfo, lfoGain, filter, droneMix];

    // Fade in gracefully
    this.ambientGain.gain.cancelScheduledValues(t);
    this.ambientGain.gain.setValueAtTime(0.001, t);
    this.ambientGain.gain.exponentialRampToValueAtTime(0.35, t + 2.5);
  }

  stopAmbientDrone() {
    if (!this.isAmbientPlaying || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.ambientGain.gain.cancelScheduledValues(t);
    this.ambientGain.gain.setValueAtTime(this.ambientGain.gain.value, t);
    this.ambientGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);

    setTimeout(() => {
      this.ambientNodes.forEach(node => {
        try { node.stop ? node.stop() : node.disconnect(); } catch (e) {}
      });
      this.ambientNodes = [];
      this.isAmbientPlaying = false;
    }, 1300);
  }

  toggleAmbientDrone() {
    if (this.isAmbientPlaying) {
      this.stopAmbientDrone();
      return false;
    } else {
      this.startAmbientDrone();
      return true;
    }
  }

  /* ── Tibetan Singing Bowl / Bell Chime Synthesis ────────────────────── */
  playChime(pitch = 528, duration = 3.5) {
    if (!this.soundEffectsEnabled) return;
    this.ensureContext();
    const t = this.ctx.currentTime;

    // Singing bowl partials (Fundamental + inharmonic harmonics)
    const partials = [
      { ratio: 1.0,   gain: 0.5,  decay: duration },
      { ratio: 2.76,  gain: 0.25, decay: duration * 0.7 },
      { ratio: 5.4,   gain: 0.12, decay: duration * 0.4 },
      { ratio: 8.9,   gain: 0.05, decay: duration * 0.25 }
    ];

    partials.forEach(({ ratio, gain, decay }) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitch * ratio, t);

      // Tremolo micro-modulation
      const trem = this.ctx.createOscillator();
      trem.type = 'sine';
      trem.frequency.setValueAtTime(4.2, t);
      const tremG = this.ctx.createGain();
      tremG.gain.setValueAtTime(pitch * 0.015, t);
      trem.connect(tremG);
      tremG.connect(osc.frequency);

      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain * 0.4, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);

      osc.connect(g);
      g.connect(this.masterGain);

      trem.start(t);
      osc.start(t);
      osc.stop(t + decay + 0.1);
      trem.stop(t + decay + 0.1);
    });
  }

  /* ── Play Specific Resonant Tone (for 7 Sounds Matrix) ──────────────── */
  playResonanceTone(soundKey, dur = 2.8) {
    this.ensureContext();
    const freq = this.TONES[soundKey] || 432.0;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const oscHarm = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    oscHarm.type = 'triangle';
    oscHarm.frequency.setValueAtTime(freq * 2, t);

    const harmGain = this.ctx.createGain();
    harmGain.gain.setValueAtTime(0.15, t);
    oscHarm.connect(harmGain);
    harmGain.connect(g);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.2);
    g.gain.setTargetAtTime(0.25, t + 0.3, dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(g);
    g.connect(this.masterGain);

    osc.start(t);
    oscHarm.start(t);
    osc.stop(t + dur + 0.05);
    oscHarm.stop(t + dur + 0.05);
  }

  /* ── Breath Phase Audio Cue ─────────────────────────────────────────── */
  playBreathCue(phase) {
    if (!this.soundEffectsEnabled) return;
    if (phase === 'inhale') {
      this.playChime(432, 2.2); // Warm Rising
    } else if (phase === 'hold') {
      this.playChime(528, 1.8); // Sacred Bell
    } else if (phase === 'exhale') {
      this.playChime(288, 2.8); // Deep Releasing
    }
  }

  /* ── Step Complete Chime ────────────────────────────────────────────── */
  playCompletionChime() {
    if (!this.soundEffectsEnabled) return;
    this.playChime(528, 3.2);
    setTimeout(() => this.playChime(660, 3.5), 180);
  }
}

window.TrueVoiceAudioEngine = TrueVoiceAudioEngine;
window.audioEngine = new TrueVoiceAudioEngine();
