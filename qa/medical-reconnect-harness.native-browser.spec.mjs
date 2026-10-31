import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { medicalConfirmationPostgres } from './helpers/medical-confirmation-postgres.mjs';
import { id } from './helpers/relations-permissions-postgres.mjs';
import { installSetPiecesCentralFixture } from './helpers/set-pieces-central-fixture.mjs';
import { createMedicalJourneyGuard } from './helpers/medical-journey-staging-guard.mjs';
import { createJourneyRequestHandler, openJourneyMedical, verifyStagingJourneyViews } from './helpers/medical-journey-staging-browser.mjs';
import { exerciseMedicalReconnect } from './helpers/medical-reconnect-scenario.mjs';
import { medicalKey } from './helpers/save-acceptance-staging.mjs';

// Exact staging scenario/guard + real browser/API/PG. Authentication and baseline
// are synthetic, and HTTP is confined to the local test server. No staging access.
test('staging reconnect rehearsal preserves peer archive across both cold views', async ({browser, baseURL}) => {
  const database = await medicalConfirmationPostgres(), contexts = [], ledger = [];
  const fixture = {run:'qa-save-reconnect',day:'2026-11-02',player:{id:'qa-save-reconnect-player',name:'Synthetic Reconnect',
    rosterType:'squad',countsInSquad:true,status:'available',position:'Midfielder'}};
  const guard = {isArmed:()=>false};
  const read = async () => ({state:await database.state(), revision:Number(await database.sql("select revision from platform_app_state_records where state_key='football-medical-team-v1'"))});
  const server = createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      let result;
      if(req.method==='GET') {
        if(url.pathname==='/api/medical')result={status:200,json:{ok:true,mode:'database',enabled:true}};
        else {
          const {state,revision}=await read();
          const keys=url.searchParams.get('keys')?.split(',')||[medicalKey,'football-player-profiles-v1','football-schedule-v1','football-session-planner-v3'];
          const entries={[medicalKey]:JSON.stringify(state),'football-player-profiles-v1':JSON.stringify({rosterVersion:'qa-reconnect',players:[]})};
          result={status:200,json:{ok:true,entries:Object.fromEntries(keys.filter(k=>k in entries).map(k=>[k,entries[k]])),
            metadata:Object.fromEntries(keys.filter(k=>k in entries).map(k=>[k,{revision,organizationId:'set-pieces-org'}])),absentKeys:keys.filter(k=>!(k in entries))}};
        }
      } else {
        if(url.pathname!=='/api/medical')throw new Error('Generic delivery must remain blocked');
        let raw='';for await(const part of req)raw+=part;
        result=await database.handle(JSON.parse(raw),1);
      }
      res.writeHead(result.status,{'Content-Type':'application/json'});res.end(JSON.stringify(result.json));
    } catch {res.writeHead(500);res.end('{}');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const upstream='http://127.0.0.1:'+server.address().port;
  const qa={origin:baseURL,primary:{user:{id:id(1)}},peer:{user:{id:id(2)}},identity:async()=>{},read};
  async function open(actor,writable) {
    const context=await browser.newContext({serviceWorkers:'block'});contexts.push(context);
    const page=await context.newPage(),auth=await installSetPiecesCentralFixture(page);auth.actor.id=id(actor);
    await page.clock.setFixedTime(new Date('2026-10-31T10:00:00Z'));
    const routing=createJourneyRequestHandler({qa,fixture,guard,mode:'peer-archived',ledger,writable});
    const toServer=route=>routing.handler(new Proxy(route,{get(target,property){
      if(property==='fetch')return options=>route.fetch({...options,url:upstream+new URL(route.request().url()).pathname+new URL(route.request().url()).search});
      const value=target[property];return typeof value==='function'?value.bind(target):value;
    }}));
    await page.route('**/api/app-state**',toServer);await page.route('**/api/medical',toServer);
    await page.goto('/?workspace=medical-team');await openJourneyMedical(page,fixture);
    return {page,context,...routing};
  }
  try {
    const author=await open(1,true);
    const baseline=await author.page.evaluate(async playerId=>{
      const state=(await import('/src/modules/medical/medical-runtime-accessors.mjs')).ensureMedicalState();
      return {...state,players:state.players.filter(p=>p.id!==playerId),records:[]};
    },fixture.player.id);
    // Local synthetic seed only. The real staging test never normalizes/replaces its baseline.
    await database.sql("update platform_app_state_records set value='"+JSON.stringify(baseline).replaceAll("'","''")+"' where state_key='football-medical-team-v1'");
    Object.assign(guard,createMedicalJourneyGuard({...fixture,actorId:id(1),baseline}));guard.arm();
    await author.page.getByRole('button',{name:fixture.player.name+' 50% training recommendation',exact:true}).click();
    await expect(author.page.locator('.medical-message')).toContainText('50% recommendation saved');
    guard.seal();
    await exerciseMedicalReconnect({qa,fixture,guard,author,ledger,now:()=>new Date('2026-10-31T11:00:00Z'),archive:async(body,account)=>{
      expect(account).toBe(qa.peer);const result=await database.handle(body,2);
      expect(result.status).toBe(200);expect(result.json.canonicalStored).toBe(true);
    }});
    const peer=await open(2,false);
    for(const client of [author,peer]){
      await client.page.reload();await verifyStagingJourneyViews(client.page,fixture,null);
      expect(client.errors).toEqual([]);
    }
    expect(ledger.filter(e=>e.stage==='archived-replay-conflict')).toHaveLength(1);
    expect(ledger.some(e=>e.stage==='generic-server-response')).toBe(false);
    expect((await database.state()).records[0].archivedAt).toBeTruthy();
  } finally {
    await Promise.allSettled(contexts.map(context=>context.close()));
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await database.db.close();
  }
});
