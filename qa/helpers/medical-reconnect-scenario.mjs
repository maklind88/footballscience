import { expect } from '@playwright/test';
import { medicalKey, requireProof } from './save-acceptance-staging.mjs';

// Peer archival uses its own authenticated canonical API session, not its UI.
// Real offline transition + delayed GET delivery exercise mutation-before-refresh.
export async function exerciseMedicalReconnect({ qa, fixture, guard, author, archive, ledger, now = () => new Date() }) {
  requireProof(author.reconnect && qa.peer.user.id !== qa.primary.user.id, 'Distinct reconnect peer required');
  author.reconnect.freeze();
  await author.context.setOffline(true);
  const id = guard.ids()[0], timestamp = now().toISOString();
  const current = await qa.read(qa.peer, medicalKey);
  await archive(guard.archiveEvent(id, current.state, timestamp), qa.peer);
  const archived = await qa.read(qa.peer, medicalKey);
  author.reconnect.expectArchive(archived.state, timestamp);
  requireProof(guard.unrelatedUnchanged(archived.state), 'Unrelated Medical content changed during peer archival');
  ledger.push({stage:'peer-archived-while-author-offline', id});
  await author.context.setOffline(false);
  await author.page.evaluate(() => {
    window.__medicalReconnectFeedback = [];
    let previous = document.querySelector('.medical-message')?.textContent?.trim();
    new MutationObserver(() => {
      const text = document.querySelector('.medical-message')?.textContent?.trim();
      if (text && text !== previous) window.__medicalReconnectFeedback.push(text);
      previous = text;
    }).observe(document, {subtree:true, childList:true, characterData:true});
  });
  await author.page.getByRole('button', {name:fixture.player.name + ' 50% training recommendation', exact:true}).click();
  await expect.poll(() => author.errors.length ? author.errors.join('; ') : ledger.some(e => e.stage === 'archived-replay-conflict')).toBe(true);
  await expect(author.page.locator('.medical-message')).toContainText('has changed centrally');
  const messages = await author.page.evaluate(() => window.__medicalReconnectFeedback);
  requireProof(messages.some(text => text.includes('confirming 50%')), 'Replay never entered confirmation');
  requireProof(!messages.some(text => /recommendation already set|recommendation saved/.test(text)), 'False confirmation appeared after reconnect');
  requireProof(ledger.filter(e => e.stage === 'archived-replay-request').length === 1, 'Semantic conflict was retried');
  const after = await qa.read(qa.peer, medicalKey);
  requireProof(after.revision === archived.revision && JSON.stringify(after.state) === JSON.stringify(archived.state), 'Replay changed canonical state');
  author.reconnect.finish();
}
