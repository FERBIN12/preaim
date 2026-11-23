// Second-monitor live leaderboard. Server mode: SSE. Local mode: localStorage + storage events.
import { createLeaderboard, LS_KEY } from './leaderboard.js';

const $ = (s) => document.querySelector(s);
/** @type {?(string|number)} */
let lastNewId = null;

function render(listEl, rows, highlightId) {
  listEl.replaceChildren();
  if (!rows.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'NO SCORES YET'; listEl.append(li); return; }
  rows.slice(0, 10).forEach((r, i) => {
    const li = document.createElement('li');
    if (String(r.id) === String(highlightId)) li.classList.add('new');
    for (const [cls, v] of [['rk', `${i + 1}`], ['in', r.initials], ['sc', r.score]]) {
      const s = document.createElement('span'); s.className = cls; s.textContent = v; li.append(s);
    }
    listEl.append(li);
  });
}

/**
 * @param {{day?: Array<Object>, all?: Array<Object>}} b
 * @param {?(string|number)} [highlightId]
 */
function show(b, highlightId = lastNewId) {
  render($('#day'), b.day || [], highlightId);
  render($('#all'), b.all || [], highlightId);
}

function setStatus(text, ok) { const el = $('#status'); el.textContent = text; el.className = ok ? 'ok' : 'warn'; }

function announce(entry) {
  if (!entry) return;
  lastNewId = entry.id;
  const el = $('#flash');
  el.textContent = `${entry.initials}  JUST SCORED  ${entry.score}`;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  setTimeout(() => { if (lastNewId === entry.id) { lastNewId = null; } }, 15000);
}

(async () => {
  const lb = await createLeaderboard({ fetchFn: window.fetch.bind(window), storage: window.localStorage, base: '.', forceLocal: location.protocol === 'file:' });
  show(await lb.top());
  if (lb.mode === 'server') {
    const es = new EventSource('./api/stream');
    es.addEventListener('hello', (e) => { setStatus('LIVE', true); show(JSON.parse(e.data)); });
    es.addEventListener('score', (e) => { const d = JSON.parse(e.data); announce(d.entry); show(d, d.entry.id); });
    es.onerror = () => setStatus('RECONNECTING...', false);
  } else {
    setStatus('LOCAL MODE (same browser)', false);
    let known = new Set((await lb.top()).all.map((r) => r.id));
    const refresh = async () => {
      const b = await lb.top();
      const fresh = b.all.find((r) => !known.has(r.id)) || b.day.find((r) => !known.has(r.id));
      if (fresh) announce(fresh);
      known = new Set([...b.all, ...b.day].map((r) => r.id));
      show(b);
    };
    window.addEventListener('storage', (e) => { if (e.key === LS_KEY) refresh(); });
    setInterval(refresh, 5000);
  }
  setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }, 1000);
})();
