/* ══════════════════════════════════════
   DICTIONARY — navigation.js
   Loaded after app.js. Reads globals:
   studyList, currentIndex, hiddenWords,
   readHistory, S, csvData,
   getSyns(), getAnts(), show(), closeModal()
   ══════════════════════════════════════ */

// ── Session state ──
const seenNumIds  = new Set(); // |NumId| values seen this session
const visitedWords = new Set(); // words visited this session (for Prev Exact/Variation)
const sessionMarks = {};        // word → 'like' | 'dislike'

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
// SKIP CONDITIONS
// ══════════════════════════════════════

// Returns true if word should be skipped going NEXT
function skipNext(word) {
  // Base: hidden
  if (hiddenWords.has(word)) return true;
  // Nav filter OFF — no further conditions
  if (!S.navFilter) return false;
  // Syn/Ant
  if (S.navSynAnt && getSyns(word).length === 0 && getAnts(word).length === 0) return true;
  // Defined
  if (S.navDefined) {
    const e = csvData.find(r => r.word === word);
    if (!e?.definition) return true;
  }
  // Rootwise
  if (S.navRootwise) {
    const e = csvData.find(r => r.word === word);
    const absId = e?.id ? Math.abs(e.id) : 0;
    if (S.nxtBehavior) {
      // Exclusive: skip if |NumId| already seen
      if (seenNumIds.has(absId)) return true;
    } else {
      // Inclusive: skip if |NumId| not yet seen
      if (!seenNumIds.has(absId)) return true;
    }
  }
  return false;
}

// Returns true if word should be skipped going PREV
function skipPrev(word) {
  // Base: hidden
  if (hiddenWords.has(word)) return true;
  // Nav filter OFF — no further conditions
  if (!S.navFilter) return false;
  // Syn/Ant
  if (S.navSynAnt && getSyns(word).length === 0 && getAnts(word).length === 0) return true;
  // Defined
  if (S.navDefined) {
    const e = csvData.find(r => r.word === word);
    if (!e?.definition) return true;
  }
  // Rootwise Prev modes
  if (S.navRootwise) {
    if (!S.prevBehavior) {
      // Exact: skip if word was NOT visited
      if (!visitedWords.has(word)) return true;
    } else {
      // Variation: skip if |NumId| NOT in seenNumIds AND word WAS visited
      const e = csvData.find(r => r.word === word);
      const absId = e?.id ? Math.abs(e.id) : 0;
      if (!seenNumIds.has(absId) && visitedWords.has(word)) return true;
    }
  }
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
// NEXT
// ══════════════════════════════════════
function navNext() {
  if (!studyList.length) return;

  // Suggest Marked weighted random (random order mode)
  if (S.orderMode === 'random' && S.suggestMarked) {
    weightedRandomNext();
    return;
  }

  const step = resolveStep();
  const n    = studyList.length;
  let   pos  = currentIndex;

  if (!S.stepAction) {
    // ── All mode (pre-count) ──
    // Jump step positions forward (skipping hidden), then scan for passing word
    let jumped = 0;
    let i = pos + 1;
    while (i < n && jumped < step) {
      if (!hiddenWords.has(studyList[i])) jumped++;
      if (jumped < step) i++;
      else break;
    }
    // i is now at the jump landing — scan forward from here for passing word
    while (i < n) {
      if (!skipNext(studyList[i])) { pos = i; break; }
      i++;
    }
    if (i >= n) {
      if (!S.loopMode) { alert("You've reached the end of the list."); return; }
      // Loop: scan from beginning
      i = 0;
      while (i < currentIndex) {
        if (!skipNext(studyList[i])) { pos = i; break; }
        i++;
      }
      if (i >= currentIndex) { alert("No matching words found."); return; }
    }

  } else {
    // ── Each mode (post-count) ──
    // Count step passing words from current position
    let count = 0;
    let i = pos + 1;
    while (i < n) {
      if (!skipNext(studyList[i])) {
        count++;
        if (count >= step) { pos = i; break; }
      }
      i++;
    }
    if (i >= n) {
      if (!S.loopMode) { alert("You've reached the end of the list."); return; }
      i = 0;
      while (i < currentIndex) {
        if (!skipNext(studyList[i])) {
          count++;
          if (count >= step) { pos = i; break; }
        }
        i++;
      }
      if (pos === currentIndex) { alert("No matching words found."); return; }
    }
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
  const n    = studyList.length;
  let   pos  = currentIndex;

  if (!S.stepAction) {
    // ── All mode (pre-count) ──
    let jumped = 0;
    let i = pos - 1;
    while (i >= 0 && jumped < step) {
      if (!hiddenWords.has(studyList[i])) jumped++;
      if (jumped < step) i--;
      else break;
    }
    // Scan backward from landing for passing word
    while (i >= 0) {
      if (!skipPrev(studyList[i])) { pos = i; break; }
      i--;
    }
    if (i < 0) {
      if (!S.loopMode) { alert("You've reached the beginning of the list."); return; }
      i = n - 1;
      while (i > currentIndex) {
        if (!skipPrev(studyList[i])) { pos = i; break; }
        i--;
      }
      if (i <= currentIndex) { alert("No matching words found."); return; }
    }

  } else {
    // ── Each mode (post-count) ──
    let count = 0;
    let i = pos - 1;
    while (i >= 0) {
      if (!skipPrev(studyList[i])) {
        count++;
        if (count >= step) { pos = i; break; }
      }
      i--;
    }
    if (i < 0) {
      if (!S.loopMode) { alert("You've reached the beginning of the list."); return; }
      i = n - 1;
      while (i > currentIndex) {
        if (!skipPrev(studyList[i])) {
          count++;
          if (count >= step) { pos = i; break; }
        }
        i--;
      }
      if (pos === currentIndex) { alert("No matching words found."); return; }
    }
  }

  currentIndex = pos;
  wordsSeen++;
  show();
}

// ══════════════════════════════════════
// WEIGHTED RANDOM (Suggest Marked)
// ══════════════════════════════════════
function getWeight(word) {
  let w = 1;
  // Persistent flags — Phase 9 placeholders
  // if (importantWords.has(word)) w *= 1.5;
  // if (favoriteWords.has(word))  w *= 1;
  // if (bookmarkWords.has(word))  w *= 1;
  // if (learnedWords.has(word))   w *= 1;

  // Session mark overrides (applied last — higher priority)
  const mark = sessionMarks[word];
  if (mark === 'like')    w *= 1/3;
  if (mark === 'dislike') w *= 3;
  return w;
}

function weightedRandomNext() {
  // Build eligible pool (hidden words excluded)
  const pool = studyList.filter(w => !hiddenWords.has(w) && w !== studyList[currentIndex]);
  if (!pool.length) { alert("No words available."); return; }

  const weights = pool.map(w => getWeight(w));
  const total   = weights.reduce((a, b) => a + b, 0);
  let   rand    = Math.random() * total;

  for (let i = 0; i < pool.length; i++) {
    rand -= weights[i];
    if (rand <= 0) {
      currentIndex = studyList.indexOf(pool[i]);
      wordsSeen++;
      show();
      return;
    }
  }
  // Fallback
  currentIndex = studyList.indexOf(pool[pool.length - 1]);
  wordsSeen++;
  show();
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
