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
  if (!store.remote) return refreshPricesLocal();
  const j = await call('refreshPrices');
  store.S = normalize({ ...store.S, ...j.data });
  lsSet(KEY_DATA, store.S);
  return j.report || [];
}

/** 本機模式：手機直接抓股票、ETF 價格與美元匯率（基金需手動） */
async function refreshPricesLocal() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('目前沒有網路，連上網路後再更新價格');
  const { fetchPrices } = await import('./prices.js');
  const r = await fetchPrices(store.S.holdings);
  const anyOk = Object.keys(r.prices).length > 0 || r.fx;
  const wanted = store.S.holdings.filter(h => h.code && h.kind !== '基金').length;
  if (!anyOk && wanted) throw new Error('抓不到任何價格，可能是網路或資料來源暫時有問題，請稍後再試');
  const now = new Date();
  const report = [];
  await commit(d => {
    for (const h of d.holdings) {
      if (r.prices[h.id]) {
        const p = r.prices[h.id];
        h.price = p.price; h.priceDate = p.date; h.priceSrc = 'auto'; h.priceErr = '';
        report.push({ name: h.name, ok: true, price: p.price, src: p.src });
      } else if (r.errors[h.id]) {
        h.priceErr = r.errors[h.id]; if (h.priceSrc !== 'manual') h.priceSrc = 'auto';
        report.push({ name: h.name, ok: false, error: h.priceErr });
      }
    }
    if (r.fx) d.settings.fxUSD = Math.round(r.fx * 10000) / 10000;
    d.settings.priceUpdated = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    d.settings.priceUpdatedAt = now.toISOString();
  }, ['holdings', 'settings']);
  if (!r.fx) report.push({ name: '美元匯率', ok: false, error: '抓不到匯率' });
  return Object.assign(report, { skippedFunds: r.skipped.length });
}
/** 打開 App 時自動更新（本機模式、有網路、距上次超過 4 小時） */
export async function autoRefreshPrices() {
  if (store.remote || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
  if (!store.S.holdings.some(h => h.code && h.kind !== '基金') && !store.S.holdings.some(h => h.cur === 'USD')) return null;
  const last = Date.parse(store.S.settings.priceUpdatedAt || '') || 0;
  if (Date.now() - last < 4 * 3600 * 1000) return null;
  try { return await refreshPricesLocal(); } catch { return null; }
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
  await ensureSnapshot();
}
export function exportJSON() { return JSON.stringify(store.S, null, 2); }

/* ---------- 貼上匯入 ---------- */
const TYPES = ['bank', 'cash', 'fx', 'broker', 'fund', 'insure', 'deposit', 'debt'];
const KINDS = ['expense', 'income', 'transfer', 'buy', 'sell', 'div'];
/**
 * 解析貼上的文字（備份 JSON）。容忍備忘錄造成的彎引號、不換行空白，
 * 以及開頭結尾多複製到的文字。回傳正規化後的資料與問題清單。
 */
export function parseImport(text) {
  let s = String(text || '')
    .replace(/[“”„‟″]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[   ​﻿]/g, ' ');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('找不到資料，請確認整段文字都有複製到（開頭是「{」、結尾是「}」）');
  let raw;
  try { raw = JSON.parse(s.slice(a, b + 1)); }
  catch { throw new Error('資料格式不完整，可能沒有複製到全部文字，請重新複製整段再貼上'); }
  if (!raw || typeof raw !== 'object') throw new Error('資料格式不正確');
  const d = normalize(raw);
  const problems = [];
  const ids = new Set(d.accounts.map(x => x.id));
  d.accounts.forEach((x, i) => {
    if (!x.id || !x.name) problems.push(`第 ${i + 1} 個帳戶缺少 id 或名稱`);
    if (!TYPES.includes(x.type)) problems.push(`帳戶「${x.name}」類型不正確（${x.type}）`);
    if (!['TWD', 'USD'].includes(x.cur)) problems.push(`帳戶「${x.name}」幣別不正確（${x.cur}）`);
  });
  const hids = new Set(d.holdings.map(h => h.id));
  d.holdings.forEach(h => { if (!ids.has(h.acct) && !store.S.accounts.some(a => a.id === h.acct)) problems.push(`標的「${h.name}」的帳戶不存在`); });
  const acctOk = id => ids.has(id) || store.S.accounts.some(a => a.id === id);
  d.txs.forEach((t, i) => {
    const n = `第 ${i + 1} 筆紀錄（${t.date || '無日期'} ${t.note || ''}）`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) problems.push(`${n}日期格式不正確`);
    if (!KINDS.includes(t.kind)) problems.push(`${n}種類不正確（${t.kind}）`);
    if (!(t.amt > 0)) problems.push(`${n}金額必須大於 0`);
    if (!acctOk(t.acct)) problems.push(`${n}帳戶不存在`);
    if (t.kind === 'transfer' && !acctOk(t.to)) problems.push(`${n}轉入帳戶不存在`);
    if (['buy', 'sell', 'div'].includes(t.kind) && !hids.has(t.hid) && !store.S.holdings.some(h => h.id === t.hid)) problems.push(`${n}標的不存在`);
    if (!t.id) t.id = 'imp' + i + Math.random().toString(36).slice(2, 7);
    if (!t.created) t.created = `${t.date}T00:00:${String(i % 60).padStart(2, '0')}`;
  });
  return { data: d, problems, hasSettings: !!(raw.settings && Object.keys(raw.settings).length) };
}
/** 把匯入資料「加入」現有資料（相同 id 的略過），回傳各類新增數量 */
export async function mergeImport(data) {
  const added = {};
  await commit(d => {
    for (const t of TABLES) {
      const key = t === 'snapshots' ? 'month' : 'id';
      const have = new Set(d[t].map(x => x[key]));
      const fresh = data[t].filter(x => !have.has(x[key]));
      d[t].push(...fresh);
      added[t] = fresh.length;
    }
    if (data.settings.startDate && (!d.txs.length || data.settings.startDate < d.settings.startDate)) d.settings.startDate = data.settings.startDate;
  }, [...TABLES, 'settings']);
  await ensureSnapshot();
  return added;
}
