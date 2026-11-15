// 統計：收支統計、投資統計
import { icon } from '../icons.js';
import { esc, money, signed, pct, shortMoney, monthOf, todayStr, shiftMonth, EPS } from '../util.js';
import { monthSummary, catInfo, investPeriods, holdingSummary, replay, HOLDING_KINDS } from '../calc.js';
import { store } from '../store.js';
import { V, rerender } from '../bus.js';
import { m, ms, monthBar, donut, legend, pairBars, pnlBars, emptyState, bubble } from '../ui.js';

export function render(S) {
  let h = `<div class="topbar"><h1>統計</h1></div>
    <div class="seg" role="tablist" aria-label="統計種類">
      <button role="tab" aria-selected="${V.statMode === 'cash'}" class="${V.statMode === 'cash' ? 'on' : ''}" data-act="stat-mode" data-v="cash">收支統計</button>
      <button role="tab" aria-selected="${V.statMode === 'inv'}" class="${V.statMode === 'inv' ? 'on' : ''}" data-act="stat-mode" data-v="inv">投資統計</button></div>`;
  return h + (V.statMode === 'cash' ? cashStats(S) : invStats(S));
}

function cashStats(S) {
  const max = monthOf(todayStr());
  const sum = monthSummary(S, V.statMonth);
  const rows = Object.entries(sum.byCat).sort((a, b) => b[1] - a[1]);
  const tot = rows.reduce((s, r) => s + r[1], 0);
  let h = monthBar(V.statMonth, '2000-01', max, 'stat-month');
  if (!rows.length) h += `<section class="card">${emptyState('這個月沒有支出紀錄', 'stats')}</section>`;
  else {
    const top = rows.slice(0, 5);
    const rest = rows.slice(5).reduce((s, r) => s + r[1], 0);
    const items = top.map(([c, v]) => ({ label: c, value: v, color: `hsl(${catInfo('expense', c).hue} 62% 72%)` }));
    if (rest > 0) items.push({ label: '其他類別', value: rest, color: 'var(--border)' });
    h += `<section class="card"><div class="donut-wrap">${donut(items, `<span>本月支出</span><b>${m(tot)}</b>`)}${legend(items)}</div></section>
    <section class="card"><div class="sec-head"><h2>分類排行</h2><span class="lbl">合計 ${m(tot)}</span></div>
      <div class="rank">${rows.map(([c, v]) => { const ci = catInfo('expense', c); return `<div class="rank-row" style="--h:${ci.hue}">${bubble(ci.icon, ci.hue, 'sm')}
        <span class="nm"><span>${esc(c)}</span><span class="num">${m(v)}</span></span><span class="pc">${Math.round(v / tot * 100)}%</span>
        <span class="track"><span class="fill" style="display:block;width:${(v / rows[0][1] * 100).toFixed(1)}%"></span></span></div>`; }).join('')}</div></section>`;
  }
  const months = []; for (let i = 5; i >= 0; i--) months.push(shiftMonth(V.statMonth, -i));
  const data = months.map(mo => monthSummary(S, mo));
  h += `<section class="card chart"><div class="sec-head"><h2>月度比較</h2></div>
    ${store.pref.hide ? '<p class="note">金額已隱藏</p>' : pairBars(data, { labels: months.map(x => Number(x.slice(5)) + '月') })}
    <div class="chart-legend"><span><i style="background:var(--primary)"></i>收入</span><span><i style="background:color-mix(in srgb, var(--primary) 35%, var(--surface))"></i>支出</span></div></section>
    <p class="note">轉帳、繳卡費、買賣投資不算收入或支出，避免重複計算；配息算收入。外幣一律換算台幣。</p>`;
  return h;
}

function invStats(S) {
  if (!S.holdings.length) return `<section class="card">${emptyState('還沒有投資紀錄<br>記一筆「投資 → 買進」後就能看投資統計', 'investment')}</section>`;
  const ps = investPeriods(S, V.invGran, V.invFilt);
  if (!ps.length) return `<section class="card">${emptyState('還沒有月初快照，下次開啟 App 時會自動建立', 'calendar')}</section>`;
  const sel = ps.find(p => p.key === V.invSel) || ps[ps.length - 1];
  const filts = [['all', '全部'], ...HOLDING_KINDS.map(k => [k, k]), ...S.holdings.map(x => [x.id, x.name.length > 8 ? x.name.slice(0, 8) + '…' : x.name])];
  let h = `<div class="seg soft" role="tablist" aria-label="期間">${[['m', '每月'], ['q', '每季'], ['y', '每年']].map(([k, l]) => `<button role="tab" aria-selected="${V.invGran === k}" class="${V.invGran === k ? 'on' : ''}" data-act="inv-gran" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="tabs" role="group" aria-label="篩選標的">${filts.map(([k, l]) => `<button class="${V.invFilt === k ? 'on' : ''}" aria-pressed="${V.invFilt === k}" data-act="inv-filt" data-v="${esc(k)}">${esc(l)}</button>`).join('')}</div>
    <section class="card"><div class="sec-head"><h2>${esc(sel.label)}</h2></div>
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><span class="pnl-big ${sel.pnl >= 0 ? 'pos' : 'neg'}">${ms(sel.pnl)}</span><span class="tag ${sel.ret >= 0 ? 'ok' : 'bad'}">報酬率 ${pct(sel.ret, 2)}</span></div>
      <dl class="kv" style="margin-top:12px"><dt>期初市值</dt><dd>${m(sel.beg)}</dd><dt>本期投入</dt><dd>${m(sel.inn)}</dd><dt>本期贖回</dt><dd>${m(sel.out)}</dd><dt>配息</dt><dd>${m(sel.div)}</dd><dt>期末市值</dt><dd>${m(sel.end)}</dd>
        ${Math.abs(sel.fx) > 0.5 ? `<dt>其中匯率影響</dt><dd class="${sel.fx >= 0 ? 'pos' : 'neg'}">${ms(sel.fx)}</dd>` : ''}</dl></section>
    <section class="card chart"><div class="sec-head"><h2>各期損益</h2><span class="lbl">點長條切換期間</span></div>${store.pref.hide ? '<p class="note">金額已隱藏</p>' : pnlBars(ps, sel.key)}</section>
    <section class="card"><div class="sec-head"><h2>明細</h2></div><div class="tbl"><table><thead><tr><th>期間</th><th>期初</th><th>投入</th><th>配息</th><th>期末</th><th>損益</th><th>報酬率</th></tr></thead><tbody>
      ${ps.slice().reverse().map(p => `<tr data-act="inv-sel" data-v="${esc(p.key)}" class="${p.key === sel.key ? 'on' : ''}" tabindex="0"><td>${esc(p.label)}</td><td>${hm(shortMoney(p.beg))}</td><td>${hm(shortMoney(p.inn))}</td><td>${hm(shortMoney(p.div))}</td><td>${hm(shortMoney(p.end))}</td><td class="${p.pnl >= 0 ? 'pos' : 'neg'}">${hm((p.pnl >= 0 ? '+' : '') + shortMoney(p.pnl))}</td><td class="${p.ret >= 0 ? 'pos' : 'neg'}">${pct(p.ret, 2)}</td></tr>`).join('')}
    </tbody></table></div></section>`;
  const R = replay(S);
  const list = holdingSummary(S, R).filter(x => x.trades.length && (V.invFilt === 'all' || x.h.kind === V.invFilt || x.h.id === V.invFilt));
  h += `<section class="card"><div class="sec-head"><h2>自買進以來</h2><span class="lbl">含補登資料</span></div><div class="list">${list.map(x => `<button class="row" data-act="open-hold" data-id="${esc(x.h.id)}"><span class="main"><span class="t">${esc(x.h.name)}</span>
      <span class="s">成本 ${esc(money(x.cost, x.h.cur))}・未實現 ${esc(signed(x.unreal, x.h.cur))}${x.div ? '・配息 ' + esc(money(x.div, x.h.cur)) : ''}${Math.abs(x.realized) > EPS ? '・已實現 ' + esc(signed(x.realized, x.h.cur)) : ''}</span></span>
      <span class="v ${x.totalRet >= 0 ? 'pos' : 'neg'}">${pct(x.totalRet, 2)}<small>累計報酬</small></span></button>`).join('') || '<p class="note">沒有符合的標的</p>'}</div></section>
    <p class="note">報酬率會考慮資金投入的時間點；季、年報酬率由每月報酬率連乘。各期「投入」不含開始使用前補登的交易。美元標的以台幣計算，並另外列出匯率影響。統計從第一筆月初快照（${esc(S.snapshots.map(s => s.month).sort()[0] || '—')}）開始。</p>`;
  return h;
}
const hm = s => (store.pref.hide ? '＊＊' : esc(s));

export const actions = {
  'stat-mode': el => { V.statMode = el.dataset.v; rerender(); },
  'stat-month': el => { const nm = shiftMonth(V.statMonth, Number(el.dataset.d)); if (nm <= monthOf(todayStr())) { V.statMonth = nm; rerender(); } },
  'inv-gran': el => { V.invGran = el.dataset.v; V.invSel = null; rerender(); },
  'inv-filt': el => { V.invFilt = el.dataset.v; rerender(); },
  'inv-sel': el => { V.invSel = el.dataset.v; rerender(); },
};
