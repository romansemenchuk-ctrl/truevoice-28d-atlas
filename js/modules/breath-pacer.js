/* ========================================================================
   TrueVoice Academy — Interactive Breath Pacer
   Visual Morphing Geometry · Audio Chimes · Phase Announcements
   Supports Box Breathing (4-4-4-4), Samavritti (6-6-6-6), Coherent (5-5), 4-7-8
   ======================================================================== */

class BreathPacer {
  constructor() {
    this.timer = null;
    this.currentPattern = [4, 4, 4, 4]; // Inhale, Hold, Exhale, Hold
    this.phaseLabels = ["ВДИХ", "ЗАТРИМКА", "ВИДИХ", "ЗАТРИМКА"];
    this.phaseClasses = ["inhale", "hold", "exhale", "hold"];
    this.currentPhase = 0;
    this.currentCount = 4;
    this.isRunning = false;
    this.activeEl = null;

    this.PATTERNS = {
      "box4":     { name: "Квадрат 4·4·4·4", counts: [4, 4, 4, 4] },
      "box6":     { name: "Самаврітті 6·6·6·6", counts: [6, 6, 6, 6] },
      "coherent": { name: "Когерентне 5·5", counts: [5, 0, 5, 0] },
      "relax478": { name: "Релакс 4·7·8", counts: [4, 7, 8, 0] }
    };
  }

  setPattern(patternKey) {
    const p = this.PATTERNS[patternKey];
    if (p) {
      this.currentPattern = [...p.counts];
      this.reset();
    }
  }

  start(containerEl) {
    this.activeEl = containerEl;
    if (this.isRunning) return;
    this.isRunning = true;
    this.currentPhase = 0;
    this.currentCount = this.currentPattern[0];

    if (window.audioEngine) {
      window.audioEngine.ensureContext();
    }

    this.tick();
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.activeEl) {
      const circle = this.activeEl.querySelector('.pacer-circle');
      if (circle) circle.className = 'pacer-circle';
    }
  }

  reset() {
    this.stop();
    this.currentPhase = 0;
    this.currentCount = this.currentPattern[0] || 4;
    this.updateDOM();
  }

  toggle(containerEl) {
    if (this.isRunning) {
      this.stop();
      return false;
    } else {
      this.start(containerEl);
      return true;
    }
  }

  tick() {
    if (!this.isRunning) return;

    // Check if we need to skip 0-duration phases (e.g. in 5-0-5-0)
    if (this.currentPattern[this.currentPhase] === 0) {
      this.advancePhase();
      return;
    }

    this.updateDOM();

    // Trigger audio chime & haptic on phase start
    if (this.currentCount === this.currentPattern[this.currentPhase]) {
      const phaseType = this.phaseClasses[this.currentPhase];
      if (window.audioEngine) {
        window.audioEngine.playBreathCue(phaseType);
      }
      if (navigator.vibrate) {
        try { navigator.vibrate(25); } catch (e) {}
      }
    }

    this.timer = setTimeout(() => {
      this.currentCount--;
      if (this.currentCount <= 0) {
        this.advancePhase();
      } else {
        this.tick();
      }
    }, 1000);
  }

  advancePhase() {
    this.currentPhase = (this.currentPhase + 1) % 4;
    while (this.currentPattern[this.currentPhase] === 0) {
      this.currentPhase = (this.currentPhase + 1) % 4;
    }
    this.currentCount = this.currentPattern[this.currentPhase];
    this.tick();
  }

  updateDOM() {
    if (!this.activeEl) return;

    const counterEl = this.activeEl.querySelector('.pacer-counter');
    const phaseEl = this.activeEl.querySelector('.pacer-phase-label');
    const circleEl = this.activeEl.querySelector('.pacer-circle');

    if (counterEl) counterEl.textContent = this.currentCount;
    if (phaseEl) phaseEl.textContent = this.phaseLabels[this.currentPhase];
    if (circleEl) {
      circleEl.className = `pacer-circle ${this.phaseClasses[this.currentPhase]}`;
    }
  }
}

window.BreathPacer = BreathPacer;
window.breathPacer = new BreathPacer();
