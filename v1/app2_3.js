/* ══════════════════════════════════════
   DICTIONARY — app.js — Phase 1 v2
   All 8 changes applied
   ══════════════════════════════════════ */

const PASSWORD = 'Dictionary';
const CSV_URL  = 'https://raw.githubusercontent.com/Amzt-pixel/NEW-VOCAB/main/dictionary1.csv';
const HOLD_DURATION = 700;

// ── State ──
let csvData      = [];
let studyList    = [];
let rootWordList = [];
let currentIndex = 0;
let startTime    = null;
let wordsSeen    = 0;

// Change 6: read history for current session
let readHistory  = []; // [{word, index, time}]
// Change 2: custom queue
let customQueue  = []; // [{word}]
// Change 2: hidden words (localStorage)
let hiddenWords  = new Set();

// Change 7: track if session is live
let sessionLive  = false;

// Settings — pending copy for Change 4 (Save/Close)
let settings = {
  accent: 'gold', fontSize: 'normal', stepNumber: 1,
  loopMode: false, filter: 'all',
  showTranslation: false, wordHighlight: false,
  orderMode: 'az', category: '1', activeTab: 'syn',
  theme: 'navy',
};
let pendingSettings = null; // only committed on Save

// Current word open in detail modal
let detailCurrentWord = null;

// Panel state
let panelTab        = 'list';
let panelFilter     = '';
let panelHoldTimer  = null;
let panelHoldItem   = null;

// Hold timers for prev/next
let prevHoldTimer = null;
let nextHoldTimer = null;

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadHiddenWords();
  applySettings();
  bindEvents();
  checkSession();
});

function checkSession() {
  const token = localStorage.getItem('dictSession') || sessionStorage.getItem('dictSession');
  if (token === 'unlocked') {
    showScreen('home');
    loadData();
  } else {
    showScreen('gate');
  }
}

// On tab close — if session was sessionStorage only, clear current session queues
window.addEventListener('beforeunload', () => {
  const inSession = sessionStorage.getItem('dictSession') === 'unlocked';
  const inLocal   = localStorage.getItem('dictSession') === 'unlocked';
  if (inSession && !inLocal) {
    localStorage.removeItem('dictCurrentSession');
    localStorage.removeItem('dictCurrentQueue');
    // dictLastSession intentionally NOT removed
  }
});

// ══════════════════════════════════════
// SCREEN MANAGEMENT
// ══════════════════════════════════════
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`${name}Screen`).classList.add('active');
}

// Change 7: go home without resetting session
function goHome() {
  showScreen('home');
  // session state (studyList, currentIndex, etc.) preserved
}

// Change 7: book icon — resume or start
function handleBookIcon() {
  if (sessionLive) {
    showScreen('study');
  } else {
    // First time — start a fresh session with current selector values
    startSession();
  }
}

// ══════════════════════════════════════
// GATE
// ══════════════════════════════════════
let wrongAttempts = 0;

function bindGate() {
  const btn      = document.getElementById('gateBtn');
  const input    = document.getElementById('gateInput');
  const error    = document.getElementById('gateError');
  const eye      = document.getElementById('gateEye');
  const remember = document.getElementById('rememberMe');

  eye.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.textContent = show ? '🙈' : '👁';
  });

  function attempt() {
    if (input.value.trim() === PASSWORD) {
      wrongAttempts = 0;
      if (remember.checked) {
        localStorage.setItem('dictSession', 'unlocked');
        sessionStorage.removeItem('dictSession');
      } else {
        sessionStorage.setItem('dictSession', 'unlocked');
        localStorage.removeItem('dictSession');
      }
      showScreen('home');
      loadData();
    } else {
      wrongAttempts++;
      error.classList.remove('hidden');
      input.value = '';
      input.focus();
      if (wrongAttempts >= 3) {
        btn.disabled = true;
        btn.textContent = 'Wait 10s…';
        setTimeout(() => { btn.disabled = false; btn.textContent = 'Unlock'; wrongAttempts = 0; }, 10000);
      }
    }
  }

  btn.addEventListener('click', attempt);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
  input.addEventListener('input', () => error.classList.add('hidden'));
}

// ══════════════════════════════════════
// DATA
// ══════════════════════════════════════
async function loadData() {
  try {
    const res  = await fetch(CSV_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    parseCSV(text);
    buildRootWordList();
    buildStats();
    renderHomeWordList(false);
  } catch (err) {
    console.error('Failed to load CSV:', err);
    document.getElementById('rootWordItems').innerHTML =
      `<div class="list-loading" style="color:#e55">Failed to load data. Check console.</div>`;
  }
}

function parseCSV(text) {
  const lines   = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  csvData = lines.slice(1).map((line, i) => {
    const cols = parseCSVLine(line);
    const obj  = {};
    headers.forEach((h, j) => { obj[h] = (cols[j] || '').trim().replace(/^"|"$/g, ''); });
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
  const result = []; let current = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQuotes && line[i+1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else current += ch;
  }
  result.push(current);
  return result;
}

// ══════════════════════════════════════
// LIBRARY HELPERS
// ══════════════════════════════════════
function getSynonyms(word) {
  const entry = csvData.find(r => r.word === word);
  if (!entry?.id) return [];
  return csvData.filter(r => r.id === entry.id && r.word !== word).map(r => r.word);
}

function getAntonyms(word) {
  const entry = csvData.find(r => r.word === word);
  if (!entry?.id) return [];
  return csvData.filter(r => r.id === -entry.id).map(r => r.word);
}

function buildRootWordList() {
  const seen = new Set();
  rootWordList = [];
  csvData.forEach(r => {
    if (!r.id) return;
    const key = Math.abs(r.id);
    if (!seen.has(key)) { seen.add(key); rootWordList.push({ word: r.word, id: r.id }); }
  });
}

function buildStats() {
  document.getElementById('statRootWords').textContent  = rootWordList.length;
  document.getElementById('statTotalWords').textContent = csvData.length;
}

function buildStudyList(order, filter) {
  let words = [...new Set(csvData.map(r => r.word))];
  if (filter === 'root') {
    const roots = new Set(rootWordList.map(r => r.word));
    words = words.filter(w => roots.has(w));
  } else if (filter === 'synant') {
    words = words.filter(w => getSynonyms(w).length > 0 || getAntonyms(w).length > 0);
  }
  if (order === 'az')     words.sort((a,b) => a.localeCompare(b));
  if (order === 'za')     words.sort((a,b) => b.localeCompare(a));
  if (order === 'random') words.sort(() => Math.random() - 0.5);
  return words;
}

// ══════════════════════════════════════
// HOME — ROOT WORD LIST
// ══════════════════════════════════════
const HOME_LIST_CHUNK = 30;
let homeListShown = 30;

function renderHomeWordList(showCount) {
  homeListShown = showCount || HOME_LIST_CHUNK;
  const container = document.getElementById('rootWordItems');
  const countEl   = document.getElementById('rootWordCount');

  const sorted = [...csvData]
    .filter((r, idx, arr) => r.id && arr.findIndex(x => Math.abs(x.id) === Math.abs(r.id)) === idx)
    .sort((a,b) => a.word.localeCompare(b.word));

  countEl.textContent = `${sorted.length} words`;
  const visible   = sorted.slice(0, homeListShown);
  const remaining = sorted.length - homeListShown;

  let html = visible.map((r, i) => {
    const hasSyn = getSynonyms(r.word).length > 0;
    const hasAnt = getAntonyms(r.word).length > 0;
    const dotClass = hasSyn && hasAnt ? 'dot-both' : hasSyn ? 'dot-syn' : hasAnt ? 'dot-ant' : '';
    return `<div class="word-list-item" onclick="jumpToWord('${escapeHtml(r.word)}')">
      <span class="word-list-num">${i+1}</span>
      <span>${escapeHtml(r.word)}</span>
      ${dotClass ? `<span class="dot-indicator ${dotClass}"></span>` : ''}
    </div>`;
  }).join('');

  if (remaining > 0) {
    html += `<div class="home-list-footer">
      <span class="home-list-link" onclick="renderHomeWordList(${homeListShown + HOME_LIST_CHUNK})">view more (+${Math.min(HOME_LIST_CHUNK, remaining)})</span>
      <span class="home-list-divider"></span>
      <span class="home-list-link" onclick="renderHomeWordList(${sorted.length})">view all (${sorted.length})</span>
    </div>`;
  }

  container.innerHTML = html;
}

// ══════════════════════════════════════
// SESSION
// ══════════════════════════════════════
function startSession() {
  const order = document.getElementById('orderSelect').value;
  settings.orderMode = order;

  studyList    = buildStudyList(order, settings.filter);
  currentIndex = 0;
  wordsSeen    = 1;
  startTime    = new Date();
  readHistory  = [];
  customQueue  = [];
  sessionLive  = true;

  updateSessionBar(order);
  showScreen('study');
  displayWord();
}

function startSessionAtWord(word) {
  if (!sessionLive) {
    studyList   = buildStudyList(settings.orderMode, settings.filter);
    startTime   = new Date();
    readHistory = [];
    customQueue = [];
    sessionLive = true;
    updateSessionBar(settings.orderMode);
  }
  const idx = studyList.findIndex(w => w === word);
  currentIndex = idx >= 0 ? idx : 0;
  wordsSeen++;
  showScreen('study');
  displayWord();
}

function getDeviceName() {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad/i.test(ua)) return 'iOS';
  if (/windows/i.test(ua)) return 'Windows';
  if (/mac/i.test(ua)) return 'Mac';
  return 'Device';
}

function generateListName(prefix) {
  const now = new Date();
  const hh  = String(now.getHours()).padStart(2,'0');
  const mm  = String(now.getMinutes()).padStart(2,'0');
  const dd  = String(now.getDate()).padStart(2,'0');
  const mo  = String(now.getMonth()+1).padStart(2,'0');
  const yy  = String(now.getFullYear()).slice(2);
  return `${prefix}-${hh}:${mm}&${dd}-${mo}-${yy}@${getDeviceName()}`;
}

function updatePanelSaveBar() {
  const nameEl = document.getElementById('panelSaveName');
  const prefixes = { list: 'List1', queue: 'CustomList', history: 'CurrentSession' };
  nameEl.value = generateListName(prefixes[panelTab] || 'List');
}

function savePanelList() {
  const name  = document.getElementById('panelSaveName').value.trim() || generateListName('List');
  let   words = [];
  if (panelTab === 'list')    words = studyList;
  if (panelTab === 'queue')   words = customQueue.map(q => q.word);
  if (panelTab === 'history') words = readHistory.map(h => h.word);
  if (!words.length) { alert('Nothing to save.'); return; }

  const saved = JSON.parse(localStorage.getItem('dictSavedLists') || '[]');
  saved.push({ name, words, type: panelTab === 'queue' ? 2 : panelTab === 'history' ? 1 : 0, savedAt: new Date().toISOString() });
  localStorage.setItem('dictSavedLists', JSON.stringify(saved));
  alert(`Saved as "${name}"`);
}

function updateSessionBar(order) {
  const labels = { az: 'A→Z', za: 'Z→A', random: 'Random' };
  document.getElementById('sessionSetName').textContent = 'Dictionary';
  document.getElementById('sessionStep').textContent    = settings.stepNumber;
  document.getElementById('sessionOrder').textContent   = labels[order] || order;
}

// ══════════════════════════════════════
// DISPLAY WORD
// ══════════════════════════════════════
function displayWord() {
  if (!studyList.length) return;

  const word  = studyList[currentIndex];
  const entry = csvData.find(r => r.word === word);
  const syns  = getSynonyms(word);
  const ants  = getAntonyms(word);
  const hasDef = !!(entry?.definition);

  // Track history (Change 6)
  if (!readHistory.length || readHistory[readHistory.length - 1].word !== word) {
    readHistory.push({ word, index: currentIndex, time: new Date().toLocaleTimeString() });
  }

  // Progress
  document.getElementById('progressPill').textContent = `${currentIndex + 1} / ${studyList.length}`;

  // Word hero
  document.getElementById('currentWord').textContent = word;
  // Role field (word type: Noun, Adjective etc.) — from 'role' column (not in CSV yet, blank until full schema)
  document.getElementById('currentRole').textContent = entry?.role || '';

  // Level badge — always shown, level 0 = Common
  const badge = document.getElementById('levelBadge');
  const levelMeta = {
    0: ['Common',      'level-0'],
    1: ['Unique',      'level-1'],
    2: ['Specific',    'level-2'],
    3: ['Colloquial',  'level-3'],
  };
  const [label, cls] = levelMeta[entry?.level ?? 0] || levelMeta[0];
  badge.textContent = label;
  badge.className   = `word-level-badge ${cls}`;

  // Build chips helper
  function buildChip(w, type) {
    const isHidden = hiddenWords.has(w);
    return `<button class="chip ${type}-chip${isHidden ? ' hidden-word' : ''}"
      ondblclick="openWordDetail('${escapeHtml(w)}')"
      onmousedown="startChipHold(event,'${escapeHtml(w)}')"
      onmouseup="clearChipHold()"
      onmouseleave="clearChipHold()"
      ontouchstart="startChipHold(event,'${escapeHtml(w)}')"
      ontouchend="clearChipHold()"
      ontouchcancel="clearChipHold()"
    >${escapeHtml(w)}</button>`;
  }

  document.getElementById('synChips').innerHTML = syns.map(s => buildChip(s, 'syn')).join('');
  document.getElementById('antChips').innerHTML = ants.map(a => buildChip(a, 'ant')).join('');

  // Definition
  const defContent = document.getElementById('defContent');
  defContent.innerHTML = hasDef
    ? `<div class="def-text">${escapeHtml(entry.definition)}</div>${entry.example ? `<div class="def-example">"${escapeHtml(entry.example)}"</div>` : ''}`
    : `<div class="empty-state" style="padding:4px 0">No definition available.</div>`;

  // Cards visibility
  document.getElementById('synCard').classList.toggle('hidden',   syns.length === 0);
  document.getElementById('antCard').classList.toggle('hidden',   ants.length === 0);
  document.getElementById('defCard').classList.toggle('hidden',   false);
  document.getElementById('emptyCard').classList.toggle('hidden', syns.length > 0 || ants.length > 0 || hasDef);
  document.getElementById('tabSyn').classList.toggle('hidden',    syns.length === 0);
  document.getElementById('tabAnt').classList.toggle('hidden',    ants.length === 0);

  document.getElementById('synCount').textContent = syns.length > 0 ? syns.length : '';
  document.getElementById('antCount').textContent = ants.length > 0 ? ants.length : '';

  // Auto tab
  const t = settings.activeTab;
  if (t === 'syn' && syns.length)      switchTab('syn');
  else if (t === 'ant' && ants.length) switchTab('ant');
  else if (syns.length)                switchTab('syn');
  else if (ants.length)                switchTab('ant');
  else                                 switchTab('def');

  updateWordListPanel();
}

// getLevelLabel removed — level shown via badge in displayWord

// ══════════════════════════════════════
// TABS
// ══════════════════════════════════════
function switchTab(tab) {
  settings.activeTab = tab;
  ['syn','ant','def'].forEach(t => {
    const capT = t.charAt(0).toUpperCase() + t.slice(1);
    document.getElementById(`tab${capT}`)?.classList.toggle('active', t === tab);
    document.getElementById(`${t}Card`)?.classList.toggle('hidden', t !== tab);
  });
}

// ══════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════
function getEffectiveStudyList() {
  // Skip hidden words
  return studyList.filter(w => !hiddenWords.has(w));
}

function nextWord() {
  const effective = getEffectiveStudyList();
  if (!effective.length) return;
  const effIdx = effective.indexOf(studyList[currentIndex]);
  const nextEff = effIdx + settings.stepNumber;
  if (nextEff >= effective.length) {
    if (!settings.loopMode) return;
    currentIndex = studyList.indexOf(effective[nextEff % effective.length]);
  } else {
    currentIndex = studyList.indexOf(effective[nextEff]);
  }
  wordsSeen++;
  displayWord();
}

function prevWord() {
  const effective = getEffectiveStudyList();
  if (!effective.length) return;
  const effIdx = effective.indexOf(studyList[currentIndex]);
  const prevEff = effIdx - settings.stepNumber;
  if (prevEff < 0) {
    if (!settings.loopMode) return;
    currentIndex = studyList.indexOf(effective[(effective.length + prevEff % effective.length) % effective.length]);
  } else {
    currentIndex = studyList.indexOf(effective[prevEff]);
  }
  wordsSeen++;
  displayWord();
}

function startPrevHold() { prevHoldTimer = setTimeout(() => { prevHoldTimer = null; const eff = getEffectiveStudyList(); const ei = eff.indexOf(studyList[currentIndex]); if (ei - settings.stepNumber >= 0) openWordDetail(eff[ei - settings.stepNumber]); }, HOLD_DURATION); }
function clearPrevHold() { if (prevHoldTimer) { clearTimeout(prevHoldTimer); prevHoldTimer = null; } }
function startNextHold() { nextHoldTimer = setTimeout(() => { nextHoldTimer = null; const eff = getEffectiveStudyList(); const ei = eff.indexOf(studyList[currentIndex]); if (ei + settings.stepNumber < eff.length) openWordDetail(eff[ei + settings.stepNumber]); }, HOLD_DURATION); }
function clearNextHold() { if (nextHoldTimer) { clearTimeout(nextHoldTimer); nextHoldTimer = null; } }

// Change 1: chip double-click opens detail; hold still works
let chipHoldTimer = null;
function startChipHold(e, word) {
  chipHoldTimer = setTimeout(() => { chipHoldTimer = null; openWordDetail(word); }, HOLD_DURATION);
}
function clearChipHold() { if (chipHoldTimer) { clearTimeout(chipHoldTimer); chipHoldTimer = null; } }

// ══════════════════════════════════════
// WORD DETAIL MODAL — Change 1
// ══════════════════════════════════════
function openWordDetail(word) {
  detailCurrentWord = word;
  const entry = csvData.find(r => r.word === word);
  const syns  = getSynonyms(word);
  const ants  = getAntonyms(word);

  document.getElementById('detailWord').textContent = word;

  const metaEl = document.getElementById('detailMeta');
  const levelLabels = { 0:'Common', 1:'Unique', 2:'Specific', 3:'Colloquial' };
  const levelClasses = { 0:'badge-common', 1:'badge-unique', 2:'badge-specific', 3:'badge-colloquial' };
  const lv = entry?.level ?? 0;
  const badges = [`<span class="detail-badge ${levelClasses[lv]}">${levelLabels[lv]}</span>`];
  if (entry?.role) badges.push(`<span class="detail-badge badge-role">${escapeHtml(entry.role)}</span>`);
  metaEl.innerHTML = badges.join('');

  let html = '';
  if (entry?.definition) {
    html += `<div class="detail-section">
      <div class="detail-section-title">Definition</div>
      <div class="detail-def">${escapeHtml(entry.definition)}</div>
      ${entry.example ? `<div class="detail-example">"${escapeHtml(entry.example)}"</div>` : ''}
    </div>`;
  }
  if (syns.length > 0) {
    html += `<div class="detail-section">
      <div class="detail-section-title" style="color:var(--syn)">Synonyms (${syns.length})</div>
      <div class="chips-wrap">${syns.map(s => `<button class="chip syn-chip" ondblclick="openWordDetail('${escapeHtml(s)}')">${escapeHtml(s)}</button>`).join('')}</div>
    </div>`;
  }
  if (ants.length > 0) {
    html += `<div class="detail-section">
      <div class="detail-section-title" style="color:var(--ant)">Antonyms (${ants.length})</div>
      <div class="chips-wrap">${ants.map(a => `<button class="chip ant-chip" ondblclick="openWordDetail('${escapeHtml(a)}')">${escapeHtml(a)}</button>`).join('')}</div>
    </div>`;
  }
  if (!html) html = `<div class="empty-state">No details available.</div>`;

  document.getElementById('detailContent').innerHTML = html;
  document.getElementById('wordDetailOverlay').classList.remove('hidden');
}

// Change 1: View Word button
function viewDetailWord() {
  if (!detailCurrentWord) return;
  closeModal('wordDetailOverlay');
  startSessionAtWord(detailCurrentWord);
}

// ══════════════════════════════════════
// SEARCH
// ══════════════════════════════════════
function initSearch() {
  const input = document.getElementById('searchInput');
  const clear = document.getElementById('searchClear');
  input.addEventListener('input', () => {
    const q = input.value.trim();
    clear.classList.toggle('hidden', !q);
    if (q.length >= 3) renderSearchResults(q, 'searchResults');
    else document.getElementById('searchResults').innerHTML = `<div class="search-hint">Type at least 3 characters to search</div>`;
  });
  clear.addEventListener('click', () => {
    input.value = ''; clear.classList.add('hidden');
    document.getElementById('searchResults').innerHTML = `<div class="search-hint">Type at least 3 characters to search</div>`;
    input.focus();
  });
}

function renderSearchResults(query, containerId) {
  const words = [...new Set(csvData.map(r => r.word))];
  let regex;
  try { regex = new RegExp(query, 'i'); } catch(e) { regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }

  const exact   = words.filter(w => w.toLowerCase() === query.toLowerCase());
  const close   = words.filter(w => regex.test(w) && !exact.includes(w));
  const meaning = words.filter(w => {
    const e = csvData.find(r => r.word === w);
    return e?.definition && regex.test(e.definition) && !exact.includes(w) && !close.includes(w);
  });

  function group(title, list) {
    if (!list.length) return '';
    return `<div>
      <div class="search-group-title">${title}</div>
      ${list.slice(0,20).map(w => {
        const e = csvData.find(r => r.word === w);
        const s = getSynonyms(w).length; const a = getAntonyms(w).length;
        const meta = [s>0?`${s} syn`:'', a>0?`${a} ant`:''].filter(Boolean).join(' · ');
        return `<div class="search-item" onclick="jumpToWordFromSearch('${escapeHtml(w)}')">
          <div>
            <div class="search-item-word">${escapeHtml(w)}</div>
            ${e?.definition ? `<div class="search-item-meta" style="font-size:12px;margin-top:2px">${escapeHtml(e.definition.substring(0,60))}${e.definition.length>60?'…':''}</div>` : ''}
          </div>
          <div class="search-item-meta">${meta}</div>
        </div>`;
      }).join('')}
    </div>`;
  }

  let html = group('Exact Match', exact) + group('Close Matches', close) + group('Matches in Meaning', meaning);
  if (!exact.length && !close.length && !meaning.length) html = `<div class="search-hint">No results for "${escapeHtml(query)}"</div>`;
  document.getElementById(containerId).innerHTML = html;
}

function jumpToWordFromSearch(word) {
  if (document.getElementById('searchScreen').classList.contains('active')) {
    showScreen(sessionLive ? 'study' : 'home');
  }
  startSessionAtWord(word);
}

// ══════════════════════════════════════
// WORD LIST PANEL — Changes 2, 5, 6
// ══════════════════════════════════════
function openWordListPanel() {
  panelTab    = 'list';
  panelFilter = '';
  document.getElementById('panelSearchInput').value = '';
  document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.panelTab === 'list'));
  updatePanelSaveBar();
  updateWordListPanel();
  document.getElementById('wordListOverlay').classList.remove('hidden');
}

function updateWordListPanel() {
  const container = document.getElementById('wordListContent');
  const filter    = panelFilter.toLowerCase();

  if (panelTab === 'list') {
    if (!studyList.length) { container.innerHTML = `<div class="panel-empty">No session active. Start a session first.</div>`; return; }
    const items = studyList
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => !filter || w.toLowerCase().includes(filter));

    container.innerHTML = items.map(({ w, i }) => {
      const isHidden  = hiddenWords.has(w);
      const isCurrent = i === currentIndex;
      return `<div class="panel-item${isCurrent ? ' current' : ''}${isHidden ? ' word-hidden' : ''}"
          id="panel-item-${i}"
          data-word="${escapeHtml(w)}"
          data-index="${i}"
          onmousedown="startPanelHold(event, this)"
          onmousemove="cancelPanelHoldOnMove(event)"
          onmouseup="clearPanelHold()"
          onmouseleave="clearPanelHold()">
        <span class="panel-item-left" onclick="navigatePanelItem(${i})">
          <span class="panel-item-num">${i+1}</span>
          <span class="panel-item-word">${escapeHtml(w)}</span>
        </span>
        <span class="panel-item-right">
          <button class="panel-action-btn panel-action-add"
            ontouchstart="event.stopPropagation()"
            onclick="openAddTo('${escapeHtml(w)}', event)">➕</button>
          <button class="panel-action-btn ${isHidden ? 'panel-action-unhide' : 'panel-action-hide'}"
            ontouchstart="event.stopPropagation()"
            onclick="toggleHideWord('${escapeHtml(w)}', event)">
            ${isHidden ? '👁️' : '🚫'}
          </button>
        </span>
      </div>`;
    }).join('');

    // Attach touch events with passive:false so we can preventDefault and
    // prevent the scroll container from stealing the touch before hold fires
    container.querySelectorAll('.panel-item').forEach(el => {
      el.addEventListener('touchstart',  e => startPanelHold(e, el), { passive: false });
      el.addEventListener('touchend',    clearPanelHold,             { passive: true  });
      el.addEventListener('touchcancel', clearPanelHold,             { passive: true  });
    });

    setTimeout(() => {
      const cur = document.getElementById(`panel-item-${currentIndex}`);
      if (cur) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 60);

  } else if (panelTab === 'queue') {
    if (!customQueue.length) { container.innerHTML = `<div class="panel-empty">Queue is empty. Add words via the ➕ button in the word list.</div>`; return; }
    const items = customQueue.filter(({ word }) => !filter || word.toLowerCase().includes(filter));
    container.innerHTML = items.map(({ word }, i) =>
      `<div class="panel-item" onclick="startSessionAtWord('${escapeHtml(word)}')">
        <span class="panel-item-left">
          <span class="panel-item-num">${i+1}</span>
          <span class="panel-item-word">${escapeHtml(word)}</span>
        </span>
        <button class="panel-action-btn panel-action-hide"
          ontouchstart="event.stopPropagation()"
          onclick="removeFromQueue('${escapeHtml(word)}', event)">✕</button>
      </div>`
    ).join('') || `<div class="panel-empty">No matches.</div>`;

  } else if (panelTab === 'history') {
    if (!readHistory.length) { container.innerHTML = `<div class="panel-empty">No words visited yet this session.</div>`; return; }
    const items = [...readHistory].reverse().filter(({ word }) => !filter || word.toLowerCase().includes(filter));
    container.innerHTML = items.map(({ word, time }, i) =>
      `<div class="panel-item" onclick="startSessionAtWord('${escapeHtml(word)}')">
        <span class="panel-item-left">
          <span class="panel-item-num">${i+1}</span>
          <span class="panel-item-word">${escapeHtml(word)}</span>
        </span>
        <span style="font-size:11px;color:var(--text-secondary);flex-shrink:0">${time}</span>
      </div>`
    ).join('') || `<div class="panel-empty">No matches.</div>`;
  }
}

// Panel hold — left-zone navigation
let panelWasHold    = false;
let panelMouseMoved = false;

function startPanelHold(e, el) {
  // Prevent the scroll container from stealing the touch gesture before hold fires
  if (e.cancelable) e.preventDefault();
  clearPanelHold();
  panelWasHold    = false;
  panelMouseMoved = false;
  panelHoldItem   = el;
  panelHoldTimer  = setTimeout(() => {
    panelHoldTimer = null;
    panelWasHold   = true;
    document.querySelectorAll('.panel-item.actions-visible').forEach(item => {
      if (item !== el) item.classList.remove('actions-visible');
    });
    el.classList.toggle('actions-visible');
  }, HOLD_DURATION);
}

function cancelPanelHoldOnMove(e) {
  panelMouseMoved = true;
  clearPanelHold();
}

function clearPanelHold() {
  if (panelHoldTimer) { clearTimeout(panelHoldTimer); panelHoldTimer = null; }
}

function navigatePanelItem(idx) {
  // Only navigate if it was not a hold action
  if (panelWasHold || panelMouseMoved) {
    panelWasHold    = false;
    panelMouseMoved = false;
    return;
  }
  currentIndex = idx;
  displayWord();
  closeModal('wordListOverlay');
}

// Change 2: hide/unhide word
function toggleHideWord(word, e) {
  e.stopPropagation();
  if (hiddenWords.has(word)) hiddenWords.delete(word);
  else hiddenWords.add(word);
  saveHiddenWords();
  updateWordListPanel();
  if (studyList.length) displayWord(); // refresh chips
}

function saveHiddenWords()  { localStorage.setItem('dictHidden', JSON.stringify([...hiddenWords])); }
function loadHiddenWords()  { try { hiddenWords = new Set(JSON.parse(localStorage.getItem('dictHidden') || '[]')); } catch(e) {} }

// Change 2: Add To from panel
function openAddTo(word, e) {
  e?.stopPropagation();
  document.getElementById('addToWordTitle').textContent = `Add "${word}" to…`;
  document.getElementById('addToOverlay').classList.remove('hidden');
  // Store which word we're acting on
  document.getElementById('addToOverlay').dataset.word = word;
}

function removeFromQueue(word, e) {
  e.stopPropagation();
  customQueue = customQueue.filter(q => q.word !== word);
  updateWordListPanel();
}

// ══════════════════════════════════════
// ADD TO POPUP
// ══════════════════════════════════════
function bindAddTo() {
  document.querySelectorAll('.addto-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const flag = btn.dataset.flag;
      const word = document.getElementById('addToOverlay').dataset.word;
      if (!word) return;

      btn.classList.toggle('active');

      if (flag === 'queue') {
        const already = customQueue.find(q => q.word === word);
        if (!already) { customQueue.push({ word }); }
        else { customQueue = customQueue.filter(q => q.word !== word); btn.classList.remove('active'); }
        updateWordListPanel();
      }
      // bookmark/important/learned/favorite will be handled in Phase 9 (word_meta)
    });
  });

  document.getElementById('addToClose').addEventListener('click', () => closeModal('addToOverlay'));
}

// ══════════════════════════════════════
// INFO MODAL — Close + Quit
// ══════════════════════════════════════
function showInfo() {
  const elapsed = startTime ? Math.floor((new Date() - startTime) / 1000) : 0;
  const mins = Math.floor(elapsed / 60); const secs = elapsed % 60;
  document.getElementById('infoContent').innerHTML = `
    <div class="info-row"><span class="info-row-label">Time</span><span class="info-row-value accent">${mins}m ${secs}s</span></div>
    <div class="info-row"><span class="info-row-label">Word Set</span><span class="info-row-value">Dictionary</span></div>
    <div class="info-row"><span class="info-row-label">Order</span><span class="info-row-value">${settings.orderMode === 'az' ? 'A→Z' : settings.orderMode === 'za' ? 'Z→A' : 'Random'}</span></div>
    <div class="info-row"><span class="info-row-label">Total Words</span><span class="info-row-value">${studyList.length}</span></div>
    <div class="info-row"><span class="info-row-label">Hidden Words</span><span class="info-row-value">${hiddenWords.size}</span></div>
    <div class="info-row"><span class="info-row-label">Words Seen</span><span class="info-row-value">${wordsSeen}</span></div>
    <div class="info-row"><span class="info-row-label">Position</span><span class="info-row-value">${currentIndex + 1} / ${studyList.length}</span></div>
    <div class="info-row"><span class="info-row-label">Queue Size</span><span class="info-row-value">${customQueue.length}</span></div>
  `;
  document.getElementById('infoOverlay').classList.remove('hidden');
}

function quitSession() {
  // Auto-save custom queue if non-empty
  if (customQueue.length > 0) {
    const name = generateListName('CustomList');
    const saved = JSON.parse(localStorage.getItem('dictSavedLists') || '[]');
    saved.push({ name, words: customQueue.map(q => q.word), type: 2, savedAt: new Date().toISOString() });
    localStorage.setItem('dictSavedLists', JSON.stringify(saved));
  }
  // Clear current session
  localStorage.removeItem('dictCurrentSession');
  localStorage.removeItem('dictCurrentQueue');
  // Reset in-memory state
  studyList    = [];
  currentIndex = 0;
  wordsSeen    = 0;
  startTime    = null;
  readHistory  = [];
  customQueue  = [];
  sessionLive  = false;
  closeModal('infoOverlay');
  showScreen('home');
}

// ══════════════════════════════════════
// SETTINGS — Change 4: pending + Save/Close
// ══════════════════════════════════════
function openSettings() {
  pendingSettings = { ...settings };
  syncSettingsUI(pendingSettings);
  document.getElementById('settingsOverlay').classList.remove('hidden');
}

function openCustomise() {
  pendingSettings = { ...settings };
  syncCustomiseUI(pendingSettings);
  document.getElementById('customiseOverlay').classList.remove('hidden');
}

function syncSettingsUI(s) {
  document.querySelectorAll('[data-step]').forEach(b => b.classList.toggle('active', parseInt(b.dataset.step) === s.stepNumber));
  document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === s.filter));
  document.getElementById('loopToggle').checked        = s.loopMode;
  document.getElementById('translationToggle').checked = s.showTranslation;
  document.getElementById('highlightToggle').checked   = s.wordHighlight;
}

function syncCustomiseUI(s) {
  document.querySelectorAll('[data-size]').forEach(b => b.classList.toggle('active', b.dataset.size === s.fontSize));
  document.querySelectorAll('[data-accent]').forEach(b => b.classList.toggle('selected', b.dataset.accent === s.accent));
  document.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('selected', b.dataset.theme === s.theme));
}

function bindSettingsEvents() {
  document.querySelectorAll('[data-step]').forEach(btn => btn.addEventListener('click', () => {
    if (!pendingSettings) return;
    document.querySelectorAll('[data-step]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pendingSettings.stepNumber = parseInt(btn.dataset.step);
  }));

  document.querySelectorAll('[data-filter]').forEach(btn => btn.addEventListener('click', () => {
    if (!pendingSettings) return;
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pendingSettings.filter = btn.dataset.filter;
  }));

  document.getElementById('loopToggle').addEventListener('change', e => { if (pendingSettings) pendingSettings.loopMode = e.target.checked; });
  document.getElementById('translationToggle').addEventListener('change', e => { if (pendingSettings) pendingSettings.showTranslation = e.target.checked; });
  document.getElementById('highlightToggle').addEventListener('change', e => { if (pendingSettings) pendingSettings.wordHighlight = e.target.checked; });

  document.getElementById('settingsSave').addEventListener('click', () => {
    if (pendingSettings) {
      Object.assign(settings, pendingSettings);
      saveSettings();
      applySettings();
      document.getElementById('sessionStep').textContent = settings.stepNumber;
    }
    pendingSettings = null;
    closeModal('settingsOverlay');
  });

  document.getElementById('settingsClose').addEventListener('click', () => {
    pendingSettings = null;
    closeModal('settingsOverlay');
    syncSettingsUI(settings);
  });
}

function bindCustomiseEvents() {
  document.querySelectorAll('[data-size]').forEach(btn => btn.addEventListener('click', () => {
    if (!pendingSettings) return;
    document.querySelectorAll('[data-size]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pendingSettings.fontSize = btn.dataset.size;
  }));

  document.querySelectorAll('[data-accent]').forEach(swatch => swatch.addEventListener('click', () => {
    if (!pendingSettings) return;
    document.querySelectorAll('[data-accent]').forEach(s => s.classList.remove('selected'));
    swatch.classList.add('selected');
    pendingSettings.accent = swatch.dataset.accent;
  }));

  document.querySelectorAll('[data-theme]').forEach(swatch => swatch.addEventListener('click', () => {
    if (!pendingSettings) return;
    document.querySelectorAll('[data-theme]').forEach(s => s.classList.remove('selected'));
    swatch.classList.add('selected');
    pendingSettings.theme = swatch.dataset.theme;
  }));

  document.getElementById('customiseSave').addEventListener('click', () => {
    if (pendingSettings) {
      Object.assign(settings, pendingSettings);
      saveSettings();
      applySettings();
    }
    pendingSettings = null;
    closeModal('customiseOverlay');
  });

  document.getElementById('customiseClose').addEventListener('click', () => {
    pendingSettings = null;
    closeModal('customiseOverlay');
    syncCustomiseUI(settings);
  });

  document.getElementById('customiseOverlay').addEventListener('click', e => {
    if (e.target.id === 'customiseOverlay') {
      pendingSettings = null;
      closeModal('customiseOverlay');
      syncCustomiseUI(settings);
    }
  });
}

function saveSettings()  { localStorage.setItem('dictSettings', JSON.stringify(settings)); }
function loadSettings()  {
  const saved = localStorage.getItem('dictSettings');
  if (saved) { try { Object.assign(settings, JSON.parse(saved)); } catch(e) {} }
  const accent = localStorage.getItem('dictAccent');
  if (accent) settings.accent = accent;
}
function applySettings() { applyAccent(); applyTheme(); applyFontSize(); }
function applyAccent()   {
  document.body.className = document.body.className.replace(/accent-\w+/g, '').trim();
  document.body.classList.add(`accent-${settings.accent}`);
  localStorage.setItem('dictAccent', settings.accent);
}
function applyTheme() {
  document.body.className = document.body.className.replace(/theme-\w+/g, '').trim();
  document.body.classList.add(`theme-${settings.theme || 'navy'}`);
}
function applyFontSize() {
  document.body.className = document.body.className.replace(/font-\w+/g, '').trim();
  document.body.classList.add(`font-${settings.fontSize}`);
}

// ══════════════════════════════════════
// MODALS
// ══════════════════════════════════════
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function closeOnOverlay(id, e) { if (e.target.id === id) closeModal(id); }

// ══════════════════════════════════════
// EVENT BINDING
// ══════════════════════════════════════
function bindEvents() {
  bindGate();
  initSearch();
  bindSettingsEvents();
  bindCustomiseEvents();
  bindAddTo();

  // Home
  document.getElementById('startBtn').addEventListener('click', startSession);
  document.getElementById('homeSearchBtn').addEventListener('click', () => showScreen('search'));
  document.getElementById('homeBookBtn').addEventListener('click', handleBookIcon);
  document.getElementById('customiseBtn').addEventListener('click', openCustomise);
  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('dictSession');
    sessionStorage.removeItem('dictSession');
    showScreen('gate');
  });

  // Study navbar
  document.getElementById('studyHomeBtn').addEventListener('click', goHome); // Change 7
  document.getElementById('infoBtn').addEventListener('click', showInfo);
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('wordListBtn').addEventListener('click', openWordListPanel);

  // Prev/Next
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  prevBtn.addEventListener('click', prevWord);
  nextBtn.addEventListener('click', nextWord);
  prevBtn.addEventListener('mousedown',   startPrevHold);
  prevBtn.addEventListener('mouseup',     clearPrevHold);
  prevBtn.addEventListener('mouseleave',  clearPrevHold);
  prevBtn.addEventListener('touchstart',  startPrevHold, { passive: true });
  prevBtn.addEventListener('touchend',    clearPrevHold);
  prevBtn.addEventListener('touchcancel', clearPrevHold);
  nextBtn.addEventListener('mousedown',   startNextHold);
  nextBtn.addEventListener('mouseup',     clearNextHold);
  nextBtn.addEventListener('mouseleave',  clearNextHold);
  nextBtn.addEventListener('touchstart',  startNextHold, { passive: true });
  nextBtn.addEventListener('touchend',    clearNextHold);
  nextBtn.addEventListener('touchcancel', clearNextHold);

  // Search back
  document.getElementById('searchBackBtn').addEventListener('click', () => {
    showScreen(sessionLive ? 'study' : 'home');
  });

  // Panel tabs
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      panelTab = tab.dataset.panelTab;
      updatePanelSaveBar();
      updateWordListPanel();
    });
  });

  // Panel save
  document.getElementById('panelSaveBtn').addEventListener('click', savePanelList);

  // Panel search (Change 5)
  document.getElementById('panelSearchInput').addEventListener('input', e => {
    panelFilter = e.target.value.trim();
    updateWordListPanel();
  });

  // Word list close
  document.getElementById('wordListClose').addEventListener('click', () => closeModal('wordListOverlay'));
  document.getElementById('wordListOverlay').addEventListener('click', e => { if (e.target.id === 'wordListOverlay') closeModal('wordListOverlay'); });

  // Info
  document.getElementById('infoClose').addEventListener('click', () => closeModal('infoOverlay'));
  document.getElementById('infoQuit').addEventListener('click', quitSession);
  document.getElementById('infoOverlay').addEventListener('click', e => closeOnOverlay('infoOverlay', e));

  // Word detail — Change 1: View Word
  document.getElementById('wordDetailClose').addEventListener('click', () => closeModal('wordDetailOverlay'));
  document.getElementById('wordDetailView').addEventListener('click', viewDetailWord);
  document.getElementById('wordDetailOverlay').addEventListener('click', e => closeOnOverlay('wordDetailOverlay', e));

  document.getElementById('settingsOverlay').addEventListener('click', e => {
    if (e.target.id === 'settingsOverlay') { pendingSettings = null; closeModal('settingsOverlay'); syncSettingsUI(settings); }
  });

  // Add To overlay
  document.getElementById('addToOverlay').addEventListener('click', e => closeOnOverlay('addToOverlay', e));

  // Keyboard
  document.addEventListener('keydown', e => {
    const screen = document.querySelector('.screen.active')?.id;
    if (screen !== 'studyScreen') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextWord();
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   prevWord();
    if (e.key === 'Escape') ['settingsOverlay','infoOverlay','wordDetailOverlay','wordListOverlay','addToOverlay'].forEach(id => closeModal(id));
  });
}

// ══════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
