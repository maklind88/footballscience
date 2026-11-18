import {test,expect} from '@playwright/test';
import {installSessionStorageFixture,readJournal,edit,day} from './helpers/session-full-app-storage-fixture.mjs';
for(const stored of [false,true])test(`mobile storage guide remains reachable with ${stored?'saved':'default'} chat position`,async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 try{
 const page=await context.newPage(),server=await installSessionStorageFixture(page);
 if(stored)await page.addInitScript(()=>localStorage.setItem('football-dashboard-chat-launcher-position-v1',JSON.stringify({left:330,top:790})));
 await page.goto('/?workspace=session-planner');
 await page.waitForFunction(()=>window.__footballScienceAppReady&&document.querySelector('#loginScreen')?.hidden);
 const modal=page.locator('#dashboardModalRoot button[data-dashboard-modal-close]');if(await modal.isVisible())await modal.tap();
 const prompt=page.locator('#platformInstallPromptHost [data-install-app-action="dismiss"]');
 try{await prompt.waitFor({state:'visible',timeout:2000});}catch{}
 if(await prompt.isVisible())await prompt.tap();
 await page.locator(`[data-session-date="${day}"]`).tap();
 if(stored)await page.evaluate(()=>{__storageFault.journal=true;});
 await edit(page,'Preserve mobile draft åäö');
 if(stored)await expect(page.locator('[data-platform-autosave-status]')).toContainText('Not saved on this device');
 else await expect.poll(()=>readJournal(page)).toHaveLength(1);
 const before=await page.evaluate(()=>({primary:localStorage.getItem('football-session-planner-v3'),position:localStorage.getItem('football-dashboard-chat-launcher-position-v1'),draft:footballScienceCentralState.getSessionWorkingCopy()}));
 const journal=await readJournal(page);
 await expect.poll(async()=>page.locator('.dashboard-chat-launcher').evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('#hubSidebar').getBoundingClientRect().top)).toBe(true);
 await page.locator('#profileMenuButton').tap();await page.getByRole('menuitem',{name:'Storage health',exact:true}).tap();
 await page.locator('summary').filter({hasText:'Prepare older tabs for upgrade'}).tap();
 await expect(page.getByRole('region',{name:'Safe tab upgrade'})).toBeVisible();
 const dialog=page.getByRole('dialog',{name:'Storage health',exact:true});
 expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await dialog.getByRole('button',{name:'Close storage health',exact:true}).tap();
 await page.setViewportSize({width:844,height:390});await page.setViewportSize({width:390,height:844});
 await page.locator('#profileMenuButton').tap();await page.getByRole('menuitem',{name:'Storage health',exact:true}).tap();
 expect(await page.evaluate(()=>({primary:localStorage.getItem('football-session-planner-v3'),position:localStorage.getItem('football-dashboard-chat-launcher-position-v1'),draft:footballScienceCentralState.getSessionWorkingCopy()}))).toEqual(before);
 expect(await readJournal(page)).toEqual(journal);expect(server.effects).toBe(0);
 }finally{await context.close();}
});
