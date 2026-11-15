// 記帳：月份總覽、每日紀錄、分類篩選
import { icon } from '../icons.js';
import { esc, monthOf, todayStr, shiftMonth, dayLabel, money } from '../util.js';
import { monthSummary, sortTxs, CATEGORIES, acctById, fxRate, INVEST_KINDS } from '../calc.js';
import { V, rerender } from '../bus.js';
import { m, txRow, monthBar, emptyState, openSheet, sheetHead, closeSheet, toast } from '../ui.js';

const KINDS = [['all', '全部'], ['expense', '支出'], ['income', '收入'], ['transfer', '轉帳'], ['invest', '投資']];

function matches(t) {
  if (V.ledgerKind === 'invest' && !INVEST_KINDS.includes(t.kind)) return false;
  if (V.ledgerKind !== 'all' && V.ledgerKind !== 'invest' && t.kind !== V.ledgerKind) return false;
  if (V.ledgerCat && t.cat !== V.ledgerCat) return false;
  return true;
}

export function render(S) {
  const today = todayStr();
  const max = monthOf(today);
  const min = '2000-01';
  const sum = monthSummary(S, V.month);
  const txs = sortTxs(S.txs.filter(t => t.date.startsWith(V.month))).reverse();
  const shown = txs.filter(matches);
  const cats = [...CATEGORIES.expense, ...CATEGORIES.income];

  let h = `<div class="topbar"><h1>記帳</h1>
    <button class="icon-btn" data-act="pick-month" aria-label="選擇月份">${icon('calendar', 22)}</button></div>
  ${monthBar(V.month, min, max, 'ledger-month')}
  <div class="stat-cards">
    <div class="stat-card" style="--bar:var(--expense)"><span class="lbl">本月支出</span><b class="neg">${m(sum.exp)}</b></div>
    <div class="stat-card" style="--bar:var(--income)"><span class="lbl">本月收入</span><b class="pos">${m(sum.inc)}</b></div>
    <div class="stat-card" style="--bar:var(--primary)"><span class="lbl">結餘</span><b class="${sum.net < 0 ? 'neg' : ''}">${m(sum.net)}</b></div>
  </div>
  <div class="cat-strip" role="group" aria-label="依類別篩選">${cats.map(c => `<button class="cat-pick ${V.ledgerCat === c.name ? 'on' : ''}" data-act="ledger-cat" data-v="${esc(c.name)}" aria-pressed="${V.ledgerCat === c.name}" style="--h:${c.hue}"><span class="bubble" style="--h:${c.hue}">${icon(c.icon, 22)}</span>${esc(c.name)}</button>`).join('')}</div>
  <div class="tabs" role="tablist" aria-label="紀錄種類">${KINDS.map(([k, l]) => `<button role="tab" aria-selected="${V.ledgerKind === k}" class="${V.ledgerKind === k ? 'on' : ''}" data-act="ledger-kind" data-v="${k}">${l}</button>`).join('')}</div>`;

  if (V.ledgerCat) h += `<div class="banner" style="background:var(--primary-soft)">只顯示「${esc(V.ledgerCat)}」<button class="btn sm" data-act="ledger-cat" data-v="${esc(V.ledgerCat)}">清除篩選</button></div>`;

  if (!shown.length) {
    const msg = txs.length ? '這個條件下沒有紀錄' : '這個月還沒有紀錄<br>點下方「＋」記第一筆';
    return h + `<section class="card">${emptyState(msg, 'records')}</section>`;
  }
  const byDay = new Map();
  for (const t of shown) { if (!byDay.has(t.date)) byDay.set(t.date, []); byDay.get(t.date).push(t); }
  for (const [d, list] of byDay) {
    const exp = S.txs.filter(t => t.date === d && t.kind === 'expense').reduce((s, t) => s + t.amt * fxRate(S, (acctById(S, t.acct) || {}).cur), 0);
    h += `<section><div class="day-head"><span>${dayLabel(d)}${d === today ? '<span class="today-dot">今天</span>' : ''}</span><span class="num">${exp ? '支出 ' + m(exp) : ''}</span></div>
      <div class="card" style="padding:4px 14px;margin-top:6px"><div class="list">${list.map(t => txRow(S, t)).join('')}</div></div></section>`;
  }
  return h;
}

export const actions = {
  'ledger-month': el => { V.month = shiftMonth(V.month, Number(el.dataset.d)); rerender(); },
  'ledger-kind': el => { V.ledgerKind = el.dataset.v; rerender(); },
  'ledger-cat': el => { V.ledgerCat = V.ledgerCat === el.dataset.v ? '' : el.dataset.v; if (V.ledgerCat && !['all', 'expense', 'income'].includes(V.ledgerKind)) V.ledgerKind = 'all'; rerender(); },
  'pick-month': () => {
    let val = V.month;
    const s = openSheet({
      label: '選擇月份',
      render: () => `<div class="grabber"></div>${sheetHead('選擇月份')}
        <label class="field"><span class="lbl">月份</span><input class="inp" type="month" id="pm" value="${val}" max="${monthOf(todayStr())}"></label>
        <button class="btn pri full" data-act="ok">前往</button>
        <button class="btn full" data-act="this">回到本月</button>`,
      on: {
        ok: () => { const v = document.getElementById('pm').value; if (!/^\d{4}-\d{2}$/.test(v)) return toast('請選擇月份', true); if (v > monthOf(todayStr())) return toast('不能選未來的月份', true); V.month = v; closeSheet(s); rerender(); },
        this: () => { V.month = monthOf(todayStr()); closeSheet(s); rerender(); },
      },
    });
  },
};
