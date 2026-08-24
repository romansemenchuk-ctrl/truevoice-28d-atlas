/* ========================================================================
   TrueVoice Academy — Voice Journey Audio Recorder
   HTML5 MediaRecorder · Live Audio Analyzer Canvas · Voice Evolution Tracker
   Saves vocal samples locally for Day 1 vs Day 7 vs Day 28 audio comparisons.
   ======================================================================== */

class VoiceJourneyRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.stream = null;
    this.audioCtx = null;
    this.analyser = null;
    this.animId = null;
    this.canvas = null;
    this.db = null;

    this.initDB();
  }

  initDB() {
    const req = indexedDB.open("TrueVoiceRecordings", 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("samples")) {
        db.createObjectStore("samples", { keyPath: "id" });
      }
    };
    req.onsuccess = e => {
      this.db = e.target.result;
    };
  }

  async startRecording(canvasEl) {
    this.canvas = canvasEl;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];

      this.mediaRecorder = new MediaRecorder(this.stream);
      this.mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.start();
      this.isRecording = true;

      // Start live visualizer
      this.startVisualizer();
      return true;
    } catch (err) {
      console.warn("Microphone access denied or unsupported", err);
      alert("Для запису голосу потрібен доступ до мікрофона. Будь ласка, надайте дозвіл у налаштуваннях браузера.");
      return false;
    }
  }

  stopRecording(lessonKey) {
    return new Promise(resolve => {
      if (!this.mediaRecorder || !this.isRecording) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const recordId = `rec_${lessonKey}_${Date.now()}`;
        const recordData = {
          id: recordId,
          lessonKey: lessonKey,
          date: new Date().toISOString(),
          blob: blob
        };

        await this.saveSample(recordData);
        this.stopVisualizer();

        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
          this.stream = null;
        }

        this.isRecording = false;
        resolve(recordData);
      };

      this.mediaRecorder.stop();
    });
  }

  startVisualizer() {
    if (!this.canvas || !this.stream) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioContext();
    const source = this.audioCtx.createMediaStreamSource(this.stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const ctx = this.canvas.getContext('2d');

    const draw = () => {
      this.animId = requestAnimationFrame(draw);
      this.analyser.getByteFrequencyData(dataArray);

      const W = this.canvas.width = this.canvas.clientWidth;
      const H = this.canvas.height = this.canvas.clientHeight;

      ctx.clearRect(0, 0, W, H);
      const barWidth = (W / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * H * 0.9;
        const grad = ctx.createLinearGradient(0, H - barHeight, 0, H);
        grad.addColorStop(0, '#E60012');
        grad.addColorStop(1, '#7A0818');

        ctx.fillStyle = grad;
        ctx.fillRect(x, H - barHeight, barWidth - 1, barHeight);
        x += barWidth;
      }
    };

    draw();
  }

  stopVisualizer() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
    if (this.canvas) {
      const ctx = this.canvas.getContext('2d');
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  saveSample(recordData) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }
      const tx = this.db.transaction("samples", "readwrite");
      const store = tx.objectStore("samples");
      store.put(recordData);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  getSamplesForLesson(lessonKey) {
    return new Promise(resolve => {
      if (!this.db) {
        resolve([]);
        return;
      }
      const tx = this.db.transaction("samples", "readonly");
      const store = tx.objectStore("samples");
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result || []).filter(r => r.lessonKey === lessonKey);
        resolve(list);
      };
      req.onerror = () => resolve([]);
    });
  }

  getAllSamples() {
    return new Promise(resolve => {
      if (!this.db) {
        resolve([]);
        return;
      }
      const tx = this.db.transaction("samples", "readonly");
      const store = tx.objectStore("samples");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  deleteSample(id) {
    return new Promise(resolve => {
      if (!this.db) { resolve(); return; }
      const tx = this.db.transaction("samples", "readwrite");
      tx.objectStore("samples").delete(id);
      tx.oncomplete = () => resolve();
    });
  }
}

window.VoiceJourneyRecorder = VoiceJourneyRecorder;
window.voiceRecorder = new VoiceJourneyRecorder();
