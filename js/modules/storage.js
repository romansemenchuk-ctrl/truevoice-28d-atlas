/* ========================================================================
   TrueVoice Academy — State & LocalStorage Manager
   Tracks lesson progress, step checkmarks, student notes, bookmarks,
   streak calculations, settings preferences, and JSON backup/restore.
   ======================================================================== */

const STORAGE_KEY = "truevoice:atlas:v2";

class AtlasStorageManager {
  constructor() {
    this.state = {
      idx: 0,
      mode: "student", // "student" or "internal"
      theme: "default",
      showSpine: true,
      showStarfield: true,
      soundFX: true,
      volume: 0.6,
      done: {},      // { "1-1": { lesson: false, steps: [0, 1] } }
      notes: {},     // { "1-1": "Особисті нотатки..." }
      bookmarks: [], // ["1-1", "2-3"]
      lastVisit: new Date().toISOString(),
      streak: 1
    };

    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.state = Object.assign(this.state, parsed);
        this.calculateStreak();
      }
    } catch (e) {
      console.warn("Could not read from LocalStorage", e);
    }
  }

  save() {
    try {
      this.state.lastVisit = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn("Could not write to LocalStorage", e);
    }
  }

  getLessonKey(lesson) {
    return `${lesson.w}-${lesson.n}`;
  }

  getLessonRecord(lesson) {
    const k = this.getLessonKey(lesson);
    if (!this.state.done[k]) {
      this.state.done[k] = { lesson: false, steps: [] };
    }
    return this.state.done[k];
  }

  isLessonDone(lesson) {
    const k = this.getLessonKey(lesson);
    return !!(this.state.done[k] && this.state.done[k].lesson);
  }

  toggleLessonDone(lesson) {
    const rec = this.getLessonRecord(lesson);
    rec.lesson = !rec.lesson;
    if (rec.lesson) {
      // Mark all steps done as well
      rec.steps = lesson.practice.map((_, i) => i);
    }
    this.save();
    return rec.lesson;
  }

  isStepDone(lesson, stepIdx) {
    const rec = this.getLessonRecord(lesson);
    return rec.steps.includes(stepIdx);
  }

  toggleStepDone(lesson, stepIdx) {
    const rec = this.getLessonRecord(lesson);
    const pos = rec.steps.indexOf(stepIdx);
    if (pos < 0) {
      rec.steps.push(stepIdx);
      if (rec.steps.length === lesson.practice.length) {
        rec.lesson = true;
      }
    } else {
      rec.steps.splice(pos, 1);
      rec.lesson = false;
    }
    this.save();
    return this.isStepDone(lesson, stepIdx);
  }

  getLessonNotes(lesson) {
    const k = this.getLessonKey(lesson);
    return this.state.notes[k] || "";
  }

  saveLessonNotes(lesson, text) {
    const k = this.getLessonKey(lesson);
    this.state.notes[k] = text;
    this.save();
  }

  isBookmarked(lesson) {
    const k = this.getLessonKey(lesson);
    return this.state.bookmarks.includes(k);
  }

  toggleBookmark(lesson) {
    const k = this.getLessonKey(lesson);
    const at = this.state.bookmarks.indexOf(k);
    if (at < 0) this.state.bookmarks.push(k);
    else this.state.bookmarks.splice(at, 1);
    this.save();
    return this.isBookmarked(lesson);
  }

  getWeekCompletedCount(weekId, allLessons) {
    return allLessons.filter(l => l.w === weekId && this.isLessonDone(l)).length;
  }

  getTotalCompletedCount(allLessons) {
    return allLessons.filter(l => this.isLessonDone(l)).length;
  }

  getTotalMinutesPracticed(allLessons) {
    let total = 0;
    allLessons.forEach(l => {
      const rec = this.getLessonRecord(l);
      l.practice.forEach((p, idx) => {
        if (rec.steps.includes(idx)) {
          const matchMin = p.d.match(/(\d+)\s*хв/i);
          if (matchMin) total += parseInt(matchMin[1], 10);
        }
      });
    });
    return total;
  }

  calculateStreak() {
    // Basic daily streak counter based on lastVisit
    const last = new Date(this.state.lastVisit || Date.now());
    const now = new Date();
    const diffHours = Math.abs(now - last) / 36e5;

    if (diffHours < 36 && diffHours >= 18) {
      this.state.streak = (this.state.streak || 1) + 1;
    } else if (diffHours >= 36) {
      this.state.streak = 1;
    }
  }

  exportDataJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `truevoice-atlas-backup-${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  importDataJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && typeof parsed === 'object') {
        this.state = Object.assign(this.state, parsed);
        this.save();
        return true;
      }
    } catch (e) {
      console.warn("Invalid backup JSON", e);
    }
    return false;
  }

  resetProgress() {
    this.state.done = {};
    this.state.notes = {};
    this.state.bookmarks = [];
    this.state.streak = 1;
    this.save();
  }
}

window.AtlasStorageManager = AtlasStorageManager;
window.atlasStorage = new AtlasStorageManager();
