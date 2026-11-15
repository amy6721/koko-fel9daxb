// 財務計算核心（純函式，不碰畫面）。所有規則依《功能規格書》。
import { EPS, monthOf, shiftMonth, daysInMonth, parseDate, clampDate, addDays, todayStr } from './util.js';

/* ---------- 常數 ---------- */
export const ACCOUNT_TYPES = {
  bank: { label: '存款', icon: 'bank' },
  cash: { label: '現金', icon: 'cash' },
  fx: { label: '外幣', icon: 'currency' },
  broker: { label: '證券', icon: 'investment' },
  fund: { label: '基金', icon: 'fund' },
  insure: { label: '保險', icon: 'insurance' },
  deposit: { label: '定存', icon: 'deposit' },
  debt: { label: '負債', icon: 'credit-card' },
};
export const TYPE_ORDER = ['bank', 'cash', 'fx', 'broker', 'fund', 'insure', 'deposit', 'debt'];
export const CURRENCIES = ['TWD', 'USD', 'JPY'];
export const CUR_LABEL = { TWD: '台幣', USD: '美元', JPY: '日圓' };

export const CATEGORIES = {
  expense: [
    { name: '餐飲', icon: 'food', hue: 12 },
    { name: '交通', icon: 'transport', hue: 205 },
    { name: '日用', icon: 'daily', hue: 150 },
    { name: '居家', icon: 'home', hue: 28 },
    { name: '娛樂', icon: 'entertainment', hue: 330 },
    { name: '醫療', icon: 'medical', hue: 0 },
    { name: '服飾', icon: 'clothing', hue: 260 },
    { name: '學習', icon: 'learning', hue: 45 },
    { name: '其他', icon: 'other', hue: 25 },
  ],
  income: [
    { name: '薪資', icon: 'wallet', hue: 150 },
    { name: '獎金', icon: 'income', hue: 95 },
    { name: '其他收入', icon: 'other', hue: 190 },
  ],
};
export function catInfo(kind, name) {
  return (CATEGORIES[kind] || []).find(c => c.name === name) || { name: name || '其他', icon: 'other', hue: 25 };
}
export const HOLDING_KINDS = ['股票', 'ETF', '基金'];
export const INVEST_KINDS = ['buy', 'sell', 'div'];
export const KIND_LABEL = { expense: '支出', income: '收入', transfer: '轉帳', buy: '買進', sell: '賣出', div: '配息' };

/* ---------- 基本查詢 ---------- */
export const acctById = (S, id) => S.accounts.find(a => a.id === id);
export const holdById = (S, id) => S.holdings.find(h => h.id === id);
export const isCard = a => a && a.type === 'debt' && Number(a.billDay) > 0;
export const unitWord = h => (h && h.kind === '基金' ? '單位' : '股');
export function fxRate(S, cur) { return cur === 'USD' ? Number(S.settings.fxUSD) || 0 : cur === 'JPY' ? Number(S.settings.fxJPY) || 0 : 1; }
/** 日期早於「開始使用日」的紀錄 = 補登 */
export const isBackfill = (S, t) => !!S.settings.startDate && t.date < S.settings.startDate;
/** 依日期、建立時間排序（舊 → 新） */
export function sortTxs(txs) {
  return txs.slice().sort((a, b) => a.date.localeCompare(b.date) || String(a.created || '').localeCompare(String(b.created || '')) || String(a.id).localeCompare(String(b.id)));
}

/* ---------- 帳戶餘額（規格 1.4） ---------- */
/** 單筆紀錄對某帳戶現金的影響（原幣） */
export function txEffect(t, acctId) {
  const amt = Number(t.amt) || 0;
  let v = 0;
  switch (t.kind) {
    case 'expense': if (t.acct === acctId) v -= amt; break;
    case 'income': if (t.acct === acctId) v += amt; break;
    case 'transfer':
      if (t.acct === acctId) v -= amt;
      if (t.to === acctId) v += (t.amt2 !== '' && t.amt2 != null ? Number(t.amt2) : amt);
      break;
    case 'buy': if (t.acct === acctId) v -= amt; break;
    case 'sell': if (t.acct === acctId) v += amt; break;
    case 'div': if (t.acct === acctId) v += amt; break;
  }
  return v;
}
/** 帳戶現金餘額。before：只計算日期 < before 的紀錄（算歷史用） */
export function cashBalance(S, acctId, before = null) {
  const a = acctById(S, acctId);
  if (!a) return 0;
  let v = Number(a.open) || 0;
  for (const t of S.txs) {
    if (isBackfill(S, t)) continue;
    if (before && t.date >= before) continue;
    v += txEffect(t, acctId);
  }
  return v;
}

/* ---------- 投資部位（由交易重播推算，平均成本法） ---------- */
/**
 * 依交易重播出每檔標的的持有數、成本、配息、已實現損益。
 * opts.before：只算日期 < before 的交易
 * 回傳 { pos: {hid: {...}}, costOut: {txId: 該筆賣出的成本}, oversell: [txId...] }
 */
export function replay(S, opts = {}) {
  const pos = {};
  const costOut = {};
  const oversell = [];
  for (const h of S.holdings) pos[h.id] = { units: 0, cost: 0, bought: 0, div: 0, realized: 0, trades: [] };
  for (const t of sortTxs(opts.txs || S.txs)) {
    if (!INVEST_KINDS.includes(t.kind) || !t.hid) continue;
    // 補登紀錄視為「開始使用前就已持有」，任何時點都計入
    if (opts.before && t.date >= opts.before && !isBackfill(S, t)) continue;
    const p = pos[t.hid] || (pos[t.hid] = { units: 0, cost: 0, bought: 0, div: 0, realized: 0, trades: [] });
    const amt = Number(t.amt) || 0;
    const u = Number(t.units) || 0;
    if (t.kind === 'buy') { p.units += u; p.cost += amt; p.bought += amt; }
    else if (t.kind === 'sell') {
      if (u > p.units + EPS) oversell.push(t.id);
      const co = p.units > EPS ? p.cost * Math.min(1, u / p.units) : 0;
      costOut[t.id] = co;
      p.cost -= co;
      p.units -= u;
      if (Math.abs(p.units) < EPS) { p.units = 0; p.cost = 0; }
      p.realized += amt - co;
    } else if (t.kind === 'div') p.div += amt;
    p.trades.push(t);
  }
  return { pos, costOut, oversell };
}

/** 標的目前使用的價格（沒有價格時退回最後一筆買進價） */
export function currentPrice(S, h) {
  if (h.price !== '' && h.price != null && isFinite(Number(h.price)) && Number(h.price) > 0) return Number(h.price);
  const buys = sortTxs(S.txs.filter(t => t.hid === h.id && (t.kind === 'buy' || t.kind === 'sell') && Number(t.units) > 0));
  const last = buys[buys.length - 1];
  return last ? (Number(last.price) || Number(last.amt) / Number(last.units)) : 0;
}
/** 價格來源狀態：auto 自動 / manual 手動 / pending 待補代碼 / buy 尚未抓價（暫用買進價） */
export function priceStatus(h) {
  if (!h.code) return 'pending';
  if (h.priceSrc === 'manual') return 'manual';
  if (h.priceSrc === 'auto') return h.priceErr ? 'error' : 'auto';
  return 'buy';
}

export function holdingSummary(S, R = replay(S)) {
  return S.holdings.map(h => {
    const p = R.pos[h.id] || { units: 0, cost: 0, bought: 0, div: 0, realized: 0, trades: [] };
    const price = currentPrice(S, h);
    const value = p.units * price;
    const fx = fxRate(S, h.cur);
    const unreal = value - p.cost;
    const base = p.cost > EPS ? p.cost : p.bought;
    return {
      h, ...p, price, value, valueTWD: value * fx, unreal,
      unrealPct: p.cost > EPS ? unreal / p.cost : 0,
      totalRet: base > EPS ? (unreal + p.div + p.realized) / base : 0,
    };
  });
}

/* ---------- 帳戶價值與淨資產（規格 1.4、5.1） ---------- */
export function accountValueTWD(S, a, R = replay(S)) {
  let v = cashBalance(S, a.id) * fxRate(S, a.cur);
  for (const h of S.holdings) if (h.acct === a.id) v += (R.pos[h.id]?.units || 0) * currentPrice(S, h) * fxRate(S, h.cur);
  return v;
}
export function totals(S, R = replay(S)) {
  let assets = 0, debts = 0;
  for (const a of S.accounts) {
    const v = accountValueTWD(S, a, R);
    if (a.type === 'debt') debts += v; else assets += v;
  }
  return { assets, debts, nw: assets + debts };
}
/** 帳戶總覽是否顯示：使用中，或已封存但仍有餘額 */
export function visibleInOverview(S, a, R) {
  return !a.archived || Math.abs(accountValueTWD(S, a, R)) > 0.004;
}

/* ---------- 每月收支（規格 2.6、6.1） ---------- */
/** 轉帳、買賣投資不算收支；配息算收入；外幣換算台幣 */
export function monthSummary(S, month) {
  let inc = 0, exp = 0;
  const byCat = {};
  for (const t of S.txs) {
    if (!t.date.startsWith(month)) continue;
    const a = acctById(S, t.acct);
    const r = fxRate(S, a ? a.cur : 'TWD');
    const v = (Number(t.amt) || 0) * r;
    if (t.kind === 'income' || t.kind === 'div') inc += v;
    else if (t.kind === 'expense') { exp += v; byCat[t.cat || '其他'] = (byCat[t.cat || '其他'] || 0) + v; }
  }
  return { inc, exp, net: inc - exp, byCat };
}

/* ---------- 信用卡帳單（規格第 3 節） ---------- */
/** 與信用卡相關的單筆：charge（消費，增加欠款）或 credit（繳款／退款，減少欠款） */
function cardFlow(t, id) {
  const e = txEffect(t, id);
  if (e < 0) return { charge: -e, credit: 0 };
  if (e > 0) return { charge: 0, credit: e };
  return null;
}
/** 結帳日 → 該期帳單的結帳日期（>= date 的第一個結帳日） */
function closingFor(date, billDay) {
  const d = parseDate(date);
  const y = d.getFullYear(), m = d.getMonth() + 1;
  const thisClose = clampDate(y, m, billDay);
  if (date <= thisClose) return thisClose;
  const nm = shiftMonth(`${y}-${String(m).padStart(2, '0')}`, 1).split('-').map(Number);
  return clampDate(nm[0], nm[1], billDay);
}
/** 結帳日之後第一個繳款截止日 */
function dueFor(close, dueDay) {
  const d = parseDate(close);
  const y = d.getFullYear(), m = d.getMonth() + 1;
  const same = clampDate(y, m, dueDay);
  if (same > close) return same;
  const nm = shiftMonth(`${y}-${String(m).padStart(2, '0')}`, 1).split('-').map(Number);
  return clampDate(nm[0], nm[1], dueDay);
}
export function cardInfo(S, a, today = todayStr()) {
  const billDay = Number(a.billDay), dueDay = Number(a.dueDay);
  const bills = new Map(); // close → bill
  const getBill = close => {
    if (!bills.has(close)) bills.set(close, { close, start: null, due: dueFor(close, dueDay), amount: 0, paid: 0, items: [] });
    return bills.get(close);
  };
  const credits = [];
  const open = Number(a.open) || 0;
  if (open < -EPS) {
    const b = getBill('0000-00-00'); // 期初欠款
    b.opening = true; b.amount = -open; b.due = null;
  } else if (open > EPS) credits.push({ date: '0000-00-00', amt: open });

  for (const t of sortTxs(S.txs)) {
    if (isBackfill(S, t)) continue;
    const f = cardFlow(t, a.id);
    if (!f) continue;
    if (f.charge) { const b = getBill(closingFor(t.date, billDay)); b.amount += f.charge; b.items.push(t); }
    if (f.credit) credits.push({ date: t.date, amt: f.credit, t });
  }
  const list = [...bills.values()].sort((x, y) => x.close.localeCompare(y.close));
  for (const b of list) {
    if (!b.opening) {
      const d = parseDate(b.close);
      const prev = shiftMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, -1).split('-').map(Number);
      b.start = addDays(clampDate(prev[0], prev[1], billDay), 1);
    }
  }
  const closed = list.filter(b => b.opening || b.close < today);
  const currentClose = closingFor(today, billDay);
  const cur = bills.get(currentClose) || { close: currentClose, amount: 0, items: [], due: dueFor(currentClose, dueDay) };
  // 繳款依先後順序抵扣最舊的已出帳帳單，剩下的就是「未出帳・已預繳」
  let pool = credits.reduce((s, c) => s + c.amt, 0);
  for (const b of closed) {
    const use = Math.min(pool, b.amount);
    b.paid = use; pool -= use;
    b.status = b.amount - b.paid < 0.5 ? 'paid' : b.paid > EPS ? 'partial' : (b.due && b.due < today ? 'overdue' : 'unpaid');
  }
  const prepaid = pool; // 抵完已出帳後的剩餘繳款
  const curPrev = parseDate(currentClose);
  const pm = shiftMonth(`${curPrev.getFullYear()}-${String(curPrev.getMonth() + 1).padStart(2, '0')}`, -1).split('-').map(Number);
  const owed = -cashBalance(S, a.id);
  return {
    owed,
    current: { close: currentClose, start: addDays(clampDate(pm[0], pm[1], billDay), 1), due: dueFor(currentClose, dueDay), charges: cur.amount, items: cur.items, prepaid },
    bills: closed.slice().reverse(),
    unpaid: closed.filter(b => b.status !== 'paid'),
  };
}

/* ---------- 淨資產快照與歷史（規格 5.2） ---------- */
/**
 * 快照只存「當月 1 日的價格與匯率」；持有數與餘額由交易推算，
 * 這樣修改舊紀錄後，歷史淨資產也會一起正確更新。
 */
export function makeSnapshot(S, month) {
  const prices = {};
  for (const h of S.holdings) prices[h.id] = currentPrice(S, h);
  return { month, date: month + '-01', fxUSD: Number(S.settings.fxUSD) || 0, fxJPY: Number(S.settings.fxJPY) || 0, prices };
}
/** 本月還沒有快照（且已到開始使用月）就要建立 */
export function needSnapshot(S, today = todayStr()) {
  const m = monthOf(today);
  if (S.settings.startDate && m < monthOf(S.settings.startDate)) return null;
  return S.snapshots.some(s => s.month === m) ? null : m;
}
function snapSorted(S) { return S.snapshots.slice().sort((a, b) => a.month.localeCompare(b.month)); }
/** 某快照中某標的的價格；缺少時往後找較新的快照，再沒有就用目前價格 */
function priceAt(S, snaps, idx, h) {
  for (let i = idx; i < snaps.length; i++) {
    const p = snaps[i].prices && snaps[i].prices[h.id];
    if (p != null && p !== '' && isFinite(Number(p)) && Number(p) > 0) return Number(p);
  }
  return currentPrice(S, h);
}
function fxAt(S, snaps, idx, cur) {
  if (cur === 'TWD') return 1;
  const f = Number(snaps[idx] && snaps[idx]['fx' + cur]);
  return f > 0 ? f : fxRate(S, cur);
}
/** 指定快照時點（該月 1 日 00:00）的資產、負債、淨資產 */
function valuesAtSnapshot(S, snaps, idx) {
  const date = snaps[idx].date;
  const R = replay(S, { before: date });
  let assets = 0, debts = 0;
  for (const a of S.accounts) {
    let v = cashBalance(S, a.id, date) * fxAt(S, snaps, idx, a.cur);
    for (const h of S.holdings) if (h.acct === a.id) v += (R.pos[h.id]?.units || 0) * priceAt(S, snaps, idx, h) * fxAt(S, snaps, idx, h.cur);
    if (a.type === 'debt') debts += v; else assets += v;
  }
  return { assets, debts, nw: assets + debts };
}
/** 近 n 個月快照 + 今天即時 */
export function netWorthSeries(S, n = 12, today = todayStr()) {
  const snaps = snapSorted(S);
  const pts = snaps.map((s, i) => ({ month: s.month, date: s.date, live: false, ...valuesAtSnapshot(S, snaps, i) }));
  const live = { month: monthOf(today), date: today, live: true, ...totals(S) };
  const out = [...pts.slice(-n), live];
  return out.map((p, i) => {
    const prev = out[i - 1];
    return { ...p, first: i === 0, change: prev ? p.nw - prev.nw : null, changePct: prev && Math.abs(prev.nw) > EPS ? (p.nw - prev.nw) / Math.abs(prev.nw) : null };
  });
}

/* ---------- 投資統計（規格 6.2） ---------- */
export function holdingFilter(S, f) {
  if (!f || f === 'all') return S.holdings;
  if (HOLDING_KINDS.includes(f)) return S.holdings.filter(h => h.kind === f);
  return S.holdings.filter(h => h.id === f);
}
/**
 * 每月：期初、投入、贖回、配息、期末、損益、報酬率（考慮投入時間）、匯率影響
 * 月報酬 = 損益 ÷ (期初 + Σ投入×剩餘天數比例 − Σ贖回×剩餘天數比例)
 */
export function investMonths(S, filter = 'all', today = todayStr()) {
  const snaps = snapSorted(S);
  if (!snaps.length) return [];
  const hs = holdingFilter(S, filter);
  const ids = new Set(hs.map(h => h.id));
  const curMonth = monthOf(today);
  const first = snaps[0].month;
  const months = [];
  for (let m = first; m <= curMonth; m = shiftMonth(m, 1)) months.push(m);
  const snapIdx = m => snaps.findIndex(s => s.month === m);
  const nearestIdx = m => { let i = snaps.findIndex(s => s.month >= m); return i < 0 ? -1 : i; };

  function valueAt(m) { // 該月 1 日的部位價值（TWD）與美元部位資訊
    const date = m + '-01';
    const R = replay(S, { before: date });
    let i = snapIdx(m); if (i < 0) i = nearestIdx(m);
    let v = 0; const usd = {};
    for (const h of hs) {
      const u = R.pos[h.id]?.units || 0;
      const p = i >= 0 ? priceAt(S, snaps, i, h) : currentPrice(S, h);
      const fx = i >= 0 ? fxAt(S, snaps, i, h.cur) : fxRate(S, h.cur);
      v += u * p * fx;
      if (h.cur !== 'TWD') usd[h.id] = { u, p, fx };
    }
    return { v, usd };
  }
  function liveValue() {
    const R = replay(S);
    let v = 0; const usd = {};
    for (const h of hs) {
      const u = R.pos[h.id]?.units || 0, p = currentPrice(S, h), fx = fxRate(S, h.cur);
      v += u * p * fx;
      if (h.cur !== 'TWD') usd[h.id] = { u, p, fx };
    }
    return { v, usd };
  }
  return months.map(m => {
    const beg = valueAt(m);
    const end = m === curMonth ? liveValue() : valueAt(shiftMonth(m, 1));
    const [y, mo] = m.split('-').map(Number);
    const dim = daysInMonth(y, mo);
    let inn = 0, out = 0, div = 0, wi = 0;
    for (const t of S.txs) {
      if (!t.date.startsWith(m) || !ids.has(t.hid) || !INVEST_KINDS.includes(t.kind) || isBackfill(S, t)) continue;
      const h = holdById(S, t.hid);
      const r = h && h.cur !== 'TWD' ? (end.usd[h.id]?.fx || fxRate(S, h.cur)) : 1;
      const v = (Number(t.amt) || 0) * r;
      const w = 1 - (Number(t.date.slice(8)) - 1) / dim;
      if (t.kind === 'buy') { inn += v; wi += v * w; }
      else if (t.kind === 'sell') { out += v; wi -= v * w; }
      else div += v;
    }
    const pnl = end.v - beg.v - inn + out + div;
    const base = beg.v + wi;
    let fxEff = 0;
    for (const id in end.usd) { const e = end.usd[id], b = beg.usd[id]; if (b) fxEff += e.u * e.p * (e.fx - b.fx); }
    return { month: m, beg: beg.v, end: end.v, inn, out, div, pnl, ret: base > EPS ? pnl / base : 0, fx: fxEff, current: m === curMonth };
  });
}
/** 依粒度（m 月 / q 季 / y 年）彙整；季、年報酬率 = 各月連乘 */
export function investPeriods(S, gran = 'm', filter = 'all', today = todayStr()) {
  const ms = investMonths(S, filter, today);
  const groups = [];
  for (const x of ms) {
    const [y, mo] = x.month.split('-').map(Number);
    const key = gran === 'm' ? x.month : gran === 'q' ? `${y}Q${Math.ceil(mo / 3)}` : String(y);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, months: [] }; groups.push(g); }
    g.months.push(x);
  }
  return groups.map(g => {
    const m = g.months;
    const r = { key: g.key, beg: m[0].beg, end: m[m.length - 1].end, inn: 0, out: 0, div: 0, fx: 0, pnl: 0, ret: 1 };
    for (const x of m) { r.inn += x.inn; r.out += x.out; r.div += x.div; r.fx += x.fx; r.pnl += x.pnl; r.ret *= 1 + x.ret; }
    r.ret -= 1;
    const cur = m.some(x => x.current);
    const firstMo = Number(m[0].month.slice(5));
    const notes = [];
    let base;
    if (gran === 'm') { const [y, mo] = g.key.split('-'); base = `${y}/${Number(mo)}`; r.short = `${Number(mo)}月`; }
    else if (gran === 'q') {
      const [y, q] = g.key.split('Q');
      base = `${y} Q${q}`; r.short = `${y.slice(2)}Q${q}`;
      if (firstMo !== (Number(q) - 1) * 3 + 1) notes.push(`${firstMo} 月起`);
    } else { base = g.key; r.short = g.key; if (firstMo !== 1) notes.push(`${firstMo} 月起`); }
    if (cur) notes.push('至今');
    r.label = base + (notes.length ? `（${notes.join('・')}）` : '');
    return r;
  });
}

/* ---------- 驗證 ---------- */
/** 新增／修改後重播，檢查是否有賣超（賣出數量 > 當時持有） */
export function checkOversell(S, txsAfter) {
  return replay(S, { txs: txsAfter }).oversell;
}
/** 可作為投資扣款／入帳的帳戶：同幣別、非負債／保險／定存、使用中 */
export function investAccounts(S, cur, keepId) {
  return S.accounts.filter(a => (a.cur === cur) && !['debt', 'insure', 'deposit'].includes(a.type) && (!a.archived || a.id === keepId));
}
/** 預設扣款帳戶：股票、ETF → 證券交割戶；基金 → 銀行帳戶 */
export function defaultInvestAccount(S, kind, cur) {
  const ok = investAccounts(S, cur);
  const pref = kind === '基金' ? ['bank', 'fx', 'cash', 'broker', 'fund'] : ['broker', 'bank', 'fx', 'cash', 'fund'];
  for (const t of pref) { const a = ok.find(x => x.type === t); if (a) return a.id; }
  return ok[0]?.id || '';
}
/** 新標的歸屬帳戶：股票、ETF → 證券帳戶；基金 → 基金帳戶 */
export function holdingHomeAccount(S, kind, cur) {
  const type = kind === '基金' ? 'fund' : 'broker';
  const list = S.accounts.filter(a => a.type === type && !a.archived);
  return (list.find(a => a.cur === cur) || list[0])?.id || '';
}
/** 預設帳戶（封存時自動改選其他使用中的帳戶） */
export function defaultAccount(S, kind = 'expense') {
  const active = S.accounts.filter(a => !a.archived);
  const d = active.find(a => a.id === S.settings.defaultAcct);
  if (d) return d.id;
  const pref = kind === 'income' ? ['bank', 'cash'] : ['cash', 'bank', 'debt'];
  for (const t of pref) { const a = active.find(x => x.type === t); if (a) return a.id; }
  return active[0]?.id || '';
}
