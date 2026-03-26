/* ══════════════════════════════════════
   DICTIONARY — navigation.js
   Loaded after app.js. Reads globals:
   studyList, currentIndex, hiddenWords,
   readHistory, S, csvData,
   getSyns(), getAnts(), show(), openDetail(), closeModal()
   ══════════════════════════════════════ */

// ── Session state ──
const sessionMarks = {};   // word → 'like' | 'dislike'
const seenNumIds   = new Set(); // |NumId| values seen this session

// ══════════════════════════════════════
// EFFECTIVE QUEUE
// ══════════════════════════════════════

// Returns the filtered list of navigable words
function navEffective() {
  return studyList.filter(w => {
    // Always skip hidden
    if (hiddenWords.has(w)) return false;
    // If nav filter is OFF — all words pass
    if (!S.navFilter) return true;
    // Apply active filter conditions — word must pass ALL checked filters
    if (S.navSynAnt   && !passSynAnt(w))   return false;
    if (S.navDefined  && !passDefined(w))   return false;
    if (S.navRootwise && !passRootwise(w))  return false;
    return true;
  });
}

function passSynAnt(word) {
  return getSyns(word).length > 0 || getAnts(word).length > 0;
}

function passDefined(word) {
  const e = csvData.find(r => r.word === word);
  return !!(e?.definition);
}

function passRootwise(word) {
  const e = csvData.find(r => r.word === word);
  if (!e?.id) return false;
  const absId = Math.abs(e.id);
  if (S.nxtBehavior) {
    // Exclusive — pass only if this |NumId| has NOT been seen yet
    return !seenNumIds.has(absId);
  } else {
    // Inclusive — pass only if this |NumId| HAS been seen
    return seenNumIds.has(absId);
  }
}

// ══════════════════════════════════════
// STEP — All (pre-count) and Each (post-count)
// ══════════════════════════════════════

// Returns the actual step number to use (handles random navigation)
function resolveStep() {
  if (S.orderMode !== 'random' && S.randomNav) {
    const delta = S.navDelta || 2;
    const raw   = S.stepNumber + Math.floor(Math.random() * (2 * delta + 1)) - delta;
    return Math.max(1, raw);
  }
  return S.stepNumber;
}

// Scan forward from startIdx in eff[], return index of next valid word
// mode 'all'  — jump step positions, then scan forward for passing word
// mode 'each' — count step passing words, return the step-th one
function scanForward(eff, startIdx, step) {
  if (S.stepAction) {
    // Each (post-count) — count passing words
    let count = 0;
    for (let i = startIdx + 1; i < eff.length; i++) {
      if (passesAllFilters(eff[i])) {
        count++;
        if (count >= step) return i;
      }
    }
    return -1; // hit end
  } else {
    // All (pre-count) — jump step positions, then scan for passing word
    const jumpIdx = startIdx + step;
    for (let i = jumpIdx; i < eff.length; i++) {
      if (passesAllFilters(eff[i])) return i;
    }
    return -1;
  }
}

function scanBackward(eff, startIdx, step) {
  if (S.stepAction) {
    // Each (post-count)
    let count = 0;
    for (let i = startIdx - 1; i >= 0; i--) {
      if (passesAllFilters(eff[i])) {
        count++;
        if (count >= step) return i;
      }
    }
    return -1;
  } else {
    // All (pre-count)
    const jumpIdx = startIdx - step;
    for (let i = jumpIdx; i >= 0; i--) {
      if (passesAllFilters(eff[i])) return i;
    }
    return -1;
  }
}

// A word passes all active filters (used during scanning)
function passesAllFilters(word) {
  if (!S.navFilter) return true;
  if (S.navSynAnt  && !passSynAnt(word))  return false;
  if (S.navDefined && !passDefined(word)) return false;
  // Note: Rootwise is evaluated based on seenNumIds at scan time
  if (S.navRootwise && !passRootwise(word)) return false;
  return true;
}

// ══════════════════════════════════════
// NEXT
// ══════════════════════════════════════
function navNext() {
  const eff = navEffective();
  if (!eff.length) return;

  const step    = resolveStep();
  const currEff = eff.indexOf(studyList[currentIndex]);
  if (currEff < 0) return;

  let targetEff = scanForward(eff, currEff, step);

  if (targetEff < 0) {
    // Hit the end
    if (!S.loopMode) { alert("You've reached the end of the list."); return; }
    // Loop: scan from beginning
    targetEff = scanForward(eff, -1, step);
    if (targetEff < 0) { alert("No matching words found."); return; }
  }

  const word = eff[targetEff];
  currentIndex = studyList.indexOf(word);
  trackNumId(word);
  wordsSeen++;
  show();
}

// ══════════════════════════════════════
// PREV
// ══════════════════════════════════════
function navPrev() {
  const eff = navEffective();
  if (!eff.length) return;

  const step    = resolveStep();
  const currEff = eff.indexOf(studyList[currentIndex]);
  if (currEff < 0) return;

  let targetEff;

  if (S.navRootwise && S.prevBehavior) {
    // Variation mode — find word with same |NumId| as current, but not current word
    targetEff = findVariationPrev(eff, currEff);
  } else {
    // Default — scan backward
    targetEff = scanBackward(eff, currEff, step);
  }

  if (targetEff < 0) {
    if (!S.loopMode) { alert("You've reached the beginning of the list."); return; }
    // Loop: scan from end
    targetEff = scanBackward(eff, eff.length, step);
    if (targetEff < 0) { alert("No matching words found."); return; }
  }

  const word = eff[targetEff];
  currentIndex = studyList.indexOf(word);
  trackNumId(word);
  wordsSeen++;
  show();
}

// Find a word in eff with same |NumId| as current word, not current word itself
function findVariationPrev(eff, currEff) {
  const currWord = eff[currEff];
  const currEntry = csvData.find(r => r.word === currWord);
  if (!currEntry?.id) return scanBackward(eff, currEff, resolveStep());

  const absId = Math.abs(currEntry.id);
  // Scan backward for a word with same |NumId| but different word
  for (let i = currEff - 1; i >= 0; i--) {
    const e = csvData.find(r => r.word === eff[i]);
    if (e && Math.abs(e.id) === absId && eff[i] !== currWord) return i;
  }
  return -1;
}

// ══════════════════════════════════════
// TRACK SEEN NumIds
// ══════════════════════════════════════
function trackNumId(word) {
  const e = csvData.find(r => r.word === word);
  if (e?.id) seenNumIds.add(Math.abs(e.id));
}

// Call this when session starts to seed the first word's NumId
function navSessionStart() {
  seenNumIds.clear();
  Object.keys(sessionMarks).forEach(k => delete sessionMarks[k]);
  if (studyList.length) trackNumId(studyList[currentIndex]);
}

// ══════════════════════════════════════
// QUICK NAV POPUP
// ══════════════════════════════════════
function navOpenQuickPopup() {
  const word = studyList[currentIndex];
  if (!word) return;

  // Show current word
  document.getElementById('quickNavWord').textContent = '"' + word + '"';

  // Sync like/dislike button states
  const mark = sessionMarks[word];
  document.getElementById('quickLikeBtn').classList.toggle('active', mark === 'like');
  document.getElementById('quickDislikeBtn').classList.toggle('active', mark === 'dislike');

  document.getElementById('quickNavOverlay').classList.remove('hidden');
}

// Bind like/dislike buttons — called once from app.js bindAll
function navBindQuickNav() {
  document.getElementById('quickLikeBtn').addEventListener('click', () => {
    const word = studyList[currentIndex];
    if (!word) return;
    sessionMarks[word] = sessionMarks[word] === 'like' ? undefined : 'like';
    if (sessionMarks[word] === undefined) delete sessionMarks[word];
    document.getElementById('quickLikeBtn').classList.toggle('active', sessionMarks[word] === 'like');
    document.getElementById('quickDislikeBtn').classList.remove('active');
  });

  document.getElementById('quickDislikeBtn').addEventListener('click', () => {
    const word = studyList[currentIndex];
    if (!word) return;
    sessionMarks[word] = sessionMarks[word] === 'dislike' ? undefined : 'dislike';
    if (sessionMarks[word] === undefined) delete sessionMarks[word];
    document.getElementById('quickDislikeBtn').classList.toggle('active', sessionMarks[word] === 'dislike');
    document.getElementById('quickLikeBtn').classList.remove('active');
  });
}

// ══════════════════════════════════════
// WEIGHTED RANDOM (Suggest Marked)
// ══════════════════════════════════════
function getWeight(word) {
  const mark = sessionMarks[word];
  let w = 1;
  // Persistent flags (Phase 9 — placeholders for now)
  // w *= flagWeight(word);

  // Session mark overrides
  if (mark === 'like')    w *= 1/3;
  if (mark === 'dislike') w *= 3;
  return w;
}

function weightedRandomNext() {
  const eff = navEffective();
  if (!eff.length) return;

  const weights = eff.map(w => getWeight(w));
  const total   = weights.reduce((a, b) => a + b, 0);
  let rand      = Math.random() * total;

  for (let i = 0; i < eff.length; i++) {
    rand -= weights[i];
    if (rand <= 0) {
      currentIndex = studyList.indexOf(eff[i]);
      trackNumId(eff[i]);
      wordsSeen++;
      show();
      return;
    }
  }
  // Fallback
  currentIndex = studyList.indexOf(eff[eff.length - 1]);
  show();
}
