// 資料層：Google 試算表（Apps Script）或本機模式
// 規則：連線模式下，伺服器回報成功才更新畫面；失敗就提示，不讓使用者誤以為已存檔。
import { clone, todayStr } from './util.js';
import { needSnapshot, makeSnapshot } from './calc.js';

const KEY_DATA = 'koko:data:v1';
const KEY_CONN = 'koko:conn:v1';
const KEY_PREF = 'koko:pref:v1';

export const TABLES = ['accounts', 'txs', 'holdings', 'snapshots'];

export function emptyState() {
  return {
    settings: { appName: '摳摳', iconStyle: 0, startDate: todayStr(), defaultAcct: '', fxUSD: 30.5, priceUpdated: '' },
    accounts: [], txs: [], holdings: [], snapshots: [],
  };
}

function lsGet(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }

export const store = {
  S: emptyState(),
  conn: lsGet(KEY_CONN, { url: '', key: '' }),
  pref: lsGet(KEY_PREF, { theme: 'auto', hide: false }),
  online: null,      // null 未知 / true 已連線 / false 失敗
  loading: false,
  lastError: '',
  get remote() { return !!(this.conn.url && this.conn.key); },
};

function normalize(d) {
  const base = emptyState();
  const S = { ...base, ...d, settings: { ...base.settings, ...(d && d.settings) } };
  for (const t of TABLES) S[t] = Array.isArray(S[t]) ? S[t] : [];
  const n = v => (v === '' || v == null ? v : Number(v));
  S.accounts = S.accounts.map(a => ({ ...a, open: Number(a.open) || 0, billDay: n(a.billDay) || '', dueDay: n(a.dueDay) || '', archived: a.archived === true || a.archived === 'TRUE' || a.archived === 'true' }));
  S.txs = S.txs.map(t => ({ ...t, date: String(t.date).slice(0, 10), amt: Number(t.amt) || 0, amt2: n(t.amt2), units: n(t.units), price: n(t.price), fee: n(t.fee) }));
  S.holdings = S.holdings.map(h => ({ ...h, price: n(h.price), priceErr: h.priceErr || '' }));
  S.snapshots = S.snapshots.map(s => ({ ...s, month: String(s.month).slice(0, 7), date: String(s.date || s.month + '-01').slice(0, 10), fxUSD: Number(s.fxUSD) || 0, prices: typeof s.prices === 'string' ? safeJSON(s.prices) : (s.prices || {}) }));
  S.settings.fxUSD = Number(S.settings.fxUSD) || 30.5;
  S.settings.iconStyle = Number(S.settings.iconStyle) || 0;
  return S;
}
function safeJSON(s) { try { return JSON.parse(s); } catch { return {}; } }

/* ---------- 與 Apps Script 溝通 ---------- */
async function call(action, payload = {}, conn = store.conn) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    // text/plain 可避免瀏覽器的 CORS 預檢，Apps Script 才收得到
    const res = await fetch(conn.url, {
      method: 'POST', redirect: 'follow', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, key: conn.key, ...payload }),
    });
    if (!res.ok) throw new Error(`伺服器回應 ${res.status}`);
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || '伺服器回報錯誤');
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('連線逾時，請檢查網路');
    if (e instanceof TypeError) throw new Error('無法連線到試算表，請檢查網路或連線設定');
    throw e;
  } finally { clearTimeout(timer); }
}

/* ---------- 載入 ---------- */
export async function init() {
  store.S = normalize(lsGet(KEY_DATA, null) || emptyState());
  if (store.remote) await reload();
  else await ensureSnapshot();
}
export async function reload() {
  if (!store.remote) return;
  store.loading = true;
  try {
    const j = await call('load');
    store.S = normalize(j.data);
    lsSet(KEY_DATA, store.S);
    store.online = true; store.lastError = '';
    await ensureSnapshot();
  } catch (e) {
    store.online = false; store.lastError = e.message;
    throw e;
  } finally { store.loading = false; }
}
async function ensureSnapshot() {
  const m = needSnapshot(store.S, todayStr());
  if (!m) return;
  try { await commit(d => { d.snapshots.push(makeSnapshot(d, m)); }, ['snapshots']); } catch { /* 下次開啟再試 */ }
}

/**
 * 修改資料：mutate 在副本上執行；連線模式要等伺服器確認才生效。
 * tables：這次有變動的資料表（只送這些），settings 變動傳 'settings'
 */
export async function commit(mutate, tables) {
  const draft = clone(store.S);
  const ret = mutate(draft);
  if (store.remote) {
    const payload = { tables: {} };
    for (const t of tables) if (t === 'settings') payload.settings = draft.settings; else payload.tables[t] = draft[t];
    await call('save', payload);
    store.online = true;
  }
  store.S = draft;
  lsSet(KEY_DATA, store.S);
  return ret;
}

/* ---------- 抓價 ---------- */
export async function refreshPrices() {
  if (!store.remote) throw new Error('本機模式無法自動抓價。請到設定連線 Google 試算表，或在標的裡手動填寫價格。');
  const j = await call('refreshPrices');
  store.S = normalize({ ...store.S, ...j.data });
  lsSet(KEY_DATA, store.S);
  return j.report || [];
}

/* ---------- 連線設定 ---------- */
export async function testConnection(conn) {
  const j = await call('ping', {}, conn);
  return j;
}
export async function connect(conn, { upload = false } = {}) {
  await testConnection(conn);
  if (upload) {
    const S = store.S;
    await call('save', { tables: Object.fromEntries(TABLES.map(t => [t, S[t]])), settings: S.settings }, conn);
  }
  store.conn = conn; lsSet(KEY_CONN, conn);
  if (!upload) await reload(); else store.online = true;
}
export function disconnect() {
  store.conn = { url: '', key: '' }; lsSet(KEY_CONN, store.conn); store.online = null;
}
export async function remoteHasData(conn) {
  const j = await call('load', {}, conn);
  const d = j.data || {};
  return (d.accounts || []).length + (d.txs || []).length > 0;
}

/* ---------- 偏好（只存在這支手機） ---------- */
export function setPref(p) { Object.assign(store.pref, p); lsSet(KEY_PREF, store.pref); }

/* ---------- 本機資料工具 ---------- */
export async function replaceAll(data) {
  const S = normalize(data);
  await commit(d => { for (const t of TABLES) d[t] = S[t]; d.settings = S.settings; }, [...TABLES, 'settings']);
}
export function exportJSON() { return JSON.stringify(store.S, null, 2); }
