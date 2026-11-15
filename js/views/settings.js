// 設定：App 外觀、記帳設定、帳戶、資料連線、備份
import { icon } from '../icons.js';
import { esc, money, num, todayStr } from '../util.js';
import { ACCOUNT_TYPES, TYPE_ORDER, accountValueTWD, replay, isCard } from '../calc.js';
import { store, commit, connect, disconnect, testConnection, remoteHasData, reload, setPref, replaceAll, exportJSON, emptyState as emptyData, parseImport, mergeImport } from '../store.js';
import { rerender } from '../bus.js';
import { m, bubble, acctIcon, toast, busy, confirmSheet, openSheet, closeSheet, refreshSheet, sheetHead } from '../ui.js';
import { openAccountForm } from './assets.js';
import { ICON_STYLES, appIconSVG, applyTouchIcon } from '../appicon.js';
import { demoData } from '../demo.js';

const draft = { name: null, url: null, key: null };

export function render(S) {
  if (draft.name === null) draft.name = S.settings.appName || '摳摳';
  if (draft.url === null) { draft.url = store.conn.url; draft.key = store.conn.key; }
  const R = replay(S);
  const status = store.remote ? (store.online === false ? `<span class="tag bad">連線失敗</span>` : store.online ? '<span class="tag ok">已連線</span>' : '<span class="tag">連線中…</span>') : '<span class="tag warn">本機模式</span>';
  let h = `<div class="topbar"><a class="icon-btn" href="#home" aria-label="返回首頁">${icon('chevron-left', 22)}</a><h1>設定</h1></div>`;

  h += `<section class="card" style="display:flex;flex-direction:column;gap:14px"><h2 style="font-size:16px;margin:0">App 外觀</h2>
    <div style="display:flex;gap:14px;align-items:center">${appIconSVG(S.settings.iconStyle, 64)}<div style="flex:1;min-width:0"><label class="field"><span class="lbl">主畫面圖示下方的名稱（2～6 字）</span>
      <div style="display:flex;gap:8px"><input class="inp" id="s-name" data-bind="name" value="${esc(draft.name)}" maxlength="6" autocomplete="off"><button class="btn" data-act="save-name">儲存</button></div></label></div></div>
    <div class="field"><span class="lbl">圖示樣式</span><div class="icon-opts">${ICON_STYLES.map((st, i) => `<button class="icon-opt ${S.settings.iconStyle === i ? 'on' : ''}" data-act="icon-style" data-v="${i}" aria-pressed="${S.settings.iconStyle === i}">${appIconSVG(i, 52)}${esc(st.name)}</button>`).join('')}</div></div>
    <div class="field"><span class="lbl">深色模式</span><div class="seg soft">${[['auto', '跟隨系統'], ['light', '淺色'], ['dark', '深色']].map(([k, l]) => `<button class="${store.pref.theme === k ? 'on' : ''}" data-act="theme" data-v="${k}">${l}</button>`).join('')}</div></div>
  </section>`;

  h += `<section class="card" style="display:flex;flex-direction:column;gap:14px"><h2 style="font-size:16px;margin:0">記帳設定</h2>
    <label class="field"><span class="lbl">開始使用日</span><input class="inp" type="date" data-act-change="start-date" value="${esc(S.settings.startDate)}" max="${todayStr()}"></label>
    <p class="note" style="margin-top:-8px">帳戶的期初餘額是這一天的餘額。日期早於這天的投資紀錄視為「補登」，只算進成本，不影響帳戶餘額。</p>
    <label class="field"><span class="lbl">預設帳戶（記帳時預先選好）</span><select class="inp" data-act-change="default-acct"><option value="">自動（優先選現金、存款）</option>${S.accounts.filter(a => !a.archived).map(a => `<option value="${esc(a.id)}" ${S.settings.defaultAcct === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
    <div class="two"><label class="field"><span class="lbl">美元匯率（1 USD＝幾台幣）</span><input class="inp num" inputmode="decimal" data-act-change="fx" data-cur="USD" value="${esc(S.settings.fxUSD)}"></label>
      <label class="field"><span class="lbl">日圓匯率（1 JPY＝幾台幣）</span><input class="inp num" inputmode="decimal" data-act-change="fx" data-cur="JPY" value="${esc(S.settings.fxJPY)}"></label></div>
    <p class="note" style="margin-top:-8px">有網路時會自動更新匯率。</p>
  </section>`;

  h += `<section class="card"><div class="sec-head"><h2>帳戶</h2><button class="btn sm soft" data-act="new-acct">${icon('add', 16)}新增帳戶</button></div>`;
  if (!S.accounts.length) h += `<p class="note">還沒有帳戶。先建立常用的銀行、現金、信用卡帳戶吧。</p>`;
  for (const ty of TYPE_ORDER) {
    const list = S.accounts.filter(a => a.type === ty);
    if (!list.length) continue;
    h += `<div class="group-head" style="margin-top:8px">${ACCOUNT_TYPES[ty].label}</div><div class="list">${list.map(a => `<button class="row" data-act="edit-acct" data-id="${esc(a.id)}">${bubble(acctIcon(a), 8, 'sm prim')}<span class="main"><span class="t">${esc(a.name)}${a.archived ? '<span class="tag">已封存</span>' : ''}${S.settings.defaultAcct === a.id ? '<span class="tag prim">預設</span>' : ''}</span><span class="s">${a.cur}${isCard(a) ? `・結帳日 ${a.billDay} 日／繳款日 ${a.dueDay} 日` : ''}</span></span><span class="v">${m(accountValueTWD(S, a, R))}</span></button>`).join('')}</div>`;
  }
  h += '</section>';

  h += `<section class="card" style="display:flex;flex-direction:column;gap:12px"><div class="sec-head"><h2>資料連線（Google 試算表）</h2>${status}</div>
    ${store.remote ? `<p class="note">資料儲存在你的 Google 試算表。${store.online === false ? `<span class="neg">${esc(store.lastError)}</span>` : ''}</p>
      <div class="two"><button class="btn" data-act="reload">重新載入</button><button class="btn danger" data-act="disconnect">中斷連線</button></div>`
      : `<p class="note">目前資料只存在這支手機的瀏覽器裡，清除瀏覽器資料或換手機就會消失。建議依照 README 部署 Apps Script 後在這裡連線。</p>
      <label class="field"><span class="lbl">Apps Script 網址</span><input class="inp" id="s-url" data-bind="url" value="${esc(draft.url)}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" inputmode="url"></label>
      <label class="field"><span class="lbl">存取金鑰（執行 setup 後取得）</span><input class="inp" id="s-key" data-bind="key" value="${esc(draft.key)}" placeholder="例如 k-xxxxxxxx" autocomplete="off"></label>
      <button class="btn pri" data-act="connect">測試並連線</button>`}
  </section>`;

  h += `<section class="card" style="display:flex;flex-direction:column;gap:10px"><h2 style="font-size:16px;margin:0">備份與資料</h2>
    <div class="two"><button class="btn" data-act="export">匯出備份</button><label class="btn" style="cursor:pointer">匯入備份<input type="file" accept="application/json,.json" data-act-change="import" hidden></label></div>
    <button class="btn soft" data-act="paste-import">${icon('note', 18)}貼上文字匯入</button>
    <button class="btn" data-act="load-demo">載入示範資料</button>
    <button class="btn danger" data-act="clear">清除所有資料</button>
    <p class="note">匯入、示範資料、清除都會取代目前所有資料${store.remote ? '（包含試算表裡的資料）' : ''}，執行前會再確認一次。</p></section>`;

  h += `<section class="card" style="display:flex;flex-direction:column;gap:6px"><h2 style="font-size:16px;margin:0">加到手機主畫面</h2>
    <p class="note"><b>iPhone</b>：用 Safari 打開網址 → 分享 → 加入主畫面。</p>
    <p class="note"><b>Android</b>：用 Chrome 打開網址 → 右上選單 → 加到主畫面（或「安裝應用程式」）。</p>
    <p class="note">從主畫面打開時會全螢幕顯示，沒有網址列。</p></section>
  <p class="note" style="text-align:center">摳摳 v1.3</p>`;
  return h;
}

async function guardReplace(title) {
  return confirmSheet({ title, message: `目前所有資料${store.remote ? '（包含試算表）' : ''}都會被取代，無法復原。<br><small class="mut">建議先「匯出備份」。</small>`, okText: '確定取代' });
}

export const actions = {
  'save-name': async el => {
    const n = draft.name.trim();
    if (n.length < 1 || n.length > 6) return toast('名稱請填 1～6 個字', true);
    try { await busy(el, () => commit(d => { d.settings.appName = n; }, ['settings']), '…'); toast('已儲存'); document.title = n; rerender(); }
    catch (e) { toast('儲存失敗：' + e.message, true); }
  },
  'icon-style': async el => {
    const v = Number(el.dataset.v);
    try { await commit(d => { d.settings.iconStyle = v; }, ['settings']); applyTouchIcon(v); toast('已套用。若已加到主畫面，需移除後重新加入才會換圖示'); rerender(); }
    catch (e) { toast('儲存失敗：' + e.message, true); }
  },
  theme: el => { setPref({ theme: el.dataset.v }); document.dispatchEvent(new Event('koko-theme')); rerender(); },
  'start-date': async el => {
    const v = el.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return toast('請選擇日期', true);
    if (v > todayStr()) { el.value = store.S.settings.startDate; return toast('開始使用日不能是未來', true); }
    try { await commit(d => { d.settings.startDate = v; }, ['settings']); toast('已更新開始使用日'); rerender(); }
    catch (e) { toast('儲存失敗：' + e.message, true); el.value = store.S.settings.startDate; }
  },
  'default-acct': async el => {
    try { await commit(d => { d.settings.defaultAcct = el.value; }, ['settings']); toast('已更新預設帳戶'); rerender(); }
    catch (e) { toast('儲存失敗：' + e.message, true); }
  },
  fx: async el => {
    const v = num(el.value);
    const k = 'fx' + (el.dataset.cur || 'USD');
    if (!(v > 0)) { el.value = store.S.settings[k]; return toast('匯率請填大於 0 的數字', true); }
    try { await commit(d => { d.settings[k] = v; }, ['settings']); toast('已更新匯率'); rerender(); }
    catch (e) { toast('儲存失敗：' + e.message, true); }
  },
  'edit-acct': el => openAccountForm(el.dataset.id),
  connect: async el => {
    const conn = { url: draft.url.trim(), key: draft.key.trim() };
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(conn.url)) return toast('請貼上 Apps Script 網頁應用程式網址（https://script.google.com/…/exec）', true);
    if (!conn.key) return toast('請填寫存取金鑰', true);
    try {
      await busy(el, async () => {
        await testConnection(conn);
        const remoteHas = await remoteHasData(conn);
        const localHas = store.S.accounts.length + store.S.txs.length > 0;
        let upload = false;
        if (!remoteHas && localHas) upload = await confirmSheet({ title: '上傳目前的資料？', message: '試算表目前是空的。要把這支手機上的資料上傳到試算表嗎？', okText: '上傳', danger: false });
        else if (remoteHas && localHas) {
          if (!await confirmSheet({ title: '改用試算表的資料？', message: '試算表裡已經有資料，連線後會改用試算表的資料，這支手機上的資料會被取代。', okText: '改用試算表資料' })) throw new Error('已取消連線');
        }
        await connect(conn, { upload });
      }, '連線中…');
      toast('已連線到 Google 試算表 ✓'); rerender();
    } catch (e) { toast(e.message, true); }
  },
  reload: async el => {
    try { await busy(el, () => reload(), '載入中…'); toast('已重新載入'); } catch (e) { toast(e.message, true); }
    rerender();
  },
  disconnect: async () => {
    if (!await confirmSheet({ title: '中斷連線？', message: '中斷後會改用本機模式，資料仍保留在試算表，之後可以再連線。', okText: '中斷連線' })) return;
    disconnect(); draft.url = null; toast('已中斷連線'); rerender();
  },
  export: () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `摳摳備份-${todayStr()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('已匯出備份檔');
  },
  import: async el => {
    const file = el.files && el.files[0];
    el.value = '';
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); if (!data || !Array.isArray(data.accounts)) throw new Error(); }
    catch { return toast('檔案格式不正確，請選擇「匯出備份」產生的 JSON 檔', true); }
    if (!await guardReplace('匯入備份？')) return;
    try { await replaceAll(data); toast('已匯入備份'); rerender(); } catch (e) { toast('匯入失敗：' + e.message, true); }
  },
  'paste-import': () => openPasteImport(),
  'load-demo': async () => {
    if ((store.S.accounts.length || store.S.txs.length) && !await guardReplace('載入示範資料？')) return;
    try { await replaceAll(demoData()); toast('已載入示範資料，可到設定「清除所有資料」後開始正式使用'); location.hash = '#home'; rerender(); }
    catch (e) { toast('載入失敗：' + e.message, true); }
  },
  clear: async () => {
    if (!await guardReplace('清除所有資料？')) return;
    try { await replaceAll(emptyData()); toast('已清除所有資料'); rerender(); } catch (e) { toast('清除失敗：' + e.message, true); }
  },
};
export function onInput(e) { const k = e.target.dataset.bind; if (k && k in draft) draft[k] = e.target.value; }

/* ---------- 貼上文字匯入 ---------- */
function openPasteImport() {
  const st = { text: '', parsed: null, err: '' };
  const isEmpty = () => !store.S.accounts.length && !store.S.txs.length;
  const s = openSheet({
    full: true, label: '貼上文字匯入',
    render: () => {
      let h = sheetHead('貼上文字匯入');
      if (!st.parsed) {
        h += `<p class="note">把整理好的資料文字整段複製，長按下面的框框選「貼上」，再按「讀取資料」。</p>
          <textarea class="inp" id="imp-text" data-bind="text" rows="10" style="min-height:220px;padding:12px;font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.4" placeholder="在這裡長按 → 貼上" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">${esc(st.text)}</textarea>
          <div class="err" role="alert">${esc(st.err)}</div>
          <button class="btn pri full" data-act="read">讀取資料</button>
          <p class="note">貼上的文字只會存在這支手機裡，不會上傳到任何地方。</p>`;
        return h;
      }
      const { data, problems } = st.parsed;
      const inv = data.txs.filter(t => ['buy', 'sell', 'div'].includes(t.kind)).length;
      const dates = data.txs.map(t => t.date).sort();
      h += `<section class="card"><h2 style="font-size:16px;margin:0 0 10px">讀到的資料</h2><dl class="kv">
          <dt>帳戶</dt><dd>${data.accounts.length} 個</dd>
          <dt>記帳紀錄</dt><dd>${data.txs.length - inv} 筆</dd>
          <dt>投資紀錄</dt><dd>${inv} 筆</dd>
          <dt>投資標的</dt><dd>${data.holdings.length} 檔</dd>
          ${dates.length ? `<dt>日期範圍</dt><dd>${esc(dates[0])} ～ ${esc(dates[dates.length - 1])}</dd>` : ''}
          ${data.settings.startDate ? `<dt>開始使用日</dt><dd>${esc(data.settings.startDate)}</dd>` : ''}
        </dl>
        ${data.accounts.length ? `<div class="lbl" style="margin-top:12px">帳戶</div><p style="margin:4px 0 0;font-size:14px">${data.accounts.map(a => esc(a.name)).join('、')}</p>` : ''}</section>`;
      if (problems.length) {
        h += `<div class="banner" style="flex-direction:column;align-items:flex-start;background:color-mix(in srgb,var(--expense) 12%,transparent)"><b>有 ${problems.length} 個問題，請修正後再匯入：</b>
          <ul style="margin:4px 0 0;padding-left:1.2em">${problems.slice(0, 8).map(p => `<li>${esc(p)}</li>`).join('')}${problems.length > 8 ? `<li>…還有 ${problems.length - 8} 個</li>` : ''}</ul></div>
          <button class="btn full" data-act="back">重新貼上</button>`;
        return h;
      }
      if (isEmpty()) h += `<button class="btn pri full" data-act="replace">匯入</button>`;
      else h += `<p class="note">手機裡已經有資料，請選擇匯入方式：</p>
        <button class="btn pri full" data-act="merge">加入到現有資料</button>
        <p class="note" style="text-align:center;margin-top:-6px">保留現有資料，只加入新的（重複的會略過）</p>
        <button class="btn full danger" data-act="replace">取代全部資料</button>
        <p class="note" style="text-align:center;margin-top:-6px">刪除手機上現有的資料，只留匯入的資料</p>`;
      h += `<button class="btn full" data-act="back">重新貼上</button>`;
      return h;
    },
    onInput: e => { if (e.target.dataset.bind === 'text') { st.text = e.target.value; st.err = ''; } },
    on: {
      read: () => {
        if (!st.text.trim()) { st.err = '請先貼上資料文字'; return refreshSheet(s); }
        try { st.parsed = parseImport(st.text); st.err = ''; }
        catch (e) { st.err = e.message; }
        refreshSheet(s);
      },
      back: () => { st.parsed = null; refreshSheet(s); },
      merge: async el => {
        try {
          const n = await busy(el, () => mergeImport(st.parsed.data), '匯入中…');
          closeSheet(s); toast(`已加入 ${n.accounts} 個帳戶、${n.txs} 筆紀錄、${n.holdings} 檔標的`); location.hash = '#home'; rerender();
        } catch (e) { toast('匯入失敗：' + e.message, true); }
      },
      replace: async el => {
        if (!isEmpty() && !await guardReplace('取代全部資料？')) return;
        const data = st.parsed.data;
        if (!data.settings.startDate) data.settings.startDate = store.S.settings.startDate;
        try {
          await busy(el, () => replaceAll({ ...data, settings: { ...store.S.settings, ...pickSettings(data.settings) } }), '匯入中…');
          closeSheet(s); toast('匯入完成 ✓'); location.hash = '#home'; rerender();
        } catch (e) { toast('匯入失敗：' + e.message, true); }
      },
    },
  });
}
function pickSettings(o) {
  const out = {};
  for (const k of ['startDate', 'defaultAcct', 'fxUSD', 'fxJPY', 'appName', 'iconStyle']) if (o[k] !== undefined && o[k] !== '') out[k] = o[k];
  return out;
}
