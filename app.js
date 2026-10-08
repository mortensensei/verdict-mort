/* Verdict — yes/no decision practice. All data lives in localStorage on this device. */
(() => {
  'use strict';

  const VERSION = '1.0.0';
  const STORE_KEY = 'verdict.v1';
  const DAY = 86400000;
  const REVISIT_MIN_AGE = 7 * DAY;

  // ---------- Questions ----------
  function hash(str) { // FNV-1a 32-bit -> base36, stable ID from question text
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }
  const CATEGORIES = Object.keys(QUESTION_BANK);
  const QUESTIONS = [];
  const QBYID = {};
  for (const cat of CATEGORIES) {
    for (const text of QUESTION_BANK[cat]) {
      const q = { id: hash(text), text, cat };
      if (QBYID[q.id]) continue; // skip exact duplicates
      QUESTIONS.push(q); QBYID[q.id] = q;
    }
  }

  // ---------- Storage ----------
  const DEFAULTS = { mode: 'quick', timer: 5, revisit: 0.1, cats: {} };
  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { /* ignore */ }
    if (!d || typeof d !== 'object') d = {};
    d.settings = Object.assign({}, DEFAULTS, d.settings || {});
    if (!Array.isArray(d.answers)) d.answers = [];
    return d;
  }
  let db = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
    catch (e) { toast('Could not save — storage full or blocked'); }
  }
  const S = () => db.settings;
  const catOn = (c) => S().cats[c] !== false;

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const fmtSec = (ms) => (ms / 1000).toFixed(1) + 's';
  const word = (a) => (a === 'y' ? 'Yes' : a === 'n' ? 'No' : 'Timeout');
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  function median(nums) {
    if (!nums.length) return 0;
    const s = [...nums].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  let toastTimer;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function lastAnswers() { // id -> most recent real (non-timeout) answer
    const m = {};
    for (const a of db.answers) if (a.a !== 't') m[a.id] = a;
    return m;
  }

  // ---------- Navigation ----------
  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
    document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    if (name === 'stats') renderStats();
    if (name === 'settings') renderSettings();
    if (name === 'play' && $('summary').classList.contains('active')) { renderStart(); showScreen('start'); }
    window.scrollTo(0, 0);
  }
  function showScreen(name) {
    document.querySelectorAll('#tab-play .screen').forEach((s) => s.classList.toggle('active', s.id === name));
    document.body.classList.toggle('playing', name === 'play');
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ---------- Start screen ----------
  function renderStart() {
    document.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === S().mode)));
    const enabled = QUESTIONS.filter((q) => catOn(q.cat));
    const seen = new Set(db.answers.filter((a) => a.a !== 't').map((a) => a.id));
    const fresh = enabled.filter((q) => !seen.has(q.id)).length;
    const nCats = CATEGORIES.filter(catOn).length;
    $('start-meta').textContent = S().mode === 'quick'
      ? `${S().timer}s per question · ${nCats} of ${CATEGORIES.length} categories · ${fresh} unseen`
      : `No timer · ${nCats} of ${CATEGORIES.length} categories · ${fresh} unseen`;
  }
  document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => {
    S().mode = b.dataset.mode; save(); renderStart();
  }));
  $('btn-start').addEventListener('click', startSession);
  $('btn-again').addEventListener('click', () => { renderStart(); showScreen('start'); });

  // ---------- Session ----------
  let session = null; // { mode, seen:Set, entries:[], current, startTs, timerRAF, timerStart, locked, lastEntry }

  function startSession() {
    if (!QUESTIONS.some((q) => catOn(q.cat))) { toast('Turn on at least one category in Settings'); return; }
    session = { mode: S().mode, seen: new Set(), entries: [], current: null, locked: false };
    $('timer').classList.toggle('off', session.mode !== 'quick');
    $('t-to-wrap').classList.toggle('hidden', session.mode !== 'quick');
    updateTally();
    showScreen('play');
    nextQuestion();
  }

  function chooseQuestion() {
    const pool = QUESTIONS.filter((q) => catOn(q.cat));
    let avail = pool.filter((q) => !session.seen.has(q.id));
    if (!avail.length) { // went through everything this session — start the cycle over
      session.seen.clear();
      if (session.current) session.seen.add(session.current.id);
      avail = pool.filter((q) => !session.seen.has(q.id));
      if (!avail.length) avail = pool;
    }
    const last = lastAnswers();
    const now = Date.now();
    const rate = Number(S().revisit) || 0;
    const due = avail.filter((q) => last[q.id] && now - last[q.id].ts >= REVISIT_MIN_AGE);
    if (rate > 0 && due.length && Math.random() < rate) return pick(due);
    const fresh = avail.filter((q) => !last[q.id]);
    if (fresh.length) return pick(fresh);
    // Everything answered before: prefer what's been longest since last asked
    const sorted = [...avail].sort((a, b) => last[a.id].ts - last[b.id].ts);
    return pick(sorted.slice(0, Math.max(1, Math.min(25, Math.ceil(sorted.length / 4)))));
  }

  function nextQuestion() {
    const q = chooseQuestion();
    session.current = q;
    session.seen.add(q.id);
    session.locked = false;
    session.prev = lastAnswers()[q.id] || null;

    $('q-cat').textContent = q.cat;
    $('q-text').textContent = q.text;
    const rv = $('q-revisit');
    if (session.prev) {
      rv.textContent = `Revisit · on ${fmtDate(session.prev.ts)} you said ${word(session.prev.a)}`;
      rv.classList.remove('hidden');
    } else rv.classList.add('hidden');
    const fb = $('q-feedback'); fb.textContent = ''; fb.className = 'feedback';
    for (const id of ['btn-yes', 'btn-no']) { const b = $(id); b.disabled = false; b.classList.remove('picked'); }
    $('answer-row').classList.remove('hidden');
    $('note-row').classList.add('hidden');
    $('note').value = '';

    session.startTs = performance.now();
    if (session.mode === 'quick') startTimer();
  }

  // Timer
  function startTimer() {
    stopTimer();
    const total = S().timer * 1000;
    session.timerStart = performance.now();
    const fill = $('timer-fill');
    const tick = (now) => {
      const left = Math.max(0, 1 - (now - session.timerStart) / total);
      fill.style.transform = `scaleX(${left})`;
      fill.classList.toggle('low', left < 0.3);
      if (left <= 0) { session.timerRAF = null; answer('t'); return; }
      session.timerRAF = requestAnimationFrame(tick);
    };
    fill.style.transform = 'scaleX(1)'; fill.classList.remove('low');
    session.timerRAF = requestAnimationFrame(tick);
  }
  function stopTimer() {
    if (session && session.timerRAF) { cancelAnimationFrame(session.timerRAF); session.timerRAF = null; }
  }
  // If the app is backgrounded mid-question, restart that question's clock on return.
  document.addEventListener('visibilitychange', () => {
    if (!session || session.locked || !$('play').classList.contains('active')) return;
    if (document.hidden) stopTimer();
    else { session.startTs = performance.now(); if (session.mode === 'quick') startTimer(); }
  });

  function answer(a) {
    if (!session || session.locked) return;
    session.locked = true;
    stopTimer();
    const ms = Math.round(performance.now() - session.startTs);
    const q = session.current;
    const entry = { id: q.id, a, ms, m: session.mode === 'quick' ? 'q' : 'r', ts: Date.now() };
    const fb = $('q-feedback');

    if (a === 't') {
      fb.textContent = "Time's up";
    } else if (session.prev) {
      entry.rv = 1;
      if (session.prev.a !== a) {
        entry.ch = 1; entry.from = session.prev.a;
        fb.textContent = `Changed your mind — was ${word(session.prev.a)}`;
        fb.classList.add('changed');
      } else {
        fb.textContent = 'Same answer as last time';
        fb.classList.add('same');
      }
    }
    db.answers.push(entry); save();
    session.entries.push(entry);
    session.lastEntry = entry;
    updateTally();

    $('btn-yes').disabled = $('btn-no').disabled = true;
    if (a !== 't') $(a === 'y' ? 'btn-yes' : 'btn-no').classList.add('picked');

    if (session.mode === 'reflect' && a !== 't') {
      $('answer-row').classList.add('hidden');
      $('note-row').classList.remove('hidden');
    } else {
      const delay = a === 't' ? 900 : (fb.textContent ? 1300 : 450);
      session.advance = setTimeout(() => { if (session) nextQuestion(); }, delay);
    }
  }
  $('btn-yes').addEventListener('click', () => answer('y'));
  $('btn-no').addEventListener('click', () => answer('n'));
  $('btn-next').addEventListener('click', () => {
    const note = $('note').value.trim();
    if (note && session.lastEntry) { session.lastEntry.note = note; save(); }
    $('note').blur();
    nextQuestion();
  });

  function updateTally() {
    const e = session ? session.entries : [];
    $('t-count').textContent = e.filter((x) => x.a !== 't').length;
    $('t-yes').textContent = e.filter((x) => x.a === 'y').length;
    $('t-no').textContent = e.filter((x) => x.a === 'n').length;
    $('t-to').textContent = e.filter((x) => x.a === 't').length;
  }

  $('btn-end').addEventListener('click', endSession);
  function endSession() {
    if (!session) return;
    stopTimer(); clearTimeout(session.advance);
    // Save a note typed but not submitted
    const note = $('note').value.trim();
    if (note && session.lastEntry && !$('note-row').classList.contains('hidden')) { session.lastEntry.note = note; save(); }
    const e = session.entries;
    if (!e.length) { session = null; renderStart(); showScreen('start'); return; }
    const real = e.filter((x) => x.a !== 't');
    const yes = e.filter((x) => x.a === 'y').length;
    const to = e.length - real.length;
    const changed = e.filter((x) => x.ch);
    const revisits = e.filter((x) => x.rv).length;
    let html = '<div class="kpis">';
    html += kpi(real.length, 'answered');
    html += kpi(pct(yes, real.length) + '%', 'said yes');
    if (session.mode === 'quick') {
      html += kpi(real.length ? fmtSec(median(real.map((x) => x.ms))) : '—', 'median decision time');
      html += kpi(to, 'timeouts');
    } else {
      html += kpi(e.filter((x) => x.note).length, 'notes written');
      html += kpi(revisits, 'revisits');
    }
    html += '</div>';
    if (revisits) {
      html += `<div class="card"><h3>Revisits: ${changed.length} of ${revisits} changed</h3>`;
      html += changed.length ? changed.map(changedItem).join('') : '<p class="hint">You stuck with every earlier answer.</p>';
      html += '</div>';
    }
    $('summary-body').innerHTML = html;
    session = null;
    showScreen('summary');
  }
  const kpi = (v, l) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`;
  function changedItem(x) {
    const q = QBYID[x.id];
    return `<div class="list-item"><div class="q">${esc(q ? q.text : '(removed question)')}</div>
      <div class="d"><span class="pill ${x.from}">${word(x.from)}</span> → <span class="pill ${x.a}">${word(x.a)}</span> · ${fmtDate(x.ts)}</div></div>`;
  }

  // ---------- Stats ----------
  function renderStats() {
    const all = db.answers;
    const body = $('stats-body');
    if (!all.length) { body.innerHTML = '<div class="empty">No answers yet.<br>Play a round and your stats will show up here.</div>'; return; }
    const real = all.filter((x) => x.a !== 't');
    const quick = all.filter((x) => x.m === 'q');
    const quickReal = quick.filter((x) => x.a !== 't');
    const yes = real.filter((x) => x.a === 'y').length;
    const days = new Set(all.map((x) => new Date(x.ts).toDateString())).size;
    const changed = all.filter((x) => x.ch);
    const revisits = all.filter((x) => x.rv).length;

    let h = '<div class="kpis">';
    h += kpi(real.length, 'decisions made');
    h += kpi(pct(yes, real.length) + '%', 'yes overall');
    h += kpi(quickReal.length ? fmtSec(median(quickReal.map((x) => x.ms))) : '—', 'median quick-fire time');
    h += kpi(quick.length ? pct(quick.length - quickReal.length, quick.length) + '%' : '—', 'quick-fire timeouts');
    h += kpi(days, days === 1 ? 'day practiced' : 'days practiced');
    h += kpi(revisits ? `${changed.length}/${revisits}` : '—', 'revisits changed');
    h += '</div>';

    // By category
    h += '<div class="card"><h3>By category</h3><div class="legend"><span><i style="background:var(--yes)"></i>Yes</span><span><i style="background:var(--no)"></i>No</span></div>';
    const rows = CATEGORIES.map((c) => {
      const items = real.filter((x) => QBYID[x.id] && QBYID[x.id].cat === c);
      const y = items.filter((x) => x.a === 'y').length;
      const qms = items.filter((x) => x.m === 'q').map((x) => x.ms);
      return { c, n: items.length, y, med: qms.length ? median(qms) : null };
    }).filter((r) => r.n).sort((a, b) => b.n - a.n);
    for (const r of rows) {
      h += `<div class="bar-row"><span class="name">${esc(r.c)}</span>
        <span class="num">${r.n} · ${pct(r.y, r.n)}% yes${r.med != null ? ' · ' + fmtSec(r.med) : ''}</span>
        <div class="bar"><div class="y" style="width:${pct(r.y, r.n)}%"></div><div class="n" style="width:${100 - pct(r.y, r.n)}%"></div></div></div>`;
    }
    h += '<p class="hint">Times are median quick-fire decision times.</p></div>';

    // Changed minds
    if (changed.length) {
      h += '<div class="card"><h3>Changed your mind</h3>' + changed.slice(-10).reverse().map(changedItem).join('') + '</div>';
    }

    // Toughest calls: slowest quick-fire answers and timeouts, by question
    const tough = {};
    for (const x of quick) {
      const t = tough[x.id] || (tough[x.id] = { id: x.id, n: 0, to: 0, ms: [] });
      t.n++; if (x.a === 't') t.to++; else t.ms.push(x.ms);
    }
    const timerMs = S().timer * 1000;
    const toughList = Object.values(tough)
      .map((t) => ({ ...t, score: (t.to * timerMs + t.ms.reduce((a, b) => a + b, 0)) / t.n }))
      .sort((a, b) => b.score - a.score).slice(0, 5).filter((t) => QBYID[t.id]);
    if (toughList.length >= 3) {
      h += '<div class="card"><h3>Toughest calls</h3>' + toughList.map((t) => `<div class="list-item"><div class="q">${esc(QBYID[t.id].text)}</div>
        <div class="d">${t.ms.length ? 'avg ' + fmtSec(t.ms.reduce((a, b) => a + b, 0) / t.ms.length) : ''}${t.to ? (t.ms.length ? ' · ' : '') + t.to + ' timeout' + (t.to > 1 ? 's' : '') : ''}</div></div>`).join('') + '</div>';
    }

    // Recent
    h += '<div class="card"><h3>Recent answers</h3>' + all.slice(-25).reverse().map((x) => {
      const q = QBYID[x.id];
      return `<div class="list-item"><div class="q">${esc(q ? q.text : '(removed question)')}</div>
        <div class="d"><span class="pill ${x.a}">${word(x.a)}</span>${x.a !== 't' && x.m === 'q' ? ' · ' + fmtSec(x.ms) : ''} · ${fmtDate(x.ts)}${x.ch ? ' · changed' : ''}</div>
        ${x.note ? `<div class="note">“${esc(x.note)}”</div>` : ''}</div>`;
    }).join('') + '</div>';

    body.innerHTML = h;
  }

  // ---------- Settings ----------
  function renderSettings() {
    $('set-timer').value = S().timer;
    $('set-timer-val').textContent = S().timer + ' seconds';
    document.querySelectorAll('#set-revisit button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === Number(S().revisit)));
    const counts = {};
    for (const q of QUESTIONS) counts[q.cat] = (counts[q.cat] || 0) + 1;
    $('set-cats').innerHTML = CATEGORIES.map((c) =>
      `<button class="cat-toggle ${catOn(c) ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)} <span style="opacity:.6">${counts[c]}</span></button>`).join('');
    $('version').textContent = `Verdict ${VERSION} · ${QUESTIONS.length} questions · ${db.answers.length} answers stored`;
  }
  $('set-timer').addEventListener('input', (e) => {
    S().timer = Number(e.target.value); $('set-timer-val').textContent = S().timer + ' seconds'; save(); renderStart();
  });
  $('set-revisit').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S().revisit = Number(b.dataset.v); save(); renderSettings();
  });
  $('set-cats').addEventListener('click', (e) => {
    const b = e.target.closest('.cat-toggle'); if (!b) return;
    const c = b.dataset.cat; S().cats[c] = !catOn(c); save(); renderSettings(); renderStart();
  });
  $('cat-all').addEventListener('click', () => { S().cats = {}; save(); renderSettings(); renderStart(); });
  $('cat-none').addEventListener('click', () => { CATEGORIES.forEach((c) => (S().cats[c] = false)); save(); renderSettings(); renderStart(); });

  $('btn-export').addEventListener('click', async () => {
    const data = JSON.stringify({ app: 'verdict', version: VERSION, exported: new Date().toISOString(), ...db });
    const name = `verdict-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([data], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Verdict backup' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  $('btn-import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || !Array.isArray(d.answers)) throw new Error('bad file');
      const key = (x) => x.ts + ':' + x.id;
      const have = new Set(db.answers.map(key));
      const add = d.answers.filter((x) => x && x.id && x.ts && /^[ynt]$/.test(x.a) && !have.has(key(x)));
      const wasEmpty = db.answers.length === 0;
      db.answers = db.answers.concat(add).sort((a, b) => a.ts - b.ts);
      if (wasEmpty && d.settings) db.settings = Object.assign({}, DEFAULTS, d.settings); // restoring onto a fresh install
      save(); renderSettings(); renderStart();
      toast(`Imported ${add.length} answer${add.length === 1 ? '' : 's'}`);
    } catch (err) { toast("That file doesn't look like a Verdict backup"); }
  });
  $('btn-reset').addEventListener('click', () => {
    if (!db.answers.length) { toast('Nothing to erase'); return; }
    if (!confirm(`Erase all ${db.answers.length} answers? This can't be undone. Export a backup first if you might want them.`)) return;
    db.answers = []; save(); renderSettings(); renderStart(); toast('History erased');
  });

  // ---------- Boot ----------
  renderStart();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  // Exposed for testing in a browser console.
  window.__verdict = { db: () => db, QUESTIONS, save };
})();
