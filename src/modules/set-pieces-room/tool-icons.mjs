const paths = Object.freeze({
  select: '<path d="m5 3 13 8-6 1.5L9 18Z"/><path d="m12 13 5 7"/>',
  "home-player": '<rect x="5" y="5" width="14" height="14" rx="4"/><path d="M9 12h6"/>',
  opponent: '<circle cx="12" cy="12" r="7"/><path d="M9 12h6"/>',
  ball: '<circle cx="12" cy="12" r="7"/><path d="m12 8 2.5 1.8-.9 3h-3.2l-.9-3Z"/><path d="m12 8V5m2.5 4.8 3-1m-3.9 4 1.9 2.5m-5.1-2.5-1.9 2.5m1-5.5-3-1"/>',
  run: '<path d="M5 18c2-7 5-10 12-11"/><path d="m14 4 4 3-3 4"/>',
  pass: '<path d="M4 12h3m3 0h3m3 0h4"/><path d="m17 8 4 4-4 4"/>',
  dribble: '<path d="M4 16c4 0 2-8 6-8s2 8 6 8h4"/><path d="m17 12 4 4-4 4"/>',
  block: '<path d="M5 6v12M9 6v12M9 12h10"/><path d="m16 9 3 3-3 3"/>',
  press: '<circle cx="16" cy="12" r="3"/><path d="M4 6l6 4M4 18l6-4"/><path d="m8 7 2 3-3 .5M8 17l2-3-3-.5"/>',
  mark: '<circle cx="7" cy="12" r="3"/><circle cx="17" cy="12" r="3"/><path d="M10 12h4M12 9v6"/>',
  zone: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="m4 10 6-5m-6 11L16 5m-6 14L20 9m-4 10 4-4"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/>',
  library: '<path d="M4 5h6l2 2h8v12H4Z"/><path d="M4 10h16"/>',
  filter: '<path d="M4 5h16l-6 7v5l-4 2v-7Z"/>',
  "skip-back": '<path d="M6 5v14"/><path d="m18 6-8 6 8 6Z"/>',
  "step-back": '<path d="m15 6-8 6 8 6Z"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  "step-forward": '<path d="m9 6 8 6-8 6Z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
});

export function renderSetPieceToolIcon(tool = "") {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[tool] || paths.select}</svg>`;
}
