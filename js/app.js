// 主程式：換頁、底部導覽、事件分派、主題、PWA
import { icon } from './icons.js';
import { store, init, autoRefreshPrices } from './store.js';
import { V, setRenderer, setTxOpener, rerender, openTx } from './bus.js';
import { $, toast, sheetTop, closeSheet, closeAllSheets, refreshSheet } from './ui.js';
import { openTxForm } from './forms.js';
import { applyTouchIcon } from './appicon.js';
import { maybeRemindOnOpen, openManualReminder } from './remind.js';
import * as home from './views/home.js';
import * as ledger from './views/ledger.js';
import * as assets from './views/assets.js';
import * as stats from './views/stats.js';
import * as settings from './views/settings.js';

const VIEWS = { home, ledger, assets, stats, settings };
const NAV = [['home', '首頁', 'home'], ['ledger', '記帳', 'records'], ['add', '新增', 'add'], ['assets', '資產', 'wallet'], ['stats', '統計', 'stats']];

/* ---------- 主題 ---------- */
const mq = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = store.pref.theme === 'auto' ? (mq.matches ? 'dark' : 'light') : store.pref.theme;
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'dark' ? '#241F20' : '#FFF8F4';
}
mq.addEventListener ? mq.addEventListener('change', applyTheme) : mq.addListener(applyTheme);
document.addEventListener('koko-theme', applyTheme);

/* ---------- 畫面 ---------- */
function renderNav() {
  $('#nav').innerHTML = NAV.map(([k, l, ic]) => k === 'add'
    ? `<a href="#add" class="add" data-act="add" aria-label="新增記帳"><span>${icon('add', 28)}</span></a>`
    : `<a href="#${k}" class="${V.route === k ? 'on' : ''}" ${V.route === k ? 'aria-current="page"' : ''}>${icon(ic, 24)}<span>${l}</span></a>`).join('');
}
function render() {
  const view = VIEWS[V.route] || home;
  const main = $('#view');
  const y = window.scrollY;
  main.innerHTML = view.render(store.S);
  view.after && view.after(store.S);
  renderNav();
  document.title = (store.S.settings.appName || '摳摳') + (V.route === 'home' ? '' : `・${{ ledger: '記帳', assets: '資產', stats: '統計', settings: '設定' }[V.route]}`);
  if (render.keepScroll) window.scrollTo(0, y);
  render.keepScroll = true;
  // 開著的 sheet 也要同步更新（例如帳戶詳情）
  const top = sheetTop();
  if (top) refreshSheet(top);
}
setRenderer(render);
setTxOpener(openTxForm);

function route() {
  const r = (location.hash || '#home').slice(1);
  if (r === 'add') { history.replaceState(null, '', '#' + V.route); openTx(); return; }
  const next = VIEWS[r] ? r : 'home';
  if (next !== V.route) { V.route = next; render.keepScroll = false; window.scrollTo(0, 0); }
  closeAllSheets();
  render();
}
window.addEventListener('hashchange', route);

/* ---------- 事件分派 ---------- */
const GLOBAL = {
  'sheet-close': () => closeSheet(),
  add: (el, e) => { e.preventDefault(); openTx(); },
  'edit-tx': el => openTx({ id: el.dataset.id }),
  'open-acct': el => assets.openAccount(el.dataset.id),
  'open-hold': el => assets.openHolding(el.dataset.id),
  'open-manual': () => openManualReminder(),
  'go-accounts': (el, e) => { e.preventDefault(); location.hash = '#settings'; setTimeout(() => assets.openAccountForm(), 50); },
};
function handlerFor(name) {
  const top = sheetTop();
  if (top && top.on && top.on[name]) return top.on[name];
  const view = VIEWS[V.route];
  for (const v of [view, ...Object.values(VIEWS)]) if (v.actions && v.actions[name]) return v.actions[name];
  return GLOBAL[name];
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
  // 在 sheet 打開時，只處理最上層 sheet 內的點擊（避免點到下層）
  const top = sheetTop();
  if (top && !top.el.contains(el)) return;
  const fn = handlerFor(el.dataset.act);
  if (!fn) return;
  if (el.tagName === 'BUTTON' || el.tagName === 'A') { if (el.tagName === 'BUTTON') e.preventDefault(); }
  try { const r = fn(el, e); if (r && r.catch) r.catch(err => { console.error(err); toast(err.message || '發生錯誤', true); }); }
  catch (err) { console.error(err); toast(err.message || '發生錯誤', true); }
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-act-change]');
  if (!el) return;
  const fn = handlerFor(el.dataset.actChange);
  if (fn) Promise.resolve(fn(el, e)).catch(err => toast(err.message, true));
});
document.addEventListener('input', e => {
  const top = sheetTop();
  if (top && top.el.contains(e.target)) { top.onInput && top.onInput(e); return; }
  const view = VIEWS[V.route];
  view.onInput && view.onInput(e);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sheetTop()) { closeSheet(); return; }
  // 表格列、可點擊的非按鈕元素支援 Enter
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-act]')) { e.preventDefault(); e.target.click(); }
});

/* ---------- 啟動 ---------- */
async function start() {
  applyTheme();
  renderNav();
  $('#view').innerHTML = `<div class="loading-screen"><div style="display:grid;place-items:center;gap:10px"><span class="spin" style="width:28px;height:28px;color:var(--primary)"></span>載入中…</div></div>`;
  try { await init(); }
  catch (e) { toast('無法連線到試算表，先顯示上次的資料：' + e.message, true); }
  applyTouchIcon(store.S.settings.iconStyle);
  V.route = VIEWS[(location.hash || '#home').slice(1)] ? location.hash.slice(1) : 'home';
  if (location.hash === '#add') { V.route = 'home'; history.replaceState(null, '', '#home'); render(); openTx(); }
  else render();
  // 本機模式：有網路就自動更新股價與匯率（每 4 小時最多一次）
  autoRefreshPrices().then(r => { if (r && !sheetTop()) render(); maybeRemindOnOpen(); });
  // 從背景切回來超過 10 分鐘，視為重新打開
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 10 * 60 * 1000) autoRefreshPrices().then(r => { if (r && !sheetTop()) render(); maybeRemindOnOpen(); });
  });
  window.addEventListener('online', () => autoRefreshPrices().then(r => { if (r && !sheetTop()) render(); }));
  // 重新回到前景時，若已連線則靜默更新
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !store.remote || sheetTop()) return;
    try { const { reload } = await import('./store.js'); await reload(); render(); } catch { /* 保持舊資料 */ }
  });
}
start();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker && navigator.serviceWorker.register('sw.js').catch(() => { }));
}
