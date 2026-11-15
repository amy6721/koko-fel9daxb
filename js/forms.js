// 新增／編輯紀錄（支出、收入、轉帳、投資）
import { icon } from './icons.js';
import { esc, money, num, todayStr, fullDate, uid, fmtUnits, fmtPrice, EPS } from './util.js';
import {
  CATEGORIES, catInfo, acctById, holdById, cashBalance, ACCOUNT_TYPES, TYPE_ORDER, HOLDING_KINDS, INVEST_KINDS,
  replay, investAccounts, defaultInvestAccount, holdingHomeAccount, defaultAccount, unitWord, isBackfill, priceStatus,
} from './calc.js';
import { store, commit } from './store.js';
import { rerender } from './bus.js';
import { openSheet, refreshSheet, closeSheet, sheetHead, toast, confirmSheet, busy, bubble, acctIcon } from './ui.js';

let F = null;
let sheet = null;

const r2 = n => Math.round(n * 100) / 100;

function invTotal() {
  const u = num(F.units), p = num(F.price), fee = num(F.fee) || 0;
  if (!(u > 0) || !(p > 0)) return NaN;
  return r2(F.invKind === 'buy' ? u * p + fee : u * p - fee);
}
function holdingCur() {
  if (F.hid === 'new') return F.newCur;
  const h = holdById(store.S, F.hid);
  return h ? h.cur : 'TWD';
}
function holdingKind() {
  if (F.hid === 'new') return F.newKind;
  const h = holdById(store.S, F.hid);
  return h ? h.kind : '股票';
}

export function openTxForm(opts = {}) {
  const S = store.S;
  if (!S.accounts.some(a => !a.archived)) { toast('請先到「設定 → 帳戶」新增至少一個帳戶', true); location.hash = '#settings'; return; }
  const t = opts.id ? S.txs.find(x => x.id === opts.id) : null;
  if (t) {
    const inv = INVEST_KINDS.includes(t.kind);
    F = {
      id: t.id, kind: inv ? 'invest' : t.kind, invKind: inv ? t.kind : 'buy', amt: String(t.amt), cat: t.cat || '', acct: t.acct, to: t.to || '',
      amt2: t.amt2 != null && t.amt2 !== '' ? String(t.amt2) : '', date: t.date, note: t.note || '', hid: t.hid || '',
      units: t.units != null && t.units !== '' ? String(t.units) : '', price: t.price != null && t.price !== '' ? String(t.price) : '', fee: t.fee ? String(t.fee) : '',
      newName: '', newKind: '股票', newCode: '', newCur: 'TWD', created: t.created, err: '',
    };
  } else {
    const kind = opts.kind || 'expense';
    F = {
      id: null, kind, invKind: opts.invKind || 'buy', amt: '', cat: kind === 'income' ? '薪資' : '餐飲', acct: '', to: '', amt2: '', date: todayStr(), note: '',
      hid: opts.hid || '', units: '', price: '', fee: '', newName: '', newKind: '股票', newCode: '', newCur: 'TWD', err: '',
    };
    setDefaults(opts.acct);
  }
  sheet = openSheet({ full: true, label: F.id ? '編輯紀錄' : '新增記帳', render, on: handlers, onInput, onClose: () => { F = null; sheet = null; } });
}

function setDefaults(acct) {
  const S = store.S;
  if (F.kind === 'invest') {
    if (!F.hid) F.hid = S.holdings.length ? '' : 'new';
    if (F.invKind === 'sell' || F.invKind === 'div') {
      const h = holdById(S, F.hid);
      F.acct = acct || (h ? (investAccounts(S, h.cur).find(a => a.id === h.acct)?.id || defaultInvestAccount(S, h.kind, h.cur)) : '');
    } else F.acct = acct || (F.hid ? defaultInvestAccount(S, holdingKind(), holdingCur()) : '');
  } else {
    F.acct = acct || defaultAccount(S, F.kind);
    if (F.kind === 'transfer' && !F.to) F.to = S.accounts.find(a => !a.archived && a.id !== F.acct)?.id || '';
  }
}

function render() {
  const S = store.S;
  const a = acctById(S, F.acct);
  let h = sheetHead(F.id ? '編輯紀錄' : '新增記帳');
  h += `<div class="seg" role="tablist" aria-label="紀錄種類">${[['expense', '支出'], ['income', '收入'], ['transfer', '轉帳'], ['invest', '投資']].map(([k, l]) => `<button role="tab" aria-selected="${F.kind === k}" class="${F.kind === k ? 'on' : ''}" data-act="kind" data-v="${k}">${l}</button>`).join('')}</div>`;
  if (F.id && isBackfill(S, { date: F.date })) h += `<div class="banner">這筆是「補登」紀錄（早於開始使用日），只影響投資成本，不影響帳戶餘額。</div>`;
  h += F.kind === 'invest' ? invBody(S, a) : cashBody(S, a);
  h += `<div class="err" id="f-err" role="alert">${esc(F.err || '')}</div>
    <button class="btn pri full" data-act="save">${F.id ? '儲存修改' : '儲存'}</button>`;
  if (F.id) h += `<button class="btn full danger" data-act="delete">刪除這筆</button>`;
  return h;
}

function amountBox(cur, editable = true, value = F.amt) {
  return `<div class="amount-box"><label><span class="cur">${cur === 'USD' ? 'US$' : '$'}</span>
    <input id="f-amt" data-bind="amt" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(value)}" aria-label="金額" style="width:${amtWidth(value)}" ${editable ? '' : 'readonly tabindex="-1"'}></label></div>`;
}
const amtWidth = v => `${Math.max(1, String(v || '').length) + 0.4}ch`;
function fieldBtn(act, ic, k, v, ph = false, hue = null) {
  return `<button class="field-row" data-act="${act}">${hue !== null ? bubble(ic, hue, 'sm') : `<span class="bubble sm prim">${icon(ic, 18)}</span>`}<span class="main"><span class="k">${k}</span><span class="val ${ph ? 'ph' : ''}">${v}</span></span>${icon('chevron-right', 18).replace('class="ic"', 'class="ic chev"')}</button>`;
}
function dateRow() {
  return `<label class="field-row"><span class="bubble sm prim">${icon('calendar', 18)}</span><span class="main"><span class="k">日期</span><input type="date" id="f-date" data-bind="date" value="${esc(F.date)}" aria-label="日期"></span></label>`;
}
function noteRow() {
  return `<label class="field-row"><span class="bubble sm prim">${icon('note', 18)}</span><span class="main"><span class="k">備註</span><input id="f-note" data-bind="note" value="${esc(F.note)}" placeholder="選填，例如：午餐" maxlength="80" autocomplete="off"></span></label>`;
}
function acctLabel(a) { return a ? `${esc(a.name)}${a.cur !== 'TWD' ? `（${a.cur}）` : ''}` : '請選擇'; }

function cashBody(S, a) {
  const cur = a ? a.cur : 'TWD';
  let h = amountBox(cur);
  h += '<div class="card fields">';
  if (F.kind !== 'transfer') {
    const c = catInfo(F.kind, F.cat);
    h += fieldBtn('pick-cat', c.icon, '類別', esc(F.cat || '請選擇'), !F.cat, c.hue);
  }
  h += fieldBtn('pick-acct', 'wallet', F.kind === 'transfer' ? '轉出帳戶' : F.kind === 'income' ? '存入帳戶' : '付款帳戶', acctLabel(a), !a);
  if (F.kind === 'transfer') {
    const b = acctById(S, F.to);
    h += fieldBtn('pick-to', 'transfer', '轉入帳戶', acctLabel(b), !b);
    if (a && b && a.cur !== b.cur) h += `<label class="field-row"><span class="bubble sm prim">${icon('currency', 18)}</span><span class="main"><span class="k">實際轉入金額（${b.cur}）・換匯後入帳的金額</span><input id="f-amt2" data-bind="amt2" inputmode="decimal" value="${esc(F.amt2)}" placeholder="例如 ${b.cur === 'USD' ? '100.00' : '3,050'}" autocomplete="off"></span></label>`;
  }
  h += dateRow() + noteRow() + '</div>';
  return h;
}

function invBody(S, a) {
  const R = replay(S);
  const hasHold = S.holdings.length > 0;
  let h = `<div class="seg soft" role="tablist" aria-label="投資動作">${[['buy', '買進'], ['sell', '賣出'], ['div', '配息']].map(([k, l]) => `<button role="tab" aria-selected="${F.invKind === k}" class="${F.invKind === k ? 'on' : ''}" data-act="inv-kind" data-v="${k}">${l}</button>`).join('')}</div>`;
  const cur = holdingCur();
  const total = invTotal();
  if (F.invKind === 'div') h += amountBox(cur);
  else h += amountBox(cur, false, isFinite(total) ? fmtPrice(total).replace(/\.00$/, '') : '');
  h += '<div class="card fields">';
  const hd = holdById(S, F.hid);
  let hv = '請選擇標的', ph = true;
  if (F.hid === 'new') { hv = '＋ 新標的'; ph = false; }
  else if (hd) { hv = `${esc(hd.name)}${hd.code ? `・${esc(hd.code)}` : ''}`; ph = false; }
  h += fieldBtn('pick-hold', 'investment', '標的', hv, ph);
  if (F.hid === 'new') {
    h += `<label class="field-row"><span class="bubble sm prim">${icon('note', 18)}</span><span class="main"><span class="k">標的名稱（必填）</span><input id="f-nn" data-bind="newName" value="${esc(F.newName)}" placeholder="例如：元大台灣50" autocomplete="off" maxlength="40"></span></label>
      <div class="field-row"><span class="bubble sm prim">${icon('fund', 18)}</span><span class="main"><span class="k">種類</span><span class="chips" style="margin-top:4px">${HOLDING_KINDS.map(k => `<button class="chip ${F.newKind === k ? 'on' : ''}" data-act="new-kind" data-v="${k}">${k}</button>`).join('')}</span></span></div>
      <label class="field-row"><span class="bubble sm prim">${icon('note', 18)}</span><span class="main"><span class="k">${F.newKind === '基金' ? 'MoneyDJ 基金代碼' : '代號'}（選填，可之後補）</span><input id="f-nc" data-bind="newCode" value="${esc(F.newCode)}" placeholder="${F.newKind === '基金' ? '例如 ACDD04' : '例如 0050'}" autocomplete="off" autocapitalize="characters" maxlength="20"></span></label>
      <div class="field-row"><span class="bubble sm prim">${icon('currency', 18)}</span><span class="main"><span class="k">幣別</span><span class="chips" style="margin-top:4px">${['TWD', 'USD'].map(c => `<button class="chip ${F.newCur === c ? 'on' : ''}" data-act="new-cur" data-v="${c}">${c}</button>`).join('')}</span></span></div>`;
  }
  if (F.invKind !== 'div') {
    const uw = F.hid === 'new' ? (F.newKind === '基金' ? '單位' : '股') : unitWord(hd);
    const held = hd ? (R.pos[hd.id]?.units || 0) : 0;
    h += `<div class="field-row" style="gap:10px"><span class="bubble sm prim">${icon('stats', 18)}</span>
      <label class="main"><span class="k">${uw === '單位' ? '單位數' : '股數'}${F.invKind === 'sell' && hd ? `（持有 ${fmtUnits(held)}）` : ''}</span><input id="f-units" data-bind="units" inputmode="decimal" value="${esc(F.units)}" placeholder="0" autocomplete="off"></label>
      <label class="main"><span class="k">${holdingKind() === '基金' ? '淨值' : '成交價'}</span><input id="f-price" data-bind="price" inputmode="decimal" value="${esc(F.price)}" placeholder="0.00" autocomplete="off"></label>
      <label class="main"><span class="k">手續費</span><input id="f-fee" data-bind="fee" inputmode="decimal" value="${esc(F.fee)}" placeholder="0" autocomplete="off"></label></div>`;
  }
  h += fieldBtn('pick-acct', 'wallet', F.invKind === 'buy' ? '扣款帳戶' : '入帳帳戶', acctLabel(a), !a);
  h += dateRow() + noteRow() + '</div>';
  // 即時試算
  const amt = F.invKind === 'div' ? num(F.amt) : total;
  if (a && amt > 0) {
    const verb = F.invKind === 'buy' ? `將從「${esc(a.name)}」扣款` : `將入帳到「${esc(a.name)}」`;
    h += `<div class="preview" aria-live="polite">${verb} <b>${esc(money(amt, a.cur))}</b>${isBackfill(S, { date: F.date }) ? '<br><small>日期早於開始使用日，視為「補登」：只計入成本，不影響帳戶餘額</small>' : ''}</div>`;
  }
  if (!hasHold && F.invKind !== 'buy') h += `<p class="note" style="text-align:center">目前還沒有任何持有標的，請先記一筆「買進」。</p>`;
  return h;
}

function onInput(e) {
  const k = e.target.dataset.bind;
  if (!k || !F) return;
  F[k] = e.target.value;
  if (k === 'amt') e.target.style.width = amtWidth(e.target.value);
  if (F.err) { F.err = ''; const er = document.getElementById('f-err'); if (er) er.textContent = ''; }
  // 投資金額試算需要即時更新
  if (F.kind === 'invest' && ['units', 'price', 'fee', 'amt', 'date'].includes(k)) {
    const total = invTotal();
    const amtEl = document.getElementById('f-amt');
    if (F.invKind !== 'div' && amtEl) { amtEl.value = isFinite(total) ? fmtPrice(total).replace(/\.00$/, '') : ''; amtEl.style.width = amtWidth(amtEl.value); }
    const pv = sheet.el.querySelector('.preview');
    const html = render();
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    const npv = tmp.querySelector('.preview');
    if (pv && npv) pv.innerHTML = npv.innerHTML;
    else if (!!pv !== !!npv) refreshSheet(sheet);
  }
}

/* ---------- 選擇器 ---------- */
function pickCategory() {
  const s = openSheet({
    label: '選擇類別',
    render: () => `<div class="grabber"></div>${sheetHead('選擇類別', { back: true })}
      <div class="card"><div class="pick-grid">${CATEGORIES[F.kind].map(c => `<button class="cat-pick ${F.cat === c.name ? 'on' : ''}" data-act="pick" data-v="${esc(c.name)}" style="--h:${c.hue}"><span class="bubble" style="--h:${c.hue}">${icon(c.icon, 22)}</span>${esc(c.name)}</button>`).join('')}</div></div>
      ${F.kind === 'income' ? '<p class="note">配息請改用「投資 → 配息」記錄，才會算進該檔標的的報酬。</p>' : ''}`,
    on: { pick: el => { F.cat = el.dataset.v; closeSheet(s); refreshSheet(sheet); } },
  });
}
function pickAccount(field) {
  const S = store.S;
  let list;
  if (F.kind === 'invest') list = investAccounts(S, holdingCur(), F[field]);
  else list = S.accounts.filter(a => !a.archived || a.id === F[field]);
  if (field === 'to') list = list.filter(a => a.id !== F.acct);
  const title = field === 'to' ? '轉入帳戶' : '選擇帳戶';
  const groups = TYPE_ORDER.map(t => [t, list.filter(a => a.type === t)]).filter(g => g[1].length);
  const s = openSheet({
    label: title,
    render: () => `<div class="grabber"></div>${sheetHead(title, { back: true })}
      ${groups.length ? groups.map(([t, as]) => `<div class="group-head">${ACCOUNT_TYPES[t].label}</div><div class="card" style="padding:2px 14px"><div class="list">${as.map(a => `<button class="row" data-act="pick" data-v="${esc(a.id)}">${bubble(acctIcon(a), 8, 'sm prim')}<span class="main"><span class="t">${esc(a.name)}${a.archived ? '<span class="tag">已封存</span>' : ''}</span><span class="s">餘額 ${esc(money(cashBalance(S, a.id), a.cur))}</span></span>${F[field] === a.id ? `<span class="tag prim">已選</span>` : ''}</button>`).join('')}</div></div>`).join('')
        : `<div class="card"><p class="note" style="text-align:center">${F.kind === 'invest' ? `沒有可用的 ${holdingCur()} 帳戶。投資扣款／入帳帳戶需為同幣別的存款、現金、外幣、證券或基金帳戶。` : '沒有可選的帳戶'}</p></div>`}`,
    on: {
      pick: el => {
        F[field] = el.dataset.v;
        if (field === 'acct' && F.kind === 'transfer' && F.to === F.acct) F.to = '';
        closeSheet(s); refreshSheet(sheet);
      },
    },
  });
}
function pickHolding() {
  const S = store.S;
  const R = replay(S);
  let list = S.holdings.slice();
  if (F.invKind !== 'buy') list = list.filter(h => (R.pos[h.id]?.units || 0) > EPS || h.id === F.hid || F.invKind === 'div');
  const s = openSheet({
    label: '選擇標的',
    render: () => `<div class="grabber"></div>${sheetHead('選擇標的', { back: true })}
      <div class="card" style="padding:2px 14px"><div class="list">
      ${F.invKind === 'buy' ? `<button class="row" data-act="pick" data-v="new"><span class="bubble sm prim">${icon('add', 18)}</span><span class="main"><span class="t">＋ 新標的</span><span class="s">只填名稱就能記，代號可之後再補</span></span></button>` : ''}
      ${list.map(h => `<button class="row" data-act="pick" data-v="${esc(h.id)}">${bubble(h.kind === '基金' ? 'fund' : 'investment', 40, 'sm')}<span class="main"><span class="t">${esc(h.name)}${priceStatus(h) === 'pending' ? '<span class="tag warn">待補代碼</span>' : ''}</span><span class="s">${esc(h.kind)}${h.code ? '・' + esc(h.code) : ''}・持有 ${fmtUnits(R.pos[h.id]?.units || 0)} ${unitWord(h)}</span></span>${F.hid === h.id ? '<span class="tag prim">已選</span>' : ''}</button>`).join('')}
      </div></div>${!list.length && F.invKind !== 'buy' ? '<p class="note" style="text-align:center">目前沒有持有中的標的</p>' : ''}`,
    on: {
      pick: el => {
        F.hid = el.dataset.v;
        const h = holdById(S, F.hid);
        const ok = investAccounts(S, holdingCur()).some(a => a.id === F.acct);
        if (!ok || !F.acct) {
          F.acct = F.invKind === 'buy' ? defaultInvestAccount(S, holdingKind(), holdingCur()) : (h && investAccounts(S, h.cur).find(a => a.id === h.acct)?.id) || defaultInvestAccount(S, holdingKind(), holdingCur());
        }
        if (F.invKind === 'buy' && h && !F.price) { const p = Number(h.price); if (p > 0) F.price = String(p); }
        closeSheet(s); refreshSheet(sheet);
      },
    },
  });
}

/* ---------- 儲存 ---------- */
function fail(msg) { F.err = msg; const er = document.getElementById('f-err'); if (er) er.textContent = msg; else refreshSheet(sheet); return null; }

function buildTx(S) {
  const date = F.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('請選擇日期');
  const a = acctById(S, F.acct);
  const orig = F.id ? S.txs.find(t => t.id === F.id) : null;
  if (!a) return fail(F.kind === 'transfer' ? '請選擇轉出帳戶' : '請選擇帳戶');
  if (a.archived && (!orig || orig.acct !== a.id)) return fail('這個帳戶已封存，請選擇其他帳戶');
  const base = { id: F.id || uid('t'), date, note: F.note.trim(), created: F.created || new Date().toISOString() };
  if (F.kind !== 'invest') {
    const amt = num(F.amt);
    if (!(amt > 0)) return fail('請輸入大於 0 的金額');
    if (F.kind === 'transfer') {
      const b = acctById(S, F.to);
      if (!b) return fail('請選擇轉入帳戶');
      if (b.id === a.id) return fail('轉出與轉入不能是同一個帳戶');
      if (b.archived && (!orig || orig.to !== b.id)) return fail('轉入帳戶已封存，請選擇其他帳戶');
      let amt2 = '';
      if (a.cur !== b.cur) { amt2 = num(F.amt2); if (!(amt2 > 0)) return fail(`跨幣別轉帳請填實際轉入金額（${b.cur}）`); amt2 = r2(amt2); }
      return { tx: { ...base, kind: 'transfer', amt: r2(amt), acct: a.id, to: b.id, amt2 } };
    }
    if (!F.cat) return fail('請選擇類別');
    return { tx: { ...base, kind: F.kind, amt: r2(amt), cat: F.cat, acct: a.id } };
  }
  // 投資
  let hid = F.hid, newHold = null, newAcct = null;
  if (!hid) return fail('請選擇標的');
  if (hid === 'new') {
    if (F.invKind !== 'buy') return fail('新標的請先記一筆「買進」');
    const name = F.newName.trim();
    if (!name) return fail('請填寫標的名稱');
    if (S.holdings.some(h => h.name === name)) return fail('已有同名標的，請直接從清單選擇');
    let home = holdingHomeAccount(S, F.newKind, F.newCur);
    if (!home) { // 沒有證券／基金帳戶就自動建立
      newAcct = { id: uid('a'), name: F.newKind === '基金' ? '基金帳戶' : '證券帳戶', type: F.newKind === '基金' ? 'fund' : 'broker', cur: F.newCur, open: 0, billDay: '', dueDay: '', archived: false };
      home = newAcct.id;
    }
    newHold = { id: uid('h'), acct: home, kind: F.newKind, code: F.newCode.trim().toUpperCase(), name, cur: F.newCur, price: num(F.price) || '', priceDate: date, priceSrc: 'buy', priceErr: '' };
    hid = newHold.id;
  }
  const h = newHold || holdById(S, hid);
  if (!h) return fail('找不到這檔標的，請重新選擇');
  if (a.cur !== h.cur) return fail(`這檔標的是 ${h.cur}，請選擇 ${h.cur} 帳戶`);
  if (['debt', 'insure', 'deposit'].includes(a.type)) return fail('投資扣款／入帳不能使用負債、保險或定存帳戶');
  let tx;
  if (F.invKind === 'div') {
    const amt = num(F.amt);
    if (!(amt > 0)) return fail('請輸入配息金額');
    tx = { ...base, kind: 'div', amt: r2(amt), acct: a.id, hid, units: '', price: '', fee: '' };
  } else {
    const u = num(F.units), p = num(F.price), fee = F.fee === '' ? 0 : num(F.fee);
    if (!(u > 0)) return fail(`請輸入${unitWord(h) === '單位' ? '單位數' : '股數'}`);
    if (!(p > 0)) return fail(`請輸入${h.kind === '基金' ? '淨值' : '成交價'}`);
    if (!(fee >= 0)) return fail('手續費不能是負數');
    const amt = invTotal();
    if (!(amt > 0)) return fail('手續費不能大於成交金額');
    tx = { ...base, kind: F.invKind, amt, acct: a.id, hid, units: u, price: p, fee: fee || '' };
  }
  return { tx, newHold, newAcct };
}

async function save(btn) {
  const S = store.S;
  const built = buildTx(S);
  if (!built) return;
  const { tx, newHold, newAcct } = built;
  const txsAfter = F.id ? S.txs.map(t => (t.id === F.id ? tx : t)) : [...S.txs, tx];
  if (tx.kind === 'sell') {
    const bad = replay({ ...S, holdings: newHold ? [...S.holdings, newHold] : S.holdings }, { txs: txsAfter }).oversell;
    if (bad.length) {
      const held = replay(S, { txs: S.txs.filter(t => t.id !== F.id) }).pos[tx.hid]?.units || 0;
      return fail(`賣出數量超過持有數量（目前持有 ${fmtUnits(held)}）`);
    }
  } else if (F.id) {
    const bad = replay(S, { txs: txsAfter }).oversell;
    if (bad.length) return fail('修改後會造成之後的賣出紀錄超過持有數量，請先調整賣出紀錄');
  }
  const tables = ['txs'];
  if (newHold) tables.push('holdings');
  if (newAcct) tables.push('accounts');
  const wasEdit = !!F.id;
  try {
    await busy(btn, () => commit(d => {
      if (newAcct) d.accounts.push(newAcct);
      if (newHold) d.holdings.push(newHold);
      if (wasEdit) d.txs = d.txs.map(t => (t.id === tx.id ? tx : t)); else d.txs.push(tx);
      // 尚未抓過價的標的，先用最新買進價當現值
      if (tx.kind === 'buy' && !newHold) {
        const hh = d.holdings.find(x => x.id === tx.hid);
        if (hh && hh.priceSrc !== 'auto' && hh.priceSrc !== 'manual') { hh.price = tx.price; hh.priceDate = tx.date; hh.priceSrc = 'buy'; }
        if (!tables.includes('holdings')) tables.push('holdings');
      }
    }, tables), '儲存中…');
  } catch (e) { return fail('儲存失敗：' + e.message); }
  closeSheet(sheet);
  toast(wasEdit ? '已儲存修改' : newAcct ? `已記下，並自動建立「${newAcct.name}」` : '已記下 ✓');
  rerender();
}

async function del() {
  const S = store.S;
  const txsAfter = S.txs.filter(t => t.id !== F.id);
  if (replay(S, { txs: txsAfter }).oversell.length) return fail('刪除這筆會讓之後的賣出超過持有數量，請先刪除或調整之後的賣出紀錄');
  const t = S.txs.find(x => x.id === F.id);
  const ok = await confirmSheet({ title: '刪除這筆紀錄？', message: `${esc(t.date)}・${esc(money(t.amt, (acctById(S, t.acct) || {}).cur))}<br><small class="mut">刪除後帳戶餘額${INVEST_KINDS.includes(t.kind) ? '、持有數量與成本' : ''}會自動還原，無法復原。</small>` });
  if (!ok) return;
  try { await commit(d => { d.txs = d.txs.filter(x => x.id !== t.id); }, ['txs']); }
  catch (e) { return fail('刪除失敗：' + e.message); }
  closeSheet(sheet); toast('已刪除'); rerender();
}

const handlers = {
  kind: el => {
    const k = el.dataset.v; if (k === F.kind) return;
    F.kind = k; F.err = '';
    if (k === 'expense' || k === 'income') { if (!CATEGORIES[k].some(c => c.name === F.cat)) F.cat = k === 'income' ? '薪資' : '餐飲'; }
    if (k === 'invest') { F.hid = F.hid || (store.S.holdings.length ? '' : 'new'); setDefaults(); }
    else { const keep = acctById(store.S, F.acct); if (!keep || keep.archived) F.acct = defaultAccount(store.S, k); if (k === 'transfer' && (!F.to || F.to === F.acct)) F.to = store.S.accounts.find(a => !a.archived && a.id !== F.acct)?.id || ''; }
    refreshSheet(sheet);
  },
  'inv-kind': el => {
    F.invKind = el.dataset.v; F.err = '';
    if (F.invKind !== 'buy' && F.hid === 'new') F.hid = '';
    const h = holdById(store.S, F.hid);
    if (h && !investAccounts(store.S, h.cur).some(a => a.id === F.acct)) F.acct = defaultInvestAccount(store.S, h.kind, h.cur);
    refreshSheet(sheet);
  },
  'new-kind': el => { F.newKind = el.dataset.v; F.acct = defaultInvestAccount(store.S, F.newKind, F.newCur); refreshSheet(sheet); },
  'new-cur': el => { F.newCur = el.dataset.v; F.acct = defaultInvestAccount(store.S, F.newKind, F.newCur); refreshSheet(sheet); },
  'pick-cat': pickCategory,
  'pick-acct': () => pickAccount('acct'),
  'pick-to': () => pickAccount('to'),
  'pick-hold': pickHolding,
  save: el => save(el),
  delete: del,
};
