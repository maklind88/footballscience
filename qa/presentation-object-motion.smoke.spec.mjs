import { test, expect } from '@playwright/test';
async function open(page) {
  await page.setViewportSize({width:1414,height:762});
  await page.route('**/motion-harness', r => r.fulfill({ contentType: 'text/html', body: '<html><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/presentation-mode.css"></head><body></body></html>' }));
  await page.route('**/portrait.svg', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="teal"/></svg>' }));
  await page.goto('/motion-harness');
  await page.evaluate(async () => {
    const {createPresentationModeController,createPresentationModeRenderer} = await import('/src/modules/presentation-mode/index.mjs');
    window.controller = createPresentationModeController({documentRef:document,win:window,renderer:createPresentationModeRenderer(),getTodayValue:()=> '2026-11-05',
      getPlayerProfilesState:()=>({players:[{id:'p1',name:'Squad Player',rosterType:'squad',countsInSquad:true,photoUrl:'/portrait.svg'},{id:'guest',name:'Guest Player',countsInSquad:false,photoUrl:'/portrait.svg'}]}),
      readJson:(key,fallback)=>JSON.parse(localStorage.getItem(key)||'null')||fallback,
      writeJson:(key,value)=>localStorage.setItem(key,JSON.stringify(value)),
      isEditableTarget:e=>Boolean(e.closest('input,textarea,[contenteditable=true]')),
    });
    window.controller.bindInteractions();window.controller.open('2026-11-05');
  });
}
async function addEffect(page, effect) {
  await page.locator('[data-presentation-motion-menu] > summary').click();
  await page.locator(`[data-motion-add="${effect}"]`).click();
}
test('portrait click builds enter, move and exit before navigation and survive reload', async ({page}) => {
  await open(page);
  await page.locator('[data-presentation-players-menu] > summary').click();
  await expect(page.locator('[data-presentation-insert-player]')).toHaveCount(1);
  await page.locator('[data-presentation-insert-player="p1"]').click();
  const image = page.locator('.has-image');
  await expect(image.locator('img')).toBeVisible();
  await expect(image.locator('figcaption')).toHaveCount(0);
  await addEffect(page,'fade-in');
  await addEffect(page,'move');
  const start = await image.boundingBox();
  await image.hover();
  await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();
  await page.mouse.move(start.x+start.width/2+100,start.y+start.height/2+40,{steps:5});await page.mouse.up();
  await addEffect(page,'fade-out');
  const saved = await page.evaluate(()=>window.controller.getDeckForDate());
  const box = saved.textBoxes.cover[0];
  expect(box.playerId).toBe('p1');
  const steps = saved.textFieldStyles.cover[`textbox.${box.id}.text`].motion;
  expect(steps.map(s=>s.effect)).toEqual(['fade-in','move','fade-out']);
  expect(steps[1].x).toBeGreaterThan(5);
  await open(page);
  await expect(image.locator('img')).toBeVisible();
  await page.locator('[data-presentation-start]').click();
  await expect(image).toHaveCSS('opacity','0');
  await page.keyboard.press('ArrowRight');
  await expect(image).toHaveCSS('opacity','1');
  await page.evaluate(()=>window.controller.render());
  await expect(image).toHaveCSS('opacity','1');
  await page.keyboard.press('ArrowRight');
  const relativeDestination = () => image.evaluate(e => parseFloat(getComputedStyle(e).translate) / e.closest('.presentation-slide').getBoundingClientRect().width * 100);
  await expect.poll(relativeDestination).toBeCloseTo(steps[1].x, 1);
  // Resize the stage directly: Chromium forbids resizing a native fullscreen window.
  await page.locator('.presentation-stage').evaluate(e => { e.style.width = '800px'; });
  await expect.poll(() => page.locator('.presentation-stage').evaluate(e => e.getBoundingClientRect().width)).toBe(800);
  await expect.poll(relativeDestination).toBeCloseTo(steps[1].x, 1);
  await page.keyboard.press('ArrowRight');
  await expect(image).toHaveCSS('opacity','0');
  await page.keyboard.press('ArrowLeft');
  await expect(image).toHaveCSS('opacity','1');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.presentation-info-title')).toBeVisible();
});

async function customSlide(page) {
  await page.evaluate(() => {
    window.controller.writeDeckForDate('2026-11-05', deck => ({ ...deck, infoSlides: [...deck.infoSlides, {id:'motion-last', layout:'bullets', title:'Click builds', body:'Click this text'}], slideOrder: [...window.controller.buildModel().slides.map(s=>s.id),'motion-last'] }));
    window.controller.render();
  });
  await page.locator('[data-presentation-goto]').last().click();
}

test('text preview restores editing and last-slide clicks finish without restarting, including reduced motion', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await open(page); await customSlide(page);
  const title = page.locator('[data-presentation-motion-field="info.title"]');
  await title.click();
  await addEffect(page,'fade-in'); await addEffect(page,'fade-out');
  await page.locator('[data-presentation-motion-menu] > summary').click();
  await page.locator('[data-motion-preview]').click();
  await page.locator('[data-motion-next]').click();
  await expect(title).toHaveCSS('opacity','0');
  await page.locator('[data-motion-stop]').click();
  await expect(title).toBeVisible();
  await expect(title).toHaveCSS('opacity','1');
  await page.locator('[data-presentation-start]').click();
  await expect(title).toBeHidden();
  await expect(page.locator('[data-presentation-next]')).toBeEnabled();
  await page.locator('[data-presentation-motion-field="info.body"]').click();
  await expect(title).toBeVisible();
  await page.locator('[data-presentation-next]').click();
  await expect(title).toBeHidden();
  await expect(page.locator('[data-presentation-next]')).toBeDisabled();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await expect(title).toBeHidden();
  await page.keyboard.press('ArrowLeft');
  await expect(title).toBeVisible();
  await page.evaluate(()=>window.controller.close());
  await page.evaluate(()=>window.controller.open('2026-11-05'));
  await page.locator('[data-presentation-goto]').last().click();
  await expect(title).toBeVisible();
});

test('portraits and motion survive object duplication, slide duplication and copying to another date', async ({page}) => {
  await open(page); await customSlide(page);
  await page.locator('[data-presentation-players-menu] > summary').click();
  await page.locator('[data-presentation-insert-player="p1"]').click();
  await addEffect(page,'zoom-in');
  await page.locator('.has-image').click({button:'right'});
  await page.locator('[data-presentation-context-action="duplicate-object"]').click();
  await expect(page.locator('.has-image')).toHaveCount(2);
  await page.locator('[data-presentation-info-field="title"]').click();
  await page.locator('[data-presentation-duplicate-info]').click();
  await expect(page.locator('.has-image')).toHaveCount(2);
  const source = await page.evaluate(()=>window.controller.buildModel().slides[window.controller.buildModel().slideIndex]);
  expect(source.textBoxes.every(b=>b.playerId==='p1')).toBe(true);
  expect(Object.values(source.textFieldStyles).flatMap(s=>s.motion||[]).map(s=>s.effect)).toEqual(['zoom-in','zoom-in']);
  const copy = await page.evaluate(()=>window.controller.copyActiveSlideToDate('2026-11-06'));
  expect(copy.ok).toBe(true);
  await expect(page.locator('.has-image')).toHaveCount(2);
  const saved = await page.evaluate(()=>window.controller.getDeckForDate());
  expect(saved.textBoxes[copy.copiedSlideId]).toEqual(source.textBoxes.map(({mediaSrc,mediaName,mediaStatus,...box})=>box));
  expect(saved.textFieldStyles[copy.copiedSlideId]).toEqual(source.textFieldStyles);
  await page.locator('.has-image').last().click();
  await addEffect(page,'fade-out');
  await page.locator('[data-presentation-motion-menu] > summary').click();
  await page.locator('[data-motion-up="2"]').click();
  await page.locator('[data-presentation-motion-menu] > summary').click();
  await expect(page.locator('[data-presentation-motion-panel] li').nth(1)).toContainText('Fade out');
  await page.screenshot({path:'/private/tmp/presentation-animate-preview.png'});
  await page.locator('[data-motion-delete="1"]').click();
  const original = await page.evaluate(()=>window.controller.getDeckForDate('2026-11-05'));
  expect(original.textFieldStyles[source.id]).toEqual(source.textFieldStyles);
});


test('uploaded images animate on image slides and ordinary text boxes use the same click sequence', async ({page}) => {
  await open(page);
  await page.evaluate(() => {
    window.controller.writeDeckForDate('2026-11-05', deck => ({...deck, infoSlides:[...deck.infoSlides,{id:'image-slide',layout:'media',title:'Image',mediaKind:'image'}],slideOrder:[...window.controller.buildModel().slides.map(s=>s.id),'image-slide']}));
    window.controller.render();
  });
  await page.locator('[data-presentation-goto]').last().click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-presentation-info-media-pick="image"]').click();
  await (await chooser).setFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEtwJ+gN7uXQAAAABJRU5ErkJggg==','base64')});
  const photo = page.locator('[data-presentation-motion-field="info.media"]');
  await expect(photo.locator('img')).toHaveAttribute('src',/^blob:/);
  await photo.locator('img').click();
  await addEffect(page,'slide-in');
  await page.locator('[data-presentation-text-toolbar] [data-presentation-add-text-box]').click();
  const box = page.locator('[data-presentation-text-box-shell]');
  await addEffect(page,'fade-out');
  await page.locator('[data-presentation-start]').click();
  await expect(photo).toBeHidden();
  await expect(box).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(photo).toHaveCSS('opacity','1');
  await page.keyboard.press('ArrowRight');
  await expect(box).toHaveCSS('opacity','0');
  await page.locator('[data-presentation-exit-fullscreen]').click();
  await expect(box).toBeVisible();
  await expect(photo).toBeVisible();
});
