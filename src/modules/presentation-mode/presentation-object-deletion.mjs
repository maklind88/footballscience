// Resolve only the selected, editable object. A slide or a built-in heading is never a deletion target.
export function selectedDeletionTarget(model = {}) {
  const slide = model.slides?.[model.slideIndex];
  if (!slide || slide.readOnly || model.presenting) return null;
  const shape = model.activeShapeTarget;
  if (shape?.slideId === slide.id && slide.shapes?.some(item => item.id === shape.shapeId)) {
    return { kind: 'shape', slideId: slide.id, id: shape.shapeId };
  }
  const text = model.activeTextTarget;
  if (text?.slideId !== slide.id) return null;
  if (text.textBoxId && slide.textBoxes?.some(item => item.id === text.textBoxId)) {
    return { kind: 'textBox', slideId: slide.id, id: text.textBoxId };
  }
  if (text.field === 'info.media' && slide.infoSlide?.mediaId) {
    return { kind: 'media', slideId: slide.id };
  }
  return null;
}

export function syncObjectDeleteControl(root, model) {
  const stage = root?.querySelector?.('[data-presentation-stage]');
  if (!stage) return;
  let controls = stage.querySelector('[data-presentation-object-actions]');
  if (!selectedDeletionTarget(model)) { controls?.remove(); return; }
  if (controls) return;
  controls = stage.ownerDocument.createElement('div');
  controls.dataset.presentationObjectActions = '';
  controls.className = 'presentation-object-actions';
  controls.innerHTML = '<button type="button" data-presentation-delete-object title="Delete selected object · Delete / Backspace" aria-label="Delete selected object">Delete object</button>';
  stage.appendChild(controls);
}
