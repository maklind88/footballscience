import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {installSessionStorageFixture,ready,edit,readJournal} from './helpers/session-full-app-storage-fixture.mjs';
const region=page=>page.getByRole('region',{name:'Safe tab upgrade'});
const input=page=>page.getByLabel('Sessions recovery file to verify');
const status=page=>region(page).getByRole('status');
async function fixture(page){
  await page.goto('/medical-merge.js');
  return page.evaluate(async()=>{
    window.testDraft={scope:'session-A',owner:'owner-A',token:'token-A',value:'Current åäö',previousValue:'Original åäö',baseRevision:7};
    window.testAccess=true;window.owner='owner-A';
    const {mountStorageUpgradeGuide}=await import('/src/core/storage-upgrade-guide.mjs');
    window.disposeGuide=mountStorageUpgradeGuide({doc:document,host:document.body,getScope:()=>owner,isCurrent:()=>owner==='owner-A',
      getWorkingCopy:()=>testDraft,canReviewWorkingCopy:()=>testAccess,report:{pendingForCurrentScope:0}});
    return {schema:'football-science-session-working-copy-v1',exportedAt:'2026-11-15T12:00:00Z',...testDraft};
  });
}
const select=(page,value)=>input(page).setInputFiles({name:'sessions-unsaved-work.json',mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value))});

test('download is not proof; selecting exact file verifies only the current Sessions draft',async({page})=>{
  await fixture(page);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download this tab’s unsaved Sessions work'}).click();
  const file=await download;
  await expect(status(page)).toContainText('a download request is not a verified copy');
  await input(page).setInputFiles(await file.path());
  await expect(status(page)).toContainText('matches the current unsaved Sessions copy');
  await expect(region(page)).toContainText('Upgrade readiness for the whole tab: not verified');
  await page.evaluate(()=>{testDraft={...testDraft,token:'token-B',value:'Newer work'};});
  await expect(status(page)).toContainText('Unsaved Sessions work is present');
  await input(page).setInputFiles(await file.path());
  await expect(status(page)).toContainText('does not match');
  expect(await page.evaluate(()=>testDraft.value)).toBe('Newer work');
  expect(await page.getByRole('button',{name:/reload|upgrade now|close tab/i}).count()).toBe(0);
});

for(const change of ['baseline','owner','scope','token','revision','unknown-field','invalid-json','oversize'])test(`upgrade rejects ${change} without changing work`,async({page})=>{
  const copy=await fixture(page),before=await page.evaluate(()=>JSON.stringify(testDraft));
  if(change==='baseline')copy.previousValue='Wrong base';
  if(change==='owner')copy.owner='owner-B';if(change==='scope')copy.scope='session-B';
  if(change==='token')copy.token='old-token';if(change==='revision')copy.baseRevision++;
  if(change==='unknown-field')copy.replay=true;
  await select(page,change==='invalid-json'?'{bad':change==='oversize'?'x'.repeat(8*1024*1024+1):copy);
  await expect(status(page)).toContainText(change==='oversize'?'could not be verified':'does not match');
  expect(await page.evaluate(()=>JSON.stringify(testDraft))).toBe(before);
});

for(const event of ['platform:user-change','pagehide','freeze'])test(`late file read cannot survive ${event}`,async({page})=>{
  const copy=await fixture(page);
  await page.evaluate(()=>{
    const original=File.prototype.text;File.prototype.text=function(){const file=this;return new Promise(resolve=>{window.finishFile=()=>original.call(file).then(resolve);});};
  });
  await select(page,copy);await expect(status(page)).toContainText('Checking');
  await page.evaluate(event=>(event==='freeze'?document:window).dispatchEvent(new Event(event)),event);
  await page.evaluate(()=>finishFile());
  await expect(status(page)).toContainText('lifecycle changed');
  await expect(input(page)).toBeDisabled();
  expect(await input(page).inputValue()).toBe('');
});

test('revoked access and absent working copy never imply ready to reload',async({page})=>{
  const copy=await fixture(page);await select(page,copy);await expect(status(page)).toContainText('matches');
  await page.evaluate(()=>{testAccess=false;});
  await expect(input(page)).toBeDisabled();await expect(status(page)).toContainText('does not prove');
  await expect(region(page)).toContainText('not verified');
});

for(const workState of ['memory','pending'])test(`real product ${workState} work is preserved by the upgrade guide`,async({page,context})=>{
  const server=await installSessionStorageFixture(page);
  await page.goto('/?workspace=session-planner');await ready(page);
  await page.evaluate(workState=>{__storageFault.journal=workState==='memory';},workState);
  await edit(page,'Protected current objective åäö');
  if(workState==='memory')await expect(page.locator('[data-platform-autosave-status]')).toContainText('Not saved on this device');
  else await expect.poll(()=>readJournal(page)).toHaveLength(1);
  const before=await page.evaluate(()=>({draft:footballScienceCentralState.getSessionWorkingCopy(),primary:__nativeStorageRead('football-session-planner-v3')}));
  const journal=await readJournal(page);
  if(workState==='memory'){
    // WebKit shipped with Playwright 1.59.1 makes even File.text() fail in
    // context.setOffline(true), reproduced with an unrelated 18-byte file.
    // Block every page request instead; retain the real disk-file round trip.
    await page.route('**/*', route => route.abort('internetdisconnected'));
    expect(await page.evaluate(async()=>{
      try{await fetch('/api/client-config',{cache:'no-store'});return false;}catch{return true;}
    })).toBe(true);
  }
  await page.locator('#profileMenuButton').click();await page.getByRole('menuitem',{name:'Storage health',exact:true}).click();
  await page.locator('summary').filter({hasText:'Prepare older tabs for upgrade'}).click();
  await expect(region(page)).toBeVisible();
  if(workState==='memory'){
    const download=page.waitForEvent('download');await region(page).getByRole('button',{name:'Download this tab’s unsaved Sessions work'}).click();
    const file=await download;const exported=JSON.parse(await readFile(await file.path(),'utf8'));
    expect(exported.value).toBe(before.draft.value);expect(exported.previousValue).toBe(before.draft.previousValue);
    await input(page).setInputFiles(await file.path());await expect(status(page)).toContainText('matches the current unsaved Sessions copy');
    expect(await page.evaluate(()=>({draft:footballScienceCentralState.getSessionWorkingCopy(),primary:__nativeStorageRead('football-session-planner-v3')}))).toEqual(before);
    // Actual auth ABA invalidates the open dialog and its evidence.
    await page.evaluate(()=>{const a=platformAuthStore,u=a.getCurrentUser();a.clearCurrentUser();a.writeUsers([u]);a.setCurrentUser(u.id);});
    await expect(page.getByRole('dialog',{name:'Storage health',exact:true})).toContainText('Account or team changed');
    await expect(region(page)).toHaveCount(0);
  }else{await expect(input(page)).toBeDisabled();await expect(status(page)).toContainText('does not prove');}
  // Original work and real module journal have not been acknowledged or replaced.
  expect(await readJournal(page)).toEqual(journal);expect(server.effects).toBe(0);
  if(workState==='pending')expect(await page.evaluate(()=>({draft:footballScienceCentralState.getSessionWorkingCopy(),primary:__nativeStorageRead('football-session-planner-v3')}))).toEqual(before);
});
