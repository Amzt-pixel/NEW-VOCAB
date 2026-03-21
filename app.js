/* ══════════════════════════════════════
   DICTIONARY — app.js — Phase 1
   ══════════════════════════════════════ */

// ── Constants ──
const PASSWORD = 'dictionary'; // Change this to your password
const CSV_URL = 'https://raw.githubusercontent.com/Amzt-pixel/NEW-VOCAB/main/csvs/dictionary1.csv';
const HOLD_DURATION = 700; // ms for press-and-hold

// ── State ──
let csvData       = [];   // raw parsed CSV rows
let studyList     = [];   // ordered list of words for current session
let rootWordList  = [];   // deduplicated root words
let currentIndex  = 0;
let startTime     = null;
let wordsSeen     = 0;

// Settings (loaded from localStorage)
let settings = {
  accent:      'gold',
  fontSize:    'normal',
  stepNumber:  1,
  loopMode:    false,
  filter:      'all',     // all | root | synant
  showTranslation: false,
  wordHighlight:   false,
  orderMode:   'az',
  category:    '1',
  activeTab:   'syn',     // syn | ant | def
};

// Hold timers
let prevHoldTimer = null;
let nextHoldTimer = null;

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  applySettings();
  checkSession();
  bindEvents();
});

function checkSession() {
  const token = localStorage.getItem('dictSession');
  if (token === 'unlocked') {
    showScreen('home');
    loadData();
  } else {
    showScreen('gate');
  }
}

// ══════════════════════════════════════
// SCREEN MANAGEMENT
// ══════════════════════════════════════
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`${name}Screen`).classList.add('active');
}

// ══════════════════════════════════════
// PASSWORD GATE
// ══════════════════════════════════════
let wrongAttempts = 0;

function bindGate() {
  const btn   = document.getElementById('gateBtn');
  const input = document.getElementById('gateInput');
  const error = document.getElementById('gateError');

  function attempt() {
    const val = input.value.trim();
    if (val === PASSWORD) {
      localStorage.setItem('dictSession', 'unlocked');
      wrongAttempts = 0;
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
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = 'Unlock';
          wrongAttempts = 0;
        }, 10000);
      }
    }
  }

  btn.addEventListener('click', attempt);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
  input.addEventListener('input', () => error.classList.add('hidden'));
}

// ══════════════════════════════════════
// DATA LOADING
// ══════════════════════════════════════
async function loadData() {
  try {
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    parseCSV(text);
    buildStats();
    buildRootWordList();
    renderHomeWordList();
  } catch (err) {
    console.error('Failed to load CSV:', err);
    document.getElementById('rootWordItems').innerHTML =
      `<div class="list-loading" style="color:#e55">Failed to load data. Check console.</div>`;
  }
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  csvData = lines.slice(1).map(line => {
    // Handle quoted fields
    const cols = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ? cols[i].trim().replace(/^"|"$/g, '') : '';
    });
    return {
      word:       obj['Word']       || '',
      id:         parseFloat(obj['NumId']) || 0,
      definition: obj['Definition'] || '',
      example:    obj['Example']    || '',
      level:      parseInt(obj['Note']) || 0,
      uid:        0, // will assign below
      category:   1, // default — will expand when full schema lands
    };
  }).filter(r => r.word);

  // Assign UIDs (sequential for now)
  csvData.forEach((r, i) => r.uid = i + 1);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ══════════════════════════════════════
// STATS & LIBRARY BUILDING
// ══════════════════════════════════════
function buildStats() {
  const uniqueAbsIds = new Set(csvData.map(r => Math.abs(r.id)).filter(Boolean));
  document.getElementById('statRootWords').textContent  = uniqueAbsIds.size;
  document.getElementById('statTotalWords').textContent = csvData.length;
}

function getSynonyms(word) {
  const entry = csvData.find(r => r.word === word);
  if (!entry || !entry.id) return [];
  return csvData
    .filter(r => r.id === entry.id && r.word !== word)
    .map(r => r.word);
}

function getAntonyms(word) {
  const entry = csvData.find(r => r.word === word);
  if (!entry || !entry.id) return [];
  return csvData
    .filter(r => r.id === -entry.id)
    .map(r => r.word);
}

function hasSynOrAnt(word) {
  return getSynonyms(word).length > 0 || getAntonyms(word).length > 0;
}

function buildRootWordList() {
  const seen = new Set();
  rootWordList = [];
  csvData.forEach(r => {
    if (!r.id) return;
    const key = Math.abs(r.id);
    if (!seen.has(key)) {
      seen.add(key);
      rootWordList.push({ word: r.word, id: r.id });
    }
  });
}

function buildStudyList(order, filter, category) {
  let words = [...new Set(csvData.map(r => r.word))];

  // Filter
  if (filter === 'root') {
    const rootWords = new Set(rootWordList.map(r => r.word));
    words = words.filter(w => rootWords.has(w));
  } else if (filter === 'synant') {
    words = words.filter(w => hasSynOrAnt(w));
  }

  // Sort
  if (order === 'az')     words.sort((a,b) => a.localeCompare(b));
  if (order === 'za')     words.sort((a,b) => b.localeCompare(a));
  if (order === 'random') words.sort(() => Math.random() - 0.5);

  return words;
}

// ══════════════════════════════════════
// HOME — ROOT WORD LIST
// ══════════════════════════════════════
function renderHomeWordList() {
  const container = document.getElementById('rootWordItems');
  const countEl   = document.getElementById('rootWordCount');

  // Use alphabetical root words for home list
  const sorted = [...csvData]
    .filter((r, idx, arr) => arr.findIndex(x => Math.abs(x.id) === Math.abs(r.id)) === idx)
    .filter(r => r.id)
    .sort((a,b) => a.word.localeCompare(b.word));

  countEl.textContent = `${sorted.length} words`;
  document.getElementById('statRootWords').textContent = sorted.length;

  const SHOW = 30;
  const visible = sorted.slice(0, SHOW);

  let html = visible.map((r, i) => {
    const hasSyn = getSynonyms(r.word).length > 0;
    const hasAnt = getAntonyms(r.word).length > 0;
    let dotClass = '';
    if (hasSyn && hasAnt) dotClass = 'dot-both';
    else if (hasSyn)      dotClass = 'dot-syn';
    else if (hasAnt)      dotClass = 'dot-ant';

    return `
      <div class="word-list-item" onclick="jumpToWord('${escapeHtml(r.word)}')">
        <span class="word-list-num">${i+1}</span>
        <span>${escapeHtml(r.word)}</span>
        ${dotClass ? `<span class="dot-indicator ${dotClass}"></span>` : ''}
      </div>`;
  }).join('');

  if (sorted.length > SHOW) {
    html += `<div class="word-list-item" style="justify-content:center; color:var(--text-secondary); font-size:13px; cursor:default; font-weight:400;">
      + ${sorted.length - SHOW} more — start a session to see all
    </div>`;
  }

  container.innerHTML = html;
}

function jumpToWord(word) {
  // Start a session at this word
  startSessionAtWord(word);
}

// ══════════════════════════════════════
// SESSION START
// ══════════════════════════════════════
function startSession() {
  const order    = document.getElementById('orderSelect').value;
  const category = document.getElementById('categorySelect').value;

  settings.orderMode = order;
  settings.category  = category;

  studyList    = buildStudyList(order, settings.filter, category);
  currentIndex = 0;
  wordsSeen    = 1;
  startTime    = new Date();

  updateSessionBar(order);
  showScreen('study');
  displayWord();
}

function startSessionAtWord(word) {
  const order = settings.orderMode || 'az';
  studyList   = buildStudyList(order, settings.filter, settings.category);

  const idx = studyList.findIndex(w => w === word);
  currentIndex = idx >= 0 ? idx : 0;
  wordsSeen    = 1;
  startTime    = new Date();

  updateSessionBar(order);
  showScreen('study');
  displayWord();
}

function updateSessionBar(order) {
  const orderLabels = { az: 'A→Z', za: 'Z→A', random: 'Random' };
  document.getElementById('sessionSetName').textContent = 'Dictionary';
  document.getElementById('sessionStep').textContent    = settings.stepNumber;
  document.getElementById('sessionOrder').textContent   = orderLabels[order] || order;
}

// ══════════════════════════════════════
// DISPLAY WORD
// ══════════════════════════════════════
function displayWord() {
  if (!studyList.length) return;

  const word   = studyList[currentIndex];
  const entry  = csvData.find(r => r.word === word);
  const syns   = getSynonyms(word);
  const ants   = getAntonyms(word);
  const hasDef = entry && entry.definition;

  // Progress
  document.getElementById('progressPill').textContent = `${currentIndex + 1} / ${studyList.length}`;

  // Word hero
  document.getElementById('currentWord').textContent = word;
  document.getElementById('currentPos').textContent  = entry ? getLevelLabel(entry.level) : '';

  // Synonyms
  const synChips = document.getElementById('synChips');
  synChips.innerHTML = syns.map(s =>
    `<button class="chip syn-chip" 
      onmousedown="startChipHold(event,'${escapeHtml(s)}')"
      onmouseup="clearChipHold()"
      onmouseleave="clearChipHold()"
      ontouchstart="startChipHold(event,'${escapeHtml(s)}')"
      ontouchend="clearChipHold()"
      ontouchcancel="clearChipHold()"
    >${escapeHtml(s)}</button>`
  ).join('');

  // Antonyms
  const antChips = document.getElementById('antChips');
  antChips.innerHTML = ants.map(a =>
    `<button class="chip ant-chip"
      onmousedown="startChipHold(event,'${escapeHtml(a)}')"
      onmouseup="clearChipHold()"
      onmouseleave="clearChipHold()"
      ontouchstart="startChipHold(event,'${escapeHtml(a)}')"
      ontouchend="clearChipHold()"
      ontouchcancel="clearChipHold()"
    >${escapeHtml(a)}</button>`
  ).join('');

  // Definition
  const defContent = document.getElementById('defContent');
  if (hasDef) {
    defContent.innerHTML = `<div class="def-text">${escapeHtml(entry.definition)}</div>`;
    if (entry.example) {
      defContent.innerHTML += `<div class="def-example">"${escapeHtml(entry.example)}"</div>`;
    }
  } else {
    defContent.innerHTML = `<div class="empty-state" style="padding:4px 0">No definition available.</div>`;
  }

  // Show/hide cards & tabs
  const hasSyn = syns.length > 0;
  const hasAnt = ants.length > 0;

  document.getElementById('synCard').classList.toggle('hidden', !hasSyn);
  document.getElementById('antCard').classList.toggle('hidden', !hasAnt);
  document.getElementById('defCard').classList.toggle('hidden', false);
  document.getElementById('emptyCard').classList.toggle('hidden', hasSyn || hasAnt || hasDef);

  document.getElementById('tabSyn').classList.toggle('hidden', !hasSyn);
  document.getElementById('tabAnt').classList.toggle('hidden', !hasAnt);

  // Tab counts
  document.getElementById('synCount').textContent = hasSyn ? syns.length : '';
  document.getElementById('antCount').textContent = hasAnt ? ants.length : '';

  // Auto-activate first available tab
  const activeTab = settings.activeTab;
  if (activeTab === 'syn' && hasSyn)       switchTab('syn');
  else if (activeTab === 'ant' && hasAnt)  switchTab('ant');
  else if (hasSyn)                         switchTab('syn');
  else if (hasAnt)                         switchTab('ant');
  else                                     switchTab('def');

  // Update word list panel if open
  updateWordListPanel();
}

function getLevelLabel(level) {
  const labels = { 1: 'Unique / Rare', 2: 'Specific / Formal', 3: 'Colloquial' };
  return labels[level] || '';
}

// ══════════════════════════════════════
// TAB SWITCHING
// ══════════════════════════════════════
function switchTab(tab) {
  settings.activeTab = tab;

  ['syn','ant','def'].forEach(t => {
    document.getElementById(`tab${t.charAt(0).toUpperCase()+t.slice(1)}`)
      ?.classList.toggle('active', t === tab);
    document.getElementById(`${t}Card`)
      ?.classList.toggle('hidden', t !== tab);
  });
}

// ══════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════
function nextWord() {
  const max = studyList.length;
  if (currentIndex + settings.stepNumber >= max) {
    if (!settings.loopMode) {
      if (settings.stepNumber > 1) alert('Reached end — reduce step or enable loop mode.');
      return;
    }
    currentIndex = (currentIndex + settings.stepNumber) % max;
  } else {
    currentIndex += settings.stepNumber;
  }
  wordsSeen++;
  displayWord();
}

function prevWord() {
  if (currentIndex - settings.stepNumber < 0) {
    if (!settings.loopMode) {
      if (settings.stepNumber > 1) alert('Reached beginning — reduce step or enable loop mode.');
      return;
    }
    currentIndex = (studyList.length + currentIndex - settings.stepNumber) % studyList.length;
  } else {
    currentIndex -= settings.stepNumber;
  }
  wordsSeen++;
  displayWord();
}

// ── Press-and-hold on Prev/Next → show Word Detail ──
function startPrevHold() {
  prevHoldTimer = setTimeout(() => {
    prevHoldTimer = null;
    const prevIdx = currentIndex - settings.stepNumber;
    if (prevIdx >= 0) openWordDetail(studyList[prevIdx]);
  }, HOLD_DURATION);
}

function clearPrevHold() {
  if (prevHoldTimer) { clearTimeout(prevHoldTimer); prevHoldTimer = null; }
}

function startNextHold() {
  nextHoldTimer = setTimeout(() => {
    nextHoldTimer = null;
    const nextIdx = currentIndex + settings.stepNumber;
    if (nextIdx < studyList.length) openWordDetail(studyList[nextIdx]);
  }, HOLD_DURATION);
}

function clearNextHold() {
  if (nextHoldTimer) { clearTimeout(nextHoldTimer); nextHoldTimer = null; }
}

// ── Chip press-and-hold → Word Detail ──
let chipHoldTimer = null;
let chipHoldWord  = null;

function startChipHold(e, word) {
  chipHoldWord  = word;
  chipHoldTimer = setTimeout(() => {
    chipHoldTimer = null;
    openWordDetail(word);
  }, HOLD_DURATION);
}

function clearChipHold() {
  if (chipHoldTimer) { clearTimeout(chipHoldTimer); chipHoldTimer = null; }
}

// ══════════════════════════════════════
// WORD DETAIL MODAL
// ══════════════════════════════════════
function openWordDetail(word) {
  const entry = csvData.find(r => r.word === word);
  const syns  = getSynonyms(word);
  const ants  = getAntonyms(word);

  document.getElementById('detailWord').textContent = word;

  // Meta badges
  const metaEl = document.getElementById('detailMeta');
  const badges = [];
  if (entry && entry.level > 0) {
    const levelLabels = { 1: 'Unique', 2: 'Specific', 3: 'Colloquial' };
    badges.push(`<span class="detail-badge badge-word">${levelLabels[entry.level]}</span>`);
  }
  metaEl.innerHTML = badges.join('');

  // Content
  let html = '';

  if (entry && entry.definition) {
    html += `<div class="detail-section">
      <div class="detail-section-title">Definition</div>
      <div class="detail-def">${escapeHtml(entry.definition)}</div>
      ${entry.example ? `<div class="detail-example">"${escapeHtml(entry.example)}"</div>` : ''}
    </div>`;
  }

  if (syns.length > 0) {
    html += `<div class="detail-section">
      <div class="detail-section-title" style="color:var(--syn)">Synonyms (${syns.length})</div>
      <div class="chips-wrap">
        ${syns.map(s => `<button class="chip syn-chip" onclick="openWordDetailFromDetail('${escapeHtml(s)}')">${escapeHtml(s)}</button>`).join('')}
      </div>
    </div>`;
  }

  if (ants.length > 0) {
    html += `<div class="detail-section">
      <div class="detail-section-title" style="color:var(--ant)">Antonyms (${ants.length})</div>
      <div class="chips-wrap">
        ${ants.map(a => `<button class="chip ant-chip" onclick="openWordDetailFromDetail('${escapeHtml(a)}')">${escapeHtml(a)}</button>`).join('')}
      </div>
    </div>`;
  }

  if (!html) {
    html = `<div class="empty-state">No details available for this word.</div>`;
  }

  document.getElementById('detailContent').innerHTML = html;
  document.getElementById('wordDetailOverlay').classList.remove('hidden');
}

function openWordDetailFromDetail(word) {
  // Navigate to word in study list if it exists
  const idx = studyList.findIndex(w => w === word);
  if (idx >= 0) {
    closeModal('wordDetailOverlay');
    currentIndex = idx;
    displayWord();
  } else {
    openWordDetail(word);
  }
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
    if (q.length >= 3) renderSearchResults(q);
    else document.getElementById('searchResults').innerHTML = `<div class="search-hint">Type at least 3 characters to search</div>`;
  });

  clear.addEventListener('click', () => {
    input.value = '';
    clear.classList.add('hidden');
    document.getElementById('searchResults').innerHTML = `<div class="search-hint">Type at least 3 characters to search</div>`;
    input.focus();
  });
}

function renderSearchResults(query) {
  const words = [...new Set(csvData.map(r => r.word))];
  let regex;
  try { regex = new RegExp(query, 'i'); }
  catch(e) { regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }

  const exact   = words.filter(w => w.toLowerCase() === query.toLowerCase());
  const close   = words.filter(w => regex.test(w) && !exact.includes(w));
  const meaning = words.filter(w => {
    const e = csvData.find(r => r.word === w);
    return e && e.definition && regex.test(e.definition) && !exact.includes(w) && !close.includes(w);
  });

  let html = '';

  function renderGroup(title, list) {
    if (!list.length) return '';
    return `<div>
      <div class="search-group-title">${title}</div>
      ${list.map(w => {
        const e = csvData.find(r => r.word === w);
        const syns = getSynonyms(w).length;
        const ants = getAntonyms(w).length;
        const meta = [syns > 0 ? `${syns} syn` : '', ants > 0 ? `${ants} ant` : ''].filter(Boolean).join(' · ');
        return `<div class="search-item" onclick="jumpToWordFromSearch('${escapeHtml(w)}')">
          <div>
            <div class="search-item-word">${escapeHtml(w)}</div>
            ${e && e.definition ? `<div class="search-item-meta" style="font-size:12px;color:var(--text-secondary);margin-top:2px">${escapeHtml(e.definition.substring(0,60))}${e.definition.length>60?'…':''}</div>` : ''}
          </div>
          <div class="search-item-meta">${meta}</div>
        </div>`;
      }).join('')}
    </div>`;
  }

  html += renderGroup('Exact Match', exact);
  html += renderGroup('Close Matches', close.slice(0, 20));
  html += renderGroup('Matches in Meaning', meaning.slice(0, 10));

  if (!exact.length && !close.length && !meaning.length) {
    html = `<div class="search-hint">No results found for "${escapeHtml(query)}"</div>`;
  }

  document.getElementById('searchResults').innerHTML = html;
}

function jumpToWordFromSearch(word) {
  closeScreen('search');
  startSessionAtWord(word);
}

function closeScreen(name) {
  document.getElementById(`${name}Screen`).classList.remove('active');
  document.getElementById('studyScreen').classList.add('active');
}

// ══════════════════════════════════════
// WORD LIST PANEL
// ══════════════════════════════════════
function openWordListPanel() {
  updateWordListPanel();
  document.getElementById('wordListOverlay').classList.remove('hidden');
}

function updateWordListPanel() {
  const container = document.getElementById('wordListContent');
  if (!studyList.length) return;

  container.innerHTML = studyList.map((w, i) => `
    <div class="panel-item ${i === currentIndex ? 'current' : ''}" onclick="jumpToIndex(${i})">
      <span class="panel-item-num">${i+1}</span>
      <span>${escapeHtml(w)}</span>
    </div>
  `).join('');

  // Scroll current into view
  setTimeout(() => {
    const current = container.querySelector('.current');
    if (current) current.scrollIntoView({ block: 'center' });
  }, 50);
}

function jumpToIndex(idx) {
  currentIndex = idx;
  displayWord();
  document.getElementById('wordListOverlay').classList.add('hidden');
}

// ══════════════════════════════════════
// INFO MODAL
// ══════════════════════════════════════
function showInfo() {
  const elapsed = startTime ? Math.floor((new Date() - startTime) / 1000) : 0;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  document.getElementById('infoContent').innerHTML = `
    <div class="info-row"><span class="info-row-label">Time</span><span class="info-row-value accent">${mins}m ${secs}s</span></div>
    <div class="info-row"><span class="info-row-label">Word Set</span><span class="info-row-value">Dictionary</span></div>
    <div class="info-row"><span class="info-row-label">Order</span><span class="info-row-value">${settings.orderMode === 'az' ? 'A→Z' : settings.orderMode === 'za' ? 'Z→A' : 'Random'}</span></div>
    <div class="info-row"><span class="info-row-label">Total Words</span><span class="info-row-value">${studyList.length}</span></div>
    <div class="info-row"><span class="info-row-label">Words Seen</span><span class="info-row-value">${wordsSeen}</span></div>
    <div class="info-row"><span class="info-row-label">Position</span><span class="info-row-value">${currentIndex + 1} / ${studyList.length}</span></div>
    <div class="info-row"><span class="info-row-label">Step Size</span><span class="info-row-value">${settings.stepNumber}</span></div>
    <div class="info-row"><span class="info-row-label">Loop Mode</span><span class="info-row-value">${settings.loopMode ? 'On' : 'Off'}</span></div>
  `;
  document.getElementById('infoOverlay').classList.remove('hidden');
}

// ══════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════
function openSettings() {
  // Sync UI to current settings
  document.querySelectorAll('[data-size]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.size === settings.fontSize);
  });
  document.querySelectorAll('[data-step]').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.step) === settings.stepNumber);
  });
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === settings.filter);
  });
  document.querySelectorAll('[data-accent]').forEach(swatch => {
    swatch.classList.toggle('selected', swatch.dataset.accent === settings.accent);
  });
  document.getElementById('loopToggle').checked        = settings.loopMode;
  document.getElementById('translationToggle').checked = settings.showTranslation;
  document.getElementById('highlightToggle').checked   = settings.wordHighlight;

  document.getElementById('settingsOverlay').classList.remove('hidden');
}

function bindSettingsEvents() {
  // Font size
  document.querySelectorAll('[data-size]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-size]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.fontSize = btn.dataset.size;
      applyFontSize();
      saveSettings();
    });
  });

  // Step
  document.querySelectorAll('[data-step]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-step]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.stepNumber = parseInt(btn.dataset.step);
      document.getElementById('sessionStep').textContent = settings.stepNumber;
      saveSettings();
    });
  });

  // Filter
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.filter = btn.dataset.filter;
      saveSettings();
    });
  });

  // Accent
  document.querySelectorAll('[data-accent]').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('[data-accent]').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      settings.accent = swatch.dataset.accent;
      applyAccent();
      saveSettings();
    });
  });

  // Toggles
  document.getElementById('loopToggle').addEventListener('change', e => {
    settings.loopMode = e.target.checked;
    saveSettings();
  });
  document.getElementById('translationToggle').addEventListener('change', e => {
    settings.showTranslation = e.target.checked;
    saveSettings();
  });
  document.getElementById('highlightToggle').addEventListener('change', e => {
    settings.wordHighlight = e.target.checked;
    saveSettings();
  });

  // Close
  document.getElementById('settingsClose').addEventListener('click', () => {
    closeModal('settingsOverlay');
  });
}

// ══════════════════════════════════════
// SETTINGS PERSISTENCE
// ══════════════════════════════════════
function saveSettings() {
  localStorage.setItem('dictSettings', JSON.stringify(settings));
}

function loadSettings() {
  const saved = localStorage.getItem('dictSettings');
  if (saved) {
    try { Object.assign(settings, JSON.parse(saved)); }
    catch(e) { console.warn('Settings parse error', e); }
  }
  const accent = localStorage.getItem('dictAccent');
  if (accent) settings.accent = accent;
}

function applySettings() {
  applyAccent();
  applyFontSize();
}

function applyAccent() {
  document.body.className = document.body.className.replace(/accent-\w+/g, '').trim();
  document.body.classList.add(`accent-${settings.accent}`);
  localStorage.setItem('dictAccent', settings.accent);
}

function applyFontSize() {
  document.body.className = document.body.className.replace(/font-\w+/g, '').trim();
  document.body.classList.add(`font-${settings.fontSize}`);
}

// ══════════════════════════════════════
// MODAL HELPERS
// ══════════════════════════════════════
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function closeOnOverlay(overlayId, e) {
  if (e.target.id === overlayId) closeModal(overlayId);
}

// ══════════════════════════════════════
// EVENT BINDING
// ══════════════════════════════════════
function bindEvents() {
  bindGate();
  initSearch();
  bindSettingsEvents();

  // Home
  document.getElementById('startBtn').addEventListener('click', startSession);
  document.getElementById('homeSearchBtn').addEventListener('click', () => showScreen('search'));

  // Study navbar
  document.getElementById('studyHomeBtn').addEventListener('click', () => showScreen('home'));
  document.getElementById('infoBtn').addEventListener('click', showInfo);
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('wordListBtn').addEventListener('click', openWordListPanel);

  // Nav buttons — tap = navigate, hold = word detail
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  prevBtn.addEventListener('click', prevWord);
  nextBtn.addEventListener('click', nextWord);

  prevBtn.addEventListener('mousedown',   startPrevHold);
  prevBtn.addEventListener('mouseup',     () => { clearPrevHold(); });
  prevBtn.addEventListener('mouseleave',  clearPrevHold);
  prevBtn.addEventListener('touchstart',  startPrevHold, { passive: true });
  prevBtn.addEventListener('touchend',    () => { clearPrevHold(); });
  prevBtn.addEventListener('touchcancel', clearPrevHold);

  nextBtn.addEventListener('mousedown',   startNextHold);
  nextBtn.addEventListener('mouseup',     () => { clearNextHold(); });
  nextBtn.addEventListener('mouseleave',  clearNextHold);
  nextBtn.addEventListener('touchstart',  startNextHold, { passive: true });
  nextBtn.addEventListener('touchend',    () => { clearNextHold(); });
  nextBtn.addEventListener('touchcancel', clearNextHold);

  // Search back
  document.getElementById('searchBackBtn').addEventListener('click', () => {
    if (studyList.length) showScreen('study');
    else showScreen('home');
  });

  // Word list panel
  document.getElementById('wordListClose').addEventListener('click', () => closeModal('wordListOverlay'));
  document.getElementById('wordListOverlay').addEventListener('click', e => closeOnOverlay('wordListOverlay', e));

  // Info modal
  document.getElementById('infoClose').addEventListener('click', () => closeModal('infoOverlay'));
  document.getElementById('infoOverlay').addEventListener('click', e => closeOnOverlay('infoOverlay', e));

  // Word detail
  document.getElementById('wordDetailClose').addEventListener('click', () => closeModal('wordDetailOverlay'));
  document.getElementById('wordDetailOverlay').addEventListener('click', e => closeOnOverlay('wordDetailOverlay', e));

  // Settings overlay
  document.getElementById('settingsOverlay').addEventListener('click', e => closeOnOverlay('settingsOverlay', e));

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    const screen = document.querySelector('.screen.active')?.id;
    if (screen !== 'studyScreen') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextWord();
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   prevWord();
    if (e.key === 'Escape') {
      ['settingsOverlay','infoOverlay','wordDetailOverlay','wordListOverlay'].forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
      });
    }
  });
}

// ══════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
