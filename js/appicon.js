// App 主畫面圖示（三種樣式）。設定頁預覽用，也會即時套用到 iPhone 的 apple-touch-icon
export const ICON_STYLES = [
  { name: '蜜桃貓掌', bg: '#E79A9E', fg: '#FFF8F4' },
  { name: '奶油貓掌', bg: '#FFF1EA', fg: '#D98085' },
  { name: '摳字金幣', bg: '#F6D7D3', fg: '#3E3431' },
];

export function appIconSVG(style = 0, size = 64) {
  const s = ICON_STYLES[style] || ICON_STYLES[0];
  let inner;
  if (style === 2) {
    inner = `<circle cx="50" cy="52" r="30" fill="#F2C46B"/><circle cx="50" cy="52" r="24" fill="none" stroke="#C99A3A" stroke-width="2.5"/>
      <text x="50" y="64" text-anchor="middle" font-family="'PingFang TC','Noto Sans TC',sans-serif" font-weight="800" font-size="31" fill="${s.fg}">摳</text>`;
  } else {
    inner = `<g fill="${s.fg}"><ellipse cx="50" cy="62" rx="19" ry="16"/><ellipse cx="29" cy="42" rx="7.5" ry="9.5" transform="rotate(-18 29 42)"/>
      <ellipse cx="42" cy="31" rx="7.5" ry="10"/><ellipse cx="58" cy="31" rx="7.5" ry="10"/><ellipse cx="71" cy="42" rx="7.5" ry="9.5" transform="rotate(18 71 42)"/></g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><rect width="100" height="100" rx="${size >= 120 ? 0 : 22}" fill="${s.bg}"/>${inner}</svg>`;
}

/** 把選好的圖示畫成 PNG，設為 apple-touch-icon（iPhone 加到主畫面時使用） */
export function applyTouchIcon(style) {
  try {
    const svg = appIconSVG(style, 180).replace('rx="0"', 'rx="0"');
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 180;
      c.getContext('2d').drawImage(img, 0, 0, 180, 180);
      let link = document.querySelector('link[rel="apple-touch-icon"]');
      if (!link) { link = document.createElement('link'); link.rel = 'apple-touch-icon'; document.head.appendChild(link); }
      link.href = c.toDataURL('image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  } catch { /* 不支援時沿用預設圖示 */ }
}
