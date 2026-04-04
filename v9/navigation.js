/* ══════════════════════════════════════
   DICTIONARY — navigation.js
   Loaded after app.js. Reads globals:
   studyList, currentIndex, hiddenWords,
   readHistory, S, csvData,
   getSyns(), getAnts(), show(), closeModal()
   ══════════════════════════════════════ */

// ── Session state ──
const seenNumIds    = new Set(); // |NumId| values seen
const seenSignedIds = new Set(); // signed NumId values seen (for Avoid Opposites)
const visitedWords  = new Set();
const sessionMarks  = {};

// ══════════════════════════════════════
// SESSION TRACKING
// ══════════════════════════════════════
function trackVisit(word) {
  readHistory.push({ word, index: currentIndex, time: new Date().toLocaleTimeString() });
  visitedWords.add(word);
  const e = csvData.find(r => r.word === word);
  if (e?.id) {
    seenNumIds.add(Math.abs(e.id));
    seenSignedIds.add(e.id);
  }
}

function navSessionStart() {
  seenNumIds.clear();
  seenSignedIds.clear();
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

function getSignedId(word) {
  const e = csvData.find(r => r.word === word);
  return e?.id || 0;
}

// ══════════════════════════════════════
// ROOTWISE CHECK — shared by Next and Prev
// Returns true if the word PASSES the rootwise condition
// ══════════════════════════════════════
function rootwisePassNext(word) {
  const signedId = getSignedId(word);
  const absId    = Math.abs(signedId);
  if (!absId) return false;

  // Avoid Opposites: skip if this word's NumId is the negative of any seen ID
  if (S.avoidOpposites) {
    if (seenSignedIds.has(-signedId)) return false;
  }

  // Exclusive (default ON): pass if |NumId| NOT yet seen
  // Inclusive (exclusive OFF): pass if |NumId| HAS been seen
  return S.exclusive ? !seenNumIds.has(absId) : seenNumIds.has(absId);
}

// ══════════════════════════════════════
// SYNANT + DEFINED BASE CHECK
// Returns true if word should be SKIPPED by base filters
// ══════════════════════════════════════
function skipBase(word) {
  if (!S.navFilter) return false;
  if (!S.navSynAnt && !S.navDefined) return false;

  const synAntOk  = !S.navSynAnt  || hasSynAnt(word);
  const definedOk = !S.navDefined || hasDef(word);

  // OR logic between SynAnt and Defined
 // const basePass = synAntOk || definedOk;
   const basePass = S.joinCondition
    ? (synAntOk || definedOk)
    : (synAntOk && definedOk);
  return !basePass;
}

// ══════════════════════════════════════
// SKIP — NEXT
// ══════════════════════════════════════
function skipNext(word) {
  if (hiddenWords.has(word)) return true;
  if (!S.navFilter) return false;

  const anyBaseActive = S.navSynAnt || S.navDefined;
  const basePass      = anyBaseActive ? !skipBase(word) : true;

  if (!S.navRootwise) return !basePass;

  const rootPass = rootwisePassNext(word);

  // Necessary ON → (SynAnt OR Def) AND Root
  // Necessary OFF → (SynAnt OR Def) OR Root
  if (S.necessary) {
    return !(basePass && rootPass);
  } else {
    return !(basePass || rootPass);
  }
}

// ══════════════════════════════════════
// SKIP — PREV
// Evaluates base + rootwise, then applies Prev mode conditions
// ══════════════════════════════════════

// Pass condition: word was visited (Exact)
function prevExactPass(word) {
  return visitedWords.has(word);
}

// Pass condition: |NumId| seen AND word not yet visited (Variation)
function prevVariationPass(word) {
  return seenNumIds.has(getAbsId(word)) && !visitedWords.has(word);
}

// Pass condition: |NumId| NOT seen (Neither-checked Exclusive mode)
function prevExclusivePass(word) {
  return !seenNumIds.has(getAbsId(word));
}

function skipPrev(word) {
  if (hiddenWords.has(word)) return true;
  if (!S.navFilter) {
    // No filter — just apply Prev mode
    return !applyPrevMode(word);
  }

  const anyBaseActive = S.navSynAnt || S.navDefined;
  const basePass      = anyBaseActive ? !skipBase(word) : true;

  if (!S.navRootwise) {
    return !(basePass && applyPrevMode(word));
  }

  const rootPass = rootwisePassNext(word); // same root condition logic

  let filterPass;
  if (S.necessary) {
    filterPass = basePass && rootPass;
  } else {
    filterPass = basePass || rootPass;
  }

  return !(filterPass && applyPrevMode(word));
}

function applyPrevMode(word) {
  const useExact     = S.prevExact;
  const useVariation = S.prevVariation;

  if (!useExact && !useVariation) {
    // Neither checked → Exclusive mode
    return prevExclusivePass(word);
  }

  if (useExact && useVariation) {
    return prevExactPass(word) || prevVariationPass(word);
  }

  if (useExact)     return prevExactPass(word);
  if (useVariation) return prevVariationPass(word);

  return false;
}

// ══════════════════════════════════════
// STEP RESOLUTION
// ══════════════════════════════════════
function resolveStep() {
  if (S.orderMode !== 'random' && S.randomNav) {
    const delta = S.navDelta || 2;
    const raw   = S.stepNumber + Math.floor(Math.random() * (delta + 1));
    return Math.max(1, raw);
  }
  return S.stepNumber;
}

// ══════════════════════════════════════
// SCAN HELPERS
// ══════════════════════════════════════
function scanAll(start, step, dir, skipFn) {
  const n   = studyList.length;
  const inc = dir === 'next' ? 1 : -1;
  let jumped = 0;
  let i = start + inc;

  while (dir === 'next' ? i < n : i >= 0) {
    if (!hiddenWords.has(studyList[i])) {
      jumped++;
      if (jumped >= step) break;
    }
    i += inc;
  }

  while (dir === 'next' ? i < n : i >= 0) {
    if (!skipFn(studyList[i])) return i;
    i += inc;
  }
  return -1;
}

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

  const step = resolveStep();
  let   pos  = doScan(currentIndex, step, 'prev', skipPrev);

  // Variation Fallback: if Variation is ON, fallback selected, and scan failed
  if (pos === -1 && S.prevVariation && S.variationFallback && !S.prevExact) {
    // Retry using Exact only as fallback
    const fallbackSkip = word => {
      if (hiddenWords.has(word)) return true;
      if (!S.navFilter) return !prevExactPass(word);
      const anyBaseActive = S.navSynAnt || S.navDefined;
      const basePass      = anyBaseActive ? !skipBase(word) : true;
      if (!S.navRootwise) return !(basePass && prevExactPass(word));
      const rootPass   = rootwisePassNext(word);
      const filterPass = S.necessary ? (basePass && rootPass) : (basePass || rootPass);
      return !(filterPass && prevExactPass(word));
    };
    pos = doScan(currentIndex, step, 'prev', fallbackSkip);
  }

  if (pos === -1) {
    if (!S.loopMode) { alert("You've reached the beginning of the list."); return; }
    pos = doScan(studyList.length, step, 'prev', skipPrev);
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
