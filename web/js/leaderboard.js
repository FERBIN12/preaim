// Leaderboard client: talks to the booth server when present, otherwise falls back to localStorage.
export const LS_KEY = 'preaim.scores.v1';
export const MAX_SCORE = 100000;
const pad = (n) => String(n).padStart(2, '0');

export const isValidInitials = (s) => typeof s === 'string' && /^[A-Z]{3}$/.test(s);
export const localDay = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export function isValidEntry(e) {
  return !!e && isValidInitials(e.initials) && Number.isInteger(e.score) && e.score >= 0 && e.score <= MAX_SCORE;
}

export function topEntries(entries, period, nowMs, limit = 10) {
  const day = localDay(nowMs);
  return entries
    .filter((e) => isValidEntry(e) && (period !== 'day' || localDay(e.ts) === day))
    .sort((a, b) => b.score - a.score || a.ts - b.ts)
    .slice(0, limit);
}

export function createLocalStore(storage, key = LS_KEY, cap = 500) {
  const load = () => {
    try { const v = JSON.parse(storage?.getItem(key) || '[]'); return Array.isArray(v) ? v.filter(isValidEntry) : []; }
    catch { return []; }
  };
  return {
    load,
    add(entry, nowMs = Date.now()) {
      const all = load();
      const row = { ...entry, ts: nowMs, id: `L${nowMs}${Math.floor(Math.random() * 1e6)}` };
      all.push(row);
      all.sort((a, b) => b.score - a.score || a.ts - b.ts);
      try { storage?.setItem(key, JSON.stringify(all.slice(0, cap))); } catch { /* storage full or blocked */ }
      return row;
    },
    top(nowMs = Date.now()) { const all = load(); return { day: topEntries(all, 'day', nowMs), all: topEntries(all, 'all', nowMs) }; },
  };
}

export function createMemoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** True only if a real PreAim server answers /api/health (not a static host 404). */
export async function detectServer(fetchFn, base = '.', timeoutMs = 1500) {
  if (typeof fetchFn !== 'function') return false;
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ac?.abort(), timeoutMs);
  try {
    const r = await fetchFn(`${base}/api/health`, { signal: ac?.signal, cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    return !!j && j.ok === true && j.service === 'preaim';
  } catch { return false; }
  finally { clearTimeout(timer); }
}

/**
 * @typedef {{day: Array<Object>, all: Array<Object>}} Board
 * @typedef {{mode: string, submit: function(Object): Promise<Object>, top: function(): Promise<Board>}} Leaderboard
 */

/** @returns {Promise<Leaderboard>} */
export async function createLeaderboard({ fetchFn, storage, base = '.', forceLocal = false } = {}) {
  const local = createLocalStore(storage);
  const server = !forceLocal && (await detectServer(fetchFn, base));
  const lb = {
    mode: server ? 'server' : 'local',
    async submit(entry) {
      if (lb.mode === 'server') {
        try {
          const r = await fetchFn(`${base}/api/score`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
          const j = await r.json();
          if (r.ok) return j.entry;
        } catch { /* fall through to local */ }
      }
      return local.add(entry);
    },
    async top() {
      if (lb.mode === 'server') {
        try {
          const [d, a] = await Promise.all(['day', 'all'].map((p) => fetchFn(`${base}/api/top?period=${p}`, { cache: 'no-store' }).then((r) => r.json())));
          return { day: d.entries, all: a.entries };
        } catch { /* fall through */ }
      }
      return local.top();
    },
  };
  return lb;
}
