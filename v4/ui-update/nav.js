/* ══════════════════════════════════════
   DICTIONARY — navigation.js
   Loaded after app.js. Reads globals:
   studyList, currentIndex, hiddenWords,
   readHistory, S, csvData,
   getSyns(), getAnts(), show(), closeModal()
   ══════════════════════════════════════ */

// ── Session state ──
const seenNumIds   = new Set();
const visitedWords = new Set();
const sessionMarks = {};

// ══════════════════════════════════════
// SESSION TRACKING
// ══════════════════════════════════════
function trackVisit(word) {
  readHistory.push({ word, index: currentIndex, time: new Date().toLocaleTimeString() });
  visitedWords.add(word);
  const e = csvData.find(r => r.word === word);
  if (e?.id) seenNumIds.add(Math.abs(e.id));
}

function navSessionStart() {
  seenNumIds.clear();
  visitedWords.clear();
  Object.keys(sessionMarks).forEach(k => delete sessionMarks[k]);
}

// ══════════════════════════════════════
// HELPERS
// ══════════════════════════════════════
function hasSynAnt(word) {
  const e = csvData.find(r => r.word === word);
  if (!e?.id) return false;
  const absId = Math.abs(e.id);
  return csvData.some(r => r.word !== word && Math.abs(r.id) === absId);
}

function hasDef(word) {
  const e = csvData.find(r => r.word === word);
  return !!(e?.definition);
}

function getAbsId(word) {
  const e = csvData.find(r => r.word === word);
  return e?.id ? Math.abs(e.id) : 0;
}

// ══════════════════════════════════════
// SKIP CONDITIONS
// ══════════════════════════════════════

function skipNext(word) {
  if (hiddenWords.has(word)) return true;
  if (!S.navFilter) return false;
  if (S.navSynAnt  && !hasSynAnt(word)) return true;
  if (S.navDefined && !hasDef(word))    return true;
  if (S.navRootwise) {
    const absId = getAbsId(word);
    if (S.nxtBehavior) {
      if (seenNumIds.has(absId))  return true; // Exclusive: skip seen
    } else {
      if (!seenNumIds.has(absId)) return true; // Inclusive: skip unseen
    }
  }
  return false;
}

// Base conditions shared by all Prev modes
function skipPrevBase(word) {
  if (hiddenWords.has(word)) return true;
  if (!S.navFilter) return false;
  if (S.navSynAnt  && !hasSynAnt(word)) return true;
  if (S.navDefined && !hasDef(word))    return true;
  return false;
}

// Exact: skip if word was never visited
function skipPrevExact(word) {
  if (skipPrevBase(word)) return true;
  if (!visitedWords.has(word)) return true;
  return false;
}

// Variation Phase 1: skip if |NumId| ∉ S OR word already visited
function skipPrevVariation1(word) {
  if (skipPrevBase(word)) return true;
  if (!seenNumIds.has(getAbsId(word))) return true; // |NumId| not seen
  if (visitedWords.has(word))          return true; // already visited
  return false;
}

// ══════════════════════════════════════
// STEP RESOLUTION
// ══════════════════════════════════════
function resolveStep() {
  if (S.orderMode !== 'random' && S.randomNav) {
    const delta = S.navDelta || 2;
    const raw   = S.stepNumber + Math.floor(Math.random() * (2 * delta + 1)) - delta;
    return Math.max(1, raw);
  }
  return S.stepNumber;
}

// ══════════════════════════════════════
// SCAN HELPERS
// ══════════════════════════════════════

// All mode: jump step non-hidden positions, then scan for passing word
function scanAll(start, step, dir, skipFn) {
  const n   = studyList.length;
  const inc = dir === 'next' ? 1 : -1;
  let jumped = 0;
  let i = start + inc;

  // Jump step non-hidden positions
  while (dir === 'next' ? i < n : i >= 0) {
    if (!hiddenWords.has(studyList[i])) {
      jumped++;
      if (jumped >= step) break;
    }
    i += inc;
  }

  // Scan from landing for first passing word
  while (dir === 'next' ? i < n : i >= 0) {
    if (!skipFn(studyList[i])) return i;
    i += inc;
  }
  return -1;
}

// Each mode: count step passing words
function scanEach(start, step, dir, skipFn) {
  const n   = studyList.length;
  const inc = dir === 'next' ? 1 : -1;
  let count = 0;
  let i = start + inc;
  while (dir === 'next' ? i < n : i >= 0) {
    if (!skipFn(studyList[i])) {
      count++;
      if (count >= step) return i;
    }
    i += inc;
  }
  return -1;
}

function doScan(start, step, dir, skipFn) {
  return S.stepAction
    ? scanEach(start, step, dir, skipFn)
    : scanAll(start, step, dir, skipFn);
}

// ══════════════════════════════════════
// NEXT
// ══════════════════════════════════════
function navNext() {
  if (!studyList.length) return;

  if (S.orderMode === 'random' && S.suggestMarked) {
    weightedRandomNext(); return;
  }

  const step = resolveStep();
  let   pos  = doScan(currentIndex, step, 'next', skipNext);

  if (pos === -1) {
    if (!S.loopMode) { alert("You've reached the end of the list."); return; }
    pos = doScan(-1, step, 'next', skipNext);
    if (pos === -1 || pos >= currentIndex) { alert("No matching words found."); return; }
  }

  currentIndex = pos;
  wordsSeen++;
  show();
}

// ══════════════════════════════════════
// PREV
// ══════════════════════════════════════
function navPrev() {
  if (!studyList.length) return;

  const step   = resolveStep();
  const useVar = S.navFilter && S.navRootwise && S.prevBehavior;
  let   pos    = -1;

  if (useVar) {
    // Phase 1 — Variation
    pos = doScan(currentIndex, step, 'prev', skipPrevVariation1);
    // Phase 2 — Fallback to Exact if Phase 1 found nothing
    if (pos === -1)
      pos = doScan(currentIndex, step, 'prev', skipPrevExact);
  } else {
    // Exact
    pos = doScan(currentIndex, step, 'prev', skipPrevExact);
  }

  if (pos === -1) {
    if (!S.loopMode) { alert("You've reached the beginning of the list."); return; }
    const skipFn = useVar ? skipPrevVariation1 : skipPrevExact;
    pos = doScan(studyList.length, step, 'prev', skipFn);
    if (pos === -1 || pos <= currentIndex) { alert("No matching words found."); return; }
  }

  currentIndex = pos;
  wordsSeen++;
  show();
}

// ══════════════════════════════════════
// WEIGHTED RANDOM
// ══════════════════════════════════════
function getWeight(word) {
  let w = 1;
  // Persistent flags — Phase 9
  const mark = sessionMarks[word];
  if (mark === 'like')    w *= 1/3;
  if (mark === 'dislike') w *= 3;
  return w;
}

function weightedRandomNext() {
  const pool = studyList.filter(w => !hiddenWords.has(w) && w !== studyList[currentIndex]);
  if (!pool.length) { alert("No words available."); return; }
  const weights = pool.map(w => getWeight(w));
  const total   = weights.reduce((a, b) => a + b, 0);
  let   rand    = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    rand -= weights[i];
    if (rand <= 0) { currentIndex = studyList.indexOf(pool[i]); wordsSeen++; show(); return; }
  }
  currentIndex = studyList.indexOf(pool[pool.length - 1]);
  wordsSeen++; show();
}

// ══════════════════════════════════════
// QUICK NAV POPUP
// ══════════════════════════════════════
function navOpenQuickPopup() {
  const word = studyList[currentIndex];
  if (!word) return;
  document.getElementById('quickNavWord').textContent = '"' + word + '"';
  const mark = sessionMarks[word];
  document.getElementById('quickLikeBtn').classList.toggle('active', mark === 'like');
  document.getElementById('quickDislikeBtn').classList.toggle('active', mark === 'dislike');
  // Init pending state and sync UI
  pendingNav = Object.assign({}, S);
  syncQuickNavUI();
  document.getElementById('quickNavOverlay').classList.remove('hidden');
}

function navBindQuickNav() {
  document.getElementById('quickLikeBtn').addEventListener('click', () => {
    const word = studyList[currentIndex];
    if (!word) return;
    if (sessionMarks[word] === 'like') delete sessionMarks[word];
    else sessionMarks[word] = 'like';
    document.getElementById('quickLikeBtn').classList.toggle('active', sessionMarks[word] === 'like');
    document.getElementById('quickDislikeBtn').classList.remove('active');
  });
  document.getElementById('quickDislikeBtn').addEventListener('click', () => {
    const word = studyList[currentIndex];
    if (!word) return;
    if (sessionMarks[word] === 'dislike') delete sessionMarks[word];
    else sessionMarks[word] = 'dislike';
    document.getElementById('quickDislikeBtn').classList.toggle('active', sessionMarks[word] === 'dislike');
    document.getElementById('quickLikeBtn').classList.remove('active');
  });
}
