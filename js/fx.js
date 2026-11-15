// 匯率：最新報價與近 3 個月走勢（鉅亨網，允許手機直接讀取）
// 走勢資料快取在手機裡，離線時顯示上次抓到的資料
import { esc, todayStr, shortDate } from './util.js';
import { CUR_LABEL } from './calc.js';

const KEY = 'koko:fxhist:v1';
const TTL = 6 * 3600 * 1000;      // 6 小時內不重抓
const DAYS = 92;                   // 約 3 個月
const SYM = { USD: 'FX:USDTWD:FOREX', JPY: 'FX:JPYTWD:FOREX' };

function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { } }
let cache = load();
const inflight = {};

async function getJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try { const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

/** 抓某幣別的近 3 個月每日收盤匯率（1 外幣 = 幾台幣），由舊到新 */
async function fetchHistory(cur) {
  const now = Math.floor(Date.now() / 1000), from = now - DAYS * 86400;
  const j = await getJSON(`https://ws.api.cnyes.com/ws/api/v1/charting/history?symbol=${SYM[cur]}&resolution=D&from=${now}&to=${from}`);
  const d = j && j.data;
  if (!d || !Array.isArray(d.t) || !d.t.length) throw new Error('沒有匯率資料');
  const pts = d.t.map((t, i) => ({ date: todayStr(new Date(t * 1000)), rate: Number(d.c[i]) })).filter(p => p.rate > 0);
  pts.sort((a, b) => a.date.localeCompare(b.date));
  return pts;
}
/** 最新報價（含今日漲跌） */
export async function fetchLatest(curs) {
  const syms = curs.filter(c => SYM[c]).map(c => SYM[c]);
  if (!syms.length) return {};
  const j = await getJSON(`https://ws.api.cnyes.com/ws/api/v1/quote/quotes/${syms.join(',')}?column=G`);
  const out = {};
  for (const q of (Array.isArray(j.data) ? j.data : [])) {
    const cur = Object.keys(SYM).find(c => SYM[c] === q['0']);
    const rate = Number(q['6']);
    if (cur && rate > 0) out[cur] = { rate, change: Number(q['11']) || 0, time: Number(q['200007']) || 0 };
  }
  return out;
}

/** 需要時重抓（有網路、超過 6 小時）。回傳 true 表示資料有更新 */
export async function ensureFx(curs, force = false) {
  curs = [...new Set(curs)].filter(c => SYM[c]);
  const need = curs.filter(c => force || !cache[c] || Date.now() - (cache[c].fetchedAt || 0) > TTL);
  if (!need.length) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const key = need.join(',');
  if (inflight[key]) return inflight[key];
  inflight[key] = (async () => {
    let changed = false;
    const latest = await fetchLatest(need).catch(() => ({}));
    await Promise.all(need.map(async c => {
      try {
        const pts = await fetchHistory(c);
        const L = latest[c];
        if (L) { const d = todayStr(new Date((L.time || Date.now() / 1000) * 1000)); const last = pts[pts.length - 1]; if (!last || last.date < d) pts.push({ date: d, rate: L.rate }); else if (last.date === d) last.rate = L.rate; }
        cache[c] = { pts, latest: L || null, fetchedAt: Date.now() };
        changed = true;
      } catch (e) { if (cache[c]) cache[c].error = e.message; else cache[c] = { pts: [], error: e.message, fetchedAt: 0 }; }
    }));
    save(cache);
    return changed;
  })().finally(() => { delete inflight[key]; });
  return inflight[key];
}

export function fxInfo(cur) {
  const c = cache[cur];
  if (!c || !c.pts || !c.pts.length) return null;
  const pts = c.pts;
  const first = pts[0], last = pts[pts.length - 1];
  const rates = pts.map(p => p.rate);
  return {
    cur, pts, last, first,
    min: Math.min(...rates), max: Math.max(...rates),
    change3m: last.rate - first.rate, change3mPct: (last.rate - first.rate) / first.rate,
    dayChange: c.latest ? c.latest.change : (pts.length > 1 ? last.rate - pts[pts.length - 2].rate : 0),
    fetchedAt: c.fetchedAt, error: c.error,
  };
}

export const fmtRate = (cur, r) => (Number(r) || 0).toFixed(cur === 'JPY' ? 4 : 3);
const sgn = (cur, v) => (v >= 0 ? '+' : '−') + fmtRate(cur, Math.abs(v));

/* ---------- 走勢圖 ---------- */
const W = 320, H = 118, L = 44, R = 6, T = 8, B = 20;
function xy(pts, i, min, max) {
  const x = L + (pts.length > 1 ? i * (W - L - R) / (pts.length - 1) : (W - L - R) / 2);
  const y = T + (max === min ? (H - T - B) / 2 : (max - pts[i].rate) / (max - min) * (H - T - B));
  return [x, y];
}
/** 一個幣別的匯率卡片內容（數字＋走勢圖）。compact：帳戶詳情用 */
export function fxCardHTML(cur, settingsRate) {
  const f = fxInfo(cur);
  const label = `${CUR_LABEL[cur] || cur}（${cur}）`;
  if (!f) {
    return `<div class="fx-block"><div class="fx-head"><b>${label}</b><span class="fx-rate num">${fmtRate(cur, settingsRate)}</span></div>
      <p class="note">${navigator.onLine === false ? '目前離線，連上網路後會顯示近 3 個月走勢。' : '正在載入近 3 個月走勢…'}</p></div>`;
  }
  const { pts, min, max } = f;
  const pad = (max - min) * 0.08 || max * 0.002;
  const lo = min - pad, hi = max + pad;
  const P = pts.map((_, i) => xy(pts, i, lo, hi));
  const line = 'M' + P.map(p => p.map(n => n.toFixed(1)).join(',')).join('L');
  const area = `${line}L${P[P.length - 1][0].toFixed(1)},${H - B}L${P[0][0].toFixed(1)},${H - B}Z`;
  const data = esc(JSON.stringify(pts.map(p => [p.date, p.rate])));
  const up = f.change3m >= 0;
  return `<div class="fx-block">
    <div class="fx-head"><b>${label}</b><span class="fx-rate num">${fmtRate(cur, f.last.rate)}</span></div>
    <div class="fx-sub"><span>1 ${cur} ＝ ${fmtRate(cur, f.last.rate)} 台幣・${shortDate(f.last.date)}</span>
      <span class="${f.dayChange >= 0 ? 'pos' : 'neg'}">今日 ${sgn(cur, f.dayChange)}</span></div>
    <div class="fxchart" data-cur="${cur}" data-pts="${data}" role="img" aria-label="${label}近 3 個月匯率，從 ${fmtRate(cur, f.first.rate)} 到 ${fmtRate(cur, f.last.rate)}">
      <svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
        <line class="grid" x1="${L}" x2="${W - R}" y1="${T}" y2="${T}"/><line class="grid" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>
        <text x="${L - 5}" y="${T + 4}" text-anchor="end">${fmtRate(cur, hi)}</text><text x="${L - 5}" y="${H - B + 1}" text-anchor="end">${fmtRate(cur, lo)}</text>
        <path class="fx-area" d="${area}"/><path class="fx-line" d="${line}"/>
        <text x="${L}" y="${H - 4}">${shortDate(f.first.date)}</text><text x="${W - R}" y="${H - 4}" text-anchor="end">${shortDate(f.last.date)}</text>
        <line class="fx-guide" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/><circle class="fx-dot" r="4" cx="${P[P.length - 1][0]}" cy="${P[P.length - 1][1]}"/>
      </svg></div>
    <div class="fx-read" aria-live="polite">近 3 個月 <span class="${up ? 'pos' : 'neg'}">${sgn(cur, f.change3m)}（${up ? '+' : '−'}${Math.abs(f.change3mPct * 100).toFixed(2)}%）</span>・最高 ${fmtRate(cur, max)}・最低 ${fmtRate(cur, min)}</div>
  </div>`;
}

/* 互動：點或滑動查看某天匯率（用事件委派，頁面和 sheet 都適用） */
function handle(e, el) {
  const pts = JSON.parse(el.dataset.pts || '[]');
  if (!pts.length) return;
  const cur = el.dataset.cur;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * W;
  const i = Math.max(0, Math.min(pts.length - 1, Math.round((x - L) / ((W - L - R) / Math.max(1, pts.length - 1)))));
  const rates = pts.map(p => p[1]);
  const min = Math.min(...rates), max = Math.max(...rates);
  const pad = (max - min) * 0.08 || max * 0.002;
  const [px, py] = xy(pts.map(p => ({ rate: p[1] })), i, min - pad, max + pad);
  const svg = el.querySelector('svg');
  const g = svg.querySelector('.fx-guide'), dot = svg.querySelector('.fx-dot');
  g.setAttribute('x1', px); g.setAttribute('x2', px); g.setAttribute('visibility', 'visible');
  dot.setAttribute('cx', px); dot.setAttribute('cy', py);
  const first = pts[0][1];
  const read = el.parentElement.querySelector('.fx-read');
  const d = pts[i][1] - first;
  read.innerHTML = `${shortDate(pts[i][0])}　<b class="num">${fmtRate(cur, pts[i][1])}</b>　較 3 個月前 <span class="${d >= 0 ? 'pos' : 'neg'}">${sgn(cur, d)}</span>`;
}
let dragging = null;
document.addEventListener('pointerdown', e => { const el = e.target.closest('.fxchart'); if (!el) return; dragging = el; try { el.setPointerCapture(e.pointerId); } catch { } handle(e, el); });
document.addEventListener('pointermove', e => { const el = dragging || (e.pointerType === 'mouse' && e.target.closest && e.target.closest('.fxchart')); if (el) handle(e, el); });
document.addEventListener('pointerup', () => { dragging = null; });
document.addEventListener('pointercancel', () => { dragging = null; });
