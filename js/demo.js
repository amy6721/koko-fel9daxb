// 示範資料：以「今天」為基準往前 3 個月產生，方便試用所有功能
import { todayStr, monthOf, shiftMonth, clampDate, addDays } from './util.js';
import { cardInfo } from './calc.js';

export function demoData(today = todayStr()) {
  const cur = monthOf(today);
  const startMonth = shiftMonth(cur, -3);
  const startDate = startMonth + '-01';
  const months = [startMonth, shiftMonth(cur, -2), shiftMonth(cur, -1), cur];
  const d = (m, day) => { const [y, mo] = m.split('-').map(Number); return clampDate(y, mo, day); };
  let n = 0;
  const txs = [];
  const add = t => { if (t.date <= today) txs.push({ id: 'dt' + (++n), note: '', created: `${t.date}T08:${String(n % 60).padStart(2, '0')}:00`, ...t }); };

  const accounts = [
    { id: 'a1', name: '薪轉帳戶', type: 'bank', cur: 'TWD', open: 182400 },
    { id: 'a2', name: '錢包', type: 'cash', cur: 'TWD', open: 4200 },
    { id: 'a3', name: '美元帳戶', type: 'fx', cur: 'USD', open: 2850 },
    { id: 'a4', name: '證券交割戶', type: 'broker', cur: 'TWD', open: 15000 },
    { id: 'a5', name: '基金帳戶', type: 'fund', cur: 'TWD', open: 0 },
    { id: 'a6', name: '儲蓄險', type: 'insure', cur: 'TWD', open: 128000 },
    { id: 'a7', name: '一年期定存', type: 'deposit', cur: 'TWD', open: 300000 },
    { id: 'a8', name: '玫瑰信用卡', type: 'debt', cur: 'TWD', open: 0, billDay: 25, dueDay: 10 },
    { id: 'a9', name: '信貸', type: 'debt', cur: 'TWD', open: -150000 },
  ].map(a => ({ billDay: '', dueDay: '', archived: false, ...a }));

  const holdings = [
    { id: 'h1', acct: 'a4', kind: 'ETF', code: '0050', name: '元大台灣50', cur: 'TWD', price: 61.35, priceSrc: 'auto' },
    { id: 'h2', acct: 'a4', kind: '股票', code: '2330', name: '台積電', cur: 'TWD', price: 1465, priceSrc: 'auto' },
    { id: 'h3', acct: 'a5', kind: '基金', code: 'ACDD04', name: '安聯台灣科技基金', cur: 'TWD', price: 665.8, priceSrc: 'auto' },
    { id: 'h4', acct: 'a5', kind: '基金', code: '', name: '世界科技基金（美元）', cur: 'USD', price: 133.11, priceSrc: 'buy' },
  ].map(h => ({ priceDate: today, priceErr: '', ...h }));

  // 開始使用前就持有的部位（補登）
  const pre = shiftMonth(startMonth, -8);
  add({ date: d(pre, 12), kind: 'buy', acct: 'a4', hid: 'h1', units: 3000, price: 52.8, fee: 225, amt: 3000 * 52.8 + 225, note: '舊部位補登' });
  add({ date: d(pre, 20), kind: 'buy', acct: 'a4', hid: 'h2', units: 60, price: 1040, fee: 88, amt: 60 * 1040 + 88, note: '舊部位補登' });
  add({ date: d(shiftMonth(pre, 2), 6), kind: 'buy', acct: 'a1', hid: 'h3', units: 165.2, price: 581.2, fee: 0, amt: Math.round(165.2 * 581.2), note: '單筆申購（補登）' });
  add({ date: d(shiftMonth(pre, 3), 15), kind: 'buy', acct: 'a3', hid: 'h4', units: 25.31, price: 118.5, fee: 0, amt: Math.round(25.31 * 118.5 * 100) / 100, note: '補登' });

  const fundNav = [612.4, 631.8, 650.3, 665.8];
  const food = [['早餐 蛋餅豆漿', 85], ['午餐便當', 120], ['晚餐 拉麵', 260], ['咖啡', 65], ['超商', 89]];
  months.forEach((mo, i) => {
    add({ date: d(mo, 1), kind: 'expense', cat: '居家', amt: 12000, acct: 'a1', note: '房租' });
    add({ date: d(mo, 1), kind: 'buy', acct: 'a1', hid: 'h3', units: Math.round(3000 / fundNav[i] * 100) / 100, price: fundNav[i], fee: 0, amt: 3000, note: '定期定額' });
    add({ date: d(mo, 5), kind: 'income', cat: '薪資', amt: 52000, acct: 'a1', note: '薪資' });
    for (let k = 0; k < 14; k++) {
      const f = food[(k + i) % food.length];
      add({ date: d(mo, 2 + k * 2), kind: 'expense', cat: '餐飲', amt: f[1] + (k % 3) * 10, acct: k % 4 === 0 ? 'a8' : 'a2', note: f[0] });
    }
    add({ date: d(mo, 4), kind: 'expense', cat: '交通', amt: 1280, acct: 'a8', note: '月票' });
    add({ date: d(mo, 9), kind: 'expense', cat: '日用', amt: 860 + i * 40, acct: 'a8', note: '超市補貨' });
    add({ date: d(mo, 13), kind: 'expense', cat: '娛樂', amt: 390, acct: 'a8', note: '影音串流訂閱' });
    add({ date: d(mo, 18), kind: 'expense', cat: '學習', amt: i % 2 ? 2400 : 680, acct: 'a8', note: i % 2 ? '線上課程' : '書' });
    add({ date: d(mo, 21), kind: 'expense', cat: '醫療', amt: 150 + i * 50, acct: 'a2', note: '門診' });
    add({ date: d(mo, 7), kind: 'transfer', amt: 6000, acct: 'a1', to: 'a2', note: '提款' });
    add({ date: d(mo, 26), kind: 'transfer', amt: 3000, acct: 'a1', to: 'a9', note: '信貸還款' });
    if (i === 1) {
      add({ date: d(mo, 11), kind: 'expense', cat: '服飾', amt: 1890, acct: 'a8', note: '冬季外套' });
      add({ date: d(mo, 16), kind: 'transfer', amt: 30600, acct: 'a1', to: 'a3', amt2: 1000, note: '換美元' });
      add({ date: d(mo, 22), kind: 'div', amt: 3300, acct: 'a4', hid: 'h1', note: '0050 配息' });
      add({ date: d(mo, 20), kind: 'income', cat: '獎金', amt: 8000, acct: 'a1', note: '專案獎金' });
    }
    if (i === 2) add({ date: d(mo, 14), kind: 'sell', acct: 'a4', hid: 'h2', units: 10, price: 1420, fee: 40, amt: 14200 - 40, note: '部分獲利了結' });
  });
  // 本月：提前繳一點卡費（展示「未出帳・已預繳」）
  add({ date: d(cur, 2) <= today ? d(cur, 2) : today, kind: 'expense', cat: '餐飲', amt: 85, acct: 'a2', note: '早餐 蛋餅豆漿' });

  const settings = { appName: '摳摳', iconStyle: 0, startDate, defaultAcct: 'a2', fxUSD: 30.6, priceUpdated: `${today.slice(5).replace('-', '/')} 08:00`, priceUpdatedAt: new Date().toISOString() };
  const S = { settings, accounts, holdings, txs, snapshots: [] };

  // 信用卡：每期帳單在繳款日前 3 天從薪轉帳戶繳清
  const info = cardInfo(S, accounts[7], today);
  for (const b of info.bills) {
    if (b.opening || !b.due) continue;
    const pay = addDays(b.due, -3);
    if (pay <= today) add({ date: pay, kind: 'transfer', amt: b.amount, acct: 'a1', to: 'a8', note: '繳信用卡費' });
  }
  const last = info.current;
  if (last.charges > 0) add({ date: today, kind: 'transfer', amt: 2000, acct: 'a1', to: 'a8', note: '先繳部分卡費' });

  // 月初快照（只存價格與匯率）
  const path = { h1: [57.2, 58.9, 60.1, 61.0], h2: [1310, 1380, 1440, 1450], h3: fundNav, h4: [124.6, 127.9, 131.0, 132.4] };
  const fx = [31.25, 31.02, 30.81, 30.7];
  S.snapshots = months.map((mo, i) => ({ month: mo, date: mo + '-01', fxUSD: fx[i], prices: { h1: path.h1[i], h2: path.h2[i], h3: path.h3[i], h4: path.h4[i] } }));
  return S;
}
