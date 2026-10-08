import { test, expect } from '@playwright/test';
import { installSetPiecesCentralFixture } from './helpers/set-pieces-central-fixture.mjs';

test('profile storage health opens in the real app and preserves protected content', async ({page}) => {
  await installSetPiecesCentralFixture(page);
  await page.goto('/?workspace=medical-team');
  await page.waitForFunction(()=>window.__footballScienceAppReady && document.querySelector('#loginScreen')?.hidden);
  await page.evaluate(()=>document.querySelector('#dashboardModalRoot button[data-dashboard-modal-close]')?.click());
  await page.evaluate(()=>localStorage.setItem('qa-health-sentinel','private sentinel'));
  await page.locator('#profileMenuButton').click();
  await page.getByRole('menuitem',{name:'Storage health',exact:true}).click();
  const dialog = page.getByRole('dialog',{name:'Storage health',exact:true});
  await expect(dialog).toContainText('Available storage information read. No data was changed.');
  await expect(dialog).toContainText('This is not the localStorage limit');
  await expect(dialog).toContainText('IndexedDB: approximate JSON sizes');
  await expect(dialog).toContainText('Archived and recovery rows remain protected.');
  await expect(dialog).not.toContainText('private sentinel');
  await expect(dialog).not.toContainText('qa-health-sentinel');
  expect(await page.evaluate(()=>localStorage.getItem('qa-health-sentinel'))).toBe('private sentinel');
  await dialog.getByRole('button',{name:'Close storage health'}).click();
  await expect(dialog).toHaveCount(0);
});

for (const kind of ['conflict','predecessor','recovery']) {
  test(`review explains ${kind} without resolving or rewriting any version`, async ({page})=>{
    await page.goto('/');
    await page.evaluate(async kind=>{
      const {openSessionSaveReview}=await import('/src/modules/session-planner/session-save-review.mjs');
      const local={session:{title:'Synthetic draft',blocks:[]}},central={session:{title:'Synthetic central',blocks:[]}};
      window.__reviewMutations=0;
      const row={change:{id:'synthetic',date:'2026-10-05',after:local},central,
        conflicts:kind==='predecessor'?['An earlier local version needs review.']:['title']};
      await openSessionSaveReview({document,canReview:()=>true,
        bridge:{hydrate:async()=>true,getSessionSaveReviews:async()=>kind==='recovery'?[]:[row],resolveSessionSaveReview:()=>{window.__reviewMutations++;}},
        legacy:{list:async()=>kind==='recovery'?[{date:'2026-10-05',local,central,differences:[]}]:[],resolve:()=>{window.__reviewMutations++;}},
      });
    },kind);
    const dialog=page.getByRole('dialog',{name:'Review local saves'});
    await expect(dialog).toContainText(kind==='recovery'?'retained local recovery copy':kind==='predecessor'?'depends on an earlier unresolved local version':'conflicts with central training');
    await dialog.getByRole('button',{name:'Close',exact:true}).click();
    expect(await page.evaluate(()=>window.__reviewMutations)).toBe(0);
  });
}
