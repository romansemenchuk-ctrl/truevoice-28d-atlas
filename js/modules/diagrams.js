/* ========================================================================
   TrueVoice Academy — Somatic Anatomy & Resonator Plates Engine
   Interactive SVGs: Body Resonator Zones · Vagus Nerve · Deep Front Line ·
   Acupressure · Somatic Asanas · Breath Geometry · Seven Sounds Matrix
   ======================================================================== */

const SVG_DEFS = `
<svg width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">
 <defs>
  <linearGradient id="vessel" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#241C21" stop-opacity=".95"/>
    <stop offset="100%" stop-color="#141013" stop-opacity=".45"/>
  </linearGradient>
  <radialGradient id="zone">
    <stop offset="0%" stop-color="#FF382E" stop-opacity=".55"/>
    <stop offset="60%" stop-color="#E60012" stop-opacity=".22"/>
    <stop offset="100%" stop-color="#E60012" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="gold-zone">
    <stop offset="0%" stop-color="#E5BA35" stop-opacity=".55"/>
    <stop offset="60%" stop-color="#C9A227" stop-opacity=".25"/>
    <stop offset="100%" stop-color="#C9A227" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="thread" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#FF382E"/>
    <stop offset="100%" stop-color="#7A0818"/>
  </linearGradient>
  <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="3.5" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
 </defs>
</svg>`;

const TXT = (x, y, s, { a = "start", c = "m-f", sz = 8.5, mono = true } = {}) =>
  `<text x="${x}" y="${y}" text-anchor="${a}" class="${c}" dominant-baseline="middle"
    style="font-family:${mono ? "var(--font-mono)" : "var(--font-display)"};font-size:${sz}px;letter-spacing:${mono ? ".08em" : "0"}">${s}</text>`;

const LEAD_LINE = (x1, y1, x2, y2) =>
  `<path d="M${x1} ${y1} H${x2}" stroke="var(--line-strong)" stroke-width=".85" fill="none"/>
   <circle cx="${x1}" cy="${y1}" r="2" fill="var(--accent-lit)"/>`;

const GROUND_LINE = (x1, x2, y) =>
  `<path d="M${x1} ${y} H${x2}" stroke="var(--line)" stroke-width="1" fill="none"/>`;

/* ── 1. Torso Base Silhouette ─────────────────────────────────────────── */
const TORSO_PATH = `
 <g opacity=".45">
   <path d="M104 100 C84 130 78 168 78 206" stroke="var(--edge)" stroke-width="1.2" fill="none" stroke-linecap="round"/>
   <path d="M236 100 C256 130 262 168 262 206" stroke="var(--edge)" stroke-width="1.2" fill="none" stroke-linecap="round"/>
 </g>
 <ellipse cx="170" cy="34" rx="26" ry="30" fill="url(#vessel)" stroke="var(--edge)" stroke-width=".95"/>
 <path d="M158 62 h24 v20 h-24 z" fill="url(#vessel)" stroke="var(--edge)" stroke-width=".95"/>
 <path d="M170 80 C208 80 234 90 238 112 C242 134 230 150 224 168
          C218 188 232 206 228 220 C224 236 200 246 170 246
          C140 246 116 236 112 220 C108 206 122 188 116 168
          C110 150 98 134 102 112 C106 90 132 80 170 80 Z"
       fill="url(#vessel)" stroke="var(--edge)" stroke-width=".95"/>
 <path d="M170 88 V240" stroke="var(--line-strong)" stroke-width=".8" stroke-dasharray="2 3"/>
 <path d="M118 108 Q170 120 222 108 M116 140 Q170 152 224 140 M120 174 Q170 184 220 174"
       stroke="var(--line)" stroke-width=".65" fill="none"/>`;

const ANATOMICAL_ZONES = {
  head:      { cy: 34,  rx: 26, ry: 30, side: 1,  lb: "ГОЛОВА · І / Е (2-3 кГц)",  sound: "Мммм" },
  jaw:       { cy: 58,  rx: 20, ry: 9,  side: -1, lb: "ЩЕЛЕПА · M. MASSETER",     sound: "Хааа" },
  throat:    { cy: 74,  rx: 13, ry: 11, side: 1,  lb: "ГОРТАНЬ · VAGUS",          sound: "Аааа" },
  chest:     { cy: 118, rx: 64, ry: 28, side: -1, lb: "ГРУДИ · А / О (1-1.4 кГц)", sound: "Хааа" },
  diaphragm: { cy: 152, rx: 58, ry: 13, side: 1,  lb: "ДІАФРАГМА · ОПОРА",        sound: "Оооо" },
  belly:     { cy: 182, rx: 52, ry: 19, side: -1, lb: "ЖИВІТ · У (400-800 Гц)",   sound: "Уууу" },
  pelvis:    { cy: 220, rx: 56, ry: 21, side: 1,  lb: "ТАЗОВЕ ДНО · ГРУНТ",        sound: "Уууу" }
};

function renderBodyPlate(keys) {
  const marks = keys.map(k => {
    const z = ANATOMICAL_ZONES[k];
    if (!z) return "";
    const ax = 170 + z.side * (z.rx + 2), gx = z.side > 0 ? 305 : 35;
    return `
      <g class="interactive-zone" data-zone="${k}" data-sound="${z.sound}" style="cursor:pointer">
        <ellipse cx="170" cy="${z.cy}" rx="${z.rx * 1.15}" ry="${z.ry * 1.16}" fill="url(#zone)" opacity=".65"/>
        <ellipse cx="170" cy="${z.cy}" rx="${z.rx}" ry="${z.ry}" fill="none"
                 stroke="var(--accent)" stroke-width="1.1" stroke-opacity=".7"/>
        ${LEAD_LINE(ax, z.cy, gx)}
        ${TXT(gx + (z.side > 0 ? 6 : -6), z.cy, z.lb, { a: z.side > 0 ? "start" : "end", c: "m-f", sz: 8.5 })}
      </g>`;
  }).join("");

  return `<svg viewBox="0 0 470 300" width="470" role="img" aria-label="Анатомічна пластина резонаторів: ${keys.join(', ')}">
    <g transform="translate(68, 4)">${TORSO_PATH}${marks}</g>
  </svg>`;
}

/* ── 2. Breath Square & Samavritti ─────────────────────────────────────── */
function renderBreathSquare(counts) {
  const labs = ["ВДИХ", "ЗАТРИМКА", "ВИДИХ", "ЗАТРИМКА"];
  const P = [[46, 150], [46, 46], [150, 46], [150, 150]];
  const segs = [[46, 150, 46, 46], [46, 46, 150, 46], [150, 46, 150, 150], [150, 150, 46, 150]];

  return `<svg viewBox="0 0 200 220" width="200" role="img"
    aria-label="Квадратне дихання, рахунок ${counts.join(" — ")}" data-counts="${counts.join(",")}">
    <rect x="46" y="46" width="104" height="104" fill="none" stroke="var(--line)" stroke-width="1.2"/>
    ${segs.map((s, i) => `<path class="bs-seg" data-i="${i}" d="M${s[0]} ${s[1]} L${s[2]} ${s[3]}"
       stroke="var(--edge)" stroke-width="1.2" fill="none" stroke-linecap="round"/>`).join("")}
    ${P.map((p, i) => `<circle class="bs-dot" data-i="${i}" cx="${p[0]}" cy="${p[1]}" r="2.8" fill="var(--line-strong)"/>`).join("")}
    <text class="bs-num" x="98" y="96" text-anchor="middle" fill="var(--accent-lit)"
      style="font-family:var(--font-display);font-size:34px;font-weight:400">${counts[0]}</text>
    <text class="bs-phase" x="98" y="122" text-anchor="middle" fill="var(--fg-ash)" dominant-baseline="middle"
      style="font-family:var(--font-mono);font-size:8.5px;letter-spacing:.12em">${labs[0]}</text>
    <g class="bs-lab">${TXT(98, 192, counts.join(" · ") + " РАХУНКИ", { a: "middle", c: "d-f", sz: 9 })}</g>
  </svg>`;
}

/* ── 3. Vagus Nerve Pathway ───────────────────────────────────────────── */
function renderVagusPlate() {
  const org = (cx, cy, rx, ry, lb) => `
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#vessel)" stroke="var(--edge)" stroke-width=".95"/>
    ${lb ? TXT(cx, cy, lb, { a: "middle", c: "m-f", sz: 8.5 }) : ""}`;

  return `<svg viewBox="0 0 350 330" width="350" role="img" aria-label="Шлях блукаючого нерва (N. Vagus) від мозкового стовбура">
    <ellipse cx="175" cy="30" rx="70" ry="20" fill="url(#vessel)" stroke="var(--edge)" stroke-width=".95"/>
    ${TXT(175, 30, "МОЗКОВИЙ СТОВБУР", { a: "middle", c: "m-f", sz: 8.5 })}
    <g filter="url(#soft)">
      <path d="M142 50 C116 104 110 168 116 240" stroke="url(#thread)" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M208 50 C234 104 240 168 234 240" stroke="url(#thread)" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    </g>
    ${org(175, 78, 36, 13, "ГОРТАНЬ")}
    ${org(175, 136, 32, 21, "СЕРЦЕ")}
    ${org(150, 194, 16, 28, "")}${org(200, 194, 16, 28, "")}
    ${TXT(175, 194, "ЛЕГЕНІ", { a: "middle", c: "m-f", sz: 8.5 })}
    ${org(175, 260, 42, 22, "ШКТ · ВІСЦЕРА")}
    ${LEAD_LINE(122, 108, 48)}${TXT(42, 108, "N. VAGUS", { a: "end", c: "r-f", sz: 8.5 })}
    <path d="M18 310 q10 -16 20 0 t20 0 t20 0" stroke="var(--sacred)" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    ${TXT(102, 310, "HRV — МАРКЕР ВАГУСНОГО ТОНУСУ", { c: "g-f", sz: 8.5 })}
  </svg>`;
}

/* ── 4. Sound Propagation Resonance Map ───────────────────────────────── */
function renderSoundMap() {
  const zones = ["ГОЛОВА / ПАЗУХИ", "ГРУДНА КЛІТКА", "ЖИВІТ / ТАЗ"];
  return `<svg viewBox="0 0 330 180" width="330" role="img" aria-label="Розповсюдження звукового резонансу">
    <g filter="url(#soft)">
      ${[108, 82, 58, 34].map((r, i) => `<ellipse cx="66" cy="90" rx="${r}" ry="${r * 0.52}"
        fill="none" stroke="var(--accent)" stroke-width="1.1" stroke-opacity="${(0.16 + i * 0.22).toFixed(2)}"
        stroke-dasharray="${i < 3 ? "3 6" : "none"}"/>`).join("")}
      <circle cx="66" cy="90" r="18" fill="url(#zone)"/>
      <circle cx="66" cy="90" r="18" fill="none" stroke="var(--accent)" stroke-width="1.1"/>
    </g>
    ${TXT(66, 91, "Мм", { a: "middle", c: "r-f", sz: 16, mono: false })}
    ${zones.map((z, i) => {
      const y = 48 + i * 44;
      return `<path d="M182 ${y} h118" stroke="var(--edge)" stroke-width=".85"/>
              ${TXT(182, y - 10, z, { c: "t-f", sz: 9.5 })}
              ${TXT(298, y - 10, ["І / Е", "А / О", "У"][i], { a: "end", c: "m-f", sz: 8.5 })}
              <path d="M136 ${90 + (i - 1) * 12} C156 ${90 + (i - 1) * 12} 162 ${y} 182 ${y}"
                    stroke="var(--accent)" stroke-width=".85" stroke-opacity=".5" fill="none" stroke-dasharray="2 4"/>`;
    }).join("")}
  </svg>`;
}

/* ── 5. Deep Front Line Fascial Chain (Myers 2001) ────────────────────── */
function renderFasciaPlate() {
  const nodes = [236, 212, 188, 164, 142, 120, 100, 80, 58, 30];
  return `<svg viewBox="0 0 470 300" width="470" role="img" aria-label="Глибока передня лінія (Myers 2001)">
    <g transform="translate(68, 4)" opacity=".45">${TORSO_PATH}</g>
    <g transform="translate(68, 4)" filter="url(#soft)">
      <path d="M170 236 C166 208 172 188 170 164 C168 142 176 120 170 100 C164 80 172 56 170 30"
            stroke="url(#thread)" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      ${nodes.map(y => `<circle cx="170" cy="${y}" r="3" fill="var(--accent-lit)"/>`).join("")}
    </g>
    <g transform="translate(68, 4)">
      ${LEAD_LINE(174, 164, 290)}
      ${TXT(296, 158, "ГЛИБОКА ПЕРЕДНЯ ЛІНІЯ", { c: "m-f", sz: 8.5 })}
      ${TXT(296, 172, "ТОМАС МАЙЄРС · MYOFASCIAL", { c: "d-f", sz: 7.5 })}
      ${LEAD_LINE(166, 236, 80)}${TXT(74, 236, "ТАЗОВЕ ДНО", { a: "end", c: "m-f", sz: 8.5 })}
      ${LEAD_LINE(174, 30, 290)}${TXT(296, 30, "ЯЗИК · ПРЕГОРТАНЬ", { c: "m-f", sz: 8.5 })}
    </g>
  </svg>`;
}

/* ── 6. Acupressure Points Release Map ────────────────────────────────── */
function renderAcupressurePlate() {
  const pts = [
    { x: 170, y: 10,  lb: "YINTANG · ТРЕТЄ ОКО", side: 1 },
    { x: 198, y: 34,  lb: "SHEN MEN · ВЕРХІВКА ВУХА", side: 1 },
    { x: 114, y: 94,  lb: "JIAN JING · ТРАПЕЦІЯ", side: -1 },
    { x: 226, y: 94,  lb: "JIAN JING · GB21", side: 1 }
  ];

  return `<svg viewBox="0 0 470 300" width="470" role="img" aria-label="Акупресурні точки звільнення голосу">
    <g transform="translate(68, 4)" opacity=".5">${TORSO_PATH}</g>
    <g transform="translate(68, 4)">
      ${pts.map(p => `
        <ellipse cx="${p.x}" cy="${p.y}" rx="16" ry="16" fill="url(#zone)" opacity=".85"/>
        <circle cx="${p.x}" cy="${p.y}" r="7.5" fill="none" stroke="var(--accent)" stroke-width="1.1"/>
        <circle cx="${p.x}" cy="${p.y}" r="2.4" fill="var(--accent-lit)"/>`).join("")}
      ${pts.map(p => {
        const gx = p.side > 0 ? 300 : 40;
        return LEAD_LINE(p.x + p.side * 9, p.y, gx) +
               TXT(gx + p.side * 6, p.y, p.lb, { a: p.side > 0 ? "start" : "end", c: "m-f", sz: 8.5 });
      }).join("")}
      <g opacity=".95">
        <path d="M52 218 c10 -12 26 -12 34 0 c6 10 2 22 -10 26 c-12 4 -24 -2 -26 -12 z"
              fill="url(#vessel)" stroke="var(--edge)" stroke-width=".95"/>
        <ellipse cx="64" cy="226" rx="12" ry="12" fill="url(#gold-zone)" opacity=".85"/>
        <circle cx="64" cy="226" r="6" fill="none" stroke="var(--sacred)" stroke-width="1.1"/>
        <circle cx="64" cy="226" r="2.2" fill="var(--sacred-lit)"/>
        ${TXT(56, 258, "HEGU (LI4) · ДОЛОНЯ", { a: "middle", c: "g-f", sz: 8.5 })}
      </g>
    </g>
  </svg>`;
}

/* ── 7. Nadi-Shodhana Alternating Breathing ────────────────────────────── */
function renderNadiPlate() {
  return `<svg viewBox="0 0 310 180" width="310" role="img" aria-label="Наді-Шодхана: гармонізація півкуль">
    <path d="M74 30 C130 14 170 14 236 30" stroke="var(--sacred)" stroke-width="1.2" fill="none" stroke-dasharray="3 5"/>
    ${TXT(155, 22, "БАЛАНС ПІВКУЛЬ МОЗКУ", { a: "middle", c: "g-f", sz: 8.5 })}
    <ellipse cx="125" cy="92" rx="32" ry="42" fill="url(#vessel)" stroke="var(--edge)" stroke-width=".95"/>
    <ellipse cx="185" cy="92" rx="32" ry="42" fill="url(#vessel)" stroke="var(--edge)" stroke-width=".95"/>
    ${TXT(125, 92, "Л", { a: "middle", c: "t-f", sz: 18, mono: false })}
    ${TXT(185, 92, "П", { a: "middle", c: "t-f", sz: 18, mono: false })}
    <g filter="url(#soft)">
      <path d="M92 68 C66 68 50 80 50 92 C50 104 66 116 92 116"
            stroke="var(--accent)" stroke-width="2" fill="none" stroke-linecap="round"/>
    </g>
    <path d="M88 62 l8 6 -8 6 z" fill="var(--accent-lit)"/>
    <path d="M218 68 C244 68 260 80 260 92 C260 104 244 116 218 116"
          stroke="var(--edge)" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-dasharray="4 5"/>
    ${TXT(42, 92, "ВДИХ", { a: "end", c: "r-f", sz: 8.5 })}
    ${TXT(268, 92, "ВИДИХ", { c: "m-f", sz: 8.5 })}
    ${TXT(155, 154, "ЧЕРГУВАННЯ НІЗДРІВ · RSA", { a: "middle", c: "d-f", sz: 8.5 })}
  </svg>`;
}

/* ── 8. Somatic Asana Vector Plates ───────────────────────────────────── */
const ASANA_SPINE = d => `<g filter="url(#soft)"><path d="${d}" stroke="url(#thread)" stroke-width="2.6"
   fill="none" stroke-linecap="round"/></g>`;
const ASANA_MASS  = d => `<path d="${d}" fill="url(#vessel)" stroke="var(--edge)" stroke-width=".85"/>`;
const ASANA_VEC   = (d, x, y, lb) => `<path d="${d}" stroke="var(--accent)" stroke-width="1.1" fill="none"
   stroke-dasharray="3 4" stroke-opacity=".85"/>${TXT(x, y, lb, { a: "middle", c: "r-f", sz: 8.5 })}`;
const ASANA_BASE  = (inner, note) => `<svg viewBox="0 0 310 190" width="310" role="img" aria-label="${note}">
   ${GROUND_LINE(20, 290, 154)}${inner}</svg>`;

const ASANA_PLATES = {
  croc: ASANA_BASE(`
    ${ASANA_MASS("M74 144 C74 128 104 122 150 122 C196 122 226 128 226 144 C226 150 196 152 150 152 C104 152 74 150 74 144 Z")}
    ${ASANA_MASS("M48 136 a17 13 0 1 1 .1 0")}
    <path d="M66 132 C54 118 40 110 28 108" stroke="var(--edge)" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M232 138 C248 140 264 138 276 134 M232 144 C248 148 264 146 276 143"
          stroke="var(--edge)" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    ${ASANA_SPINE("M62 132 C110 118 190 118 236 130")}
    <path d="M150 104 V86" stroke="var(--accent)" stroke-width="1.1" stroke-dasharray="3 4" fill="none"/>
    <path d="M150 80 l5 9 -10 0 z" fill="var(--accent)"/>
    <path d="M150 110 l5 -9 -10 0 z" fill="var(--accent)"/>
    ${TXT(150, 68, "ДІАФРАГМАЛЬНИЙ ОПІР ПІДЛОГИ", { a: "middle", c: "r-f", sz: 8.5 })}`,
    "Макрасана (Поза Крокодила): ізоляція діафрагмального дихання"),

  child: ASANA_BASE(`
    ${ASANA_MASS("M92 148 C92 126 130 112 186 112 C232 112 252 126 252 148 C252 152 210 152 172 152 C134 152 92 152 92 148 Z")}
    ${ASANA_MASS("M70 140 a17 13 0 1 1 .1 0")}
    <path d="M88 134 C64 128 42 128 24 130 M88 142 C64 138 42 138 24 140"
          stroke="var(--edge)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    ${ASANA_SPINE("M78 132 C118 108 176 100 240 126")}
    ${ASANA_VEC("M158 92 C176 78 200 76 218 84", 188, 64, "ДОВГА СПИНА · ВИДОВЖЕНИЙ ВИДИХ")}`,
    "Баласана (Поза Дитини): видовжений видих вздовж хребта"),

  catcow: ASANA_BASE(`
    <path d="M62 128 C112 96 182 100 238 124" stroke="var(--edge)" stroke-width="1.6"
          fill="none" stroke-dasharray="5 5" stroke-linecap="round"/>
    ${ASANA_SPINE("M62 128 C112 152 182 148 238 124")}
    ${ASANA_MASS("M50 126 a15 12 0 1 1 .1 0")}
    ${[62, 150, 238].map(x => `<path d="M${x} ${x === 150 ? 134 : 128} V154" stroke="var(--edge)" stroke-width="1.8" stroke-linecap="round"/>`).join("")}
    ${TXT(150, 86, "ВДИХ — КОРОВА (РОЗКРИТТЯ)", { a: "middle", c: "m-f", sz: 8.5 })}
    ${TXT(150, 174, "ВИДИХ — КІШКА (УДЖАЙЇ)", { a: "middle", c: "r-f", sz: 8.5 })}`,
    "Марджаріасана (Кішка-Корова): хвиля хребта і дихання"),

  cobra: ASANA_BASE(`
    ${ASANA_MASS("M112 146 C112 132 150 126 200 126 C244 126 266 132 266 146 C266 151 232 152 194 152 C150 152 112 151 112 146 Z")}
    ${ASANA_MASS("M62 92 a16 14 0 1 1 .1 0")}
    <path d="M100 140 C86 128 74 116 68 106" stroke="var(--edge)" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M104 140 L96 152 M120 142 L112 152" stroke="var(--edge)" stroke-width="1.8" stroke-linecap="round"/>
    ${ASANA_SPINE("M252 138 C196 136 140 132 74 100")}
    ${ASANA_VEC("M78 78 C96 62 122 58 144 64", 118, 44, "РОЗКРИТТЯ ГРУДНОГО РЕЗОНАТОРА")}`,
    "Бхуджангасана (Поза Кобри): декомпресія горла та грудей"),

  tri: ASANA_BASE(`
    ${ASANA_MASS("M74 146 a17 6 0 1 1 .1 0")}${ASANA_MASS("M226 146 a17 6 0 1 1 .1 0")}
    <path d="M74 140 L106 104 M226 140 L194 104" stroke="var(--edge)" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M106 104 Q150 98 194 104" stroke="var(--edge)" stroke-width="1.6" fill="none"/>
    <path d="M106 104 C92 82 78 68 68 58" stroke="var(--edge)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    ${ASANA_MASS("M62 50 a14 12 0 1 1 .1 0")}
    ${ASANA_SPINE("M194 104 C206 82 218 62 228 42")}
    <path d="M234 36 L240 18" stroke="var(--accent)" stroke-width="1.1" stroke-dasharray="3 4" fill="none"/>
    <path d="M242 12 l1 10 -9 -4 z" fill="var(--accent)"/>
    ${TXT(226, 14, "ТРИВАЛИЙ ЗВУК", { a: "end", c: "r-f", sz: 8.5 })}
    ${TXT(155, 174, "ЛАТЕРАЛЬНА ФАСЦІАЛЬНА ЛІНІЯ", { a: "middle", c: "d-f", sz: 8.5 })}`,
    "Триконасана (Поза Трикутника): латеральна лінія і звукова витривалість"),

  lotus: ASANA_BASE(`
    ${ASANA_MASS("M92 148 C92 134 116 128 150 128 C184 128 208 134 208 148 C208 152 184 152 150 152 C116 152 92 152 92 148 Z")}
    <path d="M96 140 C108 130 124 134 134 144 M204 140 C192 130 176 134 166 144"
          stroke="var(--edge)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    ${ASANA_MASS("M138 76 h24 v56 h-24 z")}
    ${ASANA_MASS("M150 58 a17 19 0 1 1 .1 0")}
    ${ASANA_SPINE("M150 144 V44")}
    ${[144, 124, 104, 84, 62].map((y, i) => `<circle cx="150" cy="${y}" r="${4 + i * 1.8}" fill="none"
       stroke="var(--accent)" stroke-width="1" stroke-opacity="${(0.22 + i * 0.16).toFixed(2)}"/>`).join("")}
    ${TXT(150, 174, "САМАВРІТТІ · ВЕРТИКАЛЬНА ВІСЬ", { a: "middle", c: "d-f", sz: 8.5 })}`,
    "Падмасана (Лотос): вертикальна акустична вісь хребта")
};

/* ── 9. Seven Sounds Interactive Table ────────────────────────────────── */
const SEVEN_SOUNDS_TABLE = `
<div class="sounds-table-wrap">
<table class="sounds">
  <caption class="sr-only">Сім звуків TrueVoice: резонаторні поверхи, частоти і фізіологічний вплив</caption>
  <thead>
    <tr>
      <th>Звук</th>
      <th>Зона резонансу</th>
      <th>Частота</th>
      <th>Соматична дія</th>
      <th>Тон</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Мммм</td>
      <td>Голова · носові пазухи</td>
      <td>432 Гц</td>
      <td>Синтез оксиду азоту (NO) ↑ · релакс</td>
      <td><button class="sound-play-btn" data-sound="Мммм" title="Прослухати тон 432 Гц">▶ 432Hz</button></td>
    </tr>
    <tr>
      <td>Хааа</td>
      <td>Серце · грудина</td>
      <td>136.1 Гц</td>
      <td>Активація парасимпатики · OM frequency</td>
      <td><button class="sound-play-btn" data-sound="Хааа" title="Прослухати тон серця">▶ 136Hz</button></td>
    </tr>
    <tr>
      <td>Аааа</td>
      <td>Горло · відкритість</td>
      <td>256 Гц</td>
      <td>Декомпресія гортані · вільна експресія</td>
      <td><button class="sound-play-btn" data-sound="Аааа" title="Прослухати тон 256 Гц">▶ 256Hz</button></td>
    </tr>
    <tr>
      <td>Оооо</td>
      <td>Сонячне сплетіння · ребра</td>
      <td>194.2 Гц</td>
      <td>Розширення діафрагми · баланс</td>
      <td><button class="sound-play-btn" data-sound="Оооо" title="Прослухати тон 194 Гц">▶ 194Hz</button></td>
    </tr>
    <tr>
      <td>Уууу</td>
      <td>Живіт · тазове дно</td>
      <td>126.2 Гц</td>
      <td>Глибинне заземлення · меридіан нирок</td>
      <td><button class="sound-play-btn" data-sound="Уууу" title="Прослухати тон 126 Гц">▶ 126Hz</button></td>
    </tr>
    <tr style="opacity:0.9">
      <td>Шшш</td>
      <td>ЦНС · печінка</td>
      <td>341.3 Гц</td>
      <td>Скидання напруги та роздратування</td>
      <td><button class="sound-play-btn" data-sound="Шшш" title="Прослухати тон">▶ 341Hz</button></td>
    </tr>
    <tr style="opacity:0.9">
      <td>Бррр</td>
      <td>Губи · маска обличчя</td>
      <td>210.4 Гц</td>
      <td>SOVT опір · мікромасаж голосових складок</td>
      <td><button class="sound-play-btn" data-sound="Бррр" title="Прослухати тон">▶ 210Hz</button></td>
    </tr>
  </tbody>
</table>
</div>`;

/* ── Schemas Registry ─────────────────────────────────────────────────── */
const SCHEMAS_REGISTRY = {
  "sq":       { c: "Квадратне дихання 4·4·4·4",        h: () => renderBreathSquare([4, 4, 4, 4]) },
  "sq66":     { c: "Самаврітті 6·6·6·6",                h: () => renderBreathSquare([6, 6, 6, 6]) },
  "body-all": { c: "Резонаторні поверхи тіла",          h: () => renderBodyPlate(["head", "throat", "chest", "diaphragm", "belly", "pelvis"]) },
  "body-ht":  { c: "Верхній резонаторний поверх",      h: () => renderBodyPlate(["head", "throat", "chest"]) },
  "body-jaw": { c: "Замок щелепи (M. masseter)",        h: () => renderBodyPlate(["jaw", "head"]) },
  "body-jt":  { c: "Щелепа · горло · грудний центр",    h: () => renderBodyPlate(["jaw", "throat", "chest"]) },
  "body-th":  { c: "Гортань і грудний поверх",          h: () => renderBodyPlate(["throat", "chest"]) },
  "body-df":  { c: "Діафрагма та черепна порожнина",    h: () => renderBodyPlate(["diaphragm", "belly"]) },
  "body-pv":  { c: "Тазове дно та живіт",               h: () => renderBodyPlate(["pelvis", "belly"]) },
  "vagus":    { c: "Блукаючий нерв (N. Vagus) та зв'язок з гортанню", h: renderVagusPlate },
  "sound":    { c: "Хвильова карта резонансу",          h: renderSoundMap },
  "7sounds":  { c: "Сім звуків TrueVoice — частоти та соматична дія", h: () => SEVEN_SOUNDS_TABLE, wide: true },
  "fascia":   { c: "Глибока передня лінія (Myers 2001)", h: renderFasciaPlate },
  "acupr":    { c: "Акупресурні точки соматичного релізу", h: renderAcupressurePlate },
  "nadi":     { c: "Наді-Шодхана: гармонізація півкуль", h: renderNadiPlate },
  "croc":     { c: "Макрасана (Поза Крокодила)",        h: () => ASANA_PLATES.croc },
  "child":    { c: "Баласана (Поза Дитини)",            h: () => ASANA_PLATES.child },
  "catcow":   { c: "Марджаріасана (Кішка-Корова)",      h: () => ASANA_PLATES.catcow },
  "cobra":    { c: "Бхуджангасана (Поза Кобри)",        h: () => ASANA_PLATES.cobra },
  "tri":      { c: "Триконасана (Поза Трикутника)",     h: () => ASANA_PLATES.tri },
  "lotus":    { c: "Падмасана / Сукхасана (Лотос)",     h: () => ASANA_PLATES.lotus }
};

window.SVG_DEFS = SVG_DEFS;
window.SCHEMAS_REGISTRY = SCHEMAS_REGISTRY;
