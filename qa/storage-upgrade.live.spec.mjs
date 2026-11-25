import {expect} from '@playwright/test';
import {test} from './helpers/live-browser-readonly.mjs';

// Existing QA credentials in a disposable authenticated browser profile only.
// No draft creation, import, activation, recovery, acknowledgement or deletion.
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,trace:'off',screenshot:'off',video:'off'});
test.skip(!process.env.LIVE_QA_USERNAME || !process.env.LIVE_QA_PASSWORD,'Authenticated QA credentials required');
test('mobile upgrade guide is reachable live without compact activation or central writes',async({page})=>{
 const compactRequests=[];let blockedWrites=0;
 page.on('request',r=>{if(r.url().includes('/src/core/snapshot-compact-archive.mjs'))compactRequests.push(r.url());});
 await page.route('**/api/app-state**',route=>{
   if(['GET','HEAD'].includes(route.request().method()))return route.fallback();
   blockedWrites++;return route.abort('blockedbyclient');
 });
 await page.goto('/');
 await page.waitForFunction(()=>window.__footballScienceAppReady && document.querySelector('#loginScreen')?.hidden,null,{timeout:75000});
 const modal=page.locator('#dashboardModalRoot button[data-dashboard-modal-close]');if(await modal.isVisible())await modal.tap();
 const prompt=page.locator('#platformInstallPromptHost [data-install-app-action="later"]');
 try{await prompt.waitFor({state:'visible',timeout:2000});}catch{}
 if(await prompt.isVisible())await prompt.tap();
 await page.locator('#profileMenuButton').tap();
 const health=page.getByRole('menuitem',{name:'Storage health',exact:true});await expect(health).toBeVisible();await health.tap();
 const dialog=page.getByRole('dialog',{name:'Storage health',exact:true});
 await dialog.locator('summary').filter({hasText:'Prepare older tabs for upgrade'}).tap();
 await expect(dialog.getByRole('region',{name:'Safe tab upgrade'})).toContainText('Upgrade readiness for the whole tab: not verified');
 expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 expect(compactRequests).toEqual([]);
 // A writer module is neither imported by product boot nor by this guide.
 console.log('[storage-upgrade-live]',JSON.stringify({mobileGuide:true,compactWriterImported:false,centralWritesForwarded:0,blockedBackgroundWrites:blockedWrites}));
 await dialog.getByRole('button',{name:'Close storage health',exact:true}).tap();
});
