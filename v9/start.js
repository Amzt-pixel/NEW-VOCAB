/* ══════════════════════════════════════
   DICTIONARY — start.js  (home + session startup)
   ══════════════════════════════════════ */

const CSV_URL = 'https://raw.githubusercontent.com/Amzt-pixel/NEW-VOCAB/main/dict_demo.csv';

// ── Home state ──
let demoStudyList  = [];
let homeListMode   = 'root';    // 'root' or 'all'
let homeSourceMode = 'dynamic'; // 'dynamic' or 'static'
let homeSelMode    = 'normal';  // 'normal' or 'custom'
const CHUNK = 30;
let homeShown = 30;

// ══════════════════════════════════════
// DATA — CSV loading and parsing
// ══════════════════════════════════════
async function loadData() {
  try {
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    parseCSV(await res.text());
    buildRootList();
    demoStudyList = buildDemoStudyList();
    updateStats();
    renderHomeList();
    renderQueueCards();
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
      word:       obj['Word']        || '',
      id:         parseFloat(obj['NumId']) || 0,
      category:   parseInt(obj['Category']) || 1,
      role:       obj['Role']        || '',
      definition: obj['Definition1'] || '',
      definition2:obj['Definition2'] || '',
      example:    obj['Example1']    || '',
      example2:   obj['Example2']    || '',
      example3:   obj['Example3']    || '',
      example4:   obj['Example4']    || '',
      example5:   obj['Example5']    || '',
      bengaliDef: obj['BengaliDef']  || '',
      bengaliEx1: obj['BengaliEx1']  || '',
      bengaliEx2: obj['BengaliEx2']  || '',
      bengaliEx3: obj['BengaliEx3']  || '',
      refWord:    obj['RefWord']     || '',
      level:      parseInt(obj['Level']) || 0,
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

function buildRootList() {
  const seen = new Set();
  rootWordList = [];
  csvData.forEach(r => {
    if (!r.id) return;
    const k = Math.abs(r.id);
    if (!seen.has(k)) { seen.add(k); rootWordList.push({ word: r.word, id: r.id }); }
  });
}

// ══════════════════════════════════════
// STATS
// ══════════════════════════════════════
function updateStats() {
  const source = demoStudyList.length ? demoStudyList : studyList.length ? studyList : null;
  if (!source) {
    document.getElementById('statRootWords').textContent  = rootWordList.length;
    document.getElementById('statTotalWords').textContent = csvData.length;
    document.getElementById('statCategories').textContent = '3';
    return;
  }
  const sourceSet = new Set(source);
  const rootCount = rootWordList.filter(r => sourceSet.has(r.word)).length;
  const cats = new Set(source.map(w => { const e = csvData.find(r => r.word === w); return e?.category; }).filter(Boolean));
  document.getElementById('statRootWords').textContent  = rootCount;
  document.getElementById('statTotalWords').textContent = source.length;
  document.getElementById('statCategories').textContent = cats.size;
}

// ══════════════════════════════════════
// LIST BUILDERS
// ══════════════════════════════════════
function buildStudyList() {
  let words = [...new Set(csvData.map(r => r.word))];
  const cat = getActiveCat();
  if (cat) words = words.filter(w => { const e = csvData.find(r => r.word === w); return e?.category === parseInt(cat); });
  if (S.filter === 'root') {
    const roots = new Set(rootWordList.map(r => r.word));
    words = words.filter(w => roots.has(w));
  } else if (S.filter === 'synant') {
    words = words.filter(w => getSyns(w).length > 0 || getAnts(w).length > 0);
  }
  if (S.orderMode === 'az')      words.sort((a,b) => a.localeCompare(b));
  else if (S.orderMode === 'za') words.sort((a,b) => b.localeCompare(a));
  else                           words.sort(() => Math.random() - 0.5);
  return words;
}

function buildDemoStudyList() {
  const cat   = getActiveCat();
  const order = getActiveOrder();
  let words   = [...new Set(csvData.map(r => r.word))];
  if (cat) words = words.filter(w => { const e = csvData.find(r => r.word === w); return e?.category === parseInt(cat); });
  if (order === 'az')      words.sort((a,b) => a.localeCompare(b));
  else if (order === 'za') words.sort((a,b) => b.localeCompare(a));
  else                     words.sort(() => Math.random() - 0.5);
  return words;
}

// ══════════════════════════════════════
// SEG BTN HELPERS
// ══════════════════════════════════════
function getActiveCat() {
  const b = document.querySelector('#catBtns .seg-btn.active');
  return b ? b.dataset.cat : '';
}

function getActiveOrder() {
  const b = document.querySelector('#orderBtns .seg-btn.active');
  return b ? b.dataset.order : 'az';
}

function setActiveSegBtn(groupId, dataAttr, value) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.getAttribute(dataAttr) === value));
}

function resetSegBtnsToDefault() {
  setActiveSegBtn('catBtns',   'data-cat',   '');
  setActiveSegBtn('orderBtns', 'data-order', 'az');
}

// ══════════════════════════════════════
// SELECTION MODE (Normal / Custom)
// ══════════════════════════════════════
function setSelMode(mode, btn) {
  homeSelMode = mode;
  btn.closest('.sel-toggle').querySelectorAll('.sel-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('normalPanel').style.display = mode === 'normal' ? 'block' : 'none';
  document.getElementById('customPanel').style.display = mode === 'custom'  ? 'block' : 'none';
}

// ══════════════════════════════════════
// QUEUE CARDS
// ══════════════════════════════════════
function renderQueueCards() {
  const catLabel = c => c === '1' ? 'Dictionary' : c === '2' ? 'Idioms' : c === '3' ? 'Phrasal Verbs' : 'All Categories';

  const latest = JSON.parse(localStorage.getItem('dictCurrentSession') || 'null');
  const latestMeta = document.getElementById('latestSessionMeta');
  if (latestMeta) {
    latestMeta.textContent = (latest?.wordUids?.length)
      ? latest.wordUids.length + ' ' + catLabel(latest.category) + ' | ' + formatSessionDate(latest.startedAt)
      : 'No active session';
  }

  const past = JSON.parse(localStorage.getItem('dictLastSession') || 'null');
  const pastMeta = document.getElementById('pastSessionMeta');
  if (pastMeta) {
    pastMeta.textContent = (past?.wordUids?.length)
      ? past.wordUids.length + ' ' + catLabel(past.category) + ' | ' + formatSessionDate(past.savedAt)
      : 'No past session';
  }

  // Latest Custom Queue
  const queue = JSON.parse(localStorage.getItem('dictCurrentQueue') || 'null');
  const queueMeta = document.getElementById('latestQueueMeta');
  if (queueMeta) {
    queueMeta.textContent = (queue?.length)
      ? queue.length + ' words | ' + formatSessionDate(queue[0]?.addedAt)
      : 'No queue active';
  }
   renderPinnedGrid();
}

function renderPinnedGrid() {
  const grid = document.getElementById('pinnedGrid');
  if (!grid) return;
  const pins = JSON.parse(localStorage.getItem('dictImportantSessions') || '[]');
  const catLabel = c => c === '1' ? 'Dictionary' : c === '2' ? 'Idioms' : c === '3' ? 'Phrasal Verbs' : 'All';

  let html = '';
  for (let i = 0; i < 4; i++) {
    const pin     = pins[i] || null;
    const isEmpty = !pin;
    const id      = pin?.id || ('pin' + i);
    const name    = 'Pin ' + (i + 1) + (pin ? ' (' + id + ')' : '');
    const meta    = pin?.wordUids
      ? pin.wordUids.length + ' ' + catLabel(pin.category) + ' | ' + formatSessionDate(pin.savedAt)
      : '— | — —';

    html += '<div class="queue-card' + (isEmpty ? ' empty' : '') + '"'
      + (isEmpty ? '' : ' onclick="openQueue(\'local:' + id + '\')"') + '>'
      + '<div class="qc-top"><div>'
      + '<div class="qc-name">' + name + '</div>'
      + '<div class="qc-meta">' + meta + '</div>'
      + '</div><span class="qc-badge badge-pin">Pin</span></div>'
      + '<div class="qc-actions" onclick="event.stopPropagation()">'
      + '<button class="qc-btn qc-accent"' + (isEmpty ? ' disabled' : ' onclick="savePinned(' + i + ')"') + '>Save</button>'
      + '<button class="qc-btn qc-danger"' + (isEmpty ? ' disabled' : ' onclick="deletePin(' + i + ')"') + '>Delete</button>'
      + '</div></div>';
  }
  grid.innerHTML = html;
}

function formatSessionDate(isoStr) {
  try {
    const d   = new Date(isoStr);
    const now = new Date();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString())       return t + ' Today';
    if (d.toDateString() === yesterday.toDateString()) return t + ' Yesterday';
    return t + ' ' + d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  } catch(e) { return '—'; }
}
/*
function openQueue(id) {
  if (homeSelMode !== 'custom') {
    const selBtns = document.querySelectorAll('.sel-toggle .sel-btn');
    selBtns.forEach(b => b.classList.remove('active'));
    selBtns[1].classList.add('active');
    homeSelMode = 'custom';
    document.getElementById('normalPanel').style.display = 'none';
    document.getElementById('customPanel').style.display = 'block';
  }
  const inp = document.getElementById('queueIdInput');
  if (inp) inp.value = id;
  document.querySelector('.start-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
*/

function openQueue(id) {
  switchStartTab('custom', document.querySelectorAll('.start-tab')[1]);
  const inp = document.getElementById('queueIdInput');
  if (inp) inp.value = id;
  document.querySelector('.start-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function savePinned(index) {
  const pins = JSON.parse(localStorage.getItem('dictImportantSessions') || '[]');
  const pin  = pins[index];
  if (!pin?.wordUids) return;
  const saved = JSON.parse(localStorage.getItem('dictSavedLists') || '[]');
  saved.push({ name: listName('Pin' + (index + 1)), words: pin.wordUids, type: 1, savedAt: new Date().toISOString() });
  localStorage.setItem('dictSavedLists', JSON.stringify(saved));
  alert('Saved!');
}

function deletePin(index) {
  const pins = JSON.parse(localStorage.getItem('dictImportantSessions') || '[]');
  pins.splice(index, 1);
  localStorage.setItem('dictImportantSessions', JSON.stringify(pins));
  renderPinnedGrid();
}

// ══════════════════════════════════════
// HOME LIST
// ══════════════════════════════════════
function renderHomeList(n) {
  homeShown = n || CHUNK;
  const container = document.getElementById('rootWordItems');
  const countEl   = document.getElementById('rootWordCount');
  const labelEl   = document.getElementById('homeListLabel');
  const btn1      = document.getElementById('homeListBtn1');
  const btn2      = document.getElementById('homeListBtn2');

  const source      = homeSourceMode === 'dynamic' ? demoStudyList : studyList;
  const modeLabel   = homeListMode   === 'root' ? 'Root Words' : 'All Words';
  const sourceLabel = homeSourceMode === 'dynamic' ? 'Dynamic' : 'Static';
  if (labelEl) labelEl.textContent = modeLabel + ' | ' + sourceLabel;

  if (btn1) {
    btn1.title = homeListMode === 'root' ? 'Switch to All' : 'Switch to Root';
    btn1.classList.toggle('on', homeListMode === 'all');
  }
  if (btn2) {
    const canToggle = studyList.length > 0 && demoStudyList.length > 0;
    btn2.disabled = !canToggle;
    btn2.style.opacity = canToggle ? '1' : '0.4';
    btn2.title = homeSourceMode === 'dynamic' ? 'Switch to Static' : 'Switch to Dynamic';
    btn2.classList.toggle('on', homeSourceMode === 'static');
  }

  let words = [...source];
  if (homeListMode === 'root') {
    const rootSet = new Set(rootWordList.map(r => r.word));
    words = words.filter(w => rootSet.has(w));
  }

  countEl.textContent = words.length + ' words';
  const visible   = words.slice(0, homeShown);
  const remaining = words.length - homeShown;

  let html = visible.map((w, i) => {
    const s   = getSyns(w).length > 0;
    const a   = getAnts(w).length > 0;
    const dot = s && a ? 'dot-both' : s ? 'dot-syn' : a ? 'dot-ant' : '';
    const e   = csvData.find(r => r.word === w);
    const idx = source.indexOf(w);
    const lvlMap = { 0:'Common', 1:'Unique', 2:'Specific', 3:'Colloquial' };
    const lvlCls = { 0:'wl-level-0', 1:'wl-level-1', 2:'wl-level-2', 3:'wl-level-3' };
    const lvl    = e?.level ?? 0;
    const pos    = idx >= 0 ? idx + 1 : i + 1;
    return '<div class="word-list-item" onclick="handleWordListClick(\'' + esc(w) + '\',' + pos + ')">'
      + '<span class="word-list-num">' + pos + '</span>'
      + '<span class="wl-word">' + esc(w) + ' <span class="wl-id">#' + (e?.id || '—') + '</span></span>'
      + '<span class="wl-level ' + lvlCls[lvl] + '">' + lvlMap[lvl] + '</span>'
      + (dot ? '<span class="dot-indicator ' + dot + '"></span>' : '')
      + '</div>';
  }).join('');

  if (remaining > 0) {
    const more = Math.min(CHUNK, remaining);
    html += '<div class="home-list-footer">'
      + '<span class="home-list-link" onclick="renderHomeList(' + (homeShown + CHUNK) + ')">view more (+' + more + ')</span>'
      + '<span class="home-list-divider"></span>'
      + '<span class="home-list-link" onclick="renderHomeList(' + words.length + ')">view all (' + words.length + ')</span>'
      + '</div>';
  }

  if (!words.length) html = '<div class="list-loading">No words match current selection.</div>';
  container.innerHTML = html;
  updateStats();
}

function handleWordListClick(word, pos) {
  if (!sessionLive) { feedStartAt(pos); return; }
  if (homeSourceMode === 'static') {
    const idx = studyList.indexOf(word);
    if (idx >= 0) { currentIndex = idx; showScreen('study'); show(); }
    return;
  }
  feedStartAt(pos);
}

function feedStartAt(pos) {
  const idMap = { normal: 'startAtNormal', custom: 'startAtCustom', import: 'startAtImport' };
  const inp = document.getElementById(idMap[homeSelMode] || 'startAtNormal');
  if (inp) { inp.value = pos; inp.focus(); inp.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}

function toggleHomeListMode() {
  homeListMode = homeListMode === 'root' ? 'all' : 'root';
  homeShown = CHUNK; renderHomeList();
}

function toggleHomeSourceMode() {
  if (!(studyList.length > 0 && demoStudyList.length > 0)) return;
  homeSourceMode = homeSourceMode === 'dynamic' ? 'static' : 'dynamic';
  homeShown = CHUNK; renderHomeList();
}

// ══════════════════════════════════════
// SESSION
// ══════════════════════════════════════
function startSession() {
  const order   = getActiveOrder();
  const cat     = getActiveCat();
  const startAt = parseInt(document.getElementById('startAtNormal')?.value || '1') - 1;

  S.orderMode   = order;
  S.category    = cat;
  studyList     = demoStudyList.length ? [...demoStudyList] : buildDemoStudyList();
  demoStudyList = [];
  currentIndex  = Math.max(0, Math.min(startAt, studyList.length - 1));
  wordsSeen     = 1;
  startTime     = new Date();
  readHistory   = [];
  customQueue   = [];
  sessionLive   = true;
  homeSourceMode = 'static';
  updateBar();
  navSessionStart();
  showScreen('study');
  show();
}

function startAt(word) {
  if (!sessionLive) {
    S.orderMode   = getActiveOrder();
    S.category    = getActiveCat();
    studyList     = demoStudyList.length ? [...demoStudyList] : buildDemoStudyList();
    demoStudyList = [];
    startTime     = new Date();
    readHistory   = [];
    customQueue   = [];
    sessionLive   = true;
    homeSourceMode = 'static';
    updateBar();
    navSessionStart();
  }
  const idx = studyList.indexOf(word);
  currentIndex = idx >= 0 ? idx : 0;
  wordsSeen++;
  showScreen('study');
  show();
}

function updateBar() {
  document.getElementById('sessionStep').textContent = S.stepNumber;
  document.getElementById('sessionLoopIcon').textContent = S.loopMode ? '🔁' : '';
  const filterEl = document.getElementById('sessionFilterChip');
  if (S.navFilter) {
    const parts = [];
    if (S.navSynAnt)   parts.push('Sy/An');
    if (S.navDefined)  parts.push('Dfn');
    if (S.navRootwise) parts.push('Root');
    filterEl.textContent = 'Filter: ' + parts.join('·');
  } else {
    filterEl.textContent = '';
  }
}

// ══════════════════════════════════════
// QUIT HOOK — called by app.js quitSession()
// ══════════════════════════════════════
function onQuitSession() {
  resetSegBtnsToDefault();
  demoStudyList  = buildDemoStudyList();
  homeSourceMode = 'dynamic';
  homeShown      = CHUNK;
  updateStats();
  renderHomeList();
  renderQueueCards();
  showScreen('home');
}

// ══════════════════════════════════════
// BIND START EVENTS — called by app.js bindAll()
// ══════════════════════════════════════
function bindStartEvents() {
  document.getElementById('startBtn').addEventListener('click', startSession);

  document.getElementById('homeListBtn1').addEventListener('click', toggleHomeListMode);
  document.getElementById('homeListBtn2').addEventListener('click', toggleHomeSourceMode);

  // Seg-btn listeners — Category
  document.getElementById('catBtns').addEventListener('click', e => {
    const b = e.target.closest('.seg-btn'); if (!b) return;
    document.querySelectorAll('#catBtns .seg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    demoStudyList = buildDemoStudyList(); homeShown = CHUNK; renderHomeList();
  });

  // Seg-btn listeners — Order
  document.getElementById('orderBtns').addEventListener('click', e => {
    const b = e.target.closest('.seg-btn'); if (!b) return;
    document.querySelectorAll('#orderBtns .seg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    demoStudyList = buildDemoStudyList(); homeShown = CHUNK; renderHomeList();
  });

   // System/Saved seg-btns — Custom
  document.getElementById('customModeBtns').addEventListener('click', e => {
    const b = e.target.closest('.seg-btn'); if (!b) return;
    document.querySelectorAll('#customModeBtns .seg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
  });

  // System/Saved seg-btns — Import
  document.getElementById('importModeBtns').addEventListener('click', e => {
    const b = e.target.closest('.seg-btn'); if (!b) return;
    document.querySelectorAll('#importModeBtns .seg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
  });

   // Setup panel seg-btns
  ['data-setup-mode', 'data-setup-focus', 'data-setup-listtype'].forEach(attr => {
    document.querySelectorAll('[' + attr + ']').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('[' + attr + ']').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      });
    });
  });

  // Setup overlay close on backdrop click
  document.getElementById('setupOverlay').addEventListener('click', e => {
    if (e.target.id === 'setupOverlay') closeModal('setupOverlay');
  });
}

function switchStartTab(tab, btn) {
  document.querySelectorAll('.start-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['normal','custom','import'].forEach(t => {
    document.getElementById('panel-' + t).style.display = t === tab ? 'block' : 'none';
  });
  homeSelMode = tab;
}

function resetStartAt(inputId) {
  const inp = document.getElementById(inputId);
  if (inp) inp.value = '1';
}

function openSetup() {
  document.getElementById('setupOverlay').classList.remove('hidden');
}

function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  const label = document.getElementById('importFileName');
  if (label) label.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
}

// ── Setup panel state ──
let setupState = {
  mode: 'read',
  focus: 'syn',
  temporary: false,
  listType: 'group',
};

function saveSetup() {
  // Save to local state — wiring to S deferred
  setupState.mode      = document.querySelector('[data-setup-mode].active')?.dataset.setupMode || 'read';
  setupState.focus     = document.querySelector('[data-setup-focus].active')?.dataset.setupFocus || 'syn';
  setupState.temporary = document.getElementById('setupTempToggle').checked;
  setupState.listType  = document.querySelector('[data-setup-listtype].active')?.dataset.setupListtype || 'group';
}

function resetSetup() {
  setupState = { mode: 'read', focus: 'syn', temporary: false, listType: 'group' };
  syncSetupUI();
}

function syncSetupUI() {
  document.querySelectorAll('[data-setup-mode]').forEach(b =>
    b.classList.toggle('active', b.dataset.setupMode === setupState.mode));
  document.querySelectorAll('[data-setup-focus]').forEach(b =>
    b.classList.toggle('active', b.dataset.setupFocus === setupState.focus));
  document.getElementById('setupTempToggle').checked = setupState.temporary;
  document.querySelectorAll('[data-setup-listtype]').forEach(b =>
    b.classList.toggle('active', b.dataset.setupListtype === setupState.listType));
}

