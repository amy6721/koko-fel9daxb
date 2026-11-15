// 共用小工具：格式化、日期、id
const nf0 = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf4 = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 4 });

export const EPS = 1e-6;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 金額：TWD → $1,234（無小數）；USD → US$1,234.56；JPY → ¥1,234；負數用「−」 */
export function money(n, cur = 'TWD') {
  n = Number(n) || 0;
  const a = Math.abs(n);
  const neg = cur === 'USD' ? a >= 0.005 && n < 0 : Math.round(a) > 0 && n < 0;
  const s = cur === 'USD' ? 'US$' + nf2.format(a) : (cur === 'JPY' ? '¥' : '$') + nf0.format(Math.round(a));
  return (neg ? '−' : '') + s;
}
/** 帶正負號（+ / −） */
export function signed(n, cur = 'TWD') {
  const s = money(Math.abs(n), cur);
  if (Math.abs(n) < (cur === 'USD' ? 0.005 : 0.5)) return s;
  return (n < 0 ? '−' : '+') + s;
}
export const fmtUnits = n => nf4.format(Number(n) || 0);
export const fmtPrice = n => nf2.format(Number(n) || 0);
export const fmtInt = n => nf0.format(Math.round(Number(n) || 0));
export function pct(r, digits = 1) {
  if (!isFinite(r)) return '—';
  return (r >= 0 ? '+' : '−') + Math.abs(r * 100).toFixed(digits) + '%';
}
export function shortMoney(v) {
  const a = Math.abs(v);
  const s = a >= 10000 ? (a / 10000).toFixed(a >= 100000 ? 0 : 1) + '萬' : nf0.format(Math.round(a));
  return (v < 0 && Math.round(a) > 0 ? '−' : '') + s;
}

export function uid(prefix = 'x') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 解析使用者輸入的數字（允許千分位逗號） */
export function num(v) {
  if (v === null || v === undefined) return NaN;
  const s = String(v).replace(/,/g, '').trim();
  if (s === '') return NaN;
  return Number(s);
}

/* ---------- 日期（一律用 YYYY-MM-DD 字串，避免時區問題） ---------- */
export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const monthOf = date => date.slice(0, 7);
export function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
export function shiftMonth(m, d) {
  let [y, mo] = m.split('-').map(Number);
  mo += d;
  while (mo < 1) { mo += 12; y--; }
  while (mo > 12) { mo -= 12; y++; }
  return `${y}-${String(mo).padStart(2, '0')}`;
}
export function monthLabel(m) { const [y, mo] = m.split('-'); return `${y} 年 ${Number(mo)} 月`; }
const WK = '日一二三四五六';
export function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function dayLabel(s) { const d = parseDate(s); return `${d.getMonth() + 1}月${d.getDate()}日（${WK[d.getDay()]}）`; }
export function shortDate(s) { const d = parseDate(s); return `${d.getMonth() + 1}/${d.getDate()}`; }
export function fullDate(s) { const d = parseDate(s); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${WK[d.getDay()]}）`; }
/** 某年某月的第 day 日（超過月底則取月底） */
export function clampDate(y, m, day) {
  const dd = Math.min(day, daysInMonth(y, m));
  return `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}
export function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return todayStr(d); }

export const clone = o => JSON.parse(JSON.stringify(o));
