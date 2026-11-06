import { normalizeMotion, motionTimeline } from './presentation-motion.mjs';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function presentationPlayers(state = {}) {
  return (Array.isArray(state.players) ? state.players : []).filter(p => p?.id && !p.archivedAt && p.countsInSquad !== false && (!p.rosterType || p.rosterType === 'squad'))
    .map(p => ({ id: String(p.id), name: String(p.name || 'Player'), photoUrl: /^(https?:\/\/|\/[^/]|assets\/|data:image\/(?:png|jpeg|webp|gif|avif);base64,)/i.test(p.photoUrl || '') ? p.photoUrl : '' }));
}
export function renderObjectTools(model, popover) {
  const players = model.presentationPlayers || [];
  return popover('Players', `<div class="presentation-player-picker"><input type="search" data-presentation-player-search placeholder="Search players" aria-label="Search players"><div>${players.length ? players.map(p => `<button type="button" data-presentation-insert-player="${escape(p.id)}" data-player-name="${escape(p.name.toLowerCase())}" ${p.photoUrl ? '' : 'disabled'}>${p.photoUrl ? `<img src="${escape(p.photoUrl)}" alt="" loading="lazy">` : '<span>No photo</span>'}<span>${escape(p.name)}</span></button>`).join('') : '<p>No squad players available.</p>'}</div></div>`, 'data-presentation-players-menu', { icon: 'players' })
    + popover('Animate', '<div data-presentation-motion-panel class="presentation-motion-panel"></div>', 'data-presentation-motion-menu', { icon: 'animate' });
}
export function createObjectTools({ getRoot, getModel, getTarget, saveStyles, insertPlayer, playback, render }) {
  let pending = null, drag = null;
  let selectedDuration = 600;
  const labels = { 'fade-in': 'Fade in', 'slide-in': 'Slide in', 'zoom-in': 'Zoom in', 'fade-out': 'Fade out', move: 'Move' };
  function context() { const model = getModel(); const slide = model.slides[model.slideIndex]; return { model, slide, styles: slide?.textFieldStyles || {} }; }
  function add(field, effect, duration, point = {}) {
    const { styles } = context();
    if (normalizeMotion(styles[field]?.motion).length >= 24) return;
    const order = Math.max(0, ...motionTimeline(styles).map(s => s.order)) + 1;
    saveStyles({ ...styles, [field]: { ...styles[field], motion: [...normalizeMotion(styles[field]?.motion), { effect, duration, order, ...point }] } });
  }
  function sync() {
    const root = getRoot(), panel = root?.querySelector('[data-presentation-motion-panel]'); if (!panel) return;
    const { model, slide, styles } = context(); if (model.presenting) return;
    if (pending && (pending.slideId !== slide.id || pending.dateValue !== model.dateValue)) { pending = null; drag = null; }
    const target = getTarget(); const steps = motionTimeline(styles);
    const atLimit = normalizeMotion(styles[target?.field]?.motion).length >= 24;
    const objectName = field => {
      const box = slide.textBoxes?.find(box => `textbox.${box.id}.text` === field);
      return String(box?.mediaName || box?.text || ({ 'info.title': 'Title', 'info.body': 'Body', 'info.media': 'Image' })[field] || field.split('.').at(-1)).slice(0, 40);
    };
    panel.innerHTML = `<p>${pending ? 'Drag the selected object to its destination.' : atLimit ? 'Maximum 24 steps per object. Remove a step to add another.' : target?.field ? 'Each step runs on a click.' : 'Select text, a portrait or an image.'}</p>
      <label>Duration <select data-motion-duration aria-label="Animation duration">${[[300,"Fast"],[600,"Normal"],[1000,"Slow"]].map(([value,label]) => `<option value="${value}" ${selectedDuration === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <div class="presentation-motion-effects">${Object.entries(labels).map(([key,label]) => `<button type="button" data-motion-add="${key}" ${target?.field && !atLimit ? '' : 'disabled'}>${label}</button>`).join('')}</div>
      ${pending ? '<button type="button" data-motion-cancel>Cancel destination</button>' : ''}
      <ol>${steps.map((s,i) => `<li><span>${i + 1}. ${escape(labels[s.effect])} · ${escape(objectName(s.field))}</span><button type="button" data-motion-up="${i}" aria-label="Move animation ${i+1} earlier" ${i ? '' : 'disabled'}>↑</button><button type="button" data-motion-delete="${i}" aria-label="Remove animation ${i+1}">×</button></li>`).join('')}</ol>
      <button type="button" data-motion-preview ${steps.length ? '' : 'disabled'}>Preview</button><button type="button" data-motion-next>Next click</button><button type="button" data-motion-stop>Stop preview</button>`;
    let hint = root.querySelector('[data-motion-destination-hint]'); hint?.remove();
    if (pending) { hint = root.ownerDocument.createElement('div'); hint.dataset.motionDestinationHint = ''; hint.className = 'presentation-motion-destination-hint'; hint.textContent = 'Drag selected object to set destination · Esc to cancel'; root.appendChild(hint); }
  }
  return {
    sync,
    cancel() { pending = null; if (drag) drag.el.style.translate = drag.previous; drag = null; },
    input(event) { if (event.target.matches('[data-motion-duration]')) selectedDuration = Number(event.target.value) || 600; if (event.target.matches('[data-presentation-player-search]')) getRoot().querySelectorAll('[data-presentation-insert-player]').forEach(b => { b.hidden = !b.dataset.playerName.includes(event.target.value.toLowerCase().trim()); }); },
    click(event) {
      const button = event.target.closest('button'); if (!button) return false;
      if (button.hasAttribute('data-presentation-insert-player')) { this.cancel(); playback.stop(); insertPlayer(button.dataset.presentationInsertPlayer); return true; }
      const { model, styles } = context();
      if (model.presenting) return false;
      const target = getTarget();
      if (button.hasAttribute('data-motion-add') && target?.field) {
        this.cancel(); playback.stop();
        const duration = Number(getRoot().querySelector('[data-motion-duration]')?.value) || 600;
        const effect = button.dataset.motionAdd;
        if (effect === 'move') { pending = { ...target, duration, dateValue: model.dateValue }; getRoot().querySelector('[data-presentation-motion-menu]')?.removeAttribute('open'); sync(); }
        else add(target.field, effect, duration);
        return true;
      }
      if (button.hasAttribute('data-motion-cancel')) { this.cancel(); sync(); return true; }
      if (button.hasAttribute('data-motion-preview')) { playback.preview(getRoot(), model); playback.step(); return true; }
      if (button.hasAttribute('data-motion-next')) { playback.step(); return true; }
      if (button.hasAttribute('data-motion-stop')) { playback.stop(); render(); return true; }
      const steps = motionTimeline(styles);
      if (button.hasAttribute('data-motion-delete') || button.hasAttribute('data-motion-up')) {
        const i = Number(button.dataset.motionDelete ?? button.dataset.motionUp);
        if (button.hasAttribute('data-motion-delete')) steps.splice(i, 1);
        else if (i > 0) [steps[i-1],steps[i]] = [steps[i],steps[i-1]];
        const next = Object.fromEntries(Object.entries(styles).map(([field, style]) => [field, { ...style, motion: [] }]));
        steps.forEach((s, i) => next[s.field].motion.push({ ...s, order: i + 1 })); saveStyles(next); return true;
      }
      return false;
    },
    down(event) {
      if (!pending || event.button > 0) return false;
      const el = [...getRoot().querySelectorAll('[data-presentation-motion-field]')].find(e => e.dataset.presentationMotionField === pending.field);
      if (!el?.contains(event.target)) return false;
      const rect = el.closest('.presentation-slide').getBoundingClientRect();
      drag = { el, rect, x: event.clientX, y: event.clientY, dx: 0, dy: 0, previous: el.style.translate };
      event.preventDefault(); event.stopImmediatePropagation(); el.setPointerCapture?.(event.pointerId); return true;
    },
    move(event) { if (!drag) return; event.preventDefault(); drag.dx = (event.clientX-drag.x)/drag.rect.width*100; drag.dy = (event.clientY-drag.y)/drag.rect.height*100; drag.el.style.translate = `${event.clientX-drag.x}px ${event.clientY-drag.y}px`; },
    up(event) { if (!drag) return; const point = { x: drag.dx, y: drag.dy }; const target = pending; this.cancel(); if (event.type !== 'pointercancel') add(target.field, 'move', target.duration, point); else render(); },
    escape() { if (!pending) return false; this.cancel(); render(); return true; },
  };
}
