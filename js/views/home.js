// 首頁：淨資產、收支摘要、近期紀錄
import { icon } from '../icons.js';
import { esc, money, signed, pct, monthOf, todayStr, shiftMonth, shortDate, fullDate } from '../util.js';
import { totals, replay, monthSummary, netWorthSeries, sortTxs, isCard, cardInfo, priceStatus } from '../calc.js';
import { store, setPref } from '../store.js';
import { V, rerender } from '../bus.js';
import { manualItems } from '../remind.js';
import { m, txRow, monthBar, trendSVG, trendXY, TW, TH, emptyState, openSheet, sheetHead, $, bubble } from '../ui.js';

export function reminders(S) {
  const today = todayStr();
  const out = [];
  for (const a of S.accounts) {
    if (!isCard(a) || a.archived) continue;
    const info = cardInfo(S, a, today);
    for (const b of info.unpaid) {
      const left = b.amount - b.paid;
      if (b.opening) continue;
      const overdue = b.due && b.due < today;
      const days = b.due ? Math.round((new Date(b.due) - new Date(today)) / 864e5) : null;
      if (overdue || (days !== null && days <= 7)) out.push({ icon: 'credit-card', hue: 0, title: `${a.name} 帳單${overdue ? '已逾期' : `還有 ${days} 天到期`}`, sub: `應繳 ${money(left)}・截止 ${b.due ? fullDate(b.due) : '—'}`, bad: overdue, acct: a.id });
    }
  }
  const man = manualItems(S);
  if (man.length) out.push({ icon: 'refresh', hue: 40, title: `${man.length} 檔需要手動更新價格`, sub: man.map(x => x.h.name).join('、'), act: 'open-manual' });
  return out;
}

export function render(S) {
  const R = replay(S);
  const T = totals(S, R);
  const series = netWorthSeries(S, 12);
  const live = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const hasLogo = true;
  const rem = reminders(S);
  const today = todayStr();
  const sum = monthSummary(S, V.homeMonth);
  const recent = sortTxs(S.txs).reverse().slice(0, 5);

  let h = `<div class="home-head">
    <div class="topbar">
      <div class="brand"><img class="logo" src="assets/brand/logo.png" width="82" height="28" alt="${esc(S.settings.appName || '摳摳')}"><span class="brand-text ${hasLogo && (S.settings.appName || '摳摳') === '摳摳' ? 'has-logo' : ''}">${esc(S.settings.appName || '摳摳')}</span></div>
      <button class="icon-btn" data-act="reminders" aria-label="提醒${rem.length ? `（${rem.length} 則）` : ''}">${icon('bell', 22)}${rem.length ? '<span class="dot"></span>' : ''}</button>
      <a class="icon-btn" href="#settings" aria-label="設定">${icon('settings', 22)}</a>
    </div>
    <div class="mascot-wrap"><img src="assets/brand/mascot-peek.png" width="105" height="57" alt=""></div>
  </div>`;

  if (!S.accounts.length) {
    return h + `<section class="card nw-card">${emptyState('歡迎使用！先建立你的第一個帳戶<br>（例如銀行存款、錢包、信用卡），<br>之後每筆記帳都會自動更新餘額。', 'wallet',
      `<a class="btn pri" href="#settings" data-act="go-accounts">新增帳戶</a><button class="btn sm" data-act="load-demo">先看看示範資料</button>`)}</section>`;
  }

  const ch = prev ? live.nw - prev.nw : null;
  const chPct = prev && Math.abs(prev.nw) > 1e-6 ? ch / Math.abs(prev.nw) : null;
  h += `<section class="card nw-card" id="nwCard">
    <div class="nw-top"><span class="lbl">我的淨資產</span>
      <button class="icon-btn" data-act="toggle-hide" aria-label="${store.pref.hide ? '顯示金額' : '隱藏金額'}" aria-pressed="${store.pref.hide}">${icon('eye', 18)}</button></div>
    <div class="nw-big" id="nwBig">${m(T.nw)}</div>
    <div class="nw-change ${ch === null ? 'mut' : ch >= 0 ? 'pos' : 'neg'}" id="nwChange">${ch === null ? '這是第一筆紀錄，下個月起可比較變化' : `<span aria-hidden="true">${ch >= 0 ? '↗' : '↘'}</span>較上月底 ${store.pref.hide ? '＊＊＊＊' : esc(signed(ch))}${chPct !== null ? `（${pct(chPct)}）` : ''}`}</div>
    <div class="trend" id="trend" role="img" aria-label="近 ${series.length} 個月淨資產走勢，點或滑動查看各月數字">${trendSVG(series.map(p => p.nw))}<span class="guide" id="trGuide" hidden></span><span class="pt" id="trPt"></span></div>
    <div class="trend-note" id="trNote"></div>
    <div class="nw-split">
      <div><span class="lbl">資產總額</span><b id="nwAs">${m(T.assets)}</b></div>
      <div><span class="lbl">負債總額</span><b class="neg" id="nwDe">${m(Math.abs(T.debts))}</b></div>
    </div>
  </section>`;

  h += `<section class="card">
    <div class="sec-head"><h2>${Number(V.homeMonth.slice(5))} 月收支</h2>
      <button class="icon-btn" data-act="home-month" data-d="-1" aria-label="上個月">${icon('chevron-left', 18)}</button>
      <button class="icon-btn" data-act="home-month" data-d="1" ${V.homeMonth >= monthOf(today) ? 'disabled style="opacity:.3"' : ''} aria-label="下個月">${icon('chevron-right', 18)}</button></div>
    <div class="flow-rows">
      <div class="flow-row">${icon('income', 18)}<span>收入</span><b class="pos">${m(sum.inc)}</b></div>
      <div class="flow-row">${icon('expense', 18)}<span>支出</span><b class="neg">${m(sum.exp)}</b></div>
      <div class="flow-row total">${icon('wallet', 18)}<span>結餘</span><b class="${sum.net < 0 ? 'neg' : ''}">${m(sum.net)}</b></div>
    </div></section>`;

  h += `<section class="card"><div class="sec-head"><h2>最近紀錄</h2><a class="link" href="#ledger">查看全部 ${icon('chevron-right', 14)}</a></div>
    ${recent.length ? `<div class="list">${recent.map(t => txRow(S, t, { showDate: true })).join('')}</div>` : emptyState('還沒有任何紀錄<br>點下方「＋」記第一筆', 'note')}</section>`;
  return h;
}

/** 走勢圖互動：點選或滑動查看各月 */
export function after(S) {
  const el = $('#trend');
  if (!el) return;
  const series = netWorthSeries(S, 12);
  const vals = series.map(p => p.nw);
  const n = series.length;
  function show(i) {
    const sel = i == null ? n - 1 : Math.max(0, Math.min(n - 1, i));
    const p = series[sel];
    const [x, y] = trendXY(vals, sel);
    const pt = $('#trPt'), g = $('#trGuide');
    pt.style.left = (x / TW * 100) + '%'; pt.style.top = (y / TH * 100) + '%';
    g.style.left = (x / TW * 100) + '%'; g.hidden = i == null;
    const label = p.live ? `今天 ${shortDate(p.date)}（即時）` : `${p.date.slice(0, 4)}/${shortDate(p.date)} 快照`;
    let note = label;
    if (p.first) note += '・第一筆快照';
    else if (p.change !== null) note += `・較前期 ${store.pref.hide ? '＊＊＊＊' : signed(p.change)}${p.changePct !== null ? `（${pct(p.changePct)}）` : ''}`;
    $('#trNote').textContent = i == null ? '' : note;
    $('#nwBig').innerHTML = m(p.nw);
    $('#nwAs').innerHTML = m(p.assets);
    $('#nwDe').innerHTML = m(Math.abs(p.debts));
    V.nwSel = i;
  }
  const idx = e => { const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * TW; return n > 1 ? Math.round((x - 6) / ((TW - 12) / (n - 1))) : 0; };
  let down = false;
  el.addEventListener('pointerdown', e => { down = true; try { el.setPointerCapture(e.pointerId); } catch { } show(idx(e)); });
  el.addEventListener('pointermove', e => { if (down || e.pointerType === 'mouse') show(idx(e)); });
  el.addEventListener('pointerup', () => { down = false; });
  el.addEventListener('pointercancel', () => { down = false; });
  el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !down) show(null); });
  el.tabIndex = 0;
  el.addEventListener('keydown', e => {
    const cur = V.nwSel == null ? n - 1 : V.nwSel;
    if (e.key === 'ArrowLeft') { show(cur - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { show(cur + 1); e.preventDefault(); }
    else if (e.key === 'Escape') show(null);
  });
  show(null);
}

export const actions = {
  'toggle-hide': () => { setPref({ hide: !store.pref.hide }); rerender(); },
  'home-month': el => { const d = Number(el.dataset.d); const nm = shiftMonth(V.homeMonth, d); if (nm <= monthOf(todayStr())) { V.homeMonth = nm; rerender(); } },
  reminders: () => {
    const list = reminders(store.S);
    openSheet({
      label: '提醒',
      render: () => `<div class="grabber"></div>${sheetHead('提醒')}
        ${list.length ? `<div class="card"><div class="list">${list.map(r => `<${r.acct ? `button data-act="open-acct" data-id="${esc(r.acct)}"` : r.act ? `button data-act="${r.act}"` : 'div'} class="row">${bubble(r.icon, r.hue)}<span class="main"><span class="t ${r.bad ? 'neg' : ''}">${esc(r.title)}</span><span class="s">${esc(r.sub)}</span></span></${r.acct || r.act ? 'button' : 'div'}>`).join('')}</div></div>`
          : `<div class="card">${emptyState('目前沒有需要注意的事項', 'bell')}</div>`}
        <p class="note">提醒包含：7 天內到期或逾期的信用卡帳單，以及需要手動更新價格的標的（基金淨值、抓價失敗、待補代碼）。</p>`,
    });
  },
};
