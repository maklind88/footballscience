const effects = new Set(['fade-in', 'slide-in', 'zoom-in', 'fade-out', 'move']);
export function normalizeMotion(value) {
  return (Array.isArray(value) ? value : []).slice(0, 24).filter(s => s && effects.has(s.effect)).map((s, i) => ({
    effect: s.effect, order: Math.max(1, Math.min(999, Number(s.order) || i + 1)),
    duration: Math.max(100, Math.min(5000, Number(s.duration) || 500)),
    x: Math.max(-200, Math.min(200, Number(s.x) || 0)), y: Math.max(-200, Math.min(200, Number(s.y) || 0)),
  }));
}
export function motionTimeline(styles = {}) {
  return Object.entries(styles).flatMap(([field, style]) => normalizeMotion(style.motion).map((step, index) => ({ ...step, field, index })))
    .sort((a, b) => a.order - b.order || a.field.localeCompare(b.field) || a.index - b.index);
}
export function createMotionPlayback(win = {}) {
  let key = '', cursor = 0, root, timeline = [], active = [], preview = false, lastSlide = false, firstSlide = false;
  const touched = new Map();
  const cancel = () => { active.forEach(a => a.cancel()); active = []; };
  function restore() {
    cancel();
    touched.forEach((style, el) => Object.assign(el.style, style));
    touched.clear();
  }
  function find(field) {
    return [...(root?.querySelectorAll?.('[data-presentation-motion-field]') || [])].find(e => e.dataset.presentationMotionField === field);
  }
  function stateAt(field, count) {
    const first = timeline.find(s => s.field === field);
    const state = { opacity: first?.effect.endsWith('-in') ? 0 : 1, x: 0, y: 0 };
    timeline.slice(0, count).filter(s => s.field === field).forEach(s => {
      if (s.effect.endsWith('-in')) state.opacity = 1;
      if (s.effect === 'fade-out') state.opacity = 0;
      if (s.effect === 'move') { state.x = s.x; state.y = s.y; }
    });
    return state;
  }
  function frame(state) {
    const rect = root.querySelector('.presentation-slide')?.getBoundingClientRect() || { width: 0, height: 0 };
    return { opacity: state.opacity, translate: `${state.x * rect.width / 100}px ${state.y * rect.height / 100}px` };
  }
  function apply() {
    restore();
    new Set(timeline.map(s => s.field)).forEach(field => {
      const el = find(field); if (!el) return;
      touched.set(el, Object.fromEntries(['opacity', 'translate', 'visibility', 'pointerEvents'].map(name => [name, el.style[name]])));
      const state = stateAt(field, cursor);
      // Destination coordinates follow the slide through fullscreen and viewport resizing.
      el.style.opacity = state.opacity;
      el.style.translate = `calc(var(--presentation-slide-width, 1px) * ${state.x / 100}) calc(var(--presentation-slide-height, 1px) * ${state.y / 100})`;
      el.style.visibility = state.opacity ? '' : 'hidden';
      el.style.pointerEvents = state.opacity ? '' : 'none';
    });
    const next = root?.querySelector('[data-presentation-next]');
    if (next) next.disabled = lastSlide && cursor >= timeline.length;
    const prev = root?.querySelector("[data-presentation-prev]");
    if (prev) prev.disabled = firstSlide && cursor === 0;
  }
  return {
    mount(nextRoot, model) {
      root = nextRoot;
      lastSlide = model.slideIndex >= model.slides.length - 1; firstSlide = model.slideIndex === 0;
      const slide = model.slides?.[model.slideIndex];
      const nextKey = `${model.dateValue}:${model.meetingType}:${slide?.id}:${model.presenting}`;
      if (nextKey !== key) { cursor = 0; preview = false; key = nextKey; }
      timeline = model.presenting || preview ? motionTimeline(slide?.textFieldStyles).filter(s => find(s.field)) : [];
      cursor = Math.min(cursor, timeline.length); apply();
    },
    step(direction = 1) {
      if (direction < 0) { if (!cursor) return false; cursor--; apply(); return true; }
      if (cursor >= timeline.length) return false;
      const step = timeline[cursor]; const el = find(step.field);
      const before = frame(stateAt(step.field, cursor)); cursor++; apply();
      const after = frame(stateAt(step.field, cursor));
      if (el && !win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        el.style.visibility = ''; el.style.pointerEvents = 'none';
        const from = { ...before };
        if (step.effect === 'slide-in') {
          const [x, y] = after.translate.split(' ');
          from.translate = `${parseFloat(x) - 40}px ${y}`;
        }
        if (step.effect === 'zoom-in') from.scale = '.8';
        const animation = el.animate?.([from, { ...after, scale: '1' }], { duration: step.duration, easing: 'ease-out' });
        if (animation) { active.push(animation); animation.finished.then(() => {
          if (!active.includes(animation)) return;
          el.style.visibility = Number(after.opacity) ? '' : 'hidden'; el.style.pointerEvents = Number(after.opacity) ? '' : 'none';
        }).catch(() => {}); }
      }
      return true;
    },
    preview(nextRoot, model) { preview = true; cursor = 0; key = `${model.dateValue}:${model.meetingType}:${model.slides[model.slideIndex]?.id}:${model.presenting}`; this.mount(nextRoot, model); },
    stop() { restore(); key = ''; cursor = 0; preview = false; },
  };
}
