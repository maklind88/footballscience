// Presentation-only formations. Player profiles remain the source of names and photos.
export const lineupBoardSlots = Object.freeze([
  { id: 'gk', label: 'GK', x: 50, y: 88 },
  { id: 'lb', label: 'LB', x: 15, y: 68 },
  { id: 'lcb', label: 'LCB', x: 38, y: 68 },
  { id: 'rcb', label: 'RCB', x: 62, y: 68 },
  { id: 'rb', label: 'RB', x: 85, y: 68 },
  { id: 'dm', label: '6', x: 50, y: 49 },
  { id: 'lcm', label: '8', x: 29, y: 34 },
  { id: 'rcm', label: '8', x: 71, y: 34 },
  { id: 'lw', label: 'LW', x: 17, y: 13 },
  { id: 'st', label: '9', x: 50, y: 10 },
  { id: 'rw', label: 'RW', x: 83, y: 13 },
]);
export const escapeLineupHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function normalizeLineupBoard(value) {
  const used = new Set();
  return Object.fromEntries(lineupBoardSlots.flatMap(({id}) => {
    const playerId = typeof value?.[id] === 'string' ? value[id].trim().slice(0, 160) : '';
    if (!playerId || used.has(playerId)) return [];
    used.add(playerId); return [[id, playerId]];
  }));
}
export function assignLineupBoardPlayer(assignments, slot, playerId) {
  const next = normalizeLineupBoard(assignments);
  if (!lineupBoardSlots.some(s => s.id === slot)) return next;
  const previous = next[slot];
  const source = Object.keys(next).find(id => next[id] === playerId);
  if (source && source !== slot) {
    if (previous) next[source] = previous;
    else delete next[source];
  }
  if (playerId) next[slot] = playerId;
  else delete next[slot];
  return normalizeLineupBoard(next);
}
export function lineupInitials(name) {
  return String(name || '?').trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}
export function renderLineupBoard(box, slide, model) {
  const esc = escapeLineupHtml;
  const players = new Map((model.presentationPlayers || []).map(p => [p.id, p]));
  const assignments = normalizeLineupBoard(box.lineup);
  return `<section class="presentation-lineup-board" aria-label="${esc(box.text)} 4-3-3">
    <header data-presentation-drag-text-box="${esc(box.id)}" data-presentation-slide-id="${esc(slide.id)}"><strong>${esc(box.text)}</strong><span>4–3–3</span></header>
    <div class="presentation-lineup-board-pitch">
      <svg class="presentation-lineup-board-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect x="3" y="2" width="94" height="96" rx="1"/><path d="M3 50H97 M32 2V18H68V2 M40 2V8H60V2 M32 98V82H68V98 M40 98V92H60V98"/><ellipse cx="50" cy="50" rx="12" ry="9"/></svg>
      ${lineupBoardSlots.map(slot => {
        const playerId = assignments[slot.id], player = players.get(playerId);
        const name = player?.name || (playerId ? 'Unavailable player' : slot.label);
        const parts = name.trim().split(/\s+/);
        const displayName = playerId && parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name;
        const tag = model.presenting || slide.readOnly ? 'div' : 'button';
        return `<${tag} ${tag === 'button' ? 'type="button"' : ''} class="presentation-lineup-board-slot ${playerId ? 'is-filled' : ''}" data-lineup-slot="${slot.id}" data-lineup-board="${esc(box.id)}" title="${esc(name)}" aria-label="${esc(`${box.text}, ${slot.label}: ${playerId ? name : 'Choose player'}`)}" style="left:${slot.x}%;top:${slot.y}%">
          <span class="presentation-lineup-board-avatar">${player?.photoUrl ? `<img src="${esc(player.photoUrl)}" alt="" draggable="false">` : `<span>${esc(playerId ? lineupInitials(name) : slot.label)}</span>`}</span>
          <span class="presentation-lineup-board-name">${esc(playerId ? displayName : '+ Add')}</span>
        </${tag}>`;
      }).join('')}
    </div></section>`;
}

export function resizeLineupBoardBounds(resize, event) {
  const axis = resize.axis || 'se';
  const dx = (event.clientX - resize.startClientX) / resize.slideWidth * 100;
  const dy = (event.clientY - resize.startClientY) / resize.slideHeight * 100;
  const sx = (axis.includes('w') ? -dx : dx) / resize.startWidth;
  const sy = (axis.includes('n') ? -dy : dy) / resize.startHeight;
  const horizontal = /[ew]/.test(axis), vertical = /[ns]/.test(axis);
  const change = horizontal && vertical ? (Math.abs(sx) >= Math.abs(sy) ? sx : sy) : horizontal ? sx : sy;
  const roomWidth = axis.includes('w') ? resize.startX + resize.startWidth - 2 : 96 - resize.startX;
  const roomHeight = axis.includes('n') ? resize.startY + resize.startHeight - 2 : 96 - resize.startY;
  const scale = Math.max(14 / resize.startWidth, 5 / resize.startHeight,
    Math.min(70 / resize.startWidth, 84 / resize.startHeight, roomWidth / resize.startWidth, roomHeight / resize.startHeight, 1 + change));
  const width = resize.startWidth * scale, height = resize.startHeight * scale;
  return { width, height, fontSize: resize.startFontSize,
    x: resize.startX - (axis.includes('w') ? width - resize.startWidth : 0),
    y: resize.startY - (axis.includes('n') ? height - resize.startHeight : 0),
  };
}
