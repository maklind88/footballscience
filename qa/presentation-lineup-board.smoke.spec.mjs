import { test, expect } from '@playwright/test';
async function open(page, viewport = {width:1414,height:763}) {
  await page.setViewportSize(viewport);
  await page.route('**/lineup-harness', r => r.fulfill({contentType:'text/html',body:'<html><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/presentation-mode.css"></head><body></body></html>'}));
  await page.route('**/lineup-photo.svg', r => r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="220"><rect width="160" height="220" fill="#dde8ee"/><ellipse cx="80" cy="72" rx="32" ry="40" fill="#b88162"/><path d="M20 220v-50q60-60 120 0v50" fill="#203c65"/><path d="M48 60q-6-55 32-44q44-3 32 45q-15-22-30-25z" fill="#46382f"/></svg>'}));
  await page.goto('/lineup-harness');
  await page.evaluate(async () => {
    const {createPresentationModeController,createPresentationModeRenderer} = await import('/src/modules/presentation-mode/index.mjs');
    window.profiles = {players:Array.from({length:24}, (_,i)=>({id:`p${i+1}`, name:['Kailen Sheridan','Madison White','Molly Pritchard','Dani Weatherholt','Ella Hase','Feli Rauch','Ashley Sanchez','Denise O’Sullivan','Ryan Williams','Manaka Matsukubo','Jaedyn Shaw'][i%11]+(i>=11?' II':''),countsInSquad:true,rosterType:'squad',photoUrl:i===23?'':'/lineup-photo.svg'})).concat([{id:'guest',name:'Guest',countsInSquad:false,photoUrl:'/lineup-photo.svg'}])};
    window.controller=createPresentationModeController({documentRef:document,win:window,renderer:createPresentationModeRenderer(),getTodayValue:()=> '2026-11-06',getPlayerProfilesState:()=>window.profiles,
      readJson:(key,fallback)=>JSON.parse(localStorage.getItem(key)||'null')||fallback,writeJson:(key,value)=>{if(window.failWrite) throw new Error('Storage unavailable');localStorage.setItem(key,JSON.stringify(value));},isEditableTarget:e=>Boolean(e.closest('input,textarea,select,[contenteditable=true]'))});
    window.controller.bindInteractions();window.controller.open('2026-11-06');
    if (!window.controller.getDeckForDate().infoSlides.some(s=>s.id==='teams-test')) {
      window.controller.writeDeckForDate('2026-11-06',d=>({...d,infoSlides:[...d.infoSlides,{id:'teams-test',layout:'bullets',title:'Teams',body:''}],slideOrder:[...window.controller.buildModel().slides.map(s=>s.id),'teams-test']}));window.controller.render();
    }
  });
  await page.locator('[data-presentation-goto]').last().click();
}
async function insert(page, count=2) {
  await page.locator('[data-presentation-players-menu] > summary').click();
  await page.locator(`[data-lineup-insert="${count}"]`).click();
}
const board = page => page.locator('.presentation-lineup-board');
const assignments = page => page.evaluate(()=>window.controller.getDeckForDate().textBoxes['teams-test'].map(b=>b.lineup));
async function choose(page, id) { await page.locator(`[data-lineup-player="${id}"]`).click(); }

test('two lineups fill quickly, swap positions, retain references and persist through undo, slide navigation and reload',async({page})=>{
  await open(page);await insert(page);
  await expect(board(page)).toHaveCount(2);
  const heading=await page.locator('.presentation-info-title').boundingBox();
  expect((await board(page).first().boundingBox()).y).toBeGreaterThan(heading.y+heading.height);
  await expect(board(page).first().locator('[data-lineup-slot]')).toHaveCount(11);
  await board(page).first().locator('[data-lineup-slot="gk"]').click();
  await expect(page.locator('[data-lineup-player="guest"]')).toHaveCount(0);
  await page.screenshot({path:'/private/tmp/presentation-lineup-selection.png'});
  for(let i=1;i<=11;i++) await choose(page,`p${i}`);
  await expect(page.locator('[data-lineup-picker]')).toHaveCount(0);
  await board(page).nth(1).locator('[data-lineup-slot="gk"]').click();
  const pickerRect=await page.locator('[data-lineup-picker]').boundingBox();
  expect(pickerRect.x+pickerRect.width).toBeLessThan((await board(page).nth(1).boundingBox()).x);
  for(let i=12;i<=22;i++) await choose(page,`p${i}`);
  await expect(page.locator('[data-lineup-picker]')).toHaveCount(0);
  expect((await assignments(page)).map(x=>Object.keys(x).length)).toEqual([11,11]);
  const before = await assignments(page);
  await board(page).first().locator('[data-lineup-slot="gk"]').click();await choose(page,'p2');
  expect((await assignments(page))[0]).toMatchObject({gk:'p2',lb:'p1'});
  await page.keyboard.press('ControlOrMeta+z');
  expect(await assignments(page)).toEqual(before);
  await page.locator('[data-presentation-goto="0"]').click();await page.locator('[data-presentation-goto]').last().click();
  expect(await assignments(page)).toEqual(before);
  await open(page);expect(await assignments(page)).toEqual(before);
  await page.screenshot({path:'/private/tmp/presentation-two-lineups.png'});
  // Profile changes are read-only inputs; saved assignments keep their stable IDs.
  await page.evaluate(()=>{window.profiles.players[0].name='Updated name';window.controller.render();});
  await expect(board(page).first().locator('[data-lineup-slot="gk"]')).toHaveAttribute('title','Updated name');
  expect(await assignments(page)).toEqual(before);
  await page.locator('[data-presentation-start]').click();
  await expect(board(page).locator('button')).toHaveCount(0);
  expect(await assignments(page)).toEqual(before);
});

test('clear, missing photo, search, native text keys, deletion and undo keep other positions intact',async({page})=>{
  await open(page);await insert(page,1);
  await board(page).locator('[data-lineup-slot="gk"]').click();
  const search=page.locator('[data-lineup-search]');
  await search.fill('Kailen');await search.press('Backspace');
  await expect(board(page)).toHaveCount(1);
  await expect(page.locator('[data-lineup-player]:visible')).toHaveCount(3);
  await search.fill('unmatchable');await expect(page.locator('[data-lineup-no-results]')).toBeVisible();
  await search.fill('');await choose(page,'p24');
  await page.keyboard.press('Escape');
  await expect(board(page).locator('[data-lineup-slot="gk"] img')).toHaveCount(0);
  expect((await assignments(page))[0].gk).toBe('p24');
  await board(page).locator('[data-lineup-slot="gk"]').click();
  await page.locator('[data-lineup-clear]').click();await page.keyboard.press('Escape');
  expect((await assignments(page))[0]).toEqual({});
  await page.keyboard.press('ControlOrMeta+z');
  expect((await assignments(page))[0].gk).toBe('p24');
  await page.getByRole('button',{name:'Delete selected object',exact:true}).click();
  await expect(board(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(board(page)).toHaveCount(1);
  expect((await assignments(page))[0].gk).toBe('p24');
  await open(page);expect((await assignments(page))[0].gk).toBe('p24');
});

for(const viewport of [{width:1414,height:763},{width:1024,height:768},{width:390,height:844}]) {
  test(`lineups scale without overlapping circles or pitch bounds at ${viewport.width}px`,async({page})=>{
    await open(page,viewport);await insert(page);
    const geometry=await board(page).evaluateAll(boards=>boards.map(b=>{
      const rect=b.getBoundingClientRect();
      const slots=[...b.querySelectorAll('.presentation-lineup-board-avatar')].map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,radius:getComputedStyle(e).borderRadius};});
      return{x:rect.x,y:rect.y,w:rect.width,h:rect.height,slots};
    }));
    expect(geometry[0].x+geometry[0].w).toBeLessThan(geometry[1].x);
    for(const b of geometry) for(const [i,s] of b.slots.entries()) {
      expect(Math.abs(s.w-s.h)).toBeLessThan(1);expect(s.radius).toBe('50%');
      expect(s.x).toBeGreaterThanOrEqual(b.x);expect(s.x+s.w).toBeLessThanOrEqual(b.x+b.w+1);
      expect(s.y).toBeGreaterThanOrEqual(b.y);expect(s.y+s.h).toBeLessThanOrEqual(b.y+b.h+1);
      for(const t of b.slots.slice(i+1)) expect(s.x+s.w<=t.x||t.x+t.w<=s.x||s.y+s.h<=t.y||t.y+t.h<=s.y).toBe(true);
    }
  });
}

test('a long squad picker has separated circular cards, and an individual portrait remains circular',async({page})=>{
  await open(page);await page.locator('[data-presentation-players-menu] > summary').click();
  const cards=page.locator('[data-presentation-insert-player]');
  await expect(cards).toHaveCount(24);
  const a=await cards.nth(0).boundingBox(), b=await cards.nth(3).boundingBox();
  expect(a.y+a.height).toBeLessThan(b.y);
  await expect(cards.first().locator('img')).toHaveCSS('border-radius','50%');
  await page.screenshot({path:'/private/tmp/presentation-lineup-picker.png'});
  await cards.first().click();
  const photo=page.locator('.is-player-portrait .presentation-local-media-box');
  const bounds=await photo.boundingBox();expect(Math.abs(bounds.width-bounds.height)).toBeLessThan(1);
  await expect(photo).toHaveCSS('border-radius','50%');
});

test('a failed save keeps the selected position open and announces failure before a successful retry',async({page})=>{
  await open(page);await insert(page,1);
  await board(page).locator('[data-lineup-slot="gk"]').click();
  await page.evaluate(()=>window.failWrite=true);
  await choose(page,'p1');
  await expect(page.locator('[data-lineup-save-status]')).toContainText('could not be saved');
  expect((await assignments(page))[0]).toEqual({});
  await expect(page.locator('[data-lineup-picker] h2')).toContainText('GK');
  await page.evaluate(()=>window.failWrite=false);await choose(page,'p1');
  expect((await assignments(page))[0].gk).toBe('p1');
  await page.keyboard.press('Escape');await open(page);
  expect((await assignments(page))[0].gk).toBe('p1');
});

test('lineup movement and proportional resize persist, and copies retain assignments and click animations',async({page})=>{
  await open(page);await insert(page,1);
  await board(page).locator('[data-lineup-slot="gk"]').click();await choose(page,'p1');await page.keyboard.press('Escape');
  const shell=page.locator('.presentation-free-text-box-shell.is-lineup');
  const before=await shell.boundingBox();
  const header=await board(page).locator('header').boundingBox();
  await page.mouse.move(header.x+header.width/2,header.y+header.height/2);await page.mouse.down();await page.mouse.move(header.x+header.width/2+35,header.y+header.height/2-20,{steps:4});await page.mouse.up();
  expect((await shell.boundingBox()).x).toBeGreaterThan(before.x+20);
  const handle=shell.locator('[data-presentation-resize-text-box][data-presentation-resize-axis="se"]');
  const h=await handle.boundingBox();
  await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x-70,h.y-12,{steps:5});await page.mouse.up();
  const after=await shell.boundingBox();
  expect(after.width).toBeLessThan(before.width);expect(after.width/after.height).toBeCloseTo(before.width/before.height,1);
  await page.locator('[data-presentation-motion-menu] > summary').click();await page.locator('[data-motion-add="fade-in"]').click();
  await board(page).locator('header').click({button:'right'});await page.locator('[data-presentation-context-action="duplicate-object"]').click();
  await expect(board(page)).toHaveCount(2);
  const source=await page.evaluate(()=>window.controller.buildModel().slides[window.controller.buildModel().slideIndex]);
  expect(source.textBoxes.every(b=>b.lineup.gk==='p1')).toBe(true);
  const copied=await page.evaluate(()=>window.controller.copyActiveSlideToDate('2026-11-07'));
  expect(copied.ok).toBe(true);
  const saved=await page.evaluate(()=>window.controller.getDeckForDate());
  expect(saved.textBoxes[copied.copiedSlideId]).toEqual(source.textBoxes);
  expect(saved.textFieldStyles[copied.copiedSlideId]).toEqual(source.textFieldStyles);
  await page.locator('[data-presentation-start]').click();
  await expect(page.locator('.is-lineup').first()).toHaveCSS('opacity','0');
  await page.keyboard.press('ArrowRight');
  await expect.poll(()=>page.locator('.is-lineup').evaluateAll(els=>els.filter(e=>getComputedStyle(e).opacity==='1').length)).toBe(1);
  await page.keyboard.press('ArrowRight');
  await expect.poll(()=>page.locator('.is-lineup').evaluateAll(els=>els.filter(e=>getComputedStyle(e).opacity==='1').length)).toBe(2);
});

test('bib colors default to Blue and Red and persist independently with undo and save failure feedback',async({page})=>{
  await open(page);await insert(page);
  const colors=page.locator('[data-lineup-color]');
  await expect(colors.nth(0)).toHaveValue('Blue');await expect(colors.nth(1)).toHaveValue('Red');
  await colors.first().selectOption('Green');
  await expect(colors.first()).toHaveValue('Green');await expect(colors.nth(1)).toHaveValue('Red');
  await page.keyboard.press('ControlOrMeta+z');await expect(colors.first()).toHaveValue('Blue');
  await colors.first().selectOption('Yellow');
  await open(page);await expect(colors.first()).toHaveValue('Yellow');await expect(colors.nth(1)).toHaveValue('Red');
  await page.evaluate(()=>window.failWrite=true);await colors.first().selectOption('Orange');
  await expect(colors.first()).toHaveValue('Yellow');await expect(board(page).first().locator('[data-lineup-color-status]')).toContainText('could not be saved');
  await page.evaluate(()=>window.failWrite=false);await colors.first().selectOption('White');
  await board(page).first().locator('[data-lineup-slot="gk"]').click();await expect(page.locator('[data-lineup-picker] header')).toContainText('White');await page.keyboard.press('Escape');
  await page.locator('[data-presentation-start]').click();
  await expect(page.locator('[data-lineup-color]')).toHaveCount(0);
  await expect(board(page).first().locator('header')).toContainText('White');
  await expect(board(page).nth(1).locator('header')).toContainText('Red');
});
