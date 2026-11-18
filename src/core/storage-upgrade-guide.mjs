import { encodeSessionUpgradeCopy, verifySessionUpgradeCopy, upgradeCopyMaxBytes } from './session-upgrade-copy.mjs';

// No reload/close/claim/skipWaiting, save, server request or persistent grant.
// This guide can check one module's current exported draft, never certify all
// work in this tab or any other tab. Missing evidence remains unknown.
export function mountStorageUpgradeGuide({ doc, host, getScope, isCurrent,
  getWorkingCopy = () => null, canReviewWorkingCopy = () => false, report }) {
  const win = doc.defaultView;
  const section = doc.createElement('section'); section.dataset.storageUpgradeGuide = '';
  const node = (tag, text) => { const e = doc.createElement(tag); e.textContent = text; return e; };
  section.setAttribute('aria-label', 'Safe tab upgrade');
  section.append(node('h3', 'Prepare an older tab for upgrade'));
  section.append(node('p', 'Keep every older tab open while securing its work. This page cannot inspect another tab’s unsaved memory. Do not clear browser data.'));
  const steps = node('ol', '');
  for (const text of [
    'In each older tab, review each module you edited. Resolve saving failures or export its current work using that module’s recovery tools. A newer tab cannot export an older tab’s memory.',
    'Open the exported file and verify its contents before upgrading. Sessions work from this tab can be compared below. Pending queues, reviews and other modules still need their own checks.',
    'Once that tab’s work is secured, open the current app separately and check the retained work there. If offline or the new app cannot open, keep the older tab open.',
    'Close or reload an older tab only after its own work has been secured and checked. This guide never performs that action or approves compact writing.',
  ]) steps.append(node('li', text));
  section.append(steps);
  const markers = report?.pendingForCurrentScope;
  section.append(node('p', Number.isSafeInteger(markers)
    ? `${markers} pending module markers were observed in the storage check. This count is not proof that all work is safe to close.`
    : 'Pending module markers are unknown. Keep the tab open until its work has been checked.'));
  section.append(node('p', 'Upgrade readiness for the whole tab: not verified. This check does not cover pending journal entries, other modules, other tabs or recovery-file durability.'));
  const status = node('p', ''); status.setAttribute('role', 'status');
  const download = node('button', 'Download this tab’s unsaved Sessions work'); download.type = 'button';
  const label = node('label', 'Check an exported Sessions recovery file ');
  const file = doc.createElement('input'); file.type = 'file'; file.accept = '.json,application/json';
  file.setAttribute('aria-label', 'Sessions recovery file to verify'); label.append(file);
  section.append(download, label, status); host.append(section);
  let invalidated = false, busy = false, attempt = 0, lastToken;
  const valid = () => !invalidated && section.isConnected && isCurrent();
  const read = () => {
    try {
      if (!valid() || !canReviewWorkingCopy()) return null;
      const draft = getWorkingCopy();
      return draft && draft.owner === getScope() ? draft : null;
    } catch { return null; }
  };
  const signature = draft => draft ? JSON.stringify([draft.owner, draft.scope, draft.token, draft.baseRevision]) : '';
  const check = () => {
    if (!valid()) return invalidate();
    let draft;
    try { draft = read(); } catch { draft = null; }
    const token = signature(draft);
    if (token !== lastToken) {
      attempt++; lastToken = token; file.value = '';
      status.textContent = draft ? 'Unsaved Sessions work is present. Download it, then select the saved file to compare.'
        : 'No accessible Sessions memory copy was returned. This does not prove that the tab has no unsaved or pending work.';
    }
    download.disabled = !draft; file.disabled = !draft || busy;
  };
  function invalidate() {
    if (invalidated) return;
    invalidated = true; attempt++; file.value = ''; download.disabled = file.disabled = true;
    status.textContent = 'Account, access or page lifecycle changed. Reopen Storage health before checking a file.';
  }
  download.addEventListener('click', () => {
    try {
      const draft = read(); if (!draft) { check(); return; }
      const text = encodeSessionUpgradeCopy(draft, getScope());
      const url = win.URL.createObjectURL(new win.Blob([text], { type: 'application/json' }));
      try {
        const link = doc.createElement('a'); link.href = url; link.download = 'sessions-unsaved-work.json';
        doc.body.append(link); try { link.click(); } finally { link.remove(); }
      } finally { win.setTimeout(() => win.URL.revokeObjectURL(url), 1000); }
      status.textContent = 'Download requested. Select the saved file below to check it; a download request is not a verified copy.';
    } catch { if (valid()) status.textContent = 'The recovery download could not start. Use Sessions recovery and keep this tab open.'; }
  });
  file.addEventListener('change', async () => {
    const selected = file.files?.[0]; if (!selected || busy) return;
    const id = ++attempt, opening = read(), token = signature(opening);
    if (!opening) { check(); return; }
    busy = true; file.disabled = true; status.textContent = 'Checking the selected file locally…';
    let timer;
    try {
      if (!selected.size || selected.size > upgradeCopyMaxBytes) throw Error('File size');
      const text = await Promise.race([selected.text(), new Promise((_, reject) => {
        timer = win.setTimeout(() => reject(Error('File read timeout')), 3000);
      })]);
      if (id !== attempt || !valid()) return;
      const current = read();
      if (signature(current) !== token || !current) { check(); return; }
      status.textContent = verifySessionUpgradeCopy(text, current, getScope())
        ? 'The selected file matches the current unsaved Sessions copy, including its original baseline. This does not approve closing the tab or confirm central saving.'
        : 'The file does not match the current Sessions copy. Keep this tab open and export its latest work.';
    } catch { if (id === attempt && valid()) status.textContent = 'The file could not be verified. Keep this tab open.'; }
    finally { win.clearTimeout(timer); busy = false; file.value = ''; if (valid()) check(); }
  });
  win.addEventListener('platform:user-change', invalidate);
  win.addEventListener('pagehide', invalidate);
  doc.addEventListener('freeze', invalidate);
  const poll = win.setInterval(check, 250); check();
  return () => { invalidated = true; attempt++; win.clearInterval(poll);
    win.removeEventListener('platform:user-change', invalidate); win.removeEventListener('pagehide', invalidate);
    doc.removeEventListener('freeze', invalidate); file.value = ''; section.remove(); };
}
