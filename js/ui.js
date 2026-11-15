// 共用介面元件：提示、Sheet、圖表、列表列
import { icon } from './icons.js';
import { esc, money, signed, shortMoney, shortDate, monthLabel } from './util.js';
import { acctById, holdById, catInfo, KIND_LABEL, isBackfill, ACCOUNT_TYPES } from './calc.js';
import { store } from './store.js';

export const $ = (s, r = document) => r.querySelector(s);

/* ---------- 隱藏金額 ---------- */
export function m(n, cur) { return store.pref.hide ? '<span class="masked">＊＊＊＊</span>' : esc(money(n, cur)); }
export function ms(n, cur) { return store.pref.hide ? '<span class="masked">＊＊＊＊</span>' : esc(signed(n, cur)); }

/* ---------- 提示 ---------- */
let toastTimer;
export function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg; t.classList.toggle('bad', bad); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), bad ? 4200 : 2400);
}

/* ---------- Sheet 堆疊 ---------- */
const stack = [];
export function sheetTop() { return stack[stack.length - 1]; }
/**
 * 打開一個 sheet。render() 回傳內容 HTML；on 為 data-act 處理函式；full 為全螢幕
 */
export function openSheet({ render, on = {}, full = false, label = '', onInput, onClose }) {
  const el = document.createElement('div');
  el.className = 'sheet' + (full ? ' full' : '');
  el.innerHTML = `<div class="scrim" data-act="sheet-close"></div><div class="panel" role="dialog" aria-modal="true" aria-label="${esc(label)}"></div>`;
  document.body.appendChild(el);
  const s = { el, render, on, onInput, onClose, prevFocus: document.activeElement };
  stack.push(s);
  refreshSheet(s);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  const first = el.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 260);
  else el.querySelector('.panel').focus?.();
  return s;
}
export function refreshSheet(s = sheetTop()) {
  if (!s) return;
  const p = s.el.querySelector('.panel');
  const sc = p.scrollTop;
  const active = document.activeElement && p.contains(document.activeElement) ? document.activeElement.id : null;
  p.innerHTML = s.render();
  p.scrollTop = sc;
  if (active) { const a = p.querySelector('#' + CSS.escape(active)); if (a) { a.focus({ preventScroll: true }); if (a.setSelectionRange && a.type === 'text') { const l = a.value.length; try { a.setSelectionRange(l, l); } catch { } } } }
}
export function closeSheet(s = sheetTop()) {
  if (!s) return;
  const i = stack.indexOf(s); if (i >= 0) stack.splice(i, 1);
  s.el.classList.remove('open');
  setTimeout(() => s.el.remove(), 260);
  s.onClose && s.onClose();
  if (s.prevFocus && s.prevFocus.focus) try { s.prevFocus.focus({ preventScroll: true }); } catch { }
}
export function closeAllSheets() { while (stack.length) closeSheet(); }
export function sheetHead(title, { back = false, right = '' } = {}) {
  return `<div class="sheet-head">
    <button class="icon-btn" data-act="sheet-close" aria-label="${back ? '返回' : '關閉'}">${icon(back ? 'chevron-left' : 'close', 22)}</button>
    <h2>${esc(title)}</h2>${right || '<span class="spacer"></span>'}</div>`;
}

/* ---------- 確認（刪除二次確認） ---------- */
export function confirmSheet({ title, message, okText = '確定刪除', danger = true }) {
  return new Promise(resolve => {
    let done = false;
    const s = openSheet({
      label: title,
      render: () => `<div class="grabber"></div>${sheetHead(title)}<p style="margin:0;text-align:center">${message}</p>
        <button class="btn full ${danger ? 'danger armed' : 'pri'}" data-act="ok">${esc(okText)}</button>
        <button class="btn full" data-act="sheet-close">取消</button>`,
      on: { ok: () => { done = true; resolve(true); closeSheet(s); } },
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

/* ---------- 按鈕 loading ---------- */
export async function busy(btn, fn, text = '處理中…') {
  if (btn) { btn.disabled = true; btn.dataset.label = btn.innerHTML; btn.innerHTML = `<span class="spin"></span>${esc(text)}`; }
  try { return await fn(); }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = btn.dataset.label; } }
}

/* ---------- 月份切換 ---------- */
export function monthBar(month, min, max, act = 'month', sm = false) {
  return `<div class="monthbar ${sm ? 'sm' : ''}">
    <button class="icon-btn" data-act="${act}" data-d="-1" ${month <= min ? 'disabled' : ''} aria-label="上個月">${icon('chevron-left', 20)}</button>
    <span class="m">${monthLabel(month)}</span>
    <button class="icon-btn" data-act="${act}" data-d="1" ${month >= max ? 'disabled' : ''} aria-label="下個月">${icon('chevron-right', 20)}</button></div>`;
}

/* ---------- 紀錄列 ---------- */
export function bubble(iconName, hue, cls = '') {
  return `<span class="bubble ${cls}" style="--h:${hue}">${icon(iconName, cls.includes('sm') ? 18 : 20)}</span>`;
}
export function txRow(S, t, { showDate = false } = {}) {
  const a = acctById(S, t.acct) || { name: '（已刪除帳戶）', cur: 'TWD' };
  const cur = a.cur;
  let bub, title, sub, val;
  const back = isBackfill(S, t) ? '<span class="tag warn">補登</span>' : '';
  if (t.kind === 'expense' || t.kind === 'income') {
    const c = catInfo(t.kind, t.cat);
    bub = bubble(c.icon, c.hue);
    title = esc(t.note || c.name);
    sub = `${esc(c.name)}・${esc(a.name)}`;
    val = t.kind === 'expense' ? `<span>${ms(-t.amt, cur)}</span>` : `<span class="pos">${ms(t.amt, cur)}</span>`;
  } else if (t.kind === 'transfer') {
    const b = acctById(S, t.to) || { name: '（已刪除帳戶）', cur };
    bub = bubble('transfer', 200);
    title = esc(t.note || '轉帳');
    sub = `${esc(a.name)} → ${esc(b.name)}`;
    val = `<span class="mut">${m(t.amt, cur)}</span>${b.cur !== cur && t.amt2 ? `<small>→ ${m(t.amt2, b.cur)}</small>` : ''}`;
  } else {
    const h = holdById(S, t.hid);
    bub = bubble(t.kind === 'div' ? 'income' : 'investment', 40);
    title = `${esc(KIND_LABEL[t.kind])} ${esc(h ? h.name : '（已刪除標的）')}`;
    sub = `投資・${esc(a.name)}${t.note ? '・' + esc(t.note) : ''}`;
    val = t.kind === 'buy' ? `<span>${ms(-t.amt, cur)}</span><small>投資</small>`
      : t.kind === 'sell' ? `<span class="pos">${ms(t.amt, cur)}</span><small>贖回</small>`
        : `<span class="pos">${ms(t.amt, cur)}</span><small>配息</small>`;
  }
  return `<button class="row" data-act="edit-tx" data-id="${esc(t.id)}">${bub}
    <span class="main"><span class="t">${title}${back}</span><span class="s">${sub}</span></span>
    <span class="v">${val}${showDate ? `<small>${shortDate(t.date)}</small>` : ''}</span></button>`;
}

export function acctIcon(a) { return (ACCOUNT_TYPES[a.type] || {}).icon || 'wallet'; }

export function emptyState(text, iconName = 'note', action = '') {
  return `<div class="empty">${bubble(iconName, 8, 'prim')}<div>${text}</div>${action}</div>`;
}

/* ---------- 圖表 ---------- */
export const PALETTE = ['#E0868B', '#F2B07E', '#8FB4DE', '#B9A5DD', '#8CC7A6', '#E8C468', '#D7A3B8', '#B7AFA8'];

/** 環圈圖：items=[{label,value,color}] */
export function donut(items, centerHTML) {
  const total = items.reduce((s, x) => s + Math.max(0, x.value), 0);
  const R = 42, C = 2 * Math.PI * R;
  let off = 0, segs = '';
  if (total > 0) for (const it of items) {
    const len = Math.max(0, it.value) / total * C;
    if (len <= 0) continue;
    const gap = items.length > 1 ? Math.min(1.6, len * .3) : 0;
    segs += `<circle cx="50" cy="50" r="${R}" fill="none" stroke="${it.color}" stroke-width="13" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-off}" stroke-linecap="butt"/>`;
    off += len;
  } else segs = `<circle cx="50" cy="50" r="${R}" fill="none" stroke="var(--sunk)" stroke-width="13"/>`;
  return `<div class="donut" role="img" aria-label="${esc(items.map(i => `${i.label} ${total ? Math.round(i.value / total * 100) : 0}%`).join('、'))}"><svg viewBox="0 0 100 100" aria-hidden="true">${segs}</svg><div class="center">${centerHTML}</div></div>`;
}
export function legend(items) {
  const total = items.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  return `<div class="legend">${items.map(i => `<div class="li"><i style="background:${i.color}"></i><span>${esc(i.label)}</span><span class="num">${Math.round(i.value / total * 100)}%</span></div>`).join('')}</div>`;
}

/** 長條圖（收入／支出並列） */
export function pairBars(data, { labels }) {
  const W = 340, H = 170, L = 34, B = 22, T = 8;
  const top = Math.max(1, ...data.flatMap(d => [d.inc, d.exp]));
  const step = niceStep(top / 3);
  const scaleTop = Math.ceil(top / step) * step;
  const y = v => H - B - (v / scaleTop) * (H - B - T);
  const cw = (W - L - 4) / data.length, bw = Math.min(14, cw * .28);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="近 ${data.length} 個月收入與支出：${esc(data.map((d, i) => `${labels[i]} 收入 ${money(d.inc)} 支出 ${money(d.exp)}`).join('；'))}">`;
  for (let g = 0; g <= scaleTop + 1e-9; g += step) s += `<line class="grid" x1="${L}" x2="${W}" y1="${y(g)}" y2="${y(g)}"/><text x="${L - 6}" y="${y(g) + 3.5}" text-anchor="end">${shortMoney(g)}</text>`;
  data.forEach((d, i) => {
    const cx = L + i * cw + cw / 2;
    s += `<rect class="inc" x="${cx - bw - 1.5}" y="${y(d.inc)}" width="${bw}" height="${Math.max(0, H - B - y(d.inc))}" rx="3"/>`;
    s += `<rect class="exp" x="${cx + 1.5}" y="${y(d.exp)}" width="${bw}" height="${Math.max(0, H - B - y(d.exp))}" rx="3"/>`;
    s += `<text x="${cx}" y="${H - 5}" text-anchor="middle">${esc(labels[i])}</text>`;
  });
  return s + '</svg>';
}
/** 正負長條（各期損益），可點選 */
export function pnlBars(periods, selKey) {
  const W = 340, H = 160, L = 40, B = 22, T = 10;
  const vals = periods.map(p => p.pnl);
  const mx = Math.max(0, ...vals), mn = Math.min(0, ...vals), span = (mx - mn) || 1;
  const y = v => T + (mx - v) / span * (H - B - T);
  const cw = (W - L - 4) / Math.max(1, periods.length), bw = Math.min(26, cw * .6);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="各期投資損益">`;
  s += `<text x="${L - 6}" y="${y(mx) + 3.5}" text-anchor="end">${shortMoney(mx)}</text>`;
  if (mn < 0) s += `<text x="${L - 6}" y="${y(mn) + 3.5}" text-anchor="end">${shortMoney(mn)}</text>`;
  s += `<line class="zero" x1="${L}" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>`;
  const every = Math.ceil(periods.length / 8);
  periods.forEach((p, i) => {
    const x = L + i * cw + (cw - bw) / 2;
    const top = Math.min(y(p.pnl), y(0)), ht = Math.max(1.5, Math.abs(y(p.pnl) - y(0)));
    s += `<rect class="${p.pnl >= 0 ? 'p' : 'n'} ${p.key === selKey ? 'sel' : ''}" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${ht.toFixed(1)}" rx="3" data-act="inv-sel" data-v="${esc(p.key)}"><title>${esc(p.label)} ${esc(signed(p.pnl))}</title></rect>`;
    if ((periods.length - 1 - i) % every === 0) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle">${esc(p.short)}</text>`;
  });
  return s + '</svg>';
}
function niceStep(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** 淨資產走勢：回傳 svg 字串與座標函式 */
export const TW = 300, TH = 76, TP = 6;
export function trendXY(vals, i) {
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const x = vals.length > 1 ? TP + i * (TW - 2 * TP) / (vals.length - 1) : TW / 2;
  const y = TH - TP - ((vals[i] - mn) / ((mx - mn) || 1)) * (TH - 2 * TP - 4);
  return [x, mx === mn ? TH / 2 : y];
}
export function trendSVG(vals) {
  if (!vals.length) return '';
  const pts = vals.map((v, i) => trendXY(vals, i).map(n => n.toFixed(1)).join(','));
  const [lx] = trendXY(vals, vals.length - 1), [fx] = trendXY(vals, 0);
  const line = vals.length > 1 ? `M${pts.join('L')}` : `M${TP},${TH / 2}L${TW - TP},${TH / 2}`;
  return `<svg viewBox="0 0 ${TW} ${TH}" preserveAspectRatio="none" aria-hidden="true">
    ${vals.length > 1 ? `<path class="area" d="M${pts.join('L')}L${lx},${TH}L${fx},${TH}Z"/>` : ''}
    <path class="line" d="${line}" vector-effect="non-scaling-stroke"/></svg>`;
}
