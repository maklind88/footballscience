import { lineupBoardColors, lineupBoardColor, lineupBoardSlots, normalizeLineupBoard, assignLineupBoardPlayer, escapeLineupHtml as esc, lineupInitials } from './presentation-lineup-board.mjs';

export function createLineupBoardEditor({ getRoot, getModel, updateBoxes, select, render, maxBoxes = 12 }) {
  let target = null;
  let query = "";
  function report(message) {
    const node = getRoot()?.querySelector("[data-lineup-save-status]") || getRoot()?.querySelector("[data-lineup-insert-status]");
    if (node) node.textContent = message;
  }
  function context() {
    const model = getModel(), slide = model.slides[model.slideIndex];
    const valid = target && target.date === model.dateValue && target.meetingType === model.meetingType && target.slide === slide?.id && !slide.readOnly && !model.presenting;
    const box = valid && slide.textBoxes?.find(b => b.id === target.box && b.kind === 'lineup');
    return { model, slide, box };
  }
  function close() {
    const previous = target; target = null;
    getRoot()?.querySelector('[data-lineup-picker]')?.remove();
    getRoot()?.querySelectorAll('.is-lineup-editing').forEach(e => e.classList.remove('is-lineup-editing'));
    if (previous) [...(getRoot()?.querySelectorAll('[data-lineup-slot]') || [])].find(e => e.dataset.lineupBoard === previous.box && e.dataset.lineupSlot === previous.slot)?.focus();
  }
  function sync() {
    const { model, box } = context();
    if (!box) { if (target) close(); return; }
    const root = getRoot();
    root.querySelectorAll('[data-lineup-slot]').forEach(e => e.classList.toggle('is-lineup-editing', e.dataset.lineupBoard === box.id && e.dataset.lineupSlot === target.slot));
    let dialog = root.querySelector('[data-lineup-picker]');
    const key = JSON.stringify([target, box.lineup, model.presentationPlayers]);
    if (dialog?.dataset.key === key) return;
    dialog?.remove();
    dialog = root.ownerDocument.createElement('dialog');
    dialog.className = `presentation-lineup-picker${Number(box.x) > 40 ? ' is-left' : ''}`; dialog.dataset.lineupPicker = ''; dialog.dataset.key = key;
    dialog.setAttribute('aria-label', 'Choose lineup player');
    const assignments = normalizeLineupBoard(box.lineup);
    const slot = lineupBoardSlots.find(s => s.id === target.slot);
    dialog.innerHTML = `<header><div><small>${lineupBoardColor(box)} · ${Object.keys(assignments).length}/11</small><h2>${esc(slot.label)} <span>Choose player</span></h2></div><button type="button" data-lineup-done aria-label="Close player selection">×</button></header>
      <p>Choose a player. The next empty position opens automatically.</p>
      <p role="alert" data-lineup-save-status></p><input type="search" value="${esc(query)}" data-lineup-search placeholder="Search players" aria-label="Search lineup players">
      <div class="presentation-lineup-picker-list">${(model.presentationPlayers || []).map(p => {
        const used = lineupBoardSlots.find(s => assignments[s.id] === p.id);
        return `<button type="button" data-lineup-player="${esc(p.id)}" data-player-name="${esc(p.name.toLowerCase())}" aria-pressed="${assignments[target.slot] === p.id}"><span class="presentation-lineup-picker-avatar">${p.photoUrl ? `<img src="${esc(p.photoUrl)}" alt="" loading="lazy">` : esc(lineupInitials(p.name))}</span><span>${esc(p.name)}${used ? `<small>${esc(used.label)} · ${used.id === slot.id ? 'Selected' : 'Swap here'}</small>` : ''}</span></button>`;
      }).join('')}</div><p data-lineup-no-results hidden>No matching players.</p>
      <footer><button type="button" data-lineup-clear ${assignments[slot.id] ? '' : 'disabled'}>Clear position</button><button type="button" data-lineup-done>Done</button></footer>`;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('input', event => {
      if (!event.target.matches('[data-lineup-search]')) return;
      query = event.target.value;
      let visible = 0;
      dialog.querySelectorAll('[data-lineup-player]').forEach(button => { button.hidden = !button.dataset.playerName.includes(event.target.value.trim().toLowerCase()); if (!button.hidden) visible++; });
      dialog.querySelector('[data-lineup-no-results]').hidden = visible > 0;
    });
    root.append(dialog); dialog.showModal();
    const search = dialog.querySelector('input');
    search.dispatchEvent(new root.ownerDocument.defaultView.Event('input', { bubbles: true }));
    search.focus();
  }
  function insert(count) {
    const { model, slide } = context();
    if (!slide || model.presenting || slide.readOnly) return;
    const boxes = slide.textBoxes || [];
    if (boxes.length + count > maxBoxes) {
      const status = getRoot().querySelector('[data-lineup-insert-status]');
      if (status) status.textContent = `This slide has room for ${Math.max(0, maxBoxes - boxes.length)} more objects. Remove an object or use a new slide.`;
      return;
    }
    close();
    const stamp = globalThis.crypto?.randomUUID?.() || String(Date.now());
    const existing = boxes.filter(b => b.kind === 'lineup').length;
    const additions = Array.from({length:count}, (_, i) => ({
      id: `lineup-${stamp}-${i}`, kind: 'lineup', text: (existing + i) % 2 ? "Red" : "Blue",
      x: count === 2 ? 5 + 47 * i : existing === 1 ? 52 : 5, y: 31, width: 43, height: 61, lineup: {},
    }));
    try { updateBoxes(slide.id, current => [...current, ...additions]); }
    catch { report('Could not save the lineup. Please try again.'); return; }
    if (!context().slide.textBoxes?.some(b => b.id === additions[0].id)) { report('Could not save the lineup. Please try again.'); return; }
    select(slide.id, additions[0].id); render();
  }
  function click(event) {
    const el = event.target.closest('[data-lineup-insert],[data-lineup-slot],[data-lineup-player],[data-lineup-clear],[data-lineup-done]');
    if (!el) return false;
    const { model, slide, box } = context();
    if (model.presenting || slide?.readOnly) return false;
    if (el.hasAttribute('data-lineup-insert')) { insert(el.dataset.lineupInsert === '2' ? 2 : 1); return true; }
    if (el.hasAttribute('data-lineup-done')) { close(); return true; }
    if (el.hasAttribute('data-lineup-slot')) {
      query = '';
      target = { date: model.dateValue, meetingType: model.meetingType, slide: slide.id, box: el.dataset.lineupBoard, slot: el.dataset.lineupSlot };
      select(slide.id, target.box); sync(); return true;
    }
    if (!box) { close(); return true; }
    const playerId = el.dataset.lineupPlayer || '';
    if (playerId && !model.presentationPlayers.some(p => p.id === playerId)) return true;
    const next = assignLineupBoardPlayer(box.lineup, target.slot, playerId);
    try { updateBoxes(slide.id, boxes => boxes.map(b => b.id === box.id ? { ...b, lineup: next } : b)); }
    catch { report('This selection could not be saved. Keep the picker open and try again.'); return true; }
    // Only advance after the existing persistence path confirms the new assignment.
    const saved = context().box;
    if (JSON.stringify(normalizeLineupBoard(saved?.lineup)) !== JSON.stringify(next)) { report('This selection could not be saved. Keep the picker open and try again.'); return true; }
    query = '';
    if (playerId) {
      const empty = lineupBoardSlots.find(s => !next[s.id]);
      if (empty) target.slot = empty.id;
      else close();
    }
    render(); return true;
  }
  function change(event) {
    const input = event.target.closest('[data-lineup-color]');
    if (!input) return false;
    const { model, slide } = context();
    const box = slide?.textBoxes?.find(b => b.id === input.dataset.lineupColor && b.kind === 'lineup');
    if (!box || model.presenting || slide.readOnly || !Object.hasOwn(lineupBoardColors, input.value)) return true;
    const color = input.value;
    const failure = () => {
      input.value = lineupBoardColor(box);
      input.closest('header').querySelector('[data-lineup-color-status]').textContent = 'Color could not be saved. Try again.';
    };
    try { updateBoxes(slide.id, boxes => boxes.map(b => b.id === box.id ? { ...b, text: color } : b)); }
    catch { failure(); return true; }
    if (context().slide.textBoxes?.find(b => b.id === box.id)?.text !== color) { failure(); return true; }
    select(slide.id, box.id); render(); return true;
  }
  return { click, change, sync, close, escape() { if (!target) return false; close(); return true; } };
}
