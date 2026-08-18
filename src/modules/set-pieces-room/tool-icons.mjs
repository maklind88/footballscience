const paths = Object.freeze({
  select: '<path d="m5 3 13 8-6 1.5L9 18Z"/><path d="m12 13 5 7"/>',
  "home-player": '<path d="m8 5 2-2h4l2 2 4 2-2 5-2-1v9H8v-9l-2 1-2-5Z"/><path d="M10 3c.4 1.5 3.6 1.5 4 0"/>',
  opponent: '<circle cx="12" cy="12" r="8"/><path d="M10 9h2v6m-2 0h5"/>',
  ball: '<circle cx="12" cy="12" r="8"/><path d="m12 8 2.5 1.8-.9 3h-3.2l-.9-3Z"/><path d="m12 8-2.7-2m5.2 3.8 3-1.1m-3.9 4.1 1.8 2.8m-5-2.8-1.8 2.8m.9-5.8-3-1.1"/>',
  run: '<circle cx="5" cy="18" r="1.4"/><path d="M6.5 17c1.2-6.2 4.4-9.4 10.5-10"/><path d="m14 4 4 2.5-2.6 4"/>',
  pass: '<circle cx="5" cy="12" r="2"/><path d="M8.5 12H19" stroke-dasharray="2 2"/><path d="m16 8 4 4-4 4"/>',
  dribble: '<circle cx="4.5" cy="16.5" r="1.6"/><path d="M7 16c2.2 0 1.4-5 4-5s1.8 5 4.2 5H20"/><path d="m17 13 3 3-3 3"/>',
  block: '<path d="M6 5v14M18 5v14M6 12h12"/><path d="M3.5 8v8M20.5 8v8"/>',
  press: '<circle cx="18" cy="12" r="2.6"/><path d="m4 6 8 4m-8 8 8-4"/><path d="m9 7.5 3 2.5-3 .7m0 5.8 3-2.5-3-.7"/>',
  mark: '<circle cx="6.5" cy="12" r="2.7"/><circle cx="17.5" cy="12" r="2.7"/><path d="M9.5 12h5" stroke-dasharray="1.5 1.5"/><path d="m12.5 9.5 2.5 2.5-2.5 2.5"/>',
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
  undo: '<path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6"/>',
  redo: '<path d="m15 7 5 5-5 5"/><path d="M20 12H10a6 6 0 0 0-6 6"/>',
  details: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/><path d="M18 8h.01M18 12h.01M18 16h.01"/>',
});

export function renderSetPieceToolIcon(tool = "") {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[tool] || paths.select}</svg>`;
}
