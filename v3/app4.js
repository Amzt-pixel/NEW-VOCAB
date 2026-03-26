/* ══════════════════════════════════════
   DICTIONARY — app.js
   ══════════════════════════════════════ */

const PASSWORD     = 'Singular37';
const CSV_URL      = 'https://raw.githubusercontent.com/Amzt-pixel/NEW-VOCAB/main/dictionary1.csv';
const HOLD_MS      = 700;

// ── Data ──
let csvData      = [];
let studyList    = [];
let rootWordList = [];
let currentIndex = 0;
let startTime    = null;
let wordsSeen    = 0;
let readHistory  = [];
let customQueue  = [];
let hiddenWords  = new Set();
let sessionLive  = false;

// ── Settings ──
let S = {
  // Appearance (Customise modal)
  accent: 'gold', fontSize: 'normal', theme: 'navy',
  // Navigation (Settings modal — always)
  stepNumber: 1, loopMode: false, filter: 'all',
  // Display (Settings modal — always)
  tabOrder: 'san',
  // Mode
  mode: 'study',
  // Study mode
  showTranslation: false, wordHighlight: false, showSimilar: false,
  // Revise mode
  showMeaning: false, meaningOptions: false,
  correctPercent: 50, randomOptionCount: false,
  minOptions: 4, maxOptions: 8, fixedOptions: 6,
  revealCorrect: false, reviseWordAction: false,
  // MCQ mode
  mcqOptions: 4, mcqMaxCorrect: 1, mcqRandomize: false,
  showClock: false, mcqWordAction: false,
  // Navigation filters
  navFilter: false,
  navSynAnt: true, navDefined: false, navRootwise: false,
  nxtBehavior: true,   // true = exclusive, false = inclusive
  prevBehavior: false, // false = default, true = variation
  stepAction: false,   // false = all (pre), true = each (post)
  randomNav: false,
  navDelta: 2,
  suggestMarked: false,
  // Internal
  orderMode: 'az',
};
let pending = null; // pending settings copy while modal is open

// ── Panel state ──
let panelTab    = 'list';
let panelFilter = '';
const panelScroll = { list: 0, queue: 0, history: 0 };

// ── Hold timers ──
let prevTimer = null;
let nextTimer = null;
let chipTimer = null;
let chipHeld  = false;
let panelTimer   = null;
let panelHeld    = false;
let panelScrolled = false;

// ── Misc ──
let pendingAddTo      = {};
let detailWord        = null;
let wrongAttempts     = 0;

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadHiddenWords();
  applyAppearance();
  bindAll();
  checkSession();
});

function checkSession() {
  const ok = localStorage.getItem('dictSession') === 'unlocked'
          || sessionStorage.getItem('dictSession') === 'unlocked';
  if (ok) { showScreen('home'); loadData(); }
  else      showScreen('gate');
}

window.addEventListener('beforeunload', () => {
  if (sessionStorage.getItem('dictSession') === 'unlocked'
   && localStorage.getItem('dictSession') !== 'unlocked') {
    localStorage.removeItem('dictCurrentSession');
    localStorage.removeItem('dictCurrentQueue');
  }
});

// ══════════════════════════════════════
// SCREENS
// ══════════════════════════════════════
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(name + 'Screen').classList.add('active');
}

function goHome()        { showScreen('home'); }
function goStudy()       { showScreen('study'); }
function handleBook()    { sessionLive ? goStudy() : startSession(); }

// ══════════════════════════════════════
// GATE
// ══════════════════════════════════════
function bindGate() {
  const btn  = document.getElementById('gateBtn');
  const inp  = document.getElementById('gateInput');
  const err  = document.getElementById('gateError');
  const eye  = document.getElementById('gateEye');
  const rem  = document.getElementById('rememberMe');

  eye.addEventListener('click', () => {
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    eye.textContent = show ? '🙈' : '👁';
  });

  function attempt() {
    if (inp.value.trim() !== PASSWORD) {
      wrongAttempts++;
      err.classList.remove('hidden');
      inp.value = ''; inp.focus();
      if (wrongAttempts >= 3) {
        btn.disabled = true; btn.textContent = 'Wait 10s…';
        setTimeout(() => { btn.disabled = false; btn.textContent = 'Unlock'; wrongAttempts = 0; }, 10000);
      }
      return;
    }
    wrongAttempts = 0;
    if (rem.checked) { localStorage.setItem('dictSession','unlocked'); sessionStorage.removeItem('dictSession'); }
    else             { sessionStorage.setItem('dictSession','unlocked'); localStorage.removeItem('dictSession'); }
    showScreen('home'); loadData();
  }

  btn.addEventListener('click', attempt);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
  inp.addEventListener('input',   () => err.classList.add('hidden'));
}

// ══════════════════════════════════════
// DATA
// ══════════════════════════════════════
async function loadData() {
  try {
    const res  = await fetch(CSV_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    parseCSV(await res.text());
    buildRootList();
    updateStats();
    renderHomeList(false);
  } catch(e) {
    console.error(e);
    document.getElementById('rootWordItems').innerHTML =
      '<div class="list-loading" style="color:#e55">Failed to load data.</div>';
  }
}

function parseCSV(text) {
  const lines   = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,''));
  csvData = lines.slice(1).map((line, i) => {
    const cols = parseCSVLine(line);
    const obj  = {};
    headers.forEach((h, j) => { obj[h] = (cols[j] || '').trim().replace(/^"|"$/g,''); });
    return {
      uid:        i + 1,
      word:       obj['Word']       || '',
      id:         parseFloat(obj['NumId']) || 0,
      definition: obj['Definition'] || '',
      example:    obj['Example']    || '',
      level:      parseInt(obj['Note']) || 0,
      category:   1,
    };
  }).filter(r => r.word);
}

function parseCSVLine(line) {
  const cols = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i+1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === ',' && !q) { cols.push(cur); cur = ''; }
    else cur += c;
  }
  cols.push(cur);
  return cols;
}

// ══════════════════════════════════════
// LIBRARY
// ══════════════════════════════════════
function getSyns(word) {
  const e = csvData.find(r => r.word === word);
  if (!e?.id) return [];
  return csvData.filter(r => r.id === e.id && r.word !== word).map(r => r.word);
}

function getAnts(word) {
  const e = csvData.find(r => r.word === word);
  if (!e?.id) return [];
  return csvData.filter(r => r.id === -e.id).map(r => r.word);
}

function buildRootList() {
  const seen = new Set();
  rootWordList = [];
  csvData.forEach(r => {
    if (!r.id) return;
    const k = Math.abs(r.id);
    if (!seen.has(k)) { seen.add(k); rootWordList.push({ word: r.word, id: r.id }); }
  });
}

function updateStats() {
  document.getElementById('statRootWords').textContent  = rootWordList.length;
  document.getElementById('statTotalWords').textContent = csvData.length;
}

function buildStudyList() {
  let words = [...new Set(csvData.map(r => r.word))];
  if (S.filter === 'root') {
    const roots = new Set(rootWordList.map(r => r.word));
    words = words.filter(w => roots.has(w));
  } else if (S.filter === 'synant') {
    words = words.filter(w => getSyns(w).length > 0 || getAnts(w).length > 0);
  }
  if (S.orderMode === 'az')     words.sort((a,b) => a.localeCompare(b));
  else if (S.orderMode === 'za') words.sort((a,b) => b.localeCompare(a));
  else                           words.sort(() => Math.random() - 0.5);
  return words;
}

// ══════════════════════════════════════
// HOME LIST
// ══════════════════════════════════════
const CHUNK = 30;
let homeShown = 30;

function renderHomeList(n) {
  homeShown = n || CHUNK;
  const container = document.getElementById('rootWordItems');
  const countEl   = document.getElementById('rootWordCount');

  const sorted = [...csvData]
    .filter((r, i, arr) => r.id && arr.findIndex(x => Math.abs(x.id) === Math.abs(r.id)) === i)
    .sort((a,b) => a.word.localeCompare(b.word));

  countEl.textContent = sorted.length + ' words';
  const visible   = sorted.slice(0, homeShown);
  const remaining = sorted.length - homeShown;

  let html = visible.map((r, i) => {
    const s = getSyns(r.word).length > 0;
    const a = getAnts(r.word).length > 0;
    const dot = s && a ? 'dot-both' : s ? 'dot-syn' : a ? 'dot-ant' : '';
    return '<div class="word-list-item" onclick="jumpToWord(\'' + esc(r.word) + '\')">'
      + '<span class="word-list-num">' + (i+1) + '</span>'
      + '<span>' + esc(r.word) + '</span>'
      + (dot ? '<span class="dot-indicator ' + dot + '"></span>' : '')
      + '</div>';
  }).join('');

  if (remaining > 0) {
    const more = Math.min(CHUNK, remaining);
    html += '<div class="home-list-footer">'
      + '<span class="home-list-link" onclick="renderHomeList(' + (homeShown + CHUNK) + ')">view more (+' + more + ')</span>'
      + '<span class="home-list-divider"></span>'
      + '<span class="home-list-link" onclick="renderHomeList(' + sorted.length + ')">view all (' + sorted.length + ')</span>'
      + '</div>';
  }

  container.innerHTML = html;
}

function jumpToWord(word) { startAt(word); }

// ══════════════════════════════════════
// SESSION
// ══════════════════════════════════════
function startSession() {
  S.orderMode  = document.getElementById('orderSelect').value;
  studyList    = buildStudyList();
  currentIndex = 0;
  wordsSeen    = 1;
  startTime    = new Date();
  readHistory  = [];
  customQueue  = [];
  sessionLive  = true;
  updateBar();
  showScreen('study');
  show();
}

function startAt(word) {
  if (!sessionLive) {
    studyList   = buildStudyList();
    startTime   = new Date();
    readHistory = [];
    customQueue = [];
    sessionLive = true;
    updateBar();
  }
  const idx = studyList.indexOf(word);
  currentIndex = idx >= 0 ? idx : 0;
  wordsSeen++;
  showScreen('study');
  show();
}

function updateBar() {
  const labels = { az:'A→Z', za:'Z→A', random:'Random' };
  document.getElementById('sessionSetName').textContent = 'Dictionary';
  document.getElementById('sessionStep').textContent    = S.stepNumber;
  document.getElementById('sessionOrder').textContent   = labels[S.orderMode] || S.orderMode;
}

// ══════════════════════════════════════
// DISPLAY
// ══════════════════════════════════════
function show() {
  if (!studyList.length) return;

  const word  = studyList[currentIndex];
  const entry = csvData.find(r => r.word === word);

  // Track history
  const last = readHistory[readHistory.length - 1];
  if (!last || last.word !== word)
    readHistory.push({ word, index: currentIndex, time: new Date().toLocaleTimeString() });

  // Hero card
  document.getElementById('progressPill').textContent = (currentIndex + 1) + ' / ' + studyList.length;
  document.getElementById('currentWord').textContent  = word;
  document.getElementById('currentRole').textContent  = entry?.role || '';

  const lvl = entry?.level ?? 0;
  const lvlMap = { 0:['Common','level-0'], 1:['Unique','level-1'], 2:['Specific','level-2'], 3:['Colloquial','level-3'] };
  const badge  = document.getElementById('levelBadge');
  badge.textContent = lvlMap[lvl][0];
  badge.className   = 'word-level-badge ' + lvlMap[lvl][1];

  if      (S.mode === 'study')  showStudy(word, entry);
  else if (S.mode === 'revise') showRevise(word, entry);
  // MCQ: future

  if (!document.getElementById('wordListOverlay').classList.contains('hidden')) updatePanel();
}

function tabOrder() {
  return { san:['syn','ant','def'], ans:['ant','syn','def'], msa:['def','syn','ant'], mas:['def','ant','syn'] }[S.tabOrder] || ['syn','ant','def'];
}

function reorderTabs() {
  const wrap = document.getElementById('focusTabs');
  const els  = { syn: document.getElementById('tabSyn'), ant: document.getElementById('tabAnt'), def: document.getElementById('tabDef') };
  tabOrder().forEach(t => wrap.appendChild(els[t]));
}

function activateFirstTab(syns, ants, hasDef, reviseDef) {
  const showDef = S.mode === 'revise' ? reviseDef : hasDef;
  for (const t of tabOrder()) {
    if (t === 'syn' && syns.length)  { switchTab('syn'); return; }
    if (t === 'ant' && ants.length)  { switchTab('ant'); return; }
    if (t === 'def' && showDef)      { switchTab('def'); return; }
  }
  switchTab('syn');
}

function setCards(syns, ants, showDef) {
  document.getElementById('synCard').classList.toggle('hidden',   !syns.length);
  document.getElementById('antCard').classList.toggle('hidden',   !ants.length);
  document.getElementById('defCard').classList.toggle('hidden',   !showDef);
  document.getElementById('emptyCard').classList.toggle('hidden', syns.length > 0 || ants.length > 0 || showDef);
  document.getElementById('tabSyn').classList.toggle('hidden',    !syns.length);
  document.getElementById('tabAnt').classList.toggle('hidden',    !ants.length);
  document.getElementById('tabDef').classList.toggle('hidden',    !showDef);
  document.getElementById('synCount').textContent = syns.length || '';
  document.getElementById('antCount').textContent = ants.length || '';
}

// ── Study mode ──
function showStudy(word, entry) {
  const syns   = getSyns(word);
  const ants   = getAnts(word);
  const hasDef = !!entry?.definition;

  document.getElementById('synChips').innerHTML = syns.map(w => studyChip(w, 'syn')).join('');
  document.getElementById('antChips').innerHTML = ants.map(w => studyChip(w, 'ant')).join('');

  document.getElementById('defContent').innerHTML = hasDef
    ? '<div class="def-text">' + esc(entry.definition) + '</div>'
      + (entry.example ? '<div class="def-example">"' + esc(entry.example) + '"</div>' : '')
    : '';

  setCards(syns, ants, hasDef);
  reorderTabs();
  activateFirstTab(syns, ants, hasDef, false);
}

function studyChip(word, type) {
  const hidden = hiddenWords.has(word) ? ' hidden-word' : '';
  return '<button class="chip ' + type + '-chip' + hidden + '"'
    + ' onmousedown="chipDown(event,\'' + esc(word) + '\')"'
    + ' onmouseup="chipUp()"'
    + ' onmouseleave="chipCancel()"'
    + ' ontouchstart="chipDown(event,\'' + esc(word) + '\')"'
    + ' ontouchmove="chipCancel()"'
    + ' ontouchend="chipUp()"'
    + ' ontouchcancel="chipCancel()"'
    + '>' + esc(word) + '</button>';
}

// ── Revise mode ──
function showRevise(word, entry) {
  const syns   = getSyns(word);
  const ants   = getAnts(word);
  const hasDef = !!entry?.definition;

  if (syns.length) document.getElementById('synChips').innerHTML = buildReviseChips(reviseOpts(syns, [word,...syns,...ants]), 'syn');
  if (ants.length) document.getElementById('antChips').innerHTML = buildReviseChips(reviseOpts(ants, [word,...ants,...syns]), 'ant');

  const showDef = hasDef && S.showMeaning;
  const defEl   = document.getElementById('defContent');

  if (showDef) {
    if (S.meaningOptions) {
      const pool = csvData.filter(r => r.definition && r.word !== word).map(r => r.definition);
      const opts = [entry.definition, ...shuffle(pool).slice(0, S.fixedOptions - 1)].sort(() => Math.random() - 0.5);
      defEl.innerHTML = opts.map(d =>
        '<button class="chip revise-chip def-revise-chip" data-correct="' + (d === entry.definition) + '" onclick="reviseClick(this)">' + esc(d) + '</button>'
      ).join('');
    } else {
      defEl.innerHTML = '<div class="def-text">' + esc(entry.definition) + '</div>'
        + (entry.example ? '<div class="def-example">"' + esc(entry.example) + '"</div>' : '');
    }
  } else {
    defEl.innerHTML = '';
  }

  setCards(syns, ants, showDef);
  reorderTabs();
  activateFirstTab(syns, ants, hasDef, showDef);
}

function reviseOpts(correct, exclude) {
  const total    = S.randomOptionCount
    ? Math.floor(Math.random() * (S.maxOptions - S.minOptions + 1)) + S.minOptions
    : S.fixedOptions;
  const maxRight = Math.max(1, Math.floor(total * S.correctPercent / 100));
  const picked   = shuffle([...correct]).slice(0, Math.min(correct.length, maxRight));
  const pool     = csvData.map(r => r.word).filter(w => !exclude.includes(w));
  const fillers  = shuffle(pool).slice(0, total - picked.length);
  return shuffle([...picked, ...fillers]).map(w => ({ word: w, correct: picked.includes(w) }));
}

function buildReviseChips(opts, type) {
  return opts.map(o => {
    return '<button class="chip ' + type + '-chip revise-chip" data-correct="' + o.correct + '" onclick="reviseClick(this)"'
      + ' onmousedown="chipDown(event,\'' + esc(o.word) + '\')" onmouseup="chipUp()" onmouseleave="chipCancel()"'
      + ' ontouchstart="chipDown(event,\'' + esc(o.word) + '\')" ontouchmove="chipCancel()" ontouchend="chipUp()" ontouchcancel="chipCancel()"'
      + '>' + esc(o.word) + '</button>';
  }).join('');
}

function reviseClick(btn) {
  if (chipHeld)                              { chipHeld = false; return; }
  if (btn.classList.contains('revise-correct') ||
      btn.classList.contains('revise-incorrect')) return;

  const ok   = btn.dataset.correct === 'true';
  const card = btn.closest('.content-card');
  btn.classList.add(ok ? 'revise-correct' : 'revise-incorrect', 'revise-selected');

  if (!ok && S.revealCorrect) {
    card.querySelectorAll('[data-correct="true"]').forEach(el => {
      if (!el.classList.contains('revise-correct')) el.classList.add('revise-revealed');
    });
  }
}

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

// ══════════════════════════════════════
// TABS
// ══════════════════════════════════════
function switchTab(tab) {
  ['syn','ant','def'].forEach(t => {
    const T = t[0].toUpperCase() + t.slice(1);
    document.getElementById('tab' + T)?.classList.toggle('active', t === tab);
    document.getElementById(t + 'Card')?.classList.toggle('hidden', t !== tab);
  });
}

// ══════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════
function effective() { return studyList.filter(w => !hiddenWords.has(w)); }

function nextWord() {
  const eff = effective();
  if (!eff.length) return;
  const ei = eff.indexOf(studyList[currentIndex]);
  const ni = ei + S.stepNumber;
  if (ni >= eff.length) {
    if (!S.loopMode) { alert("You've reached the end."); return; }
    currentIndex = studyList.indexOf(eff[ni % eff.length]);
  } else {
    currentIndex = studyList.indexOf(eff[ni]);
  }
  wordsSeen++; show();
}

function prevWord() {
  const eff = effective();
  if (!eff.length) return;
  const ei = eff.indexOf(studyList[currentIndex]);
  const pi = ei - S.stepNumber;
  if (pi < 0) {
    if (!S.loopMode) { alert("You've reached the beginning."); return; }
    currentIndex = studyList.indexOf(eff[(eff.length + pi % eff.length) % eff.length]);
  } else {
    currentIndex = studyList.indexOf(eff[pi]);
  }
  wordsSeen++; show();
}

// Prev/Next hold — opens word detail of adjacent word
function prevDown() { prevTimer = setTimeout(() => { prevTimer = null; const e = effective(); const i = e.indexOf(studyList[currentIndex]); if (i - S.stepNumber >= 0) openDetail(e[i - S.stepNumber]); }, HOLD_MS); }
function prevUp()   { if (prevTimer) { clearTimeout(prevTimer); prevTimer = null; } }
function nextDown() { nextTimer = setTimeout(() => { nextTimer = null; const e = effective(); const i = e.indexOf(studyList[currentIndex]); if (i + S.stepNumber < e.length) openDetail(e[i + S.stepNumber]); }, HOLD_MS); }
function nextUp()   { if (nextTimer) { clearTimeout(nextTimer); nextTimer = null; } }

// ══════════════════════════════════════
// CHIP HOLD
// ══════════════════════════════════════
function chipDown(e, word) {
  // Check mode-specific toggle at interaction time
  if (S.mode === 'revise' && !S.reviseWordAction) return;
  if (S.mode === 'mcq'    && !S.mcqWordAction)    return;
  // Study mode — always allowed

  if (chipTimer) clearTimeout(chipTimer);
  chipHeld  = false;
  chipTimer = setTimeout(() => {
    chipTimer = null;
    chipHeld  = true;
    e.preventDefault();
    e.stopPropagation();
    openDetail(word);
  }, HOLD_MS);
}

function chipUp()     { if (chipTimer) { clearTimeout(chipTimer); chipTimer = null; } chipHeld = false; }
function chipCancel() { if (chipTimer) { clearTimeout(chipTimer); chipTimer = null; } chipHeld = false; }

// ══════════════════════════════════════
// WORD DETAIL
// ══════════════════════════════════════
function openDetail(word) {
  detailWord = word;
  const e    = csvData.find(r => r.word === word);
  const syns = getSyns(word);
  const ants = getAnts(word);

  document.getElementById('detailWord').textContent = word;

  const lvMap  = { 0:'Common', 1:'Unique', 2:'Specific', 3:'Colloquial' };
  const lvCls  = { 0:'badge-common', 1:'badge-unique', 2:'badge-specific', 3:'badge-colloquial' };
  const lv     = e?.level ?? 0;
  let meta     = '<span class="detail-badge ' + lvCls[lv] + '">' + lvMap[lv] + '</span>';
  if (e?.role) meta += '<span class="detail-badge badge-role">' + esc(e.role) + '</span>';
  document.getElementById('detailMeta').innerHTML = meta;

  let html = '';
  if (e?.definition) {
    html += '<div class="detail-section"><div class="detail-section-title">Definition</div>'
      + '<div class="detail-def">' + esc(e.definition) + '</div>'
      + (e.example ? '<div class="detail-example">"' + esc(e.example) + '"</div>' : '')
      + '</div>';
  }
  if (syns.length) {
    html += '<div class="detail-section"><div class="detail-section-title" style="color:var(--syn)">Synonyms (' + syns.length + ')</div>'
      + '<div class="chips-wrap">' + syns.map(w => detailChip(w,'syn')).join('') + '</div></div>';
  }
  if (ants.length) {
    html += '<div class="detail-section"><div class="detail-section-title" style="color:var(--ant)">Antonyms (' + ants.length + ')</div>'
      + '<div class="chips-wrap">' + ants.map(w => detailChip(w,'ant')).join('') + '</div></div>';
  }
  if (!html) html = '<div class="empty-state">No details available.</div>';

  document.getElementById('detailContent').innerHTML = html;
  document.getElementById('wordDetailOverlay').classList.remove('hidden');
}

function detailChip(word, type) {
  return '<button class="chip ' + type + '-chip"'
    + ' onmousedown="chipDown(event,\'' + esc(word) + '\')" onmouseup="chipUp()" onmouseleave="chipCancel()"'
    + ' ontouchstart="chipDown(event,\'' + esc(word) + '\')" ontouchmove="chipCancel()" ontouchend="chipUp()" ontouchcancel="chipCancel()"'
    + '>' + esc(word) + '</button>';
}

function viewDetailWord() {
  if (detailWord) { closeModal('wordDetailOverlay'); startAt(detailWord); }
}

// ══════════════════════════════════════
// SEARCH
// ══════════════════════════════════════
function initSearch() {
  const inp = document.getElementById('searchInput');
  const clr = document.getElementById('searchClear');

  inp.addEventListener('input', () => {
    const q = inp.value.trim();
    clr.classList.toggle('hidden', !q);
    document.getElementById('searchResults').innerHTML = q.length >= 3
      ? searchHTML(q) : '<div class="search-hint">Type at least 3 characters</div>';
  });

  clr.addEventListener('click', () => {
    inp.value = ''; clr.classList.add('hidden');
    document.getElementById('searchResults').innerHTML = '<div class="search-hint">Type at least 3 characters</div>';
    inp.focus();
  });
}

function searchHTML(q) {
  let rx;
  try { rx = new RegExp(q, 'i'); } catch(e) { rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i'); }

  const words   = [...new Set(csvData.map(r => r.word))];
  const exact   = words.filter(w => w.toLowerCase() === q.toLowerCase());
  const close   = words.filter(w => rx.test(w) && !exact.includes(w));
  const meaning = words.filter(w => {
    const e = csvData.find(r => r.word === w);
    return e?.definition && rx.test(e.definition) && !exact.includes(w) && !close.includes(w);
  });

  function grp(title, list) {
    if (!list.length) return '';
    return '<div><div class="search-group-title">' + title + '</div>'
      + list.slice(0,20).map(w => {
          const e    = csvData.find(r => r.word === w);
          const s    = getSyns(w).length;
          const a    = getAnts(w).length;
          const meta = [s ? s+' syn' : '', a ? a+' ant' : ''].filter(Boolean).join(' · ');
          return '<div class="search-item" onclick="searchJump(\'' + esc(w) + '\')">'
            + '<div><div class="search-item-word">' + esc(w) + '</div>'
            + (e?.definition ? '<div class="search-item-meta" style="font-size:12px;margin-top:2px">' + esc(e.definition.slice(0,60)) + (e.definition.length>60?'…':'') + '</div>' : '')
            + '</div><div class="search-item-meta">' + meta + '</div></div>';
        }).join('')
      + '</div>';
  }

  const html = grp('Exact Match', exact) + grp('Close Matches', close) + grp('Matches in Meaning', meaning);
  return html || '<div class="search-hint">No results for "' + esc(q) + '"</div>';
}

function searchJump(word) {
  if (document.getElementById('searchScreen').classList.contains('active'))
    showScreen(sessionLive ? 'study' : 'home');
  startAt(word);
}

// ══════════════════════════════════════
// WORD LIST PANEL
// ══════════════════════════════════════
function openPanel() {
  panelTab    = 'list';
  panelFilter = '';
  document.getElementById('panelSearchInput').value = '';
  document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.panelTab === 'list'));
  updateSaveBar();
  updatePanel();
  document.getElementById('wordListOverlay').classList.remove('hidden');
}

function updatePanel() {
  const el  = document.getElementById('wordListContent');
  const f   = panelFilter.toLowerCase();
  panelScroll[panelTab] = el.scrollTop;

  if (panelTab === 'list') {
    if (!studyList.length) { el.innerHTML = '<div class="panel-empty">No session active.</div>'; return; }
    el.innerHTML = studyList
      .map((w,i) => ({ w, i }))
      .filter(({ w }) => !f || w.toLowerCase().includes(f))
      .map(({ w, i }) => {
        const cur  = i === currentIndex ? ' current' : '';
        const hide = hiddenWords.has(w) ? ' word-hidden' : '';
        return '<div class="panel-item' + cur + hide + '" id="pi-' + i + '" data-word="' + esc(w) + '" data-index="' + i + '"'
          + ' ontouchstart="panelDown(event,this)" ontouchmove="panelScroll_()" ontouchend="panelUp(event,this)" ontouchcancel="panelCancel()"'
          + ' onmousedown="panelDown(event,this)" onmouseleave="panelCancel()" onmouseup="panelUp(event,this)">'
          + '<span class="panel-item-left"><span class="panel-item-num">' + (i+1) + '</span><span class="panel-item-word">' + esc(w) + '</span></span>'
          + '</div>';
      }).join('');

  } else if (panelTab === 'queue') {
    if (!customQueue.length) { el.innerHTML = '<div class="panel-empty">Queue is empty.</div>'; return; }
    el.innerHTML = customQueue
      .filter(({ word }) => !f || word.toLowerCase().includes(f))
      .map(({ word }, i) =>
        '<div class="panel-item"><span class="panel-item-left">'
        + '<span class="panel-item-num">' + (i+1) + '</span>'
        + '<span class="panel-item-word">' + esc(word) + '</span>'
        + '</span><button class="panel-queue-remove" onclick="removeFromQueue(\'' + esc(word) + '\',event)">✕</button></div>'
      ).join('') || '<div class="panel-empty">No matches.</div>';

  } else {
    if (!readHistory.length) { el.innerHTML = '<div class="panel-empty">No words visited yet.</div>'; return; }
    el.innerHTML = [...readHistory].reverse()
      .filter(({ word }) => !f || word.toLowerCase().includes(f))
      .map(({ word, time }, i) =>
        '<div class="panel-item" onclick="startAt(\'' + esc(word) + '\')">'
        + '<span class="panel-item-left">'
        + '<span class="panel-item-num">' + (i+1) + '</span>'
        + '<span class="panel-item-word">' + esc(word) + '</span>'
        + '</span><span style="font-size:11px;color:var(--text-secondary);flex-shrink:0">' + time + '</span></div>'
      ).join('') || '<div class="panel-empty">No matches.</div>';
  }

  el.scrollTop = panelScroll[panelTab];
}

// Panel hold/tap
function panelDown(e, el) {
  if (panelTimer) clearTimeout(panelTimer);
  panelHeld     = false;
  panelScrolled = false;
  panelTimer    = setTimeout(() => {
    panelTimer = null;
    panelHeld  = true;
    if (el.dataset.word) openAddTo(el.dataset.word);
  }, HOLD_MS);
}

function panelScroll_() {
  if (panelTimer) { clearTimeout(panelTimer); panelTimer = null; }
  panelScrolled = true;
}

function panelCancel() {
  if (panelTimer) { clearTimeout(panelTimer); panelTimer = null; }
  panelHeld = false; panelScrolled = false;
}

function panelUp(e, el) {
  if (panelTimer) { clearTimeout(panelTimer); panelTimer = null; }
  if (panelHeld || panelScrolled) { panelHeld = false; panelScrolled = false; return; }
  const idx = parseInt(el.dataset.index);
  if (!isNaN(idx)) { currentIndex = idx; show(); closeModal('wordListOverlay'); }
}

// Panel save bar
function updateSaveBar() {
  const pfx = { list:'List1', queue:'CustomList', history:'CurrentSession' };
  document.getElementById('panelSaveName').value = listName(pfx[panelTab] || 'List');
}

function savePanelList() {
  const name  = document.getElementById('panelSaveName').value.trim() || listName('List');
  const words = panelTab === 'list' ? studyList
              : panelTab === 'queue' ? customQueue.map(q => q.word)
              : readHistory.map(h => h.word);
  if (!words.length) { alert('Nothing to save.'); return; }
  const saved = JSON.parse(localStorage.getItem('dictSavedLists') || '[]');
  const type  = panelTab === 'queue' ? 2 : panelTab === 'history' ? 1 : 0;
  saved.push({ name, words, type, savedAt: new Date().toISOString() });
  localStorage.setItem('dictSavedLists', JSON.stringify(saved));
  alert('Saved as "' + name + '"');
}

function listName(prefix) {
  const n  = new Date();
  const ua = navigator.userAgent;
  const dev = /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iOS' : /windows/i.test(ua) ? 'Windows' : 'Mac';
  return prefix + '-' + pad(n.getHours()) + ':' + pad(n.getMinutes())
       + '&' + pad(n.getDate()) + '-' + pad(n.getMonth()+1) + '-' + String(n.getFullYear()).slice(2)
       + '@' + dev;
}

function pad(n) { return String(n).padStart(2,'0'); }

// Hidden words
function saveHiddenWords() { localStorage.setItem('dictHidden', JSON.stringify([...hiddenWords])); }
function loadHiddenWords()  { try { hiddenWords = new Set(JSON.parse(localStorage.getItem('dictHidden') || '[]')); } catch(e) {} }

function removeFromQueue(word, e) {
  e.stopPropagation();
  customQueue = customQueue.filter(q => q.word !== word);
  updatePanel();
}

// ══════════════════════════════════════
// ADD TO POPUP
// ══════════════════════════════════════
function openAddTo(word) {
  document.getElementById('addToWordTitle').textContent = '"' + word + '"';
  document.getElementById('addToOverlay').dataset.word  = word;
  pendingAddTo = {
    queue: !!customQueue.find(q => q.word === word),
    hide:  hiddenWords.has(word),
  };
  syncAddTo();
  document.getElementById('addToOverlay').classList.remove('hidden');
}

function syncAddTo() {
  document.querySelectorAll('.addto-btn').forEach(b => b.classList.remove('active'));
  if (pendingAddTo.queue) document.querySelector('[data-flag="queue"]').classList.add('active');
  const hBtn  = document.getElementById('addToHideBtn');
  const hLbl  = document.getElementById('addToHideLabel');
  if (pendingAddTo.hide) {
    hBtn.classList.add('active');
    hBtn.firstChild.textContent = '👁️';
    hLbl.textContent = 'Unhide';
  } else {
    hBtn.firstChild.textContent = '🚫';
    hLbl.textContent = 'Hide';
  }
}

function bindAddTo() {
  document.querySelectorAll('.addto-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const flag = btn.dataset.flag;
      const word = document.getElementById('addToOverlay').dataset.word;
      if (!word) return;
      if (flag === 'queue') {
        pendingAddTo.queue = !pendingAddTo.queue;
        btn.classList.toggle('active', pendingAddTo.queue);
      } else if (flag === 'hide') {
        pendingAddTo.hide = !pendingAddTo.hide;
        btn.classList.toggle('active', pendingAddTo.hide);
        btn.firstChild.textContent = pendingAddTo.hide ? '👁️' : '🚫';
        document.getElementById('addToHideLabel').textContent = pendingAddTo.hide ? 'Unhide' : 'Hide';
      }
    });
  });

  document.getElementById('addToClose').addEventListener('click', () => {
    const word = document.getElementById('addToOverlay').dataset.word;
    if (word) {
      const inQ = !!customQueue.find(q => q.word === word);
      if (pendingAddTo.queue && !inQ)  customQueue.push({ word });
      if (!pendingAddTo.queue && inQ)  customQueue = customQueue.filter(q => q.word !== word);
      if (pendingAddTo.hide)  hiddenWords.add(word);
      else                    hiddenWords.delete(word);
      saveHiddenWords();
      updatePanel();
      if (studyList.length) show();
    }
    closeModal('addToOverlay');
  });

  document.getElementById('addToClear').addEventListener('click', () => {
    const word = document.getElementById('addToOverlay').dataset.word;
    if (word) {
      pendingAddTo = { queue: !!customQueue.find(q => q.word === word), hide: hiddenWords.has(word) };
      syncAddTo();
    }
  });
}

// ══════════════════════════════════════
// INFO / QUIT
// ══════════════════════════════════════
function showInfo() {
  const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
  const m = Math.floor(elapsed / 60), s = elapsed % 60;
  document.getElementById('infoContent').innerHTML =
    row('Time', m + 'm ' + s + 's', true) +
    row('Mode', S.mode) + row('Order', S.orderMode === 'az' ? 'A→Z' : S.orderMode === 'za' ? 'Z→A' : 'Random') +
    row('Total', studyList.length) + row('Seen', wordsSeen) +
    row('Position', (currentIndex+1) + ' / ' + studyList.length) +
    row('Hidden', hiddenWords.size) + row('Queue', customQueue.length);
  document.getElementById('infoOverlay').classList.remove('hidden');
}

function row(label, val, accent) {
  return '<div class="info-row"><span class="info-row-label">' + label + '</span>'
    + '<span class="info-row-value' + (accent ? ' accent' : '') + '">' + val + '</span></div>';
}

function quitSession() {
  if (customQueue.length) {
    const saved = JSON.parse(localStorage.getItem('dictSavedLists') || '[]');
    saved.push({ name: listName('CustomList'), words: customQueue.map(q => q.word), type: 2, savedAt: new Date().toISOString() });
    localStorage.setItem('dictSavedLists', JSON.stringify(saved));
  }
  localStorage.removeItem('dictCurrentSession');
  localStorage.removeItem('dictCurrentQueue');
  studyList = []; currentIndex = 0; wordsSeen = 0;
  startTime = null; readHistory = []; customQueue = []; sessionLive = false;
  closeModal('infoOverlay');
  showScreen('home');
}

// ══════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════
function openSettings() {
  pending = Object.assign({}, S);
  syncSettingsUI();
  showConditional(S.mode);
  document.getElementById('settingsOverlay').classList.remove('hidden');
}

function showConditional(mode) {
  document.querySelectorAll('.study-only').forEach(el  => el.classList.toggle('hidden', mode !== 'study'));
  document.querySelectorAll('.revise-only').forEach(el => el.classList.toggle('hidden', mode !== 'revise'));
  document.querySelectorAll('.mcq-only').forEach(el    => el.classList.toggle('hidden', mode !== 'mcq'));
}

function syncSettingsUI() {
  const p = pending;
  document.getElementById('modeStudyToggle').checked  = p.mode === 'study';
  document.getElementById('modeReviseToggle').checked = p.mode === 'revise';
  document.getElementById('modeMCQToggle').checked    = p.mode === 'mcq';

  btn('data-step',          'stepNumber',    p);
  btn('data-taborder',      'tabOrder',      p);
  btn('data-correctpct',    'correctPercent',p);
  btn('data-minopt',        'minOptions',    p);
  btn('data-maxopt',        'maxOptions',    p);
  btn('data-fixedopt',      'fixedOptions',  p);
  btn('data-mcqopt',        'mcqOptions',    p);
  btn('data-mcqmaxcorrect', 'mcqMaxCorrect', p);
  btn('data-delta',         'navDelta',      p);

  tog('loopToggle',             'loopMode');
  tog('translationToggle',      'showTranslation');
  tog('highlightToggle',        'wordHighlight');
  tog('showSimilarToggle',      'showSimilar');
  tog('showMeaningToggle',      'showMeaning');
  tog('meaningOptionsToggle',   'meaningOptions');
  tog('randomOptToggle',        'randomOptionCount');
  tog('revealCorrectToggle',    'revealCorrect');
  tog('reviseWordActionToggle', 'reviseWordAction');
  tog('mcqRandomizeToggle',     'mcqRandomize');
  tog('showClockToggle',        'showClock');
  tog('mcqWordActionToggle',    'mcqWordAction');

  // Navigation filter toggles
  tog('stepActionToggle',    'stepAction');
  tog('navFilterToggle',     'navFilter');
  tog('nxtBehaviorToggle',   'nxtBehavior');
  tog('prevBehaviorToggle',  'prevBehavior');
  tog('randomNavToggle',     'randomNav');
  tog('suggestMarkedToggle', 'suggestMarked');

  // Nav filter checkboxes
  document.getElementById('navSynAntChk').checked   = !!p.navSynAnt;
  document.getElementById('navDefinedChk').checked  = !!p.navDefined;
  document.getElementById('navRootwiseChk').checked = !!p.navRootwise;

  // Suggest Marked for random order mode
  if (document.getElementById('suggestMarkedRandomToggle'))
    document.getElementById('suggestMarkedRandomToggle').checked = !!p.suggestMarked;

  // Conditional visibility
  document.querySelector('.meaning-options-row').classList.toggle('hidden', !p.showMeaning);
  document.querySelectorAll('.random-opts-row').forEach(r => r.classList.toggle('hidden', !p.randomOptionCount));
  document.querySelector('.fixed-opts-row').classList.toggle('hidden', !!p.randomOptionCount);
  document.getElementById('navFilterOptions').classList.toggle('hidden', !p.navFilter);
  document.getElementById('navRootwiseOptions').classList.toggle('hidden', !p.navRootwise);
  syncNavRandomUI(p);
}

function syncNavRandomUI(p) {
  const isRandom = p.orderMode === 'random';
  document.getElementById('navRandomSection').classList.toggle('hidden', isRandom);
  document.getElementById('navRandomOrderSection').classList.toggle('hidden', !isRandom);
  if (!isRandom) {
    document.getElementById('navRandomOptions').classList.toggle('hidden', !p.randomNav);
  }
}

function btn(attr, key, p) {
  const val = String(p[key]);
  document.querySelectorAll('[' + attr + ']').forEach(b => {
    b.classList.toggle('active', b.getAttribute(attr) === val);
  });
}

function tog(id, key) {
  const el = document.getElementById(id);
  if (el) el.checked = !!pending[key];
}

function bindSettingsEvents() {
  // Mode toggles
  ['modeStudyToggle','modeReviseToggle','modeMCQToggle'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
      if (!pending) return;
      if (!e.target.checked) { e.target.checked = true; return; }
      const mode = id === 'modeStudyToggle' ? 'study' : id === 'modeReviseToggle' ? 'revise' : 'mcq';
      pending.mode = mode;
      document.getElementById('modeStudyToggle').checked  = mode === 'study';
      document.getElementById('modeReviseToggle').checked = mode === 'revise';
      document.getElementById('modeMCQToggle').checked    = mode === 'mcq';
      showConditional(mode);
    });
  });

  // Button groups
  function bindBtn(attr, key, parse) {
    document.querySelectorAll('[' + attr + ']').forEach(b => {
      b.addEventListener('click', () => {
        if (!pending) return;
        document.querySelectorAll('[' + attr + ']').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        pending[key] = parse ? parse(b.getAttribute(attr)) : b.getAttribute(attr);
      });
    });
  }

  bindBtn('data-step',          'stepNumber',    parseInt);
  bindBtn('data-filter',        'filter',        null);
  bindBtn('data-taborder',      'tabOrder',      null);
  bindBtn('data-correctpct',    'correctPercent',parseInt);
  bindBtn('data-minopt',        'minOptions',    parseInt);
  bindBtn('data-maxopt',        'maxOptions',    parseInt);
  bindBtn('data-fixedopt',      'fixedOptions',  parseInt);
  bindBtn('data-mcqopt',        'mcqOptions',    parseInt);
  bindBtn('data-mcqmaxcorrect', 'mcqMaxCorrect', parseInt);

  // Toggles
  function bindTog(id, key, onchange) {
    document.getElementById(id).addEventListener('change', e => {
      if (!pending) return;
      pending[key] = e.target.checked;
      if (onchange) onchange(e.target.checked);
    });
  }

  bindTog('loopToggle',             'loopMode');
  bindTog('translationToggle',      'showTranslation');
  bindTog('highlightToggle',        'wordHighlight');
  bindTog('showSimilarToggle',      'showSimilar');
  bindTog('showMeaningToggle',      'showMeaning',    v => document.querySelector('.meaning-options-row').classList.toggle('hidden', !v));
  bindTog('meaningOptionsToggle',   'meaningOptions');
  bindTog('randomOptToggle',        'randomOptionCount', v => {
    document.querySelectorAll('.random-opts-row').forEach(r => r.classList.toggle('hidden', !v));
    document.querySelector('.fixed-opts-row').classList.toggle('hidden', v);
  });
  bindTog('revealCorrectToggle',    'revealCorrect');
  bindTog('reviseWordActionToggle', 'reviseWordAction');
  bindTog('mcqRandomizeToggle',     'mcqRandomize');
  bindTog('showClockToggle',        'showClock');
  bindTog('mcqWordActionToggle',    'mcqWordAction');

  // Navigation filter bindings
  bindTog('stepActionToggle',   'stepAction');
  bindTog('navFilterToggle',    'navFilter',   v => document.getElementById('navFilterOptions').classList.toggle('hidden', !v));
  bindTog('nxtBehaviorToggle',  'nxtBehavior');
  bindTog('prevBehaviorToggle', 'prevBehavior');
  bindTog('randomNavToggle',    'randomNav',   v => document.getElementById('navRandomOptions').classList.toggle('hidden', !v));
  bindTog('suggestMarkedToggle','suggestMarked');
  bindTog('suggestMarkedRandomToggle', 'suggestMarked');

  // Nav filter checkboxes
  ['navSynAntChk','navDefinedChk','navRootwiseChk'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
      if (!pending) return;
      const key = id === 'navSynAntChk' ? 'navSynAnt' : id === 'navDefinedChk' ? 'navDefined' : 'navRootwise';
      pending[key] = e.target.checked;
      if (key === 'navRootwise')
        document.getElementById('navRootwiseOptions').classList.toggle('hidden', !e.target.checked);
    });
  });

  // Delta selector
  bindBtn('data-delta', 'navDelta', parseInt);

  // Save
  document.getElementById('settingsSave').addEventListener('click', () => {
    if (pending) {
      const modeChanged     = pending.mode     !== S.mode;
      const tabOrderChanged = pending.tabOrder  !== S.tabOrder;
      const reviseChanged   = S.mode === 'revise' && (
        pending.showMeaning       !== S.showMeaning       ||
        pending.meaningOptions    !== S.meaningOptions    ||
        pending.correctPercent    !== S.correctPercent    ||
        pending.randomOptionCount !== S.randomOptionCount ||
        pending.minOptions        !== S.minOptions        ||
        pending.maxOptions        !== S.maxOptions        ||
        pending.fixedOptions      !== S.fixedOptions
      );

      Object.assign(S, pending);
      saveSettings();
      applyAppearance();
      document.getElementById('sessionStep').textContent = S.stepNumber;

      if (studyList.length && (modeChanged || tabOrderChanged || reviseChanged))
        show();
    }
    pending = null;
    closeModal('settingsOverlay');
  });

  // Close
  document.getElementById('settingsClose').addEventListener('click', () => {
    pending = null;
    closeModal('settingsOverlay');
  });

  // Click outside
  document.getElementById('settingsOverlay').addEventListener('click', e => {
    if (e.target.id === 'settingsOverlay') { pending = null; closeModal('settingsOverlay'); }
  });
}

// ── Customise ──
function openCustomise() {
  pending = Object.assign({}, S);
  syncCustomiseUI();
  document.getElementById('customiseOverlay').classList.remove('hidden');
}

function syncCustomiseUI() {
  document.querySelectorAll('[data-size]').forEach(b    => b.classList.toggle('active',   b.dataset.size   === pending.fontSize));
  document.querySelectorAll('[data-accent]').forEach(b  => b.classList.toggle('selected', b.dataset.accent === pending.accent));
  document.querySelectorAll('[data-theme]').forEach(b   => b.classList.toggle('selected', b.dataset.theme  === pending.theme));
}

function bindCustomiseEvents() {
  document.querySelectorAll('[data-size]').forEach(b => b.addEventListener('click', () => {
    if (!pending) return;
    document.querySelectorAll('[data-size]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    pending.fontSize = b.dataset.size;
  }));
  document.querySelectorAll('[data-accent]').forEach(b => b.addEventListener('click', () => {
    if (!pending) return;
    document.querySelectorAll('[data-accent]').forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    pending.accent = b.dataset.accent;
  }));
  document.querySelectorAll('[data-theme]').forEach(b => b.addEventListener('click', () => {
    if (!pending) return;
    document.querySelectorAll('[data-theme]').forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    pending.theme = b.dataset.theme;
  }));
  document.getElementById('customiseSave').addEventListener('click', () => {
    if (pending) { Object.assign(S, pending); saveSettings(); applyAppearance(); }
    pending = null; closeModal('customiseOverlay');
  });
  document.getElementById('customiseClose').addEventListener('click', () => {
    pending = null; closeModal('customiseOverlay');
  });
  document.getElementById('customiseOverlay').addEventListener('click', e => {
    if (e.target.id === 'customiseOverlay') { pending = null; closeModal('customiseOverlay'); }
  });
}

// ── Persistence ──
function saveSettings() { localStorage.setItem('dictSettings', JSON.stringify(S)); }
function loadSettings() {
  try {
    const saved  = JSON.parse(localStorage.getItem('dictSettings') || '{}');
    const accent = localStorage.getItem('dictAccent');
    Object.assign(S, saved);
    if (accent) S.accent = accent;
  } catch(e) {}
}

function applyAppearance() {
  document.body.className = document.body.className
    .replace(/accent-\w+/g,'').replace(/theme-\w+/g,'').replace(/font-\w+/g,'').trim();
  document.body.classList.add('accent-' + S.accent, 'theme-' + (S.theme || 'navy'), 'font-' + S.fontSize);
  localStorage.setItem('dictAccent', S.accent);
}

// ══════════════════════════════════════
// MODALS
// ══════════════════════════════════════
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ══════════════════════════════════════
// BIND ALL EVENTS
// ══════════════════════════════════════
function bindAll() {
  bindGate();
  initSearch();
  bindSettingsEvents();
  bindCustomiseEvents();
  bindAddTo();

  // Home
  document.getElementById('startBtn').addEventListener('click', startSession);
  document.getElementById('homeSearchBtn').addEventListener('click', () => showScreen('search'));
  document.getElementById('homeBookBtn').addEventListener('click', handleBook);
  document.getElementById('customiseBtn').addEventListener('click', openCustomise);
  document.getElementById('logoutBtn').addEventListener('click', () => {
    if (!confirm('Are you sure you want to logout?')) return;
    localStorage.removeItem('dictSession'); sessionStorage.removeItem('dictSession');
    showScreen('gate');
  });

  // Study navbar
  document.getElementById('studyHomeBtn').addEventListener('click', goHome);
  document.getElementById('infoBtn').addEventListener('click', showInfo);
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('wordListBtn').addEventListener('click', openPanel);

  // Prev / Next — click navigates, hold opens word detail
  const pb = document.getElementById('prevBtn');
  const nb = document.getElementById('nextBtn');
  pb.addEventListener('click', prevWord);
  nb.addEventListener('click', nextWord);
  pb.addEventListener('mousedown',   prevDown); pb.addEventListener('mouseup',     prevUp);
  pb.addEventListener('mouseleave',  prevUp);
  pb.addEventListener('touchstart',  prevDown, { passive: true });
  pb.addEventListener('touchend',    prevUp); pb.addEventListener('touchcancel', prevUp);
  nb.addEventListener('mousedown',   nextDown); nb.addEventListener('mouseup',     nextUp);
  nb.addEventListener('mouseleave',  nextUp);
  nb.addEventListener('touchstart',  nextDown, { passive: true });
  nb.addEventListener('touchend',    nextUp); nb.addEventListener('touchcancel', nextUp);

  // Search back
  document.getElementById('searchBackBtn').addEventListener('click', () => showScreen(sessionLive ? 'study' : 'home'));

  // Panel tabs
  document.querySelectorAll('.panel-tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.panel-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    panelTab = t.dataset.panelTab;
    updateSaveBar(); updatePanel();
  }));
  document.getElementById('panelSaveBtn').addEventListener('click', savePanelList);
  document.getElementById('panelSearchInput').addEventListener('input', e => { panelFilter = e.target.value.trim(); updatePanel(); });
  document.getElementById('wordListClose').addEventListener('click', () => closeModal('wordListOverlay'));
  document.getElementById('wordListOverlay').addEventListener('click', e => { if (e.target.id === 'wordListOverlay') closeModal('wordListOverlay'); });

  // Info
  document.getElementById('infoClose').addEventListener('click', () => closeModal('infoOverlay'));
  document.getElementById('infoQuit').addEventListener('click', quitSession);
  document.getElementById('infoOverlay').addEventListener('click', e => { if (e.target.id === 'infoOverlay') closeModal('infoOverlay'); });

  // Word detail
  document.getElementById('wordDetailClose').addEventListener('click', () => closeModal('wordDetailOverlay'));
  document.getElementById('wordDetailView').addEventListener('click', viewDetailWord);
  document.getElementById('wordDetailOverlay').addEventListener('click', e => { if (e.target.id === 'wordDetailOverlay') closeModal('wordDetailOverlay'); });

  // Add To overlay
  document.getElementById('addToOverlay').addEventListener('click', e => { if (e.target.id === 'addToOverlay') closeModal('addToOverlay'); });

  // Quick Nav popup
  document.getElementById('quickNavClose').addEventListener('click', () => closeModal('quickNavOverlay'));
  document.getElementById('quickNavOverlay').addEventListener('click', e => { if (e.target.id === 'quickNavOverlay') closeModal('quickNavOverlay'); });

  // Keyboard shortcuts (study screen only)
  document.addEventListener('keydown', e => {
    if (document.querySelector('.screen.active')?.id !== 'studyScreen') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextWord();
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   prevWord();
    if (e.key === 'Escape') ['settingsOverlay','infoOverlay','wordDetailOverlay','wordListOverlay','addToOverlay'].forEach(closeModal);
  });
}

// ══════════════════════════════════════
// UTILITY
// ══════════════════════════════════════
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
