// 由 _assets_src/koko-ui-assets/svg 產生（線條圖示，以 currentColor 上色）
export const ICONS = {
 "add": "<path d=\"M12 5v14M5 12h14\"/>",
 "bank": "<path d=\"m2 8 10-5 10 5zM4 21h16M6 10v8M12 10v8M18 10v8M3 18h18\"/>",
 "bell": "<path d=\"M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 21h4\"/>",
 "calendar": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 3v4M17 3v4M3 10h18\"/>",
 "cash": "<rect x=\"2\" y=\"5\" width=\"20\" height=\"14\" rx=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M5 12h.01M19 12h.01\"/>",
 "chevron-left": "<path d=\"m15 5-7 7 7 7\"/>",
 "chevron-right": "<path d=\"m9 5 7 7-7 7\"/>",
 "close": "<path d=\"m5 5 14 14M19 5 5 19\"/>",
 "clothing": "<path d=\"m8 4-6 4 3 5 3-2v10h8V11l3 2 3-5-6-4c-1 4-7 4-8 0z\"/>",
 "credit-card": "<rect x=\"2\" y=\"5\" width=\"20\" height=\"14\" rx=\"3\"/><path d=\"M2 10h20M6 15h4\"/>",
 "currency": "<path d=\"M12 2v20M17 6H9a4 4 0 0 0 0 8h6a4 4 0 0 1 0 8H7\"/>",
 "daily": "<path d=\"M4 8h16l-1 13H5zM8 8V6a4 4 0 0 1 8 0v2\"/>",
 "deposit": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"3\"/><circle cx=\"12\" cy=\"13\" r=\"4\"/><path d=\"M12 10v3l2 1\"/>",
 "entertainment": "<path d=\"M7 7h10c3 0 5 5 5 9 0 3-3 4-5 1l-2-2H9l-2 2c-2 3-5 2-5-1 0-4 2-9 5-9zM7 10v4M5 12h4M16 11h.01M19 13h.01\"/>",
 "expense": "<path d=\"M12 21V3m-7 7 7-7 7 7\"/>",
 "eye": "<path d=\"M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z\"/><circle cx=\"12\" cy=\"12\" r=\"2.5\"/>",
 "food": "<path d=\"M4 3v6a3 3 0 0 0 6 0V3M7 3v18M19 3c-4 3-4 8 0 9v9M19 3v9\"/>",
 "fund": "<path d=\"M3 20V4h18v16zM7 15l4-5 3 3 4-6\"/>",
 "home": "<path d=\"M3 11 12 3l9 8v10h-6v-7H9v7H3z\"/>",
 "income": "<path d=\"M12 3v18m-7-7 7 7 7-7\"/>",
 "insurance": "<path d=\"m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6\"/>",
 "investment": "<path d=\"M3 21V3M3 21h18M6 16l5-5 4 3 6-8M16 6h5v5\"/>",
 "learning": "<path d=\"m2 8 10-5 10 5-10 5zM6 10v7c4 3 8 3 12 0v-7M22 8v8\"/>",
 "medical": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"4\"/><path d=\"M12 7v10M7 12h10\"/>",
 "note": "<path d=\"m4 16 12-12 4 4L8 20H4zM14 6l4 4\"/>",
 "other": "<circle cx=\"5\" cy=\"12\" r=\"1\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/>",
 "records": "<path d=\"M12 5v16M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2z\"/>",
 "refresh": "<path d=\"M20 8a8 8 0 1 0 0 8M20 3v5h-5\"/>",
 "settings": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"m10 3-1 3-3 1-3 3 2 2-1 3 3 3 3-1 2 4 3-2 3-1 2-3-1-3 2-2-3-3-3 1-2-3z\"/>",
 "stats": "<path d=\"M12 3v9h9A9 9 0 0 0 12 3zM9 4a9 9 0 1 0 11 11H9z\"/>",
 "transfer": "<path d=\"M3 7h18l-4-4M21 17H3l4 4\"/>",
 "transport": "<rect x=\"4\" y=\"3\" width=\"16\" height=\"15\" rx=\"4\"/><path d=\"M4 10h16M7 18l-2 3M17 18l2 3M8 14h.01M16 14h.01\"/>",
 "wallet": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"15\" rx=\"3\"/><path d=\"M3 9V6l14-3v2M21 11h-6a3 3 0 0 0 0 6h6\"/><path d=\"M16 14h.01\"/>"
};

export function icon(name, size = 22, label = '') {
  const body = ICONS[name] || ICONS.other;
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${body}</svg>`;
}
