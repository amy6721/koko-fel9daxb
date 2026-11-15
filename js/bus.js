// 畫面狀態（只存在記憶體）與重繪掛勾，避免模組互相循環引用
import { monthOf, todayStr } from './util.js';

const thisMonth = monthOf(todayStr());
export const V = {
  route: 'home',
  homeMonth: thisMonth,
  month: thisMonth,          // 記帳頁
  ledgerKind: 'all',         // all / expense / income / transfer / invest
  ledgerCat: '',             // 類別篩選
  statMode: 'cash',          // cash / inv
  statMonth: thisMonth,
  invGran: 'm', invFilt: 'all', invSel: null,
  nwSel: null,
};
let _render = () => { };
export function setRenderer(fn) { _render = fn; }
export function rerender() { _render(); }

let _openTx = () => { };
export function setTxOpener(fn) { _openTx = fn; }
/** 打開「新增／編輯紀錄」，opts: { id, kind, hid, acct } */
export function openTx(opts) { _openTx(opts || {}); }
