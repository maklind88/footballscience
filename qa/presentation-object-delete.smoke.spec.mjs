import { test, expect } from '@playwright/test';
async function open(page) {
  await page.setViewportSize({width:1414,height:763});
  await page.route('**/delete-harness', route => route.fulfill({contentType:'text/html',body:'<html><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/presentation-mode.css"></head><body></body></html>'}));
  await page.goto('/delete-harness');
  await page.evaluate(async () => {
    const {createPresentationModeController,createPresentationModeRenderer} = await import('/src/modules/presentation-mode/index.mjs');
    window.controller = createPresentationModeController({documentRef:document,win:window,renderer:createPresentationModeRenderer(),getTodayValue:()=> '2026-11-06',getDraftScope:()=> 'deletion-test',
      readJson:(key,fallback)=>JSON.parse(localStorage.getItem(key)||'null')||fallback,writeJson:(key,value)=>localStorage.setItem(key,JSON.stringify(value)),
      isEditableTarget:e=>Boolean(e.closest('input,textarea,select,[contenteditable=true]')),
    });
    window.controller.bindInteractions();window.controller.open('2026-11-06');
  });
}
async function seed(page, boxes) {
  await page.evaluate(boxes => {
    window.controller.writeDeckForDate('2026-11-06', deck => ({...deck,textBoxes:{cover:boxes}}));
    window.controller.render();
  }, boxes);
}
test('an empty text object can be selected by its canvas and deleted with Backspace', async ({page}) => {
  await open(page);
  await seed(page,[{id:'empty',kind:'text',text:'',x:40,y:35,width:30,height:12}]);
  const box=page.locator('[data-presentation-text-box-shell]');
  await box.click({position:{x:40,y:40}});
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-presentation-mode-shell]')).toBeVisible();
  await page.keyboard.press('Backspace');
  expect(await page.evaluate(()=>window.controller.getDeckForDate().textBoxes.cover || [])).toHaveLength(0);
  await expect(box).toHaveCount(0);
  await page.evaluate(()=>window.controller.render());
  await expect(box).toHaveCount(0);
});


async function seedImage(page, embedded = false) {
  await page.evaluate(async embedded => {
    const {createPresentationLocalMediaStore} = await import('/src/modules/presentation-mode/presentation-local-media-store.mjs');
    await createPresentationLocalMediaStore({win:window}).save({id:'delete-image',kind:'image',file:new File(['<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="teal"/></svg>'],'photo.svg',{type:'image/svg+xml'})});
    window.controller.writeDeckForDate('2026-11-06', deck => embedded ? ({...deck,infoSlides:[...deck.infoSlides,{id:'photo-slide',layout:'media',title:'Keep this slide',mediaKind:'image',mediaId:'delete-image'}],slideOrder:[...window.controller.buildModel().slides.map(s=>s.id),'photo-slide']}) : ({...deck,textBoxes:{cover:[{id:'photo',kind:'image',text:'Photo',mediaId:'delete-image',x:10,y:60,width:20,height:25}]},textFieldStyles:{cover:{'textbox.photo.text':{motion:[{effect:'fade-in',order:1,duration:300}]}}}}));
    window.controller.render();
  },embedded);
  if (embedded) await page.locator('[data-presentation-goto]').last().click();
  await expect(page.locator(embedded ? '.presentation-info-media-object' : '.presentation-local-media-object')).toHaveAttribute('src',/^blob:/);
}

test('Delete object removes edited text, cleans its draft, and Undo restores the latest text', async ({page}) => {
  await open(page);
  await page.locator('[data-presentation-text-toolbar] [data-presentation-add-text-box]').click();
  const text = page.locator('.presentation-free-text-box');
  await text.fill('Keep my latest edit!');
  await text.press('Backspace');
  await expect(text).toHaveText('Keep my latest edit');
  await expect(page.locator('[data-presentation-text-box-shell]')).toHaveCount(1);
  await page.screenshot({path:'/private/tmp/presentation-delete-object-control.png'});
  await page.getByRole('button',{name:'Delete selected object',exact:true}).click();
  await expect(page.locator('[data-presentation-text-box-shell]')).toHaveCount(0);
  await expect(page.locator('[data-presentation-draft-recovery]')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(text).toHaveText('Keep my latest edit');
  await page.getByRole('button',{name:'Delete selected object',exact:true}).click();
  await open(page);
  await expect(page.locator('[data-presentation-text-box-shell]')).toHaveCount(0);
  await expect(page.locator('[data-presentation-draft-recovery]')).toHaveCount(0);
});

test('clicking an image after editing a heading makes Delete remove the image, with reversible animation cleanup', async ({page}) => {
  await open(page); await seedImage(page);
  const heading = page.locator('[data-presentation-text-field="cover.title"]');
  const title = await heading.innerText();
  await heading.click();
  await page.locator('.presentation-local-media-box.is-image').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-presentation-text-box-shell]')).toHaveCount(0);
  await expect(heading).toHaveText(title);
  expect(await page.evaluate(()=>window.controller.getDeckForDate().textFieldStyles.cover?.['textbox.photo.text'])).toBeUndefined();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.presentation-local-media-object')).toHaveAttribute('src',/^blob:/);
  expect(await page.evaluate(()=>window.controller.getDeckForDate().textFieldStyles.cover['textbox.photo.text'].motion[0].effect)).toBe('fade-in');
  await page.getByRole('button',{name:'Delete selected object',exact:true}).click();
  await open(page);
  await expect(page.locator('[data-presentation-text-box-shell]')).toHaveCount(0);
});

test('symbols and shapes can be deleted without changing the slide or its heading', async ({page}) => {
  await open(page);
  await seed(page,[{id:'symbol',kind:'symbol',text:'★',x:40,y:30,width:15,height:15}]);
  await page.locator('.presentation-free-text-box').click();
  await page.getByRole('button',{name:'Delete selected object',exact:true}).click();
  await page.evaluate(()=>{
    window.controller.writeDeckForDate('2026-11-06',deck=>({...deck,shapes:{cover:[{id:'shape',type:'rect',x:40,y:30,width:20,height:20}]}}));
    window.controller.render();
  });
  await page.locator('[data-presentation-text-field="cover.title"]').click();
  await page.locator('[data-presentation-shape-id="shape"]').click();
  await page.keyboard.press('Backspace');
  await expect(page.locator('[data-presentation-shape]')).toHaveCount(0);
  await expect(page.locator('[data-presentation-mode-shell]')).toBeVisible();
  await page.locator('[data-presentation-text-field="cover.title"]').click();
  await expect(page.locator('[data-presentation-delete-object]')).toHaveCount(0);
});

test('removing an embedded image preserves the slide and attachment for Undo', async ({page}) => {
  await open(page); await seedImage(page,true);
  await page.locator('.presentation-info-media-object').click();
  await page.getByRole('button',{name:'Delete selected object',exact:true}).click();
  await expect(page.locator('.presentation-info-media-object')).toHaveCount(0);
  await expect(page.locator('.presentation-info-title')).toHaveValue('Keep this slide');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.presentation-info-media-object')).toHaveAttribute('src',/^blob:/);
  await page.locator('[data-presentation-start]').click();
  await expect(page.locator('[data-presentation-delete-object]')).toHaveCount(0);
  await page.keyboard.press('Delete');
  await expect(page.locator('.presentation-info-media-object')).toBeVisible();
});
