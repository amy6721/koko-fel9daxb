// 本機模式抓價：手機直接向允許跨網站讀取的公開資料源抓價格
// 股票／ETF：鉅亨網（主要）→ 證交所（上市備用）→ FinMind（上市櫃備用）
// 美元匯率：ExchangeRate-API
// 基金淨值：目前找不到允許手機直接讀取的來源，需手動填寫
import { todayStr, addDays } from './util.js';

const TIMEOUT = 10000;

async function getJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

/** 把代號轉成鉅亨網格式：台股 TWS:0050:STOCK；美股 USS:AAPL:STOCK */
function cnyesSymbol(h) {
  let c = String(h.code || '').trim().toUpperCase();
  if (c.includes(':')) c = c.split(':').pop(); // 例如 NASDAQ:AAPL、TPE:0050
  c = c.replace(/\.(TW|TWO)$/, '');
  return h.cur === 'USD' ? `USS:${c}:STOCK` : `TWS:${c}:STOCK`;
}
const plainCode = h => String(h.code || '').trim().toUpperCase().split(':').pop().replace(/\.(TW|TWO)$/, '');

const tsDate = sec => (sec ? todayStr(new Date(sec * 1000)) : todayStr());

/** 鉅亨網：可一次查多檔，回傳 { symbol: {price, date} } */
async function fromCnyes(list) {
  const out = {};
  const syms = [...new Set(list.map(cnyesSymbol))];
  for (let i = 0; i < syms.length; i += 20) {
    const chunk = syms.slice(i, i + 20);
    try {
      const j = await getJSON(`https://ws.api.cnyes.com/ws/api/v1/quote/quotes/${chunk.map(encodeURIComponent).join(',')}?column=G`);
      for (const q of (Array.isArray(j.data) ? j.data : [])) {
        const p = Number(q['6']);
        if (q['0'] && p > 0) out[q['0']] = { price: p, date: tsDate(Number(q['200007'])) };
      }
    } catch { /* 交給備用來源 */ }
  }
  return out;
}

/** 證交所（只有上市股票、ETF） */
async function fromTwse(code) {
  const j = await getJSON(`https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_AVG?stockNo=${encodeURIComponent(code)}&response=json`);
  if (j.stat !== 'OK' || !Array.isArray(j.data)) throw new Error('證交所查無資料');
  for (let i = j.data.length - 1; i >= 0; i--) {
    const [d, c] = j.data[i];
    const m = /^(\d{2,3})\/(\d{2})\/(\d{2})$/.exec(String(d).trim());
    const p = Number(String(c).replace(/,/g, ''));
    if (m && p > 0) return { price: p, date: `${Number(m[1]) + 1911}-${m[2]}-${m[3]}` };
  }
  throw new Error('證交所查無收盤價');
}

/** FinMind（上市、上櫃都有） */
async function fromFinMind(code) {
  const j = await getJSON(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${encodeURIComponent(code)}&start_date=${addDays(todayStr(), -14)}`);
  const rows = Array.isArray(j.data) ? j.data : [];
  const last = rows.filter(r => Number(r.close) > 0).pop();
  if (!last) throw new Error('FinMind 查無資料');
  return { price: Number(last.close), date: last.date };
}

export async function fetchUsdTwd() {
  const j = await getJSON('https://open.er-api.com/v6/latest/USD');
  const r = Number(j && j.rates && j.rates.TWD);
  if (!(r > 0)) throw new Error('匯率資料格式不符');
  return r;
}

/**
 * 依標的清單抓價。回傳 { prices: {hid: {price, date, src}}, errors: {hid: 訊息}, skipped: [hid], fx }
 */
export async function fetchPrices(holdings) {
  const stocks = holdings.filter(h => h.code && h.kind !== '基金');
  const skipped = holdings.filter(h => h.kind === '基金').map(h => h.id);
  const prices = {}, errors = {};
  const [cn, fx] = await Promise.all([
    fromCnyes(stocks),
    fetchUsdTwd().catch(() => null),
  ]);
  await Promise.all(stocks.map(async h => {
    const hit = cn[cnyesSymbol(h)];
    if (hit) { prices[h.id] = { ...hit, src: '鉅亨網' }; return; }
    if (h.cur === 'USD') { errors[h.id] = '找不到代號 ' + h.code; return; }
    const code = plainCode(h);
    try { prices[h.id] = { ...(await fromTwse(code)), src: '證交所' }; return; } catch { }
    try { prices[h.id] = { ...(await fromFinMind(code)), src: 'FinMind' }; return; } catch { }
    errors[h.id] = '找不到代號 ' + h.code;
  }));
  return { prices, errors, skipped, fx };
}
