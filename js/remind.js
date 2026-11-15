// 開啟提醒：需要手動更新的價格（基金淨值、抓價失敗、待補代碼）
import { icon } from './icons.js';
import { esc, num, todayStr, fmtPrice, shortDate } from './util.js';
import { replay, priceStatus, currentPrice } from './calc.js';
import { store, commit, setPref } from './store.js';
import { rerender } from './bus.js';
import { openSheet, refreshSheet, closeSheet, sheetHead, toast, busy, bubble, sheetTop } from './ui.js';

/**
 * 需要手動處理的持股（只算目前還有持有的）：
 * - manual：手動價格，且價格日期不是今天
 * - error：自動抓價失敗
 * - pending：沒有代號，無法自動抓
 * - fund：本機模式的基金（無法自動抓），且價格不是今天的
 */
export function manualItems(S, today = todayStr()) {
  const R = replay(S);
  const out = [];
  for (const h of S.holdings) {
    if ((R.pos[h.id]?.units || 0) <= 1e-6) continue;
    const st = priceStatus(h);
    const fresh = h.priceDate === today;
    let reason = null;
    if (st === 'error') reason = '自動抓價失敗';
    else if (st === 'pending' && !(h.kind === '基金' && !store.remote)) reason = '沒有代號，無法自動抓價';
    else if (st === 'pending' && !fresh) reason = h.priceDate ? `淨值停在 ${shortDate(h.priceDate)}` : '還沒有填過淨值';
    else if (!fresh && (st === 'manual' || (h.kind === '基金' && !store.remote))) reason = h.priceDate ? `價格停在 ${shortDate(h.priceDate)}` : '還沒有填過價格';
    if (reason) out.push({ h, reason, st, price: currentPrice(S, h) });
  }
  return out;
}

const SNOOZE_KEY = 'remindSnooze';
export function shouldRemind(S) {
  if (store.pref.remind === false) return false;
  if (store.pref[SNOOZE_KEY] === todayStr()) return false;
  return manualItems(S).length > 0;
}

let openSheetRef = null;
export function openManualReminder({ fromOpen = false } = {}) {
  if (openSheetRef && openSheetRef.el.isConnected) return;
  const vals = {};
  const s = openSheet({
    label: '需要手動更新',
    render: () => {
      const items = manualItems(store.S);
      let h = `<div class="grabber"></div>${sheetHead('需要手動更新')}`;
      if (!items.length) return h + `<div class="card" style="text-align:center;padding:24px">${icon('bell', 28)}<p style="margin:8px 0 0">都更新好了 ✓</p></div><button class="btn full" data-act="sheet-close">關閉</button>`;
      h += `<p class="note">${fromOpen ? '打開 App 時發現以下項目需要手動更新。' : ''}填入今天的${items.some(i => i.h.kind === '基金') ? '淨值／' : ''}價格後按「儲存」，空白的會略過。</p>`;
      h += `<div class="card" style="padding:4px 14px"><div class="list">${items.map(({ h: x, reason, st, price }) => `
        <div class="row" style="flex-wrap:wrap;row-gap:6px">${bubble(x.kind === '基金' ? 'fund' : 'investment', 40, 'sm')}
          <span class="main"><span class="t">${esc(x.name)}</span><span class="s ${st === 'error' ? 'neg' : ''}">${esc(reason)}・目前 ${x.cur === 'USD' ? 'US$' : ''}${fmtPrice(price)}</span></span>
          <input class="inp num" style="width:110px;min-height:40px;padding:0 10px;font-size:16px" id="rm-${esc(x.id)}" data-hid="${esc(x.id)}" inputmode="decimal" placeholder="${fmtPrice(price)}" value="${esc(vals[x.id] || '')}" aria-label="${esc(x.name)} 新${x.kind === '基金' ? '淨值' : '價格'}">
          ${st === 'pending' && (x.kind !== '基金' || store.remote) ? `<button class="link" style="width:100%;justify-content:flex-end;min-height:32px" data-act="open-hold" data-id="${esc(x.id)}">補上代號就能自動抓價 ${icon('chevron-right', 14)}</button>` : ''}
        </div>`).join('')}</div></div>
        <button class="btn pri full" data-act="save">儲存</button>
        <button class="btn full" data-act="snooze">今天先不要提醒</button>
        <p class="note" style="text-align:center">可以到「設定 → 記帳設定」關掉開啟提醒。</p>`;
      return h;
    },
    onInput: e => { const id = e.target.dataset.hid; if (id) vals[id] = e.target.value; },
    on: {
      save: async el => {
        const upd = {};
        for (const [id, v] of Object.entries(vals)) {
          if (String(v).trim() === '') continue;
          const p = num(v);
          if (!(p > 0)) return toast('價格請填大於 0 的數字', true);
          upd[id] = p;
        }
        if (!Object.keys(upd).length) return toast('還沒有填任何價格', true);
        try {
          await busy(el, () => commit(d => {
            for (const h of d.holdings) if (upd[h.id]) { h.price = upd[h.id]; h.priceSrc = 'manual'; h.priceDate = todayStr(); h.priceErr = ''; }
          }, ['holdings']), '儲存中…');
          for (const k of Object.keys(upd)) delete vals[k];
          toast(`已更新 ${Object.keys(upd).length} 檔價格`);
          rerender();
          if (!manualItems(store.S).length) closeSheet(s); else refreshSheet(s);
        } catch (e) { toast('儲存失敗：' + e.message, true); }
      },
      snooze: () => { setPref({ [SNOOZE_KEY]: todayStr() }); closeSheet(s); toast('今天不再提醒，明天打開時會再提醒'); },
    },
    onClose: () => { openSheetRef = null; },
  });
  openSheetRef = s;
}

/** App 開啟或從背景回來時呼叫 */
export function maybeRemindOnOpen() {
  if (sheetTop()) return;
  if (shouldRemind(store.S)) openManualReminder({ fromOpen: true });
}
