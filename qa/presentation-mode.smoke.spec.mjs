import { expect, test } from "@playwright/test";

const scheduleKey = "football-schedule-v1";
const periodizationKey = "football-periodization-v2";
const sessionPlannerKey = "football-session-planner-v3";
const medicalKey = "football-medical-team-v1";
const presentationKey = "football-dashboard-presentation-mode-v1";

async function waitForPlatformShell(page) {
  await page.waitForFunction(
    () => {
      const shell = document.getElementById("hubShell");
      const loginScreen = document.getElementById("loginScreen");
      return Boolean(
        window.__footballScienceAppReady &&
          document.body?.dataset.appReady === "true" &&
          shell &&
          !shell.hidden &&
          loginScreen &&
          loginScreen.hidden &&
          !document.body.classList.contains("is-booting")
      );
    },
    null,
    { timeout: 20_000 }
  );
}

async function dismissDashboardModal(page) {
  await page
    .evaluate(() => {
      const modalRoot = document.getElementById("dashboardModalRoot");
      const closeButton = modalRoot?.querySelector(
        "button[data-dashboard-news-dismiss], button[data-dashboard-tutorial-never], button[data-dashboard-tutorial-save], button[data-dashboard-modal-close]"
      );
      closeButton?.click();
    })
    .catch(() => {});
}

test("Presentation Mode opens from Home and renders the planned training deck", async ({ page }) => {
  const dateValue = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const expectedDateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${dateValue}T00:00:00`));

  await page.addInitScript(
    ({ dateValue: seededDate, now: seededNow, keys }) => {
      window.localStorage.setItem(
        keys.schedule,
        JSON.stringify({
          selectedDate: seededDate,
          events: [
            {
              id: "qa-presentation-training",
              date: seededDate,
              time: "10:30",
              type: "training",
              title: "Matchday Presentation Training",
            },
          ],
        })
      );
      window.localStorage.setItem(
        keys.periodization,
        JSON.stringify({
          selectedDate: seededDate,
          days: {
            [seededDate]: {
              sessionType: "Training briefing",
              matchDay: "MD-2",
              physicalLoad: "High",
              pitchSize: "2/3 pitch",
              mainFocus: "Build-up and final-third connections",
              matchPhases: ["In Possession"],
              subPhases: ["Build Up", "Final Third"],
              preTrainingVideo: "Press trigger clips",
            },
          },
        })
      );
      window.localStorage.setItem(
        keys.sessionPlanner,
        JSON.stringify({
          selectedDate: seededDate,
          sessions: {
            [seededDate]: {
              id: "qa-presentation-session",
              date: seededDate,
              title: "Matchday Presentation Training",
              theme: "Build-up and final-third connections",
              selectedBlockId: "qa-presentation-block-1",
              blocks: [
                {
                  id: "qa-presentation-block-1",
                  label: "Block 1",
                  title: "Possession (7v3)",
                  focus: "- Tempo\n- Third-player support",
                  phase: "In Possession",
                  subPhase: "Build Up, Creating Phase",
                  minutes: 10,
                  pitchSize: "2/3 pitch",
                  objective: "- Connect through pressure",
                  organization: "- 7v7 + 3 neutrals",
                  principles: "- Scan early\n- Play forward when open",
                  diagram: "half-pitch",
                  tacticalElements: [],
                  playerBoardPositions: {},
                  playerBoardColors: {
                    "ncc-2026-madison-white": "#22c55e",
                    "ncc-2026-kailen-sheridan": "#f59e0b",
                  },
                  playerBoardCustomPeople: [{ id: "qa-staff-1", name: "Lead Coach", kind: "staff", role: "Staff" }],
                },
              ],
            },
          },
        })
      );
      window.localStorage.setItem(
        keys.medical,
        JSON.stringify({
          __medicalAutoCloseActual: false,
          selectedDate: seededDate,
          selectedPlayerId: "ncc-2026-madison-white",
          players: [],
          records: [
            {
              id: "qa-record-1",
              playerId: "ncc-2026-madison-white",
              date: seededDate,
              status: "full",
              participation: 100,
              actualParticipation: "not-logged",
              shareWithCoach: true,
              createdAt: seededNow,
              updatedAt: seededNow,
            },
            {
              id: "qa-record-2",
              playerId: "ncc-2026-kailen-sheridan",
              date: seededDate,
              status: "unavailable",
              participation: 0,
              actualParticipation: "not-logged",
              shareWithCoach: true,
              createdAt: seededNow,
              updatedAt: seededNow,
            },
          ],
          injuryPlans: [],
        })
      );
      window.localStorage.setItem(
        keys.presentation,
        JSON.stringify({
          schema: "footballscience-presentation-mode-v1",
          version: 1,
          decks: {
            [seededDate]: {
              updatedAt: seededNow,
              infoSlides: [
                {
                  id: "qa-info",
                  title: "Daily Info",
                  body: "- Arrive ready\n- Bring GPS\n- Staff huddle after block 1",
                  fontSize: "large",
                  accentColor: "#38bdf8",
                  textColor: "#f8fafc",
                },
              ],
            },
          },
        })
      );
    },
    {
      dateValue,
      now,
      keys: {
        schedule: scheduleKey,
        periodization: periodizationKey,
        sessionPlanner: sessionPlannerKey,
        medical: medicalKey,
        presentation: presentationKey,
      },
    }
  );

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await dismissDashboardModal(page);

  const card = page.locator("[data-dashboard-presentation-card]");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Presentation Mode");
  await expect(card).not.toContainText("Matchday Presentation Training");
  const homeDayOptions = await card
    .locator("[data-dashboard-presentation-date] option")
    .evaluateAll((options) => options.map((option) => option.textContent?.trim() || ""));
  expect(homeDayOptions).toContain(expectedDateLabel);
  for (const optionText of homeDayOptions) {
    expect(optionText).not.toContain("Matchday Presentation Training");
    expect(optionText).not.toContain("blocks");
    expect(optionText).not.toContain("min");
  }

  await card.locator("[data-dashboard-open-presentation]").click();
  const presentation = page.locator("[data-presentation-mode-shell]");
  await expect(presentation).toBeVisible();
  await expect(presentation).toContainText("Matchday Presentation Training");
  await expect(presentation.locator("[data-presentation-pass-select]")).toHaveCount(0);
  await expect(presentation.locator("[data-presentation-date-input]")).toHaveValue(dateValue);
  await expect(presentation.locator(".presentation-control-brand strong")).toHaveText("Presentation Mode");
  await expect(presentation.locator(".presentation-control-brand")).not.toContainText("Matchday Presentation Training");
  await expect(presentation.locator(".presentation-pass-controls label > span", { hasText: /^Date$/ })).toHaveCount(0);
  await expect(presentation.locator("[data-presentation-theme-menu]")).toBeVisible();
  await expect(presentation.locator("[data-presentation-theme-menu] summary")).toHaveText("Theme");
  await expect(presentation.locator("[data-presentation-theme-preset='stadium']")).toBeHidden();
  await expect(presentation.locator("[data-presentation-style-field='theme']")).toHaveValue("classic");
  await expect(presentation.locator("[data-presentation-delete-slide]")).toBeDisabled();
  await presentation.locator("[data-presentation-theme-menu] summary").click();
  await expect(presentation.locator("[data-presentation-theme-preset='stadium']")).toBeVisible();
  const themeMenuLayout = await presentation.evaluate(() => {
    const popover = document.querySelector(".presentation-theme-popover");
    const slide = document.querySelector(".presentation-slide");
    const button = document.querySelector(".presentation-theme-button");
    if (!popover || !slide || !button) return null;
    const popoverRect = popover.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();
    const buttonStyle = getComputedStyle(button);
    return {
      aboveSlide: popoverRect.top < slideRect.top,
      readableButton: buttonStyle.color === "rgb(248, 250, 252)",
      cardCount: document.querySelectorAll("[data-presentation-theme-preset]").length,
    };
  });
  expect(themeMenuLayout).toMatchObject({
    aboveSlide: true,
    readableButton: true,
  });
  expect(themeMenuLayout?.cardCount).toBeGreaterThanOrEqual(9);
  await presentation.locator("[data-presentation-theme-preset='stadium']").click();
  await expect(presentation.locator(".presentation-slide-cover")).toHaveClass(/is-theme-stadium/);
  await presentation.locator("[data-presentation-theme-menu] summary").click();
  await presentation.locator("[data-presentation-style-field='theme']").selectOption("matchday");
  await expect(presentation.locator(".presentation-slide-cover")).toHaveClass(/is-theme-matchday/);
  const coverTheme = await presentation.locator(".presentation-slide-cover").evaluate((slide) => {
    const style = getComputedStyle(slide);
    return {
      accent: style.getPropertyValue("--presentation-accent").trim(),
      background: style.getPropertyValue("--presentation-slide-bg").trim(),
      glow: style.getPropertyValue("--presentation-slide-glow").trim(),
      text: style.getPropertyValue("--presentation-slide-text").trim(),
    };
  });
  expect(coverTheme).toMatchObject({
    accent: "#f59e0b",
    background: "#14110b",
    glow: "#d92d3f",
    text: "#ffffff",
  });
  const coverTitle = presentation.locator('[data-presentation-text-field="cover.title"]');
  await expect(coverTitle).toHaveAttribute("contenteditable", "true");
  await coverTitle.click();
  await page.keyboard.press("ArrowRight");
  await expect(presentation.locator(".presentation-progress strong")).toHaveText("1");
  await coverTitle.evaluate((element) => {
    element.textContent = "Session Briefing";
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: "Session Briefing", inputType: "insertText" }));
  });
  await expect(coverTitle).toHaveText("Session Briefing");
  const storedCoverTitle = await page.evaluate(
    ({ key, date }) => JSON.parse(window.localStorage.getItem(key) || "{}")?.decks?.[date]?.textOverrides?.cover?.["cover.title"],
    { key: presentationKey, date: dateValue }
  );
  expect(storedCoverTitle).toBe("Session Briefing");
  await coverTitle.evaluate((element) => element.blur());
  await expect(presentation.locator(".presentation-cover-copy > span")).toHaveCount(0);
  await expect(presentation.locator(".presentation-cover-metrics")).toHaveCount(0);
  const coverLayout = await presentation.evaluate(() => {
    const stage = document.querySelector(".presentation-stage");
    const slide = document.querySelector(".presentation-slide-cover");
    const logo = document.querySelector(".presentation-slide-cover .presentation-logo-hero");
    const heading = document.querySelector(".presentation-cover-copy h1");
    const date = document.querySelector(".presentation-cover-copy p");
    if (!stage || !slide || !logo || !heading || !date) return null;
    const stageRect = stage.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();
    const logoRect = logo.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    return {
      slideUsesStage: slideRect.width >= stageRect.width * 0.76,
      heroLogoScaled: logoRect.width >= slideRect.width * 0.23,
      headingScaled: headingRect.width >= slideRect.width * 0.42,
      dateUnderTitle: date.getBoundingClientRect().top >= headingRect.bottom - 2,
    };
  });
  expect(coverLayout).toMatchObject({
    slideUsesStage: true,
    heroLogoScaled: true,
    headingScaled: true,
    dateUnderTitle: true,
  });
  await expect(presentation.locator(".presentation-footer-nav .presentation-slide-tabs")).toBeVisible();
  const footerNavigationLayout = await presentation.evaluate(() => {
    const footer = document.querySelector(".presentation-footer-nav");
    const tabs = document.querySelector(".presentation-footer-nav .presentation-slide-tabs");
    const pager = document.querySelector(".presentation-footer-pager");
    const progress = document.querySelector(".presentation-progress");
    if (!footer || !tabs || !pager || !progress) return null;
    const footerRect = footer.getBoundingClientRect();
    const tabsRect = tabs.getBoundingClientRect();
    const pagerRect = pager.getBoundingClientRect();
    const progressRect = progress.getBoundingClientRect();
    return {
      tabsInsideFooter: footer.contains(tabs),
      pagerInsideFooter: footer.contains(pager),
      tabsBeforePager: tabsRect.right <= pagerRect.left + 2,
      sameControlBand: Math.abs((tabsRect.top + tabsRect.bottom) / 2 - (progressRect.top + progressRect.bottom) / 2) <= 16,
      compactFooter: footerRect.height <= 64,
    };
  });
  expect(footerNavigationLayout).toMatchObject({
    tabsInsideFooter: true,
    pagerInsideFooter: true,
    tabsBeforePager: true,
    sameControlBand: true,
    compactFooter: true,
  });

  await page.keyboard.press("ArrowRight");
  await expect(presentation.locator(".presentation-info-title")).toHaveValue("Daily Info");
  await expect(presentation.locator(".presentation-info-rule")).toHaveCount(1);
  await expect(presentation.locator("[data-presentation-delete-slide]")).toBeEnabled();
  await expect(presentation.locator("[data-presentation-toggle-editor]")).toHaveCount(0);
  await expect(presentation.locator("[data-presentation-text-toolbar]")).toBeHidden();
  const slideTopBeforeToolbar = await presentation.locator(".presentation-slide").evaluate((slide) => slide.getBoundingClientRect().top);
  await presentation.locator(".presentation-info-title").click();
  await expect(presentation).toHaveClass(/is-text-toolbar-open/);
  const textToolbar = presentation.locator("[data-presentation-text-toolbar]");
  await expect(textToolbar).toBeVisible();
  const toolbarDockLayout = await presentation.evaluate((root, beforeTop) => {
    const controlBar = root.querySelector(".presentation-control-bar");
    const editSlot = root.querySelector(".presentation-control-edit-slot");
    const toolbar = root.querySelector("[data-presentation-text-toolbar]");
    const slide = root.querySelector(".presentation-slide");
    if (!controlBar || !editSlot || !toolbar || !slide) return null;
    const controlRect = controlBar.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();
    return {
      toolbarInsideControlBar: controlBar.contains(toolbar),
      toolbarInsideEditSlot: editSlot.contains(toolbar),
      toolbarFitsControlBand: toolbarRect.top >= controlRect.top - 1 && toolbarRect.bottom <= controlRect.bottom + 1,
      slideDidNotJump: Math.abs(slideRect.top - beforeTop) <= 2,
    };
  }, slideTopBeforeToolbar);
  expect(toolbarDockLayout).toMatchObject({
    toolbarInsideControlBar: true,
    toolbarInsideEditSlot: true,
    toolbarFitsControlBand: true,
    slideDidNotJump: true,
  });
  await expect(presentation.locator(".presentation-pass-controls [data-presentation-add-info]")).toHaveText("New Slide");
  await expect(textToolbar).not.toContainText("New info slide");
  await expect(textToolbar.locator("[data-presentation-add-text-box]")).toBeVisible();
  await expect(textToolbar.locator("[data-presentation-symbol-menu]")).toBeVisible();
  await expect(textToolbar.locator("[data-presentation-shape-menu]")).toBeVisible();
  await expect(textToolbar.locator("[data-presentation-style-menu]")).toBeVisible();
  await expect(textToolbar.locator(".presentation-keynote-tool").filter({ hasText: "Text" })).toBeVisible();
  await expect(textToolbar.locator("[data-presentation-shape-menu] summary")).toContainText("Shape");
  await expect(textToolbar.locator("[data-presentation-symbol-menu] summary")).toContainText("Symbol");
  await expect(textToolbar.locator("[data-presentation-style-menu] summary")).toContainText("Style");
  await expect(textToolbar.locator("[data-presentation-delete-text-box]")).toHaveCount(0);
  await expect(textToolbar.locator("[aria-label='Insert check']")).toBeHidden();
  const styleMenu = textToolbar.locator("[data-presentation-style-menu]");
  await styleMenu.locator("summary").click();
  await expect(styleMenu.locator("[data-presentation-active-font-size]")).toBeVisible();
  await expect(styleMenu.locator("[data-presentation-active-font-size]")).toHaveValue("");
  await expect(styleMenu.locator("[data-presentation-active-font-size]")).toContainText("16 pt");
  await expect(styleMenu.locator("[data-presentation-active-font-size]")).toContainText("56 pt");
  await expect(styleMenu.locator("[data-presentation-active-font-size]")).toContainText("128 pt");
  await styleMenu.locator("[data-presentation-active-font-size]").selectOption("64");
  await expect(presentation.locator(".presentation-info-title")).toHaveAttribute("style", /font-size: 4rem/);
  await textToolbar.locator("[data-presentation-symbol-menu] summary").click();
  await expect(styleMenu).not.toHaveAttribute("open", "");
  await expect(textToolbar.locator("[aria-label='Insert check']")).toBeVisible();
  await textToolbar.locator("[aria-label='Insert check']").click();
  await expect(presentation.locator(".presentation-info-title")).toHaveValue(/✓/);
  await presentation.locator(".presentation-info-title").click();
  await textToolbar.locator("[data-presentation-shape-menu] summary").click();
  await textToolbar.locator("[data-presentation-add-shape='circle']").click();
  const slideShape = presentation.locator("[data-presentation-shape].is-circle").first();
  await expect(slideShape).toBeVisible();
  await expect(textToolbar.locator("[data-presentation-active-shape-fill]")).toBeEnabled();
  await textToolbar.locator("[data-presentation-active-shape-fill]").evaluate((input) => {
    input.value = "#f59e0b";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const storedShape = await page.evaluate(
    ({ key, date }) => JSON.parse(window.localStorage.getItem(key) || "{}")?.decks?.[date]?.shapes?.["qa-info"]?.[0],
    { key: presentationKey, date: dateValue }
  );
  expect(storedShape).toMatchObject({ type: "circle", fillColor: "#f59e0b" });
  await slideShape.focus();
  await page.keyboard.press("Delete");
  await expect(presentation.locator("[data-presentation-shape]")).toHaveCount(0);
  await presentation.locator(".presentation-info-title").click();
  await textToolbar.locator("[data-presentation-add-text-box]").click();
  await expect(presentation.locator(".presentation-free-text-box")).toContainText("Text box");
  const textBoxShell = presentation.locator("[data-presentation-text-box-shell]").first();
  const dragHandle = presentation.locator("[data-presentation-drag-text-box]").first();
  const beforeTextBox = await textBoxShell.boundingBox();
  const dragHandleBox = await dragHandle.boundingBox();
  expect(beforeTextBox).toBeTruthy();
  expect(dragHandleBox).toBeTruthy();
  await page.mouse.move(dragHandleBox.x + dragHandleBox.width / 2, dragHandleBox.y + dragHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragHandleBox.x + dragHandleBox.width / 2 + 96, dragHandleBox.y + dragHandleBox.height / 2 + 48, { steps: 6 });
  await page.mouse.up();
  const afterTextBox = await textBoxShell.boundingBox();
  expect(afterTextBox?.x).toBeGreaterThan((beforeTextBox?.x || 0) + 20);
  expect(afterTextBox?.y).toBeGreaterThan((beforeTextBox?.y || 0) + 10);
  const storedTextBox = await page.evaluate(
    ({ key, date }) => JSON.parse(window.localStorage.getItem(key) || "{}")?.decks?.[date]?.textBoxes?.["qa-info"]?.[0],
    { key: presentationKey, date: dateValue }
  );
  expect(storedTextBox?.x).toBeGreaterThan(56);
  expect(storedTextBox?.y).toBeGreaterThan(36);
  await dragHandle.focus();
  await page.keyboard.press("Delete");
  await expect(presentation.locator("[data-presentation-text-box-shell]")).toHaveCount(0);
  await presentation.locator(".presentation-info-title").click();
  await expect(presentation.locator("[data-presentation-delete-slide]")).toBeEnabled();
  const logoSizing = await presentation.evaluate(() => {
    const toolbarLogo = document.querySelector(".presentation-control-brand .presentation-logo-corner");
    const slideLogo = document.querySelector(".presentation-slide-info .presentation-corner-logo .presentation-logo-corner");
    if (!toolbarLogo || !slideLogo) return null;
    return {
      slideWidth: slideLogo.getBoundingClientRect().width,
      toolbarWidth: toolbarLogo.getBoundingClientRect().width,
    };
  });
  expect(logoSizing?.slideWidth).toBeGreaterThan(58);
  expect(logoSizing?.toolbarWidth).toBeLessThan(logoSizing?.slideWidth || 0);
  const infoTitleAboveRule = await presentation.evaluate(() => {
    const title = document.querySelector(".presentation-info-title");
    const rule = document.querySelector(".presentation-info-rule");
    if (!title || !rule) return false;
    return title.getBoundingClientRect().bottom <= rule.getBoundingClientRect().top;
  });
  expect(infoTitleAboveRule).toBe(true);
  await expect(presentation).toContainText("Arrive ready");
  await presentation.locator("[data-presentation-delete-slide]").click();
  await expect(presentation.locator(".presentation-slide-info")).toHaveCount(0);
  await expect(presentation.locator(".presentation-slide-tabs")).not.toContainText("Daily Info");
  await expect(presentation).toContainText("Training Overview");
  await expect(presentation.locator(".presentation-slide-overview .presentation-section-heading h2")).toHaveCount(0);
  await expect(presentation.locator(".presentation-overview-metric.is-load .presentation-load-gauge")).toHaveCount(1);
  await expect(presentation.locator(".presentation-overview-metric.is-load > span")).toHaveText("Planned Load");
  await expect(presentation.locator(".presentation-overview-metric.is-load .presentation-load-copy")).toHaveCount(0);
  await expect(presentation.locator(".presentation-overview-metric.is-load > span", { hasText: /^Load$/ })).toHaveCount(0);
  await expect(presentation.locator(".presentation-day-overview")).toContainText("Phase");
  await expect(presentation.locator(".presentation-day-overview")).toContainText("In Possession");
  await expect(presentation.locator(".presentation-overview-metric.is-phase")).toHaveCount(0);
  await expect(presentation.locator(".presentation-overview-metric.is-pitch")).toContainText("2/3 pitch");
  await expect(presentation.locator(".presentation-overview-metric.is-pitch .periodization-pitch-icon.is-2-3-pitch")).toBeVisible();
  await expect(presentation.locator(".presentation-overview-metric.is-focus")).toHaveCount(0);
  await expect(presentation).not.toContainText("Main Focus");
  await expect(presentation.locator(".presentation-medical-overview")).toBeVisible();
  await expect(presentation.locator(".presentation-medical-overview header")).toHaveCount(0);
  await expect(presentation.locator(".presentation-medical-overview")).not.toContainText("Medical Plan");
  await expect(presentation.locator(".presentation-medical-player").first()).toBeVisible();
  await expect(presentation.locator(".presentation-medical-player > span:last-child", { hasText: /^100%$/ }).first()).toBeVisible();
  await expect(presentation.locator(".presentation-medical-player > span:last-child", { hasText: /^0%$/ }).first()).toBeVisible();
  const overviewLoadLayout = await presentation.evaluate(() => {
    const load = document.querySelector(".presentation-overview-metric.is-load");
    const video = document.querySelector(".presentation-overview-metric.is-video");
    const matchDay = document.querySelector(".presentation-overview-metric.is-match-day");
    const pitch = document.querySelector(".presentation-overview-metric.is-pitch");
    const loadLabel = document.querySelector(".presentation-overview-metric.is-load > span");
    const videoLabel = document.querySelector(".presentation-overview-metric.is-video > span");
    const matchLabel = document.querySelector(".presentation-overview-metric.is-match-day > span");
    const gauge = document.querySelector(".presentation-load-gauge");
    const needle = document.querySelector(".presentation-load-needle");
    if (!load || !video || !matchDay || !pitch || !loadLabel || !videoLabel || !matchLabel || !gauge || !needle) return null;
    const loadRect = load.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    const matchRect = matchDay.getBoundingClientRect();
    const pitchRect = pitch.getBoundingClientRect();
    const loadLabelRect = loadLabel.getBoundingClientRect();
    const videoLabelRect = videoLabel.getBoundingClientRect();
    const matchLabelRect = matchLabel.getBoundingClientRect();
    const loadStyle = getComputedStyle(load);
    return {
      leftOfVideo: loadRect.right <= videoRect.left,
      leftOfMatchDay: videoRect.right <= matchRect.left,
      sameTopAsVideo: Math.abs(loadRect.top - videoRect.top) <= 2,
      sameTopAsMatchDay: Math.abs(loadRect.top - matchRect.top) <= 2,
      labelAlignedWithVideo: Math.abs(loadLabelRect.top - videoLabelRect.top) <= 2,
      labelAlignedWithMatchDay: Math.abs(loadLabelRect.top - matchLabelRect.top) <= 2,
      pitchUnderLoad: pitchRect.top >= loadRect.bottom - 2,
      loadColor: loadStyle.getPropertyValue("--presentation-load-color").trim(),
      loadAngle: loadStyle.getPropertyValue("--presentation-load-angle").trim(),
    };
  });
  expect(overviewLoadLayout).toMatchObject({
    leftOfVideo: true,
    leftOfMatchDay: true,
    sameTopAsVideo: true,
    sameTopAsMatchDay: true,
    labelAlignedWithVideo: true,
    labelAlignedWithMatchDay: true,
    pitchUnderLoad: true,
    loadColor: "#d92d3f",
    loadAngle: "68deg",
  });
  const overviewMetricCardsLayout = await presentation.evaluate(() => {
    const load = document.querySelector(".presentation-overview-metric.is-load");
    const cards = Array.from(
      document.querySelectorAll(
        ".presentation-overview-metric.is-video, .presentation-overview-metric.is-pitch, .presentation-overview-metric.is-match-day"
      )
    );
    if (!load || cards.length !== 3) return null;
    return {
      compactCards: [load, ...cards].every((card) => card.getBoundingClientRect().height <= 150),
      pitchHasVisual: Boolean(document.querySelector(".presentation-overview-metric.is-pitch .periodization-pitch-icon")),
      valuesNearTop: cards.every((card) => {
        const cardRect = card.getBoundingClientRect();
        const valueRect = card.querySelector("strong")?.getBoundingClientRect();
        return Boolean(valueRect && valueRect.top - cardRect.top <= cardRect.height * 0.44);
      }),
    };
  });
  expect(overviewMetricCardsLayout).toMatchObject({
    compactCards: true,
    pitchHasVisual: true,
    valuesNearTop: true,
  });
  const overviewMedicalLayout = await presentation.evaluate(() => {
    const video = document.querySelector(".presentation-overview-metric.is-video");
    const matchDay = document.querySelector(".presentation-overview-metric.is-match-day");
    const medical = document.querySelector(".presentation-medical-overview");
    const players = Array.from(document.querySelectorAll(".presentation-medical-player"));
    if (!video || !matchDay || !medical || !players.length) return null;
    const videoRect = video.getBoundingClientRect();
    const matchRect = matchDay.getBoundingClientRect();
    const medicalRect = medical.getBoundingClientRect();
    const gridRect = medical.closest(".presentation-overview-grid")?.getBoundingClientRect();
    const firstPlayerRect = players[0].getBoundingClientRect();
    return {
      rightOfVideo: medicalRect.left >= videoRect.right - 2,
      rightOfMatchDay: medicalRect.left >= matchRect.right - 2,
      widthRatio: gridRect ? medicalRect.width / gridRect.width : 0,
      spansOverviewContent: medicalRect.bottom >= firstPlayerRect.bottom,
      compactRows: players.every((player) => {
        const rect = player.getBoundingClientRect();
        return rect.height <= 30;
      }),
      allRowsFit: players.every((player) => {
        const rect = player.getBoundingClientRect();
        return rect.top >= medicalRect.top - 1 && rect.bottom <= medicalRect.bottom + 1;
      }),
    };
  });
  expect(overviewMedicalLayout).toMatchObject({
    rightOfVideo: true,
    rightOfMatchDay: true,
    spansOverviewContent: true,
    compactRows: true,
    allRowsFit: true,
  });
  expect(overviewMedicalLayout?.widthRatio).toBeGreaterThan(0.46);
  expect(overviewMedicalLayout?.widthRatio).toBeGreaterThan(0.57);
  expect(overviewMedicalLayout?.widthRatio).toBeLessThan(0.66);
  const overviewPresentingMedicalLayout = await presentation.evaluate(() => {
    const shell = document.querySelector("[data-presentation-mode-shell]");
    const list = document.querySelector(".presentation-medical-list");
    if (!shell || !list) return null;
    shell.classList.add("is-presenting");
    const columns = getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length;
    shell.classList.remove("is-presenting");
    return { columns };
  });
  expect(overviewPresentingMedicalLayout).toMatchObject({ columns: 3 });
  const overviewBlocksLayout = await presentation.evaluate(() => {
    const load = document.querySelector(".presentation-overview-metric.is-load");
    const pitch = document.querySelector(".presentation-overview-metric.is-pitch");
    const matchDay = document.querySelector(".presentation-overview-metric.is-match-day");
    const phase = document.querySelector(".presentation-day-overview");
    const blocks = document.querySelector(".presentation-block-flow");
    const articles = Array.from(document.querySelectorAll(".presentation-block-flow article"));
    if (!load || !pitch || !matchDay || !phase || !blocks || articles.length === 0) return null;
    const loadRect = load.getBoundingClientRect();
    const pitchRect = pitch.getBoundingClientRect();
    const matchRect = matchDay.getBoundingClientRect();
    const phaseRect = phase.getBoundingClientRect();
    const blocksRect = blocks.getBoundingClientRect();
    const articleRects = articles.map((article) => article.getBoundingClientRect());
    const combinedLeft = Math.min(loadRect.left, pitchRect.left, matchRect.left, phaseRect.left);
    const combinedRight = Math.max(pitchRect.right, matchRect.right, phaseRect.right);
    return {
      sameLeft: Math.abs(blocksRect.left - combinedLeft) <= 2,
      sameRight: Math.abs(blocksRect.right - combinedRight) <= 2,
      phaseAboveBlocks: phaseRect.bottom <= blocksRect.top + 2,
      phaseAlignsToBlocks: Math.abs(phaseRect.left - blocksRect.left) <= 2 && Math.abs(phaseRect.right - blocksRect.right) <= 2,
      rowsAreWide: articleRects.every((rect) => rect.width > rect.height * 2.2),
    };
  });
  expect(overviewBlocksLayout).toMatchObject({
    sameLeft: true,
    sameRight: true,
    phaseAboveBlocks: true,
    phaseAlignsToBlocks: true,
    rowsAreWide: true,
  });
  await expect(presentation).not.toContainText("10 min");
  await expect(presentation).not.toContainText("Ready");
  await expect(presentation).not.toContainText("High");

  await page.keyboard.press("ArrowRight");
  await expect(presentation).toContainText("Possession (7v3)");
  await expect(presentation).not.toContainText("10 min");
  await expect(presentation.locator(".presentation-slide-block .presentation-section-heading span")).toHaveText("Block 1");
  await expect(presentation.locator(".presentation-slide-block")).not.toContainText("10%+");
  await expect(presentation.locator(".presentation-slide-block")).not.toContainText("0% / Unavailable");
  await expect(presentation.locator(".presentation-player-rule")).toHaveCount(0);
  await expect(presentation).not.toContainText("Focus");
  await expect(presentation).not.toContainText("5v2");
  await expect(presentation).toContainText("Team Principles & MG Principles");
  await expect(presentation).not.toContainText("Coaching Points");
  await expect(presentation).not.toContainText("In this block");
  await expect(presentation).toContainText("Not in this block");
  await expect(presentation).not.toContainText("Madison White");
  await expect(presentation).toContainText("Kailen Sheridan");
  await expect(presentation).not.toContainText("Lead Coach");
  const blockVisualLayout = await presentation.evaluate(() => {
    const visual = document.querySelector(".presentation-block-visual");
    const board = document.querySelector(".presentation-block-visual .session-visual-board");
    const pitch = document.querySelector(".presentation-block-visual .session-pitch-diagram");
    const topGoal = document.querySelector(".presentation-block-visual .session-pitch-goal-top");
    const bottomGoal = document.querySelector(".presentation-block-visual .session-pitch-goal-bottom");
    const topBox = document.querySelector(".presentation-block-visual .session-pitch-box-top");
    const bottomBox = document.querySelector(".presentation-block-visual .session-pitch-box-bottom");
    if (!visual || !board || !pitch || !topGoal || !bottomGoal || !topBox || !bottomBox) return null;
    const visualRect = visual.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    const topGoalRect = topGoal.getBoundingClientRect();
    const bottomGoalRect = bottomGoal.getBoundingClientRect();
    const topBoxRect = topBox.getBoundingClientRect();
    const bottomBoxRect = bottomBox.getBoundingClientRect();
    return {
      boardIsPortrait: boardRect.height > boardRect.width * 1.35,
      boardFitsVisual:
        boardRect.top >= visualRect.top - 1 &&
        boardRect.left >= visualRect.left - 1 &&
        boardRect.right <= visualRect.right + 1 &&
        boardRect.bottom <= visualRect.bottom + 1,
      goalsFitVisual: topGoalRect.top >= visualRect.top - 1 && bottomGoalRect.bottom <= visualRect.bottom + 1,
      boxesFitVisual: topBoxRect.top >= visualRect.top - 1 && bottomBoxRect.bottom <= visualRect.bottom + 1,
      noLandscapeBoardClass:
        !board.classList.contains("session-visual-board-print-landscape") &&
        !board.classList.contains("session-visual-board-landscape"),
      noLandscapePitchClass: !pitch.classList.contains("session-pitch-diagram-landscape"),
    };
  });
  expect(blockVisualLayout).toMatchObject({
    boardIsPortrait: true,
    boardFitsVisual: true,
    goalsFitVisual: true,
    boxesFitVisual: true,
    noLandscapeBoardClass: true,
    noLandscapePitchClass: true,
  });
  const blockCopyLayout = await presentation.evaluate(() => {
    const visual = document.querySelector(".presentation-block-visual");
    const copy = document.querySelector(".presentation-block-copy");
    const heading = document.querySelector(".presentation-slide-block .presentation-section-heading h2");
    const meta = document.querySelector(".presentation-slide-block .presentation-section-heading p");
    const details = document.querySelector(".presentation-block-details");
    const detailCards = Array.from(document.querySelectorAll(".presentation-detail-block"));
    if (!visual || !copy || !heading || !meta || !details || !detailCards.length) return null;
    const visualRect = visual.getBoundingClientRect();
    const copyRect = copy.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const metaRect = meta.getBoundingClientRect();
    const headingLineHeight = Number.parseFloat(getComputedStyle(heading).lineHeight);
    const metaLineHeight = Number.parseFloat(getComputedStyle(meta).lineHeight);
    const detailRect = details.getBoundingClientRect();
    return {
      copyRightOfVisual: copyRect.left >= visualRect.right - 2,
      copyUsesWideColumn: copyRect.width >= visualRect.width * 1.1,
      headingSingleLine: headingRect.height <= headingLineHeight * 1.25,
      metaSingleLine: metaRect.height <= metaLineHeight * 1.35,
      detailsFillCopyWidth: detailRect.width >= copyRect.width - 2,
      cardsFillDetailsWidth: detailCards.every((card) => card.getBoundingClientRect().width >= detailRect.width - 4),
    };
  });
  expect(blockCopyLayout).toMatchObject({
    copyRightOfVisual: true,
    copyUsesWideColumn: true,
    headingSingleLine: true,
    metaSingleLine: true,
    detailsFillCopyWidth: true,
    cardsFillDetailsWidth: true,
  });
  const blockPlayersLayout = await presentation.evaluate(() => {
    const layout = document.querySelector(".presentation-block-layout");
    const copy = document.querySelector(".presentation-block-copy");
    const visual = document.querySelector(".presentation-block-visual");
    const players = document.querySelector(".presentation-block-players");
    const panel = document.querySelector(".presentation-player-panel.is-muted");
    const panelHeader = panel?.querySelector("header");
    const panelTitle = panelHeader?.querySelector("span");
    const panelCount = panelHeader?.querySelector("strong");
    const chips = Array.from(document.querySelectorAll(".presentation-player-panel.is-muted .presentation-player-chip"));
    if (!layout || !copy || !visual || !players || !panel || !panelHeader || !panelTitle || !panelCount || chips.length === 0) return null;
    const layoutRect = layout.getBoundingClientRect();
    const copyRect = copy.getBoundingClientRect();
    const visualRect = visual.getBoundingClientRect();
    const playersRect = players.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const titleRect = panelTitle.getBoundingClientRect();
    const countRect = panelCount.getBoundingClientRect();
    const layoutStyle = getComputedStyle(layout);
    const layoutContentBottom = layoutRect.bottom - Number.parseFloat(layoutStyle.paddingBottom || "0");
    return {
      rightOfVisual: playersRect.left >= visualRect.right - 2,
      belowCopy: playersRect.top >= copyRect.bottom - 2,
      rightAligned: Math.abs(playersRect.right - copyRect.right) <= 4,
      bottomAligned: Math.abs(playersRect.bottom - layoutContentBottom) <= 4,
      compactHeight: panelRect.height <= layoutRect.height * 0.2,
      compactWidth: playersRect.width <= copyRect.width + 2,
      countUsesPlayerLabel: /\(\d+ Players?\)/.test(panelCount.textContent || ""),
      countSitsNearTitle: countRect.left - titleRect.right <= 10,
      chipsCompact: chips.every((chip) => {
        const rect = chip.getBoundingClientRect();
        return rect.width >= 68 && rect.width <= 190 && rect.height >= 18 && rect.height <= 30;
      }),
      chipsVisible: chips.every((chip) => {
        const rect = chip.getBoundingClientRect();
        return rect.top >= panelRect.top && rect.bottom <= panelRect.bottom + 1;
      }),
    };
  });
  expect(blockPlayersLayout).toMatchObject({
    rightOfVisual: true,
    belowCopy: true,
    rightAligned: true,
    bottomAligned: true,
    compactHeight: true,
    compactWidth: true,
    countUsesPlayerLabel: true,
    countSitsNearTitle: true,
    chipsCompact: true,
    chipsVisible: true,
  });
});
