import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { installSetPiecesCentralFixture } from './helpers/set-pieces-central-fixture.mjs';
import { journeyDay as day, journeyPlayer as player, journeyKey as key, openMedicalJourney, recommendationButton, recommendationMessage } from './helpers/medical-recommendation-journey.mjs';
const oldSha='845a0ed95bbd8795bf574a8aeb0c9f37ed903250';
const changed=['src/core/central-sync-runtime-service.mjs','src/modules/medical/medical-runtime-bindings.mjs','src/modules/medical/medical-runtime-state-service.mjs','src/modules/medical/medical-workspace-runtime-renderer.mjs'];
const oldSources=new Map(changed.map(path=>['/'+path,execFileSync('git',['show',oldSha+':'+path],{encoding:'utf8'})]));

// Actual old/current browser code; remote HTTP/auth synthetic. Native acceptance
// independently checks the real projector's archived duplicate response.
for(const authorVersion of ['old','candidate']) test(`stale ${authorVersion} client cannot confirm a recommendation cleared by a peer`,async({browser})=>{
  const contexts=[],ledger=[];let revision=10, blockAuthorReads=false, originalRequest;
  let record={id:'synthetic-existing-recommendation',playerId:player.id,date:day,participation:50,createdAt:day+'T09:00:00Z',updatedAt:day+'T09:00:00Z'};
  const entries=()=>({[key]:JSON.stringify({rosterVersion:'qa-journey',players:[player],records:[record],injuryPlans:[]}),
    'football-player-profiles-v1':JSON.stringify({rosterVersion:'qa-journey',players:[player],removedPlayerIds:[]}),
    'football-schedule-v1':JSON.stringify({events:[{id:'qa-training',date:day,type:'training',title:'Synthetic training'}]}),
    'football-session-planner-v3':JSON.stringify({selectedDate:day,sessions:{[day]:{date:day,title:'Synthetic training',blocks:[]}}})});
  async function open(actor,version){
    const context=await browser.newContext();contexts.push(context);const page=await context.newPage();
    const auth=await installSetPiecesCentralFixture(page);auth.actor.id=actor;
    await page.addInitScript(()=>{
      window.__medicalFeedback=[];
      new MutationObserver(()=>{
        const text=document.querySelector('.medical-message')?.textContent?.trim();
        if(text&&window.__medicalFeedback.at(-1)!==text)window.__medicalFeedback.push(text);
      }).observe(document,{subtree:true,childList:true,characterData:true});
    });
    await page.clock.setFixedTime(new Date(day+'T12:00:00Z'));
    const served=new Set();
    if(version==='old')await page.route('**/src/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      if(oldSources.has(path)){served.add(path);return route.fulfill({contentType:'text/javascript',body:oldSources.get(path)});}
      return route.fallback();
    });
    await page.route('**/api/app-state**',async route=>{
      if(route.request().method()!=='GET')return route.fulfill({status:409,json:{ok:false,reason:'Synthetic concurrent update requires review',currentRevision:revision}});
      if(actor==='author'&&blockAuthorReads)return route.abort('internetdisconnected');
      const all=entries(),keys=new URL(route.request().url()).searchParams.get('keys')?.split(',')||Object.keys(all);
      return route.fulfill({json:{ok:true,entries:Object.fromEntries(keys.filter(k=>k in all).map(k=>[k,all[k]])),metadata:Object.fromEntries(keys.filter(k=>k in all).map(k=>[k,{revision,organizationId:'set-pieces-org'}])),absentKeys:keys.filter(k=>!(k in all))}});
    });
    await page.route('**/api/medical**',async route=>{
      if(route.request().method()==='GET')return route.fulfill({json:{ok:true,mode:'database',enabled:true}});
      const body=route.request().postDataJSON();ledger.push({actor,type:body.eventType,body});
      if(body.eventType==='record-archived'){
        expect(actor).toBe('peer');expect(body.payload.recordId).toBe(record.id);
        record={...record,archivedAt:body.payload.archivedAt,updatedAt:body.payload.archivedAt};revision++;
      }else{
        expect(actor).toBe('author');expect(body.eventType).toBe('recommendation-saved');
        expect(body.payload.record.id).toBe(record.id);
        if(!record.archivedAt){originalRequest=body;revision++;}
        else {expect(originalRequest).toBeTruthy();expect(body).toEqual(originalRequest);}
      }
      return route.fulfill({json:{ok:true,stored:true,canonicalStored:true,processingStatus:'processed',eventId:'synthetic-event',revision,duplicate:actor==='author'&&Boolean(record.archivedAt)}});
    });
    await page.goto('/?workspace=medical-team');await openMedicalJourney(page);await expect(recommendationButton(page)).toHaveClass(/is-active/);
    if(version==='old')expect([...served].sort()).toEqual([...oldSources.keys()].sort());
    return page;
  }
  try{
    const author=await open('author',authorVersion);
    // Capture the real original envelope, then prove replay uses identical content/key.
    await recommendationButton(author).click();
    await expect.poll(()=>author.evaluate(()=>window.__medicalFeedback.some(text=>text.includes('already set')))).toBe(true);
    const peer=await open('peer',authorVersion==='old'?'candidate':'old');
    blockAuthorReads=true; // Reconnect can deliver a mutation before a successful refresh.
    await peer.getByRole('button',{name:/Clear Synthetic Journey Player manual recommendation/}).click();
    await expect(recommendationMessage(peer)).toContainText('recommendation cleared');
    expect(record.archivedAt).toBeTruthy();await expect(recommendationButton(peer)).not.toHaveClass(/is-active/);
    await author.evaluate(()=>{window.__medicalFeedback=[];});
    await recommendationButton(author).click();
    await expect.poll(()=>ledger.filter(e=>e.actor==='author'&&e.type==='recommendation-saved').length).toBe(2);
    await expect.poll(()=>author.evaluate(()=>window.__medicalFeedback.some(text=>/already set|could not|changed|review/i.test(text)))).toBe(true);
    const messages=await author.evaluate(()=>window.__medicalFeedback);
    console.log(JSON.stringify({mixedClientAcceptance:{authorVersion,peerArchived:true,duplicateRequest:true,messages}}));
    expect(messages.join('\n')).not.toContain('recommendation already set');
  }finally{await Promise.allSettled(contexts.map(c=>c.close()));}
});
