/* ========================================================================
   TrueVoice Academy — Fullscreen Focus Practice Mode
   Distraction-Free Immersion · Giant Step Timer · Guided Voice Flow
   ======================================================================== */

class FocusPracticeManager {
  constructor() {
    this.modalEl = null;
    this.lesson = null;
    this.currentStepIdx = 0;
    this.remainingSeconds = 0;
    this.timerInterval = null;
    this.isRunning = false;
    this.onCompleteCallback = null;
  }

  init(modalElement) {
    this.modalEl = modalElement;
  }

  startSession(lesson, stepIndex = 0, onComplete) {
    this.lesson = lesson;
    this.currentStepIdx = stepIndex;
    this.onCompleteCallback = onComplete;

    if (!this.modalEl) return;
    this.modalEl.classList.add('open');

    // Parse step duration (e.g. "5 хв" -> 300s, "30 сек" -> 30s)
    this.loadStep(this.currentStepIdx);

    if (window.audioEngine) {
      window.audioEngine.startAmbientDrone();
    }
  }

  loadStep(idx) {
    this.currentStepIdx = Math.max(0, Math.min(this.lesson.practice.length - 1, idx));
    const step = this.lesson.practice[this.currentStepIdx];
    if (!step) return;

    let totalSeconds = 300; // default 5 mins
    const matchMin = step.d.match(/(\d+)\s*хв/i);
    const matchSec = step.d.match(/(\d+)\s*сек/i);
    if (matchMin) totalSeconds = parseInt(matchMin[1], 10) * 60;
    else if (matchSec) totalSeconds = parseInt(matchSec[1], 10);

    this.remainingSeconds = totalSeconds;
    this.stopTimer();

    this.updateDOM();
    this.startTimer();
  }

  startTimer() {
    if (this.isRunning) return;
    this.isRunning = true;

    this.timerInterval = setInterval(() => {
      this.remainingSeconds--;
      this.updateTimerDisplay();

      if (this.remainingSeconds <= 0) {
        this.stepCompleted();
      }
    }, 1000);

    this.updatePlayBtn(true);
  }

  stopTimer() {
    this.isRunning = false;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.updatePlayBtn(false);
  }

  toggleTimer() {
    if (this.isRunning) this.stopTimer();
    else this.startTimer();
  }

  stepCompleted() {
    this.stopTimer();
    if (window.audioEngine) {
      window.audioEngine.playCompletionChime();
    }
    if (this.onCompleteCallback) {
      this.onCompleteCallback(this.currentStepIdx);
    }

    if (this.currentStepIdx < this.lesson.practice.length - 1) {
      setTimeout(() => {
        this.loadStep(this.currentStepIdx + 1);
      }, 1500);
    } else {
      setTimeout(() => {
        alert("Практику уроку успішно завершено! Відчуй простір і легкість у голосі.");
        this.close();
      }, 1000);
    }
  }

  nextStep() {
    if (this.currentStepIdx < this.lesson.practice.length - 1) {
      this.loadStep(this.currentStepIdx + 1);
    }
  }

  prevStep() {
    if (this.currentStepIdx > 0) {
      this.loadStep(this.currentStepIdx - 1);
    }
  }

  close() {
    this.stopTimer();
    if (this.modalEl) {
      this.modalEl.classList.remove('open');
    }
  }

  formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  updateTimerDisplay() {
    if (!this.modalEl) return;
    const timerEl = this.modalEl.querySelector('.focus-timer');
    if (timerEl) {
      timerEl.textContent = this.formatTime(this.remainingSeconds);
    }
  }

  updateDOM() {
    if (!this.modalEl || !this.lesson) return;

    const step = this.lesson.practice[this.currentStepIdx];
    const metaEl = this.modalEl.querySelector('.focus-step-meta');
    const titleEl = this.modalEl.querySelector('.focus-step-title');
    const descEl = this.modalEl.querySelector('.focus-step-desc');

    if (metaEl) metaEl.textContent = `КРОК ${this.currentStepIdx + 1} З ${this.lesson.practice.length} · ТИЖДЕНЬ ${this.lesson.w} · УРОК ${this.lesson.n}`;
    if (titleEl) titleEl.textContent = step.n;
    if (descEl) descEl.textContent = step.t;

    this.updateTimerDisplay();
  }

  updatePlayBtn(isPlaying) {
    if (!this.modalEl) return;
    const playBtn = this.modalEl.querySelector('#focus-play-btn');
    if (playBtn) {
      playBtn.textContent = isPlaying ? "Пауза" : "Продовжити";
      playBtn.setAttribute("aria-pressed", isPlaying);
    }
  }
}

window.FocusPracticeManager = FocusPracticeManager;
window.focusMode = new FocusPracticeManager();
