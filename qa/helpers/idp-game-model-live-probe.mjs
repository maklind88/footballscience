import { expect } from '@playwright/test';

const profile = { playerId: 'qa-idp-game-model-forms', playerName: 'QA Game Model Player', position: 'CMF', role: '6', status: 'active' };
const focus = { id: 'qa-idp-game-model-focus', playerId: profile.playerId, title: 'QA receiving focus', description: 'Keep the existing coaching cue.', focusLevel: 'main', category: 'Technical', status: 'Active', rowVersion: 1 };

export async function verifyIdpGameModelForms(page, openIdp) {
  const origin = new URL(page.url()).origin;
  let writes = 0;
  // Use the deployed module and real staff session with an isolated browser
  // fixture. The forms can be opened on any team without editing player data.
  await page.route(url => url.origin === origin && url.pathname === '/api/idp', async route => {
    if (route.request().method() !== 'GET') {
      writes += 1;
      return route.abort('blockedbyclient');
    }
    const url = new URL(route.request().url());
    switch (url.searchParams.get('action')) {
      case 'dashboard': return route.fulfill({ json: { players: [{ profile, focus }] } });
      case 'player': return route.fulfill({ json: { profile, focuses: [focus] } });
      case 'sync': return route.fulfill({ json: {} });
      default: return route.abort('blockedbyclient');
    }
  });
  await openIdp();
  const workspace = page.locator('#idpWorkspace');
  await workspace.locator(`[data-idp-player="${profile.playerId}"]`).click({ timeout: 25_000 });
  const form = workspace.locator('[data-idp-create-focus]');

  await workspace.getByRole('button', { name: 'Add focus', exact: true }).click();
  await openGameModelPicker(form, 'Use Game Model action');
  await form.getByRole('button', { name: /Use action: Find the free third player/ }).click();
  await expect(form.getByRole('textbox', { name: 'Focus', exact: true })).toHaveValue('Find the free third player');
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();

  await workspace.getByRole('button', { name: `Edit focus: ${focus.title}`, exact: true }).click();
  await openGameModelPicker(form, 'Link Game Model action');
  await form.getByRole('button', { name: /Link action: Find the free third player/ }).click();
  await expect(form.locator('[data-idp-gm-preview]')).toContainText('Find the free third player');
  await expect(form.getByRole('textbox', { name: 'Focus', exact: true })).toHaveValue(focus.title);
  await expect(form.getByRole('textbox', { name: 'Focus areas' })).toHaveValue(focus.description);
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(form).toHaveCount(0);
  expect(writes).toBe(0);
}

async function openGameModelPicker(form, label) {
  await form.getByText(label, { exact: true }).click();
  await form.getByRole('combobox', { name: 'Sub-Phase', exact: true }).selectOption('build-up');
  await form.getByRole('combobox', { name: 'Position', exact: true }).selectOption('CMF-6');
  await expect(form.getByText('Individual Actions', { exact: true })).toBeVisible();
}
