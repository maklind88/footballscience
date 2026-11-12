import { readRecoverySessions, recoveryDraftModuleKey } from './snapshot-recovery-draft-format.mjs';

// Separate review surface. No module editor, autosave, replay or import calls.
export function mountSnapshotRecoveryDraftPanel({ win, doc, host, service, active, status }) {
  const panel = doc.createElement('section'); panel.dataset.snapshotRecoveryDrafts = '';
  const node = (tag, text) => { const el = doc.createElement(tag); el.textContent = text; return el; };
  const heading = node('h3', 'Separate Sessions recovery drafts');
  const intro = node('p', 'These drafts stay separate from your current plan and unsynced work. They are saved only in this browser and are not sent to the team.');
  const review = node('button', 'Review recovery drafts'); review.type = 'button';
  const list = node('div', ''); panel.append(heading, intro, review, list); host.append(panel);
  let sequence = 0;
  const invalidate = () => { sequence++; list.replaceChildren(); panel.hidden = true; };
  async function show(row, container, current) {
    if (!current()) return;
    const state = readRecoverySessions(row.content.value);
    container.replaceChildren();
    container.append(node('h4', 'Sessions Planner recovery draft'));
    container.append(node('p', `Source copy: ${new Date(row.content.source.createdAt).toLocaleString()}`));
    container.append(node('p', 'Prepared for review. No changes have been applied to Sessions Planner.'));
    if (row.content.entry.pendingCentralSync || row.content.entry.localWritePrepared)
      container.append(node('p', 'The source includes work awaiting central saving. This draft does not confirm that it was synced.'));
    for (const [date, session] of Object.entries(state.sessions).slice(0, 30)) {
      const details = node('details', ''), summary = node('summary', `${date} · ${session.title || 'Session'} · ${session.blocks.length} blocks`);
      details.append(summary);
      details.addEventListener('toggle', () => {
        if (!details.open || details.dataset.loaded || !current()) return;
        details.dataset.loaded = 'true';
        for (const block of session.blocks) {
          details.append(node('h5', block.title || block.name || 'Block'));
          if (typeof block.objective === 'string') details.append(node('p', block.objective.slice(0, 2000)));
          if (typeof block.notes === 'string') details.append(node('p', block.notes.slice(0, 2000)));
        }
      });
      container.append(details);
    }
    if (Object.keys(state.sessions).length > 30) container.append(node('p', 'Showing the first 30 dates. The download contains the complete draft.'));
    const download = node('button', 'Download recovery draft'); download.type = 'button'; container.append(download);
    download.onclick = async () => {
      if (!current() || download.disabled) return; download.disabled = true;
      try {
        const fresh = await service.read(row.id);
        if (!current()) return;
        if (JSON.stringify(fresh) !== JSON.stringify(row)) throw new Error('Draft changed');
        // Own schema deliberately cannot be silently imported as a platform backup.
        const url = win.URL.createObjectURL(new win.Blob([JSON.stringify(fresh)], { type: 'application/json' }));
        const link = node('a', ''); link.href = url; link.download = 'sessions-recovery-draft.json'; doc.body.append(link);
        try { link.click(); } finally { link.remove(); win.setTimeout(() => win.URL.revokeObjectURL(url), 1000); }
        status.textContent = 'Recovery draft downloaded. Current work remains unchanged.';
      } catch { if (current()) status.textContent = 'The draft could not be verified or downloaded. Current work remains unchanged.'; }
      finally { if (current()) download.disabled = false; }
    };
  }
  async function refresh(selectedId) {
    if (!active()) { invalidate(); return; }
    const request = ++sequence, current = () => request === sequence && active();
    review.disabled = true; list.replaceChildren();
    try {
      const rows = await service.list(); if (!current()) return;
      if (!rows.length) list.append(node('p', 'No separate recovery drafts for this account.'));
      for (const row of rows) {
        const container = node('div', ''), open = node('button', `Open Sessions draft · ${new Date(row.createdAt).toLocaleString()}`);
        open.type = 'button'; list.append(open, container);
        open.onclick = async () => {
          if (!current() || open.disabled) return; open.disabled = true;
          try { const copy = await service.read(row.id); if (current()) await show(copy, container, current); }
          catch { if (current()) status.textContent = 'Recovery draft unavailable or access changed. Current work remains unchanged.'; }
          finally { if (current()) open.disabled = false; }
        };
        if (row.id === selectedId) { const copy = await service.read(row.id); if (current()) await show(copy, container, current); }
      }
    } catch { if (current()) status.textContent = 'Recovery drafts could not be read. No work has been changed.'; }
    finally { if (current()) review.disabled = false; }
  }
  review.onclick = () => refresh();
  function addPrepareButton(section, { row, source, current }) {
    if (!Object.hasOwn(row.storage, recoveryDraftModuleKey) || !active()) return;
    const button = node('button', 'Create separate Sessions draft'); button.type = 'button'; section.append(button);
    button.onclick = async () => {
      if (!current() || !active() || button.disabled) return; button.disabled = true;
      status.textContent = 'Preparing a separate recovery draft…';
      try {
        const result = await service.prepare({ source, id: row.id, expected: row });
        if (!current() || !active()) return;
        status.textContent = result.inserted ? 'Recovery draft saved on this device. Current work remains unchanged.'
          : 'This recovery draft already exists. No duplicate was created.';
        await refresh(result.row.id);
      } catch {
        if (current() && active()) status.textContent = 'Recovery draft could not be saved or verified. The original copy and current work remain unchanged. Check storage and access before retrying.';
      } finally { if (current() && active()) button.disabled = false; }
    };
  }
  return { addPrepareButton, invalidate };
}
