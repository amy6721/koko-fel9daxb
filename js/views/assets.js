// 資產：淨資產、帳戶總覽、投資組合；帳戶詳情、信用卡帳單、標的詳情
import { icon } from '../icons.js';
import { esc, money, signed, pct, num, uid, fmtUnits, fmtPrice, fullDate, shortDate, todayStr, EPS } from '../util.js';
import {
  ACCOUNT_TYPES, TYPE_ORDER, CURRENCIES, HOLDING_KINDS, acctById, holdById, isCard, cashBalance, accountValueTWD, totals, replay,
  holdingSummary, visibleInOverview, cardInfo, priceStatus, unitWord, fxRate, sortTxs, isBackfill, KIND_LABEL,
} from '../calc.js';
import { store, commit, refreshPrices } from '../store.js';
import { V, rerender, openTx } from '../bus.js';
import { m, ms, txRow, bubble, acctIcon, emptyState, openSheet, refreshSheet, closeSheet, sheetHead, toast, busy, confirmSheet, donut, legend, PALETTE } from '../ui.js';

const chev = () => icon('chevron-right', 18).replace('class="ic"', 'class="ic chev"');

export function priceTag(h) {
  const st = priceStatus(h);
  return { pending: '<span class="tag warn">待補代碼</span>', manual: '<span class="tag">手動</span>', error: '<span class="tag bad">抓價失敗</span>', buy: '<span class="tag">買進價</span>', auto: '' }[st];
}

function acctSub(S, a, R) {
  if (isCard(a)) {
    const c = cardInfo(S, a);
    return `本期未出帳 ${money(c.current.charges)}${c.unpaid.length ? `・待繳 ${money(c.unpaid.reduce((s, b) => s + b.amount - b.paid, 0))}` : ''}`;
  }
  const hs = S.holdings.filter(h => h.acct === a.id && ((R.pos[h.id]?.units || 0) > EPS));
  if (hs.length) return `現金 ${money(cashBalance(S, a.id), a.cur)} ＋ 持有 ${hs.length} 檔`;
  if (a.cur !== 'TWD') return money(cashBalance(S, a.id), a.cur);
  return ACCOUNT_TYPES[a.type].label + (a.archived ? '・已封存' : '');
}

export function render(S) {
  const R = replay(S);
  const T = totals(S, R);
  let h = `<div class="topbar"><h1>資產</h1><button class="icon-btn accent" data-act="new-acct" aria-label="新增帳戶">${icon('add', 24)}</button></div>`;
  if (!S.accounts.length) return h + `<section class="card">${emptyState('還沒有帳戶<br>新增銀行、現金、信用卡等帳戶後，<br>這裡會顯示你的淨資產。', 'bank', '<button class="btn pri" data-act="new-acct">新增帳戶</button>')}</section>`;

  h += `<section class="card">
    <div class="nw-top"><span class="lbl">淨資產（台幣）</span><button class="icon-btn" data-act="toggle-hide" aria-label="${store.pref.hide ? '顯示金額' : '隱藏金額'}" style="width:36px;height:36px;margin:-8px 0">${icon('eye', 18)}</button></div>
    <div class="nw-big">${m(T.nw)}</div>
    <div class="nw-split"><div><span class="lbl">資產總額</span><b>${m(T.assets)}</b></div><div><span class="lbl">負債總額</span><b class="neg">${m(Math.abs(T.debts))}</b></div></div>
  </section>`;

  h += `<section class="card"><div class="sec-head"><h2>帳戶總覽</h2></div>`;
  for (const ty of TYPE_ORDER) {
    const list = S.accounts.filter(a => a.type === ty && visibleInOverview(S, a, R));
    if (!list.length) continue;
    const sub = list.reduce((s, a) => s + accountValueTWD(S, a, R), 0);
    h += `<div class="group-head" style="margin-top:10px">${ACCOUNT_TYPES[ty].label}<span class="num ${sub < -0.5 ? 'neg' : ''}">${m(sub)}</span></div><div class="list">`;
    for (const a of list) {
      const v = accountValueTWD(S, a, R);
      h += `<button class="row" data-act="open-acct" data-id="${esc(a.id)}">${bubble(acctIcon(a), 8, 'prim')}<span class="main"><span class="t">${esc(a.name)}${a.archived ? '<span class="tag">已封存</span>' : ''}</span><span class="s">${esc(acctSub(S, a, R))}</span></span><span class="v ${v < -0.5 ? 'neg' : ''}">${m(v)}</span></button>`;
    }
    h += '</div>';
  }
  const hidden = S.accounts.filter(a => !visibleInOverview(S, a, R));
  if (hidden.length) h += `<p class="note" style="margin-top:8px">另有 ${hidden.length} 個已封存且餘額為 0 的帳戶，可在「設定 → 帳戶」查看。</p>`;
  h += '</section>';

  // 投資組合
  const hs = holdingSummary(S, R).filter(x => x.units > EPS || x.trades.length);
  h += `<section class="card"><div class="sec-head"><h2>投資組合</h2><button class="btn sm soft" data-act="refresh-prices">${icon('refresh', 16)}更新價格</button></div>`;
  if (!hs.length) h += emptyState('還沒有投資部位<br>記一筆「投資 → 買進」就會出現在這裡', 'investment', '<button class="btn sm" data-act="new-buy">記一筆買進</button>');
  else {
    const groups = {};
    for (const x of hs) { if (x.units <= EPS) continue; const k = x.h.cur === 'USD' ? `${x.h.kind}（美元）` : x.h.kind; groups[k] = (groups[k] || 0) + x.valueTWD; }
    const items = Object.entries(groups).sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
    const tot = items.reduce((s, i) => s + i.value, 0);
    if (tot > 0) h += `<div class="donut-wrap" style="margin:8px 0 6px">${donut(items, `<b>${m(tot)}</b><span>投資總額</span>`)}${legend(items)}</div>`;
    h += `<div class="list">${hs.map(x => `<button class="row" data-act="open-hold" data-id="${esc(x.h.id)}">${bubble(x.h.kind === '基金' ? 'fund' : 'investment', 40)}
      <span class="main"><span class="t">${esc(x.h.name)}${priceTag(x.h)}</span><span class="s">${x.h.code ? esc(x.h.code) + '・' : ''}${fmtUnits(x.units)} ${unitWord(x.h)}・${x.h.cur === 'USD' ? 'US$' : ''}${fmtPrice(x.price)}</span></span>
      <span class="v">${m(x.valueTWD)}<small class="${x.unreal >= 0 ? 'pos' : 'neg'}">${x.units > EPS ? pct(x.unrealPct) : '已出清'}</small></span></button>`).join('')}</div>
      <p class="note" style="margin-top:8px">價格更新於 ${S.settings.priceUpdated ? esc(S.settings.priceUpdated) : '—（尚未更新）'}。股票、ETF 由試算表 GOOGLEFINANCE 抓價，基金淨值抓 MoneyDJ；${S.holdings.some(h => h.cur === 'USD') ? `美元部位以匯率 ${S.settings.fxUSD} 換算台幣。` : ''}</p>`;
  }
  h += '</section>';
  return h;
}

/* ---------- 帳戶詳情 ---------- */
export function openAccount(id) {
  const st = { limit: 30 };
  const s = openSheet({
    label: '帳戶詳情',
    render: () => {
      const S = store.S;
      const a = acctById(S, id);
      if (!a) return sheetHead('帳戶') + emptyState('這個帳戶已被刪除', 'bank');
      const R = replay(S);
      const bal = cashBalance(S, a.id);
      const v = accountValueTWD(S, a, R);
      let h = `<div class="grabber"></div>${sheetHead(a.name, { right: `<button class="icon-btn" data-act="edit-acct" aria-label="編輯帳戶">${icon('settings', 20)}</button>` })}`;
      h += `<section class="card" style="display:flex;align-items:center;gap:12px">${bubble(acctIcon(a), 8, 'lg prim')}<div style="flex:1;min-width:0"><div class="lbl">${ACCOUNT_TYPES[a.type].label}${a.cur !== 'TWD' ? `・${a.cur}` : ''}${a.archived ? '・已封存' : ''}</div>
        <div class="nw-big" style="font-size:26px">${isCard(a) ? m(-bal) : m(v)}</div>
        ${isCard(a) ? '<div class="lbl">目前欠款</div>' : a.cur !== 'TWD' ? `<div class="lbl">原幣 ${m(bal, a.cur)}</div>` : S.holdings.some(h => h.acct === a.id) ? `<div class="lbl">現金 ${m(bal)}・含持有標的市值</div>` : ''}</div></section>`;
      if (!a.archived) h += `<button class="btn soft full" data-act="add-here">${icon('add', 18)}在這個帳戶記一筆</button>`;
      if (isCard(a)) h += cardSection(S, a);
      const hs = S.holdings.filter(x => x.acct === a.id);
      if (hs.length) {
        h += `<div class="sec-head"><h2>持有標的</h2></div>`;
        for (const x of holdingSummary(S, R).filter(y => y.h.acct === a.id)) {
          const last3 = x.trades.slice(-3).reverse();
          h += `<section class="card"><button class="row" data-act="open-hold" data-id="${esc(x.h.id)}" style="padding-top:0">${bubble(x.h.kind === '基金' ? 'fund' : 'investment', 40)}<span class="main"><span class="t">${esc(x.h.name)}${priceTag(x.h)}</span><span class="s">${fmtUnits(x.units)} ${unitWord(x.h)}・市值 ${esc(money(x.value, x.h.cur))}</span></span>${chev()}</button>
            <dl class="kv" style="margin:6px 0 4px"><dt>成本</dt><dd>${m(x.cost, x.h.cur)}</dd><dt>損益</dt><dd class="${x.unreal >= 0 ? 'pos' : 'neg'}">${ms(x.unreal, x.h.cur)}（${pct(x.unrealPct)}）</dd><dt>配息合計</dt><dd>${m(x.div, x.h.cur)}</dd></dl>
            ${last3.length ? `<div class="lbl" style="margin-top:8px">最近 ${last3.length} 筆交易</div><div class="list">${last3.map(t => tradeRow(S, x.h, t)).join('')}</div>` : ''}</section>`;
        }
      }
      const txs = sortTxs(S.txs.filter(t => t.acct === a.id || t.to === a.id)).reverse();
      h += `<div class="sec-head"><h2>紀錄</h2><span class="lbl">${txs.length} 筆</span></div>`;
      h += txs.length ? `<div class="card" style="padding:4px 14px"><div class="list">${txs.slice(0, st.limit).map(t => txRow(S, t, { showDate: true })).join('')}</div></div>${txs.length > st.limit ? '<button class="btn full" data-act="more">顯示更多</button>' : ''}` : `<div class="card">${emptyState('這個帳戶還沒有紀錄', 'records')}</div>`;
      return h;
    },
    on: {
      'edit-acct': () => openAccountForm(id),
      'add-here': () => { const a = acctById(store.S, id); openTx({ acct: id, kind: ['broker', 'fund'].includes(a.type) && store.S.holdings.length ? 'invest' : 'expense' }); },
      more: () => { st.limit += 50; refreshSheet(s); },
    },
  });
  return s;
}

function tradeRow(S, h, t) {
  const R = replay(S);
  const real = t.kind === 'sell' && R.costOut[t.id] != null ? t.amt - R.costOut[t.id] : null;
  const desc = t.kind === 'div' ? '配息' : `${KIND_LABEL[t.kind]} ${fmtUnits(t.units)} ${unitWord(h)} @ ${fmtPrice(t.price)}`;
  return `<button class="row" data-act="edit-tx" data-id="${esc(t.id)}"><span class="main"><span class="t" style="font-weight:500">${esc(desc)}${isBackfill(S, t) ? '<span class="tag warn">補登</span>' : ''}</span><span class="s">${fullDate(t.date)}${t.fee ? `・手續費 ${fmtPrice(t.fee)}` : ''}${real !== null ? `・已實現 ${signed(real, h.cur)}` : ''}</span></span>
    <span class="v ${t.kind === 'buy' ? '' : 'pos'}">${t.kind === 'buy' ? ms(-t.amt, h.cur) : ms(t.amt, h.cur)}</span></button>`;
}

function cardSection(S, a) {
  const c = cardInfo(S, a);
  const statusTag = b => ({ paid: '<span class="tag ok">已繳清</span>', partial: '<span class="tag warn">部分繳款</span>', unpaid: '<span class="tag prim">待繳</span>', overdue: '<span class="tag bad">已逾期</span>' }[b.status]);
  let h = `<section class="card"><div class="sec-head"><h2>本期帳單（未出帳）</h2></div>
    <dl class="kv"><dt>帳單期間</dt><dd>${shortDate(c.current.start)} – ${shortDate(c.current.close)}</dd><dt>結帳日</dt><dd>每月 ${a.billDay} 日</dd><dt>繳款截止日</dt><dd>每月 ${a.dueDay} 日</dd><dt>本期累積</dt><dd>${m(c.current.charges)}</dd></dl>
    ${c.prepaid > 0.5 ? `<div class="banner" style="margin-top:10px;background:var(--primary-soft)">未出帳・已預繳 <b class="num">${m(c.prepaid)}</b></div>` : ''}
    ${c.current.items.length ? `<details style="margin-top:8px"><summary class="lbl" style="min-height:var(--touch);display:flex;align-items:center;cursor:pointer">本期消費明細（${c.current.items.length} 筆）</summary><div class="list">${sortTxs(c.current.items).reverse().map(t => txRow(S, t, { showDate: true })).join('')}</div></details>` : ''}
  </section>`;
  h += `<div class="sec-head"><h2>帳單紀錄</h2></div>`;
  if (!c.bills.length) h += `<div class="card">${emptyState('還沒有已出帳的帳單', 'credit-card')}</div>`;
  else h += `<div class="bills">${c.bills.map(b => `<div class="bill">
      <div class="bill-top"><span style="font-weight:700">${b.opening ? '期初欠款' : `${b.close.slice(0, 4)}/${shortDate(b.close)} 帳單`}</span>${statusTag(b)}<b>${m(b.amount)}</b></div>
      <div class="lbl">${b.opening ? '開始使用時的欠款' : `${shortDate(b.start)} – ${shortDate(b.close)}・繳款截止 ${fullDate(b.due)}`}${b.status !== 'paid' && b.paid > 0.5 ? `・已繳 ${money(b.paid)}，尚欠 ${money(b.amount - b.paid)}` : ''}</div>
      ${b.items.length ? `<details><summary class="lbl" style="min-height:36px;display:flex;align-items:center;cursor:pointer">消費明細（${b.items.length} 筆）</summary><div class="list">${sortTxs(b.items).reverse().map(t => txRow(S, t, { showDate: true })).join('')}</div></details>` : ''}
    </div>`).join('')}</div>`;
  h += `<p class="note">繳卡費請用「轉帳」：從銀行帳戶轉到這張卡。繳款會先抵扣最早的帳單，在結帳日前先繳的金額會顯示為「未出帳・已預繳」。</p>`;
  return h;
}

/* ---------- 標的詳情 ---------- */
export function openHolding(id) {
  const st = { name: null, code: null, manual: '' };
  const s = openSheet({
    label: '標的詳情',
    render: () => {
      const S = store.S;
      const h = holdById(S, id);
      if (!h) return sheetHead('標的') + emptyState('這檔標的已被刪除', 'investment');
      if (st.name === null) { st.name = h.name; st.code = h.code || ''; }
      const x = holdingSummary(S).find(y => y.h.id === id);
      const a = acctById(S, h.acct);
      const fx = fxRate(S, h.cur);
      let out = `<div class="grabber"></div>${sheetHead(h.name)}
      <section class="card"><dl class="kv">
        <dt>代號</dt><dd>${h.code ? esc(h.code) : '<span class="tag warn">待補代碼</span>'}</dd>
        <dt>種類</dt><dd class="txt">${esc(h.kind)}・${h.cur}</dd>
        <dt>歸屬帳戶</dt><dd class="txt">${esc(a ? a.name : '—')}</dd>
        <dt>持有</dt><dd>${fmtUnits(x.units)} ${unitWord(h)}</dd>
        <dt>${h.kind === '基金' ? '淨值' : '價格'}</dt><dd>${fmtPrice(x.price)} ${priceTag(h)}<br><small class="mut">${h.priceDate ? '價格日期 ' + esc(h.priceDate) : ''}</small></dd>
        <dt>市值</dt><dd>${m(x.value, h.cur)}${h.cur !== 'TWD' ? `<br><small class="mut">≈ ${m(x.value * fx)}</small>` : ''}</dd>
        <dt>總成本</dt><dd>${m(x.cost, h.cur)}</dd>
        <dt>未實現損益</dt><dd class="${x.unreal >= 0 ? 'pos' : 'neg'}">${ms(x.unreal, h.cur)}（${pct(x.unrealPct)}）</dd>
        <dt>配息合計</dt><dd>${m(x.div, h.cur)}</dd>
        <dt>已實現損益</dt><dd class="${x.realized >= 0 ? 'pos' : 'neg'}">${ms(x.realized, h.cur)}</dd>
        <dt>累計報酬率</dt><dd class="${x.totalRet >= 0 ? 'pos' : 'neg'}">${pct(x.totalRet, 2)}</dd>
      </dl>${h.priceErr ? `<p class="note neg" style="margin-top:8px">上次抓價失敗：${esc(h.priceErr)}。目前沿用前一次價格，可在下方手動填寫。</p>` : ''}</section>
      <div class="two" style="grid-template-columns:repeat(3,1fr)">${['buy', 'sell', 'div'].map(k => `<button class="btn ${k === 'buy' ? 'pri' : ''}" data-act="trade" data-v="${k}" ${k === 'sell' && x.units <= EPS ? 'disabled' : ''}>${KIND_LABEL[k]}</button>`).join('')}</div>
      <div class="sec-head"><h2>交易紀錄</h2><span class="lbl">${x.trades.length} 筆</span></div>
      ${x.trades.length ? `<div class="card" style="padding:4px 14px"><div class="list">${x.trades.slice().reverse().map(t => tradeRow(S, h, t)).join('')}</div></div>` : `<div class="card">${emptyState('沒有交易紀錄', 'records')}</div>`}
      <section class="card" style="display:flex;flex-direction:column;gap:10px"><h2 style="font-size:16px;margin:0">標的資料</h2>
        <label class="field"><span class="lbl">名稱</span><input class="inp" id="h-name" data-bind="name" value="${esc(st.name)}" maxlength="40"></label>
        <label class="field"><span class="lbl">${h.kind === '基金' ? 'MoneyDJ 基金代碼' : '代號'}</span><input class="inp" id="h-code" data-bind="code" value="${esc(st.code)}" placeholder="${h.kind === '基金' ? '例如 ACDD04' : '例如 0050'}" autocapitalize="characters" maxlength="20"></label>
        ${!h.code ? '<p class="note">補上代號後，按「更新價格」就會開始自動抓價。</p>' : ''}
        <button class="btn" data-act="save-info">儲存資料</button></section>
      <section class="card" style="display:flex;flex-direction:column;gap:10px"><h2 style="font-size:16px;margin:0">手動填寫${h.kind === '基金' ? '淨值' : '價格'}</h2>
        <p class="note">自動抓不到時使用，會標示為「手動」。之後再按「更新價格」成功抓到時，會改回自動價格。</p>
        <div style="display:flex;gap:8px"><input class="inp num" id="h-manual" data-bind="manual" inputmode="decimal" placeholder="${fmtPrice(x.price)}" value="${esc(st.manual)}" aria-label="手動價格"><button class="btn" data-act="save-manual">套用</button></div></section>
      ${!x.trades.length ? '<button class="btn full danger" data-act="del-hold">刪除這檔標的</button>' : ''}`;
      return out;
    },
    onInput: e => { const k = e.target.dataset.bind; if (k) st[k] = e.target.value; },
    on: {
      trade: el => { closeSheet(s); openTx({ kind: 'invest', invKind: el.dataset.v, hid: id }); },
      'save-info': async el => {
        const name = st.name.trim(), code = st.code.trim().toUpperCase();
        if (!name) return toast('名稱不能空白', true);
        if (store.S.holdings.some(x => x.id !== id && x.name === name)) return toast('已有同名標的', true);
        try {
          await busy(el, () => commit(d => { const h = d.holdings.find(x => x.id === id); const changed = h.code !== code; h.name = name; h.code = code; if (changed) { h.priceErr = ''; if (h.priceSrc === 'auto') h.priceSrc = 'buy'; } }, ['holdings']), '儲存中…');
          toast(code ? '已儲存，按「更新價格」就會開始抓價' : '已儲存'); refreshSheet(s); rerender();
        } catch (e) { toast('儲存失敗：' + e.message, true); }
      },
      'save-manual': async el => {
        const p = num(st.manual);
        if (!(p > 0)) return toast('請輸入大於 0 的價格', true);
        try {
          await busy(el, () => commit(d => { const h = d.holdings.find(x => x.id === id); h.price = p; h.priceSrc = 'manual'; h.priceDate = todayStr(); h.priceErr = ''; }, ['holdings']), '儲存中…');
          st.manual = ''; toast('已套用手動價格'); refreshSheet(s); rerender();
        } catch (e) { toast('儲存失敗：' + e.message, true); }
      },
      'del-hold': async () => {
        if (store.S.txs.some(t => t.hid === id)) return toast('這檔標的已有交易紀錄，無法刪除', true);
        if (!await confirmSheet({ title: '刪除標的？', message: '這檔標的沒有任何交易紀錄，刪除後無法復原。' })) return;
        try { await commit(d => { d.holdings = d.holdings.filter(x => x.id !== id); }, ['holdings']); closeSheet(s); toast('已刪除'); rerender(); }
        catch (e) { toast('刪除失敗：' + e.message, true); }
      },
    },
  });
}

/* ---------- 新增／編輯帳戶 ---------- */
export function openAccountForm(id = null) {
  const S0 = store.S;
  const a0 = id ? acctById(S0, id) : null;
  const f = a0
    ? { name: a0.name, type: a0.type, cur: a0.cur, open: a0.type === 'debt' ? String(-a0.open || '') : String(a0.open || ''), card: isCard(a0), billDay: String(a0.billDay || ''), dueDay: String(a0.dueDay || ''), err: '' }
    : { name: '', type: 'bank', cur: 'TWD', open: '', card: false, billDay: '', dueDay: '', err: '' };
  const hasRecords = id && (S0.txs.some(t => t.acct === id || t.to === id) || S0.holdings.some(h => h.acct === id));
  const s = openSheet({
    label: id ? '編輯帳戶' : '新增帳戶',
    render: () => {
      const debt = f.type === 'debt';
      return `<div class="grabber"></div>${sheetHead(id ? '編輯帳戶' : '新增帳戶')}
      <section class="card" style="display:flex;flex-direction:column;gap:14px">
        <label class="field"><span class="lbl">名稱（必填）</span><input class="inp" id="a-name" data-bind="name" value="${esc(f.name)}" placeholder="例如：薪轉帳戶、錢包、XX 信用卡" maxlength="30" autocomplete="off"></label>
        <div class="field"><span class="lbl">類型</span><div class="chips">${TYPE_ORDER.map(t => `<button class="chip ${f.type === t ? 'on' : ''}" data-act="type" data-v="${t}" ${hasRecords && t !== f.type && (t === 'debt' || f.type === 'debt') ? 'disabled' : ''}>${icon(ACCOUNT_TYPES[t].icon, 16)}${ACCOUNT_TYPES[t].label}</button>`).join('')}</div></div>
        <div class="field"><span class="lbl">幣別</span><div class="chips">${CURRENCIES.map(c => `<button class="chip ${f.cur === c ? 'on' : ''}" data-act="cur" data-v="${c}" ${hasRecords && c !== f.cur ? 'disabled' : ''}>${c}</button>`).join('')}</div>${hasRecords ? '<p class="note">已有紀錄的帳戶不能更改幣別。</p>' : ''}</div>
        <label class="field"><span class="lbl">${debt ? '開始使用當天的欠款金額（填正數）' : '開始使用當天的餘額'}</span><input class="inp num" id="a-open" data-bind="open" inputmode="decimal" value="${esc(f.open)}" placeholder="0" autocomplete="off"></label>
        <p class="note" style="margin-top:-8px">開始使用日：${esc(store.S.settings.startDate || '—')}（可在設定修改）。${debt ? '例如信貸還欠 15 萬就填 150000，系統會記為負債 −150,000。' : ''}</p>
        ${debt ? `<label class="toggle"><input type="checkbox" data-act="card" ${f.card ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--primary)"><span>這是信用卡（有每月帳單）</span></label>
          ${f.card ? `<div class="two"><label class="field"><span class="lbl">結帳日（每月幾號）</span><input class="inp num" id="a-bill" data-bind="billDay" inputmode="numeric" value="${esc(f.billDay)}" placeholder="1–31"></label><label class="field"><span class="lbl">繳款截止日（每月幾號）</span><input class="inp num" id="a-due" data-bind="dueDay" inputmode="numeric" value="${esc(f.dueDay)}" placeholder="1–31"></label></div>` : ''}` : ''}
      </section>
      <div class="err" role="alert" id="a-err">${esc(f.err)}</div>
      <button class="btn pri full" data-act="save">${id ? '儲存' : '新增帳戶'}</button>
      ${id ? `<button class="btn full" data-act="archive">${a0.archived ? '取消封存' : '封存帳戶'}</button>
        <p class="note" style="text-align:center">封存後不能再選這個帳戶記帳，但歷史紀錄會保留；若仍有餘額，淨資產照常計入。</p>
        <button class="btn full danger" data-act="delete">刪除帳戶</button>` : ''}`;
    },
    onInput: e => { const k = e.target.dataset.bind; if (k) { f[k] = e.target.value; if (f.err) { f.err = ''; document.getElementById('a-err').textContent = ''; } } },
    on: {
      type: el => { f.type = el.dataset.v; if (f.type !== 'debt') f.card = false; refreshSheet(s); },
      cur: el => { f.cur = el.dataset.v; refreshSheet(s); },
      card: el => { f.card = el.checked; refreshSheet(s); },
      save: async el => {
        const err = msg => { f.err = msg; document.getElementById('a-err').textContent = msg; };
        const name = f.name.trim();
        if (!name) return err('請填寫帳戶名稱');
        if (store.S.accounts.some(x => x.id !== id && x.name === name)) return err('已有同名帳戶');
        let open = f.open === '' ? 0 : num(f.open);
        if (!isFinite(open)) return err('餘額請填數字');
        if (f.type === 'debt') open = -Math.abs(open);
        let billDay = '', dueDay = '';
        if (f.type === 'debt' && f.card) {
          billDay = num(f.billDay); dueDay = num(f.dueDay);
          if (!Number.isInteger(billDay) || billDay < 1 || billDay > 31) return err('結帳日請填 1 到 31 的數字');
          if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return err('繳款截止日請填 1 到 31 的數字');
        }
        const rec = { name, type: f.type, cur: f.cur, open: Math.round(open * 100) / 100, billDay, dueDay };
        try {
          await busy(el, () => commit(d => {
            if (id) Object.assign(d.accounts.find(x => x.id === id), rec);
            else { d.accounts.push({ id: uid('a'), ...rec, archived: false }); }
          }, ['accounts']), '儲存中…');
          closeSheet(s); toast(id ? '已儲存' : '已新增帳戶'); rerender();
        } catch (e) { err('儲存失敗：' + e.message); }
      },
      archive: async el => {
        const arch = !acctById(store.S, id).archived;
        try {
          await busy(el, () => commit(d => {
            d.accounts.find(x => x.id === id).archived = arch;
            if (arch && d.settings.defaultAcct === id) d.settings.defaultAcct = d.accounts.find(x => !x.archived && x.id !== id)?.id || '';
          }, ['accounts', 'settings']), '儲存中…');
          closeSheet(s); toast(arch ? '已封存' : '已取消封存'); rerender();
        } catch (e) { toast('失敗：' + e.message, true); }
      },
      delete: async () => {
        const S = store.S;
        if (S.txs.some(t => t.acct === id || t.to === id) || S.holdings.some(h => h.acct === id)) return toast('這個帳戶已有紀錄或持有標的，無法刪除。不再使用請改用「封存」。', true);
        if (!await confirmSheet({ title: '刪除帳戶？', message: `「${esc(acctById(S, id).name)}」沒有任何紀錄，刪除後無法復原。` })) return;
        try {
          await commit(d => { d.accounts = d.accounts.filter(x => x.id !== id); if (d.settings.defaultAcct === id) d.settings.defaultAcct = ''; }, ['accounts', 'settings']);
          closeSheet(s); toast('已刪除帳戶'); rerender();
        } catch (e) { toast('刪除失敗：' + e.message, true); }
      },
    },
  });
}

export const actions = {
  'new-acct': () => openAccountForm(),
  'new-buy': () => openTx({ kind: 'invest', invKind: 'buy' }),
  'refresh-prices': async el => {
    if (!store.S.holdings.length) return toast('目前沒有投資標的');
    try {
      const report = await busy(el, () => refreshPrices(), '更新中…');
      const bad = report.filter(r => !r.ok);
      toast(bad.length ? `已更新，${bad.length} 檔抓不到（沿用舊價格，可手動填寫）` : '價格已更新 ✓', !!bad.length);
      rerender();
    } catch (e) { toast(e.message, true); }
  },
};
