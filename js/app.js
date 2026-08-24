/* ========================================================================
   TrueVoice Academy — 28D Somatic Voice Atlas Master Application
   Main Controller · UI Rendering · Routing · Search · Hotkeys · Audio/Timer Sync
   ======================================================================== */

(function () {
  "use strict";

  const storage = window.atlasStorage;
  const audio = window.audioEngine;
  const ambient = window.ambientFX;
  const pacer = window.breathPacer;
  const focus = window.focusMode;
  const recorder = window.voiceRecorder;

  const WEEKS = window.WEEKS_DATA;
  const LESSONS = window.LESSONS_DATA;
  const SCHEMAS = window.SCHEMAS_REGISTRY;

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const esc = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let currentQuery = "";
  let activeFilterChip = null;
  let stepTimers = {}; // { stepIdx: { remaining, interval, running } }
  let breathPulseTimer = null;

  const getCurLesson = () => LESSONS[storage.state.idx] || LESSONS[0];

  /* ── 1. Toast Notification Helper ────────────────────────────────────── */
  function showToast(message, icon = "✓") {
    const container = $("#toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<span style="color:var(--accent-lit);font-weight:700">${icon}</span> <span>${esc(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  /* ── 2. Render Progress HUD & Stats ─────────────────────────────────── */
  function renderHUD() {
    const totalDone = storage.getTotalCompletedCount(LESSONS);
    const pct = Math.round((totalDone / LESSONS.length) * 100);
    const totalMins = storage.getTotalMinutesPracticed(LESSONS);

    const hudDone = $("#hud-done-val");
    const hudPct = $("#hud-pct-val");
    const hudMins = $("#hud-mins-val");
    const hudStreak = $("#hud-streak-val");

    if (hudDone) hudDone.textContent = `${totalDone} / 28`;
    if (hudPct) hudPct.textContent = `${pct}%`;
    if (hudMins) hudMins.textContent = `${totalMins} хв`;
    if (hudStreak) hudStreak.textContent = `${storage.state.streak || 1} дн`;
  }

  /* ── 3. Render Week Navigation Tabs ─────────────────────────────────── */
  function renderWeeks() {
    const curW = getCurLesson().w;
    const container = $("#weeks");
    if (!container) return;

    container.innerHTML = WEEKS.map(w => {
      const isSelected = curW === w.id;
      const countDone = storage.getWeekCompletedCount(w.id, LESSONS);
      const pct = (countDone / 7) * 100;

      return `
        <button class="week-tab" role="tab" id="tab-w${w.id}" aria-selected="${isSelected}"
          aria-controls="pane" tabindex="${isSelected ? 0 : -1}" data-w="${w.id}">
          <div class="week-head">
            <span class="week-n">ТИЖДЕНЬ ${w.id}</span>
            <span class="week-count mono">${countDone}/7 ✓</span>
          </div>
          <span class="week-t">${esc(w.title)}</span>
          <span class="week-bar"><i style="width:${pct}%"></i></span>
        </button>`;
    }).join("");
  }

  /* ── 4. Render Desktop Rail & Mobile Selector ───────────────────────── */
  function renderRail() {
    const curL = getCurLesson();
    const curW = curL.w;
    const weekMeta = WEEKS.find(x => x.id === curW);
    const items = LESSONS.filter(l => l.w === curW);

    const rail = $("#rail");
    if (rail && weekMeta) {
      rail.innerHTML = `
        <div class="rail-head">
          <div class="rail-title">${esc(weekMeta.title)}</div>
          <div class="rail-subtitle">${esc(weekMeta.sub)}</div>
        </div>
        ${items.map(l => {
          const globalIdx = LESSONS.indexOf(l);
          const isCurrent = globalIdx === storage.state.idx;
          const isDone = storage.isLessonDone(l);
          const isBm = storage.isBookmarked(l);
          const mins = l.practice.reduce((a, p) => a + (parseInt(p.d, 10) || 0), 0);

          return `
            <button class="lesson-btn${isDone ? " done" : ""}" data-idx="${globalIdx}" aria-current="${isCurrent}">
              <span class="lesson-num">${l.w}.${l.n}</span>
              <div class="lesson-content">
                <div class="lesson-t">${esc(l.title)}</div>
                <div class="lesson-dur mono">${mins} хв ${isBm ? "★" : ""}</div>
              </div>
              <span class="tick">${isDone ? "✓" : ""}</span>
            </button>`;
        }).join("")}`;
    }

    const mobileSelect = $("#mobile-pick");
    if (mobileSelect) {
      mobileSelect.innerHTML = LESSONS.map((l, i) => {
        const isDone = storage.isLessonDone(l);
        return `<option value="${i}"${i === storage.state.idx ? " selected" : ""}>
          ${l.w}.${l.n} · ${l.title} ${isDone ? "✓" : ""}
        </option>`;
      }).join("");
    }
  }

  /* ── 5. Render Main Lesson Content ──────────────────────────────────── */
  function renderLessonPane() {
    const l = getCurLesson();
    const r = storage.getLessonRecord(l);
    const isStudent = storage.state.mode === "student";
    const isBm = storage.isBookmarked(l);
    const notesText = storage.getLessonNotes(l);
    const totalPracticeMins = l.practice.reduce((a, p) => a + (parseInt(p.d, 10) || 0), 0);

    const schemasHTML = (l.s || []).map(k => {
      const s = SCHEMAS[k];
      if (!s) return "";
      return `<figure class="schema${s.wide ? " wide" : ""}">${s.h()}<figcaption>${esc(s.c)}</figcaption></figure>`;
    }).join("");

    const pane = $("#pane");
    if (!pane) return;

    pane.innerHTML = `
      <article>
        <header class="pane-head">
          <div class="meta-row">
            <span class="eyebrow">ТИЖДЕНЬ ${l.w} · УРОК ${l.n}</span>
            <span class="dot-sep"></span>
            <span class="eyebrow mono">${totalPracticeMins} ХВ ПРАКТИКИ</span>
            ${r.lesson ? `<span class="dot-sep"></span><span class="eyebrow" style="color:var(--ok)">ПРОЙДЕНО ✓</span>` : ""}
            ${isBm ? `<span class="dot-sep"></span><span class="eyebrow" style="color:var(--sacred-lit)">У ЗАКЛАДКАХ ★</span>` : ""}
          </div>

          <h1 class="lesson-title">${esc(l.title)}</h1>

          <div class="sense-quote">
            <p>${esc(l.sense)}</p>
          </div>

          <div class="actions-row">
            <button class="btn primary" id="btn-mark-done" aria-pressed="${r.lesson}">
              ${r.lesson ? "✓ Урок пройдено" : "Позначити пройденим"}
            </button>
            <button class="btn gold" id="btn-focus-mode" title="Запустити тренування у повноекранному режимі">
              ▶ Режим практики
            </button>
            <button class="btn" id="btn-bookmark" title="Зберегти урок в обране">
              ${isBm ? "★ В обраному" : "☆ Зберегти"}
            </button>
            <button class="btn" id="btn-voice-rec" title="Записати голос до/після практики">
              🎙 Запис голосу
            </button>
            <button class="btn" id="btn-print-lesson" title="Роздрукувати урок для практики">
              Друк
            </button>
          </div>
        </header>

        ${!isStudent && l.pain ? `
          <section class="section">
            <div class="section-head"><span class="eyebrow">Звʼязок з болями ЦА (Методологія)</span></div>
            <div class="pain-box"><p>${esc(l.pain)}</p></div>
          </section>` : ""}

        <section class="section">
          <div class="section-head">
            <span class="eyebrow">Теорія та наукова основа</span>
            <span class="count mono">${l.theory.length} блоки</span>
          </div>
          <div class="cards-grid${l.theory.length > 2 ? " two" : ""}">
            ${l.theory.map(t => `
              <div class="theory-card">
                <h3>${esc(t.l)}</h3>
                <p>${esc(t.t)}</p>
              </div>`).join("")}
          </div>
        </section>

        ${schemasHTML ? `
          <section class="section">
            <div class="section-head"><span class="eyebrow">Анатомічні схеми та резонатори</span></div>
            <div class="schemas-grid">${schemasHTML}</div>
          </section>` : ""}

        <section class="section">
          <div class="section-head">
            <span class="eyebrow">Покрокова практика</span>
            <span class="count mono">${totalPracticeMins} хв</span>
          </div>
          <div class="cards-grid">
            ${l.practice.map((p, i) => {
              const isDone = r.steps.includes(i);
              return `
                <div class="step-card${isDone ? " done" : ""}" id="step-card-${i}">
                  <button class="step-check-btn" data-step="${i}" aria-pressed="${isDone}"
                    aria-label="${isDone ? "Зняти відмітку" : "Позначити виконаним"}: ${esc(p.n)}">
                    ${isDone ? "✓" : "○"}
                  </button>
                  <div class="step-body">
                    <div class="step-top">
                      <span class="step-name">${esc(p.n)}</span>
                      <span class="step-dur-badge mono">${esc(p.d)}</span>
                    </div>
                    <p>${esc(p.t)}</p>
                    <div class="step-timer-row">
                      <span class="timer-pill mono" id="timer-display-${i}">${p.d}</span>
                      <button class="timer-btn" data-timer-toggle="${i}">▶ Старт таймера</button>
                      <button class="timer-btn" data-timer-reset="${i}">Скинути</button>
                    </div>
                  </div>
                </div>`;
            }).join("")}
          </div>
        </section>

        <section class="section">
          <div class="section-head"><span class="eyebrow">Завдання на день</span></div>
          <div class="hw-box">${esc(l.hw)}</div>
        </section>

        <section class="section">
          <div class="section-head"><span class="eyebrow">Особистий щоденник уроку</span></div>
          <div class="notes-box">
            <textarea class="notes-textarea" id="lesson-notes-input" placeholder="Запиши відчуття в тілі, висоту тону, зміни після практики...">${esc(notesText)}</textarea>
            <div class="notes-footer">
              <span>Автоматично зберігається у пам'яті браузера</span>
              <span class="mono" id="notes-save-status">Збережено</span>
            </div>
          </div>
        </section>

        <nav class="pager" aria-label="Навігація по уроках">
          <button class="btn" id="btn-prev-lesson"${storage.state.idx === 0 ? " disabled" : ""}>← Попередній</button>
          <span class="pager-pos mono">УРОК ${storage.state.idx + 1} З ${LESSONS.length}</span>
          <button class="btn" id="btn-next-lesson"${storage.state.idx === LESSONS.length - 1 ? " disabled" : ""}>Наступний →</button>
        </nav>
      </article>`;

    bindLessonEvents(l);
    startBreathSquareAnimation();
  }

  /* ── 6. Bind Lesson Events & Timers ─────────────────────────────────── */
  function bindLessonEvents(l) {
    // Mark Lesson Done
    const btnMark = $("#btn-mark-done");
    if (btnMark) {
      btnMark.onclick = () => {
        const isDone = storage.toggleLessonDone(l);
        if (isDone && audio) audio.playCompletionChime();
        showToast(isDone ? "Урок позначено як пройдений!" : "Статус уроку змінено");
        renderAll();
      };
    }

    // Bookmark
    const btnBm = $("#btn-bookmark");
    if (btnBm) {
      btnBm.onclick = () => {
        const isBm = storage.toggleBookmark(l);
        showToast(isBm ? "Додано до закладок ★" : "Видалено із закладок");
        renderAll();
      };
    }

    // Focus Mode
    const btnFocus = $("#btn-focus-mode");
    if (btnFocus) {
      btnFocus.onclick = () => {
        focus.startSession(l, 0, stepIdx => {
          storage.toggleStepDone(l, stepIdx);
          renderAll();
        });
      };
    }

    // Voice Recorder Modal
    const btnVoiceRec = $("#btn-voice-rec");
    if (btnVoiceRec) {
      btnVoiceRec.onclick = () => openVoiceRecorderModal(l);
    }

    // Print
    const btnPrint = $("#btn-print-lesson");
    if (btnPrint) {
      btnPrint.onclick = () => window.print();
    }

    // Step checkboxes
    $$("[data-step]").forEach(btn => {
      btn.onclick = () => {
        const stepIdx = parseInt(btn.dataset.step, 10);
        const isDone = storage.toggleStepDone(l, stepIdx);
        if (isDone && audio) audio.playCompletionChime();
        renderAll();
      };
    });

    // Step Timers
    $$("[data-timer-toggle]").forEach(btn => {
      btn.onclick = () => {
        const stepIdx = parseInt(btn.dataset.timerToggle, 10);
        toggleStepTimer(l, stepIdx);
      };
    });

    $$("[data-timer-reset]").forEach(btn => {
      btn.onclick = () => {
        const stepIdx = parseInt(btn.dataset.timerReset, 10);
        resetStepTimer(l, stepIdx);
      };
    });

    // Sound Tone Player Buttons in 7 Sounds Matrix
    $$(".sound-play-btn").forEach(btn => {
      btn.onclick = () => {
        const soundKey = btn.dataset.sound;
        if (audio) {
          audio.playResonanceTone(soundKey);
          btn.style.color = "var(--accent-lit)";
          setTimeout(() => btn.style.color = "", 1000);
        }
      };
    });

    // Interactive Zone Clicks on Anatomical SVG Plates
    $$(".interactive-zone").forEach(zone => {
      zone.onclick = () => {
        const sound = zone.dataset.sound;
        if (audio && sound) {
          audio.playResonanceTone(sound);
          showToast(`Резонанс зони: ${zone.dataset.zone.toUpperCase()} (${sound})`, "♪");
        }
      };
    });

    // Notes auto-save with debounce
    const notesInput = $("#lesson-notes-input");
    const notesStatus = $("#notes-save-status");
    let noteSaveTimeout = null;
    if (notesInput) {
      notesInput.oninput = () => {
        if (notesStatus) notesStatus.textContent = "Збереження...";
        clearTimeout(noteSaveTimeout);
        noteSaveTimeout = setTimeout(() => {
          storage.saveLessonNotes(l, notesInput.value);
          if (notesStatus) notesStatus.textContent = "Збережено";
        }, 600);
      };
    }

    // Pager Prev/Next
    const prevBtn = $("#btn-prev-lesson");
    const nextBtn = $("#btn-next-lesson");
    if (prevBtn) prevBtn.onclick = () => gotoLesson(storage.state.idx - 1);
    if (nextBtn) nextBtn.onclick = () => gotoLesson(storage.state.idx + 1);
  }

  /* ── 7. Individual Step Timer Management ────────────────────────────── */
  function parseStepSeconds(durStr) {
    const minM = durStr.match(/(\d+)\s*хв/i);
    const secM = durStr.match(/(\d+)\s*сек/i);
    if (minM) return parseInt(minM[1], 10) * 60;
    if (secM) return parseInt(secM[1], 10);
    return 300;
  }

  function toggleStepTimer(l, stepIdx) {
    const step = l.practice[stepIdx];
    if (!stepTimers[stepIdx]) {
      stepTimers[stepIdx] = {
        remaining: parseStepSeconds(step.d),
        total: parseStepSeconds(step.d),
        running: false,
        interval: null
      };
    }

    const st = stepTimers[stepIdx];
    const disp = $(`#timer-display-${stepIdx}`);
    const toggleBtn = $(`[data-timer-toggle="${stepIdx}"]`);

    if (st.running) {
      clearInterval(st.interval);
      st.running = false;
      if (toggleBtn) toggleBtn.textContent = "▶ Продовжити";
      if (disp) disp.classList.remove("running");
    } else {
      st.running = true;
      if (toggleBtn) toggleBtn.textContent = "⏸ Пауза";
      if (disp) disp.classList.add("running");
      if (audio) audio.ensureContext();

      st.interval = setInterval(() => {
        st.remaining--;
        const m = Math.floor(st.remaining / 60);
        const s = st.remaining % 60;
        if (disp) disp.textContent = `${m}:${s.toString().padStart(2, "0")}`;

        if (st.remaining <= 0) {
          clearInterval(st.interval);
          st.running = false;
          if (disp) {
            disp.textContent = "Готово! ✓";
            disp.classList.remove("running");
          }
          if (toggleBtn) toggleBtn.textContent = "▶ Старт";
          if (audio) audio.playCompletionChime();
          storage.toggleStepDone(l, stepIdx);
          renderAll();
        }
      }, 1000);
    }
  }

  function resetStepTimer(l, stepIdx) {
    const step = l.practice[stepIdx];
    if (stepTimers[stepIdx]) {
      clearInterval(stepTimers[stepIdx].interval);
      stepTimers[stepIdx] = null;
    }
    const disp = $(`#timer-display-${stepIdx}`);
    const toggleBtn = $(`[data-timer-toggle="${stepIdx}"]`);
    if (disp) {
      disp.textContent = step.d;
      disp.classList.remove("running");
    }
    if (toggleBtn) toggleBtn.textContent = "▶ Старт таймера";
  }

  /* ── 8. Breath Square SVG Pulse Animation ───────────────────────────── */
  function startBreathSquareAnimation() {
    clearInterval(breathPulseTimer);
    const svgs = [...$$("svg[data-counts]")];
    if (!svgs.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const labs = ["ВДИХ", "ЗАТРИМКА", "ВИДИХ", "ЗАТРИМКА"];
    let phase = 0;

    const tick = () => {
      svgs.forEach(svg => {
        const counts = svg.dataset.counts.split(",").map(Number);
        svg.querySelectorAll(".bs-seg").forEach(seg => {
          const on = +seg.dataset.i === phase;
          seg.setAttribute("stroke", on ? "var(--accent)" : "var(--edge)");
          seg.setAttribute("stroke-width", on ? "2.4" : "1.2");
        });
        svg.querySelectorAll(".bs-dot").forEach(d => {
          const on = +d.dataset.i === phase;
          d.setAttribute("r", on ? "4.5" : "2.6");
          d.setAttribute("fill", on ? "var(--accent-lit)" : "var(--line-strong)");
        });
        const num = svg.querySelector(".bs-num");
        const lab = svg.querySelector(".bs-phase");
        if (num) num.textContent = counts[phase];
        if (lab) lab.textContent = labs[phase];
      });
      phase = (phase + 1) % 4;
    };

    tick();
    breathPulseTimer = setInterval(tick, 1800);
  }

  /* ── 9. Search Engine & Query Highlighting ──────────────────────────── */
  const HIGHLIGHT_START = "[[H]]", HIGHLIGHT_END = "[[/H]]";

  function getSearchHits(q) {
    const term = q.trim().toLowerCase();
    if (term.length < 2 && !activeFilterChip) return [];

    return LESSONS.map((l, i) => {
      const pool = [
        l.title, l.sense, l.hw, l.pain || "",
        ...l.theory.flatMap(t => [t.l, t.t]),
        ...l.practice.flatMap(p => [p.n, p.t])
      ];

      // Check filter chip match if active
      if (activeFilterChip) {
        const chipMatch = pool.some(text => text.toLowerCase().includes(activeFilterChip.toLowerCase()));
        if (!chipMatch) return null;
      }

      if (!term) {
        return { l, i, frag: l.sense.slice(0, 120) + "..." };
      }

      const matchIdx = pool.findIndex(str => str.toLowerCase().includes(term));
      if (matchIdx < 0) return null;

      const matchedText = pool[matchIdx];
      const at = matchedText.toLowerCase().indexOf(term);
      const start = Math.max(0, at - 50);
      const end = at + term.length + 80;
      const frag = (start > 0 ? "…" : "") +
        matchedText.slice(start, at) + HIGHLIGHT_START +
        matchedText.slice(at, at + term.length) + HIGHLIGHT_END +
        matchedText.slice(at + term.length, end) +
        (end < matchedText.length ? "…" : "");

      return { l, i, frag };
    }).filter(Boolean);
  }

  function renderSearchResults(hits) {
    const resultsContainer = $("#search-results");
    if (!resultsContainer) return;

    if (!hits.length) {
      resultsContainer.innerHTML = `
        <div style="padding:40px 20px;text-align:center;color:var(--fg-ash)">
          <p style="font-size:16px;color:var(--fg);font-family:var(--font-display)">Нічого не знайдено</p>
          <p style="font-size:13px;margin-top:6px">Спробуй коротший корінь слова (наприклад, «вагус» або «щелепа»).</p>
        </div>`;
      return;
    }

    resultsContainer.innerHTML = hits.map(h => `
      <button class="search-hit" data-goto-idx="${h.i}">
        <span class="hit-tag">ТИЖДЕНЬ ${h.l.w} · УРОК ${h.l.n}</span>
        <span class="hit-title">${esc(h.l.title)}</span>
        <span class="hit-snippet">${esc(h.frag).split(HIGHLIGHT_START).join("<mark>").split(HIGHLIGHT_END).join("</mark>")}</span>
      </button>`).join("");

    resultsContainer.querySelectorAll("[data-goto-idx]").forEach(btn => {
      btn.onclick = () => {
        closeSearchModal();
        gotoLesson(parseInt(btn.dataset.gotoIdx, 10));
      };
    });
  }

  function openSearchModal() {
    const modal = $("#search-modal-backdrop");
    const input = $("#search-modal-input");
    if (modal) modal.classList.add("open");
    if (input) {
      input.value = currentQuery;
      input.focus();
    }
    renderSearchResults(getSearchHits(currentQuery));
  }

  function closeSearchModal() {
    const modal = $("#search-modal-backdrop");
    if (modal) modal.classList.remove("open");
  }

  /* ── 10. Voice Recorder Modal ───────────────────────────────────────── */
  async function openVoiceRecorderModal(lesson) {
    const modal = $("#voice-modal-backdrop");
    if (!modal) return;
    modal.classList.add("open");

    const titleEl = $("#voice-modal-title");
    if (titleEl) titleEl.textContent = `Запис голосу · Урок ${lesson.w}.${lesson.n}`;

    const recBtn = $("#modal-record-btn");
    const waveCanvas = $("#voice-wave-canvas");
    const listEl = $("#recordings-history-list");

    const refreshHistory = async () => {
      const samples = await recorder.getSamplesForLesson(storage.getLessonKey(lesson));
      if (!listEl) return;
      if (!samples.length) {
        listEl.innerHTML = `<div style="color:var(--fg-dim);font-size:12px;padding:8px 0">Поки немає збережених записів для цього уроку.</div>`;
        return;
      }

      listEl.innerHTML = samples.map(s => {
        const url = URL.createObjectURL(s.blob);
        const dateStr = new Date(s.date).toLocaleDateString('uk-UA', { hour: '2-digit', minute: '2-digit' });
        return `
          <div class="recording-item">
            <div>
              <div style="font-weight:600;color:var(--fg)">${dateStr}</div>
              <div class="mono" style="font-size:10px;color:var(--fg-ash)">${s.id}</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <audio controls src="${url}" class="recording-audio"></audio>
              <button class="btn" data-delete-rec="${s.id}" style="padding:4px 8px;font-size:11px">✕</button>
            </div>
          </div>`;
      }).join("");

      listEl.querySelectorAll("[data-delete-rec]").forEach(btn => {
        btn.onclick = async () => {
          await recorder.deleteSample(btn.dataset.deleteRec);
          refreshHistory();
        };
      });
    };

    await refreshHistory();

    if (recBtn) {
      recBtn.onclick = async () => {
        if (!recorder.isRecording) {
          const ok = await recorder.startRecording(waveCanvas);
          if (ok) {
            recBtn.classList.add("recording");
            recBtn.textContent = "⏹ Зупинити запис";
          }
        } else {
          recBtn.classList.remove("recording");
          recBtn.textContent = "🎙 Почати запис";
          await recorder.stopRecording(storage.getLessonKey(lesson));
          showToast("Голосовий зразок успішно збережено!", "🎙");
          refreshHistory();
        }
      };
    }
  }

  function closeVoiceRecorderModal() {
    const modal = $("#voice-modal-backdrop");
    if (modal) modal.classList.remove("open");
    if (recorder.isRecording) {
      recorder.stopRecording(storage.getLessonKey(getCurLesson()));
    }
  }

  /* ── 11. Tweaks Panel & Theme Switcher ──────────────────────────────── */
  function initTweaks() {
    const drawer = $("#tweaks-drawer");
    const openBtn = $("#btn-open-tweaks");
    const closeBtn = $("#btn-close-tweaks");

    if (openBtn) openBtn.onclick = () => drawer.classList.add("open");
    if (closeBtn) closeBtn.onclick = () => drawer.classList.remove("open");

    // Accent theme swatches
    $$(".color-swatch").forEach(swatch => {
      swatch.onclick = () => {
        const theme = swatch.dataset.theme;
        storage.state.theme = theme;
        document.documentElement.setAttribute("data-theme", theme);
        $$(".color-swatch").forEach(s => s.classList.toggle("active", s === swatch));
        const color = swatch.dataset.color || "#E60012";
        ambient.setAccent(color);
        storage.save();
      };
    });

    // Toggle Spine
    const toggleSpine = $("#toggle-spine");
    if (toggleSpine) {
      toggleSpine.checked = storage.state.showSpine !== false;
      toggleSpine.onchange = () => {
        storage.state.showSpine = toggleSpine.checked;
        ambient.setSpineVisible(toggleSpine.checked);
        storage.save();
      };
    }

    // Toggle Sound FX
    const toggleFX = $("#toggle-sound-fx");
    if (toggleFX) {
      toggleFX.checked = storage.state.soundFX !== false;
      toggleFX.onchange = () => {
        storage.state.soundFX = toggleFX.checked;
        audio.setSoundEffects(toggleFX.checked);
        storage.save();
      };
    }

    // Export / Import / Reset
    const btnExport = $("#btn-export-data");
    const btnImport = $("#btn-import-data");
    const btnReset = $("#btn-reset-data");
    const fileImport = $("#file-import-input");

    if (btnExport) btnExport.onclick = () => storage.exportDataJSON();
    if (btnImport && fileImport) {
      btnImport.onclick = () => fileImport.click();
      fileImport.onchange = e => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = ev => {
            if (storage.importDataJSON(ev.target.result)) {
              showToast("Дані успішно імпортовано!");
              renderAll();
            } else {
              alert("Помилка імпорту: невірний формат файлу.");
            }
          };
          reader.readAsText(file);
        }
      };
    }
    if (btnReset) {
      btnReset.onclick = () => {
        if (confirm("Ви дійсно хочете скинути весь прогрес курсу? Цю дію неможливо скасувати.")) {
          storage.resetProgress();
          showToast("Прогрес скинуто");
          renderAll();
        }
      };
    }
  }

  /* ── 12. Navigation & Global State Synchronization ──────────────────── */
  function gotoLesson(newIdx) {
    storage.state.idx = Math.max(0, Math.min(LESSONS.length - 1, newIdx));
    storage.save();
    renderAll();
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function renderAll() {
    renderHUD();
    renderWeeks();
    renderRail();
    renderLessonPane();

    // Sync mode toggles
    const isStudent = storage.state.mode === "student";
    const btnInternal = $("#m-int");
    const btnStudent = $("#m-stu");
    if (btnInternal) btnInternal.setAttribute("aria-pressed", !isStudent);
    if (btnStudent) btnStudent.setAttribute("aria-pressed", isStudent);
  }

  /* ── 13. Global Event Listeners & Keyboard Shortcuts ────────────────── */
  function initEvents() {
    // Header View Switcher
    const btnInternal = $("#m-int");
    const btnStudent = $("#m-stu");
    if (btnInternal) {
      btnInternal.onclick = () => {
        storage.state.mode = "internal";
        storage.save();
        renderAll();
      };
    }
    if (btnStudent) {
      btnStudent.onclick = () => {
        storage.state.mode = "student";
        storage.save();
        renderAll();
      };
    }

    // Ambient Drone Header Button
    const btnDrone = $("#btn-ambient-drone");
    if (btnDrone) {
      btnDrone.onclick = () => {
        const isPlaying = audio.toggleAmbientDrone();
        btnDrone.classList.toggle("active", isPlaying);
        btnDrone.setAttribute("aria-pressed", isPlaying);
        showToast(isPlaying ? "432 Hz Ambient Drone увімкнено ♪" : "Ambient Drone вимкнено");
      };
    }

    // Week Tab click delegation
    const weeksEl = $("#weeks");
    if (weeksEl) {
      weeksEl.addEventListener("click", e => {
        const btn = e.target.closest("[data-w]");
        if (!btn) return;
        const weekId = parseInt(btn.dataset.w, 10);
        const firstLessonIdx = LESSONS.findIndex(l => l.w === weekId);
        if (firstLessonIdx >= 0) gotoLesson(firstLessonIdx);
      });
    }

    // Rail lesson click delegation
    const railEl = $("#rail");
    if (railEl) {
      railEl.addEventListener("click", e => {
        const btn = e.target.closest("[data-idx]");
        if (btn) gotoLesson(parseInt(btn.dataset.idx, 10));
      });
    }

    // Mobile Select Picker
    const mobileSelect = $("#mobile-pick");
    if (mobileSelect) {
      mobileSelect.onchange = e => gotoLesson(parseInt(e.target.value, 10));
    }

    // Search Box in Header
    const searchHeader = $("#search-input-header");
    if (searchHeader) {
      searchHeader.onclick = openSearchModal;
      searchHeader.onfocus = openSearchModal;
    }

    const mobileSearchBtn = $("#mobile-search-btn");
    if (mobileSearchBtn) mobileSearchBtn.onclick = openSearchModal;

    // Search Modal events
    const modalBackdrop = $("#search-modal-backdrop");
    const modalInput = $("#search-modal-input");
    const modalClose = $("#search-modal-close");

    if (modalBackdrop) {
      modalBackdrop.onclick = e => {
        if (e.target === modalBackdrop) closeSearchModal();
      };
    }
    if (modalClose) modalClose.onclick = closeSearchModal;

    if (modalInput) {
      modalInput.oninput = e => {
        currentQuery = e.target.value;
        renderSearchResults(getSearchHits(currentQuery));
      };
    }

    // Search Filter Chips
    $$(".search-chip").forEach(chip => {
      chip.onclick = () => {
        const tag = chip.dataset.tag;
        if (activeFilterChip === tag) {
          activeFilterChip = null;
          chip.classList.remove("active");
        } else {
          $$(".search-chip").forEach(c => c.classList.remove("active"));
          activeFilterChip = tag;
          chip.classList.add("active");
        }
        renderSearchResults(getSearchHits(currentQuery));
      };
    });

    // Voice Modal Close
    const voiceModalBackdrop = $("#voice-modal-backdrop");
    const voiceModalClose = $("#voice-modal-close");
    if (voiceModalBackdrop) {
      voiceModalBackdrop.onclick = e => {
        if (e.target === voiceModalBackdrop) closeVoiceRecorderModal();
      };
    }
    if (voiceModalClose) voiceModalClose.onclick = closeVoiceRecorderModal;

    // Focus Mode Controls
    const focusModal = $("#focus-modal");
    const focusClose = $("#focus-close-btn");
    const focusPlay = $("#focus-play-btn");
    const focusPrev = $("#focus-prev-btn");
    const focusNext = $("#focus-next-btn");

    focus.init(focusModal);
    if (focusClose) focusClose.onclick = () => focus.close();
    if (focusPlay) focusPlay.onclick = () => focus.toggleTimer();
    if (focusPrev) focusPrev.onclick = () => focus.prevStep();
    if (focusNext) focusNext.onclick = () => focus.nextStep();

    // Global Keyboard Shortcuts
    document.addEventListener("keydown", e => {
      const isInput = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

      if (e.key === "/" && !isInput) {
        e.preventDefault();
        openSearchModal();
        return;
      }
      if (e.key === "Escape") {
        closeSearchModal();
        closeVoiceRecorderModal();
        focus.close();
        $("#tweaks-drawer")?.classList.remove("open");
        return;
      }

      if (isInput || e.metaKey || e.ctrlKey || e.altKey) return;

      if (focusModal?.classList.contains("open")) {
        if (e.code === "Space") {
          e.preventDefault();
          focus.toggleTimer();
        } else if (e.key === "ArrowRight") {
          focus.nextStep();
        } else if (e.key === "ArrowLeft") {
          focus.prevStep();
        }
        return;
      }

      if (e.key === "ArrowRight") gotoLesson(storage.state.idx + 1);
      if (e.key === "ArrowLeft")  gotoLesson(storage.state.idx - 1);
      if (e.key === "m" || e.key === "M") $("#btn-ambient-drone")?.click();
      if (e.key === "f" || e.key === "F") $("#btn-focus-mode")?.click();
    });
  }

  /* ── 14. Application Initialization ────────────────────────────────── */
  function init() {
    // Insert SVG Defs into document
    document.body.insertAdjacentHTML("afterbegin", window.SVG_DEFS);

    // Apply stored theme
    if (storage.state.theme) {
      document.documentElement.setAttribute("data-theme", storage.state.theme);
    }

    // Initialize Ambient Visuals
    const starCanvas = $("#starfield-canvas");
    const spineCanvas = $("#spine-canvas");
    ambient.init(starCanvas, spineCanvas);

    // Initialize UI and Events
    initEvents();
    initTweaks();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
