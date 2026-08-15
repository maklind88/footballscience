import { expect, test } from "@playwright/test";

const scheduleKey = "football-schedule-v1";
const periodizationKey = "football-periodization-v2";
const sessionPlannerKey = "football-session-planner-v3";
const medicalKey = "football-medical-team-v1";
const presentationKey = "football-dashboard-presentation-mode-v1";
const undoShortcut = process.platform === "darwin" ? "Meta+Z" : "Control+Z";
const redoShortcut = process.platform === "darwin" ? "Meta+Shift+Z" : "Control+Y";

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

async function waitForViewportSettle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      })
  );
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
              matchDay: "Match Day -1",
              physicalLoad: "High",
              pitchSize: "2/3 pitch",
              mainFocus: "Build-up and final-third connections",
              matchPhases: ["In Possession"],
              subPhases: ["Build Up", "Final Third"],
              preTrainingVideo: "Press trigger clips",
              preTrainingNotes: "- First pass after regain\n\n- Fullback body shape",
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
  await expect(presentation.locator("[data-presentation-date-picker]")).toBeVisible();
  const dateIconStyle = await presentation.locator(".presentation-date-control").evaluate((control) => {
    const button = control.querySelector("[data-presentation-date-picker]");
    const icon = button ? getComputedStyle(button, "::before") : null;
    const input = control.querySelector("[data-presentation-date-input]");
    return {
      borderColor: button ? getComputedStyle(button).borderTopColor : "",
      buttonDisplay: button ? getComputedStyle(button).display : "",
      inputPaddingRight: input ? getComputedStyle(input).paddingRight : "",
      iconBorderColor: icon?.borderTopColor || "",
      iconDisplay: icon?.display || "",
      width: button ? getComputedStyle(button).width : "",
    };
  });
  expect(["flex", "inline-flex"]).toContain(dateIconStyle.buttonDisplay);
  expect(dateIconStyle.iconDisplay).toBe("block");
  expect(dateIconStyle.borderColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(dateIconStyle.iconBorderColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(dateIconStyle.inputPaddingRight).not.toBe("0px");
  expect(dateIconStyle.width).not.toBe("auto");
  const datePickerButton = presentation.locator("[data-presentation-date-picker]");
  const normalDatePickerBox = await datePickerButton.boundingBox();
  expect(normalDatePickerBox).not.toBeNull();
  await datePickerButton.hover();
  const hoveredDatePickerBox = await datePickerButton.boundingBox();
  await datePickerButton.focus();
  const focusedDatePickerBox = await datePickerButton.boundingBox();
  expect(hoveredDatePickerBox?.y).toBeCloseTo(normalDatePickerBox?.y ?? 0, 1);
  expect(focusedDatePickerBox?.y).toBeCloseTo(normalDatePickerBox?.y ?? 0, 1);
  const datePickerButtonOpensPicker = await presentation.evaluate(() => {
    const input = document.querySelector("[data-presentation-date-input]");
    const button = document.querySelector("[data-presentation-date-picker]");
    if (!input || !button) return false;
    let called = false;
    Object.defineProperty(input, "showPicker", {
      configurable: true,
      value: () => {
        called = true;
      },
    });
    button.click();
    return called && document.activeElement === input;
  });
  expect(datePickerButtonOpensPicker).toBe(true);
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
  await coverTitle.click();
  await expect(coverTitle.locator("[data-presentation-resize-text-field='cover.title']")).toHaveCount(8);
  const coverTitleBeforeDrag = await coverTitle.boundingBox();
  const coverTitleDragHandle = coverTitle.locator(".presentation-text-field-edge-handle.is-right");
  const coverTitleDragHandleBox = await coverTitleDragHandle.boundingBox();
  expect(coverTitleBeforeDrag).toBeTruthy();
  expect(coverTitleDragHandleBox).toBeTruthy();
  await page.mouse.move(
    coverTitleDragHandleBox.x + coverTitleDragHandleBox.width / 2,
    coverTitleDragHandleBox.y + coverTitleDragHandleBox.height * 0.82
  );
  await page.mouse.down();
  await page.mouse.move(
    coverTitleDragHandleBox.x + coverTitleDragHandleBox.width / 2 + 72,
    coverTitleDragHandleBox.y + coverTitleDragHandleBox.height * 0.82 + 36,
    { steps: 6 }
  );
  await page.mouse.up();
  const coverTitleAfterDrag = await coverTitle.boundingBox();
  expect(coverTitleAfterDrag?.x).toBeGreaterThan((coverTitleBeforeDrag?.x || 0) + 18);
  expect(coverTitleAfterDrag?.y).toBeGreaterThan((coverTitleBeforeDrag?.y || 0) + 8);
  await coverTitle.click();
  const coverTitleBeforeResize = await coverTitle.boundingBox();
  const coverTitleResizeHandle = coverTitle.locator("[data-presentation-resize-text-field='cover.title'][data-presentation-resize-axis='se']");
  const coverTitleResizeHandleBox = await coverTitleResizeHandle.boundingBox();
  expect(coverTitleBeforeResize).toBeTruthy();
  expect(coverTitleResizeHandleBox).toBeTruthy();
  await page.mouse.move(
    coverTitleResizeHandleBox.x + coverTitleResizeHandleBox.width / 2,
    coverTitleResizeHandleBox.y + coverTitleResizeHandleBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    coverTitleResizeHandleBox.x + coverTitleResizeHandleBox.width / 2 + 46,
    coverTitleResizeHandleBox.y + coverTitleResizeHandleBox.height / 2 + 34,
    { steps: 6 }
  );
  await page.mouse.up();
  const storedCoverTitleStyle = await page.evaluate(
    ({ key, date }) => JSON.parse(window.localStorage.getItem(key) || "{}")?.decks?.[date]?.textFieldStyles?.cover?.["cover.title"],
    { key: presentationKey, date: dateValue }
  );
  expect(Number(storedCoverTitleStyle?.offsetX)).toBeGreaterThan(1);
  expect(Number(storedCoverTitleStyle?.offsetY)).toBeGreaterThan(1);
  expect(Number(storedCoverTitleStyle?.width)).toBeGreaterThan(20);
  expect(Number(storedCoverTitleStyle?.height)).toBeGreaterThan(2);
  expect(Number(storedCoverTitleStyle?.fontSize)).toBeGreaterThan(16);
  await coverTitle.evaluate((element) => element.blur());
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
  const textToolbar = presentation.locator("[data-presentation-text-toolbar]");
  await expect(textToolbar).toBeVisible();
  await expect(presentation).toHaveClass(/is-text-toolbar-open/);
  const slideTopBeforeToolbar = await presentation.locator(".presentation-slide").evaluate((slide) => slide.getBoundingClientRect().top);
  const infoTitle = presentation.locator(".presentation-info-title");
  await infoTitle.click();
  await expect(infoTitle).toHaveAttribute("data-presentation-active-text", "true");
  const activeTextMarker = await infoTitle.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      boxShadow: style.boxShadow,
    };
  });
  expect(activeTextMarker.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(activeTextMarker.boxShadow).not.toBe("none");
  await expect(presentation).toHaveClass(/is-text-toolbar-open/);
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
  await expect(presentation.locator(".presentation-pass-controls [data-presentation-add-info-menu]")).toHaveText("New Slide");
  await presentation.locator(".presentation-pass-controls [data-presentation-add-info-menu]").click();
  await expect(presentation.locator(".presentation-new-slide-popover")).toBeVisible();
  await expect(presentation.locator(".presentation-new-slide-popover")).toContainText("Choose Layout");
  await expect(presentation.locator('.presentation-new-slide-popover [data-presentation-add-info="text"]')).toBeVisible();
  await expect(presentation.locator('.presentation-new-slide-popover [data-presentation-add-info="title-subtitle"]')).toBeVisible();
  await expect(presentation.locator('.presentation-new-slide-popover [data-presentation-add-info="video"]')).toBeVisible();
  await expect(presentation.locator('.presentation-new-slide-popover [data-presentation-add-info="match-squad"]')).toBeVisible();
  await expect(presentation.locator('.presentation-new-slide-popover [data-presentation-add-info="starting-xi"]')).toBeVisible();
  page.once("dialog", async (dialog) => {
    await dialog.accept("Starting XI");
  });
  await presentation.locator('.presentation-new-slide-popover [data-presentation-add-info="starting-xi"]').click();
  const lineupSlide = presentation.locator(".presentation-slide-lineup");
  await expect(lineupSlide).toBeVisible();
  const lineupGeometry = await lineupSlide.locator(".presentation-lineup-pitch").evaluate((pitch) => {
    const rect = pitch.getBoundingClientRect();
    const field = pitch.querySelector(".presentation-lineup-field-lines")?.getBoundingClientRect();
    const penaltyArc = pitch.querySelector(".presentation-lineup-penalty-arc")?.getBoundingClientRect();
    const goal = pitch.querySelector(".presentation-lineup-goal")?.getBoundingClientRect();
    const slots = Array.from(pitch.querySelectorAll(".presentation-lineup-slot")).map((slot) => slot.getBoundingClientRect());
    const overlaps = slots.some((slot, index) =>
      slots.slice(index + 1).some((other) => {
        const horizontalGap = Math.max(0, Math.max(other.left - slot.right, slot.left - other.right));
        const verticalGap = Math.max(0, Math.max(other.top - slot.bottom, slot.top - other.bottom));
        return horizontalGap < 2 && verticalGap < 2;
      })
    );
    return {
      aspect: rect.width / rect.height,
      fieldIsInsidePitch:
        Boolean(field) &&
        field.left >= rect.left &&
        field.right <= rect.right &&
        field.top >= rect.top &&
        field.bottom <= rect.bottom,
      goalVisible: Boolean(goal) && goal.width > rect.width * 0.15,
      noSlotOverlap: !overlaps,
      penaltyArcVisible: Boolean(penaltyArc) && penaltyArc.width > rect.width * 0.15,
      slotCount: slots.length,
    };
  });
  expect(lineupGeometry.aspect).toBeGreaterThan(1.25);
  expect(lineupGeometry.aspect).toBeLessThan(1.35);
  expect(lineupGeometry).toMatchObject({
    fieldIsInsidePitch: true,
    goalVisible: true,
    noSlotOverlap: true,
    penaltyArcVisible: true,
    slotCount: 11,
  });
  const assertLineupProjectionLayout = async ({
    minPitchFill,
    minSlotHeight,
    minSlotWidth,
    minTitleFontSize,
    name,
  }) => {
    const geometry = await lineupSlide.locator(".presentation-lineup-pitch").evaluate((pitch) => {
      const slide = pitch.closest(".presentation-slide");
      const heading = slide?.querySelector(".presentation-lineup-layout .presentation-section-heading h2");
      const rect = pitch.getBoundingClientRect();
      const slideRect = slide?.getBoundingClientRect();
      const headingRect = heading?.getBoundingClientRect();
      const headingStyle = heading ? window.getComputedStyle(heading) : null;
      const slots = Array.from(pitch.querySelectorAll(".presentation-lineup-slot")).map((slot) => slot.getBoundingClientRect());
      const overlaps = slots.some((slot, index) =>
        slots.slice(index + 1).some((other) => {
          const horizontalGap = Math.max(0, Math.max(other.left - slot.right, slot.left - other.right));
          const verticalGap = Math.max(0, Math.max(other.top - slot.bottom, slot.top - other.bottom));
          return horizontalGap < 2 && verticalGap < 2;
        })
      );
      return {
        aspect: rect.width / rect.height,
        fillsProjectorHeight: slideRect ? rect.height / slideRect.height : 0,
        headingFitsSlide:
          Boolean(headingRect && slideRect) &&
          headingRect.left >= slideRect.left &&
          headingRect.right <= slideRect.right &&
          headingRect.bottom <= rect.top,
        noSlotOverlap: !overlaps,
        slotCount: slots.length,
        slotHeight: slots.length ? Math.min(...slots.map((slot) => slot.height)) : 0,
        slotWidth: slots.length ? Math.min(...slots.map((slot) => slot.width)) : 0,
        titleFontSize: Number.parseFloat(headingStyle?.fontSize || "0"),
      };
    });
    expect(geometry.aspect, `${name}: half-pitch keeps 68:52.5 football proportions`).toBeGreaterThan(1.28);
    expect(geometry.aspect, `${name}: half-pitch keeps 68:52.5 football proportions`).toBeLessThan(1.31);
    expect(geometry.fillsProjectorHeight, `${name}: pitch uses the available projector height`).toBeGreaterThan(minPitchFill);
    expect(geometry.slotWidth, `${name}: player cards stay readable from distance`).toBeGreaterThanOrEqual(minSlotWidth);
    expect(geometry.slotHeight, `${name}: player cards stay readable from distance`).toBeGreaterThanOrEqual(minSlotHeight);
    expect(geometry.titleFontSize, `${name}: title remains presentation-sized`).toBeGreaterThanOrEqual(minTitleFontSize);
    expect(geometry).toMatchObject({
      headingFitsSlide: true,
      noSlotOverlap: true,
      slotCount: 11,
    });
  };
  const projectionLayouts = [
    { name: "laptop play mode", width: 1280, height: 720, minPitchFill: 0.7, minSlotWidth: 100, minSlotHeight: 92, minTitleFontSize: 34 },
    { name: "meeting-room TV", width: 1920, height: 1080, minPitchFill: 0.74, minSlotWidth: 126, minSlotHeight: 116, minTitleFontSize: 48 },
    { name: "large projector", width: 2560, height: 1440, minPitchFill: 0.74, minSlotWidth: 126, minSlotHeight: 116, minTitleFontSize: 48 },
    { name: "narrow control window", width: 1117, height: 772, minPitchFill: 0.58, minSlotWidth: 97, minSlotHeight: 92, minTitleFontSize: 32 },
  ];
  for (const layout of projectionLayouts) {
    await test.step(`Starting XI scales for ${layout.name}`, async () => {
      await page.setViewportSize({ width: layout.width, height: layout.height });
      await waitForViewportSettle(page);
      await presentation.locator("[data-presentation-start]").click();
      await expect(presentation).toHaveClass(/is-presenting/);
      await assertLineupProjectionLayout(layout);
      await presentation.locator("[data-presentation-exit-fullscreen]").click();
      await expect(presentation).not.toHaveClass(/is-presenting/);
    });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await waitForViewportSettle(page);
  await presentation.locator("[data-presentation-delete-slide]").click();
  await expect(lineupSlide).toHaveCount(0);
  const insertMenu = presentation.locator("[data-presentation-insert-menu]");
  await expect(insertMenu.locator("summary")).toHaveText("Insert");
  await insertMenu.locator("summary").click();
  await expect(presentation.locator(".presentation-insert-popover")).toBeVisible();
  await expect(presentation.locator('.presentation-insert-popover [data-presentation-add-media="image"]')).toBeVisible();
  await expect(presentation.locator('.presentation-insert-popover [data-presentation-add-media="video"]')).toBeVisible();
  await expect(presentation.locator('.presentation-insert-popover [data-presentation-add-shape="rect"]')).toBeVisible();
  await presentation.locator('.presentation-insert-popover [data-presentation-add-media="image"]').click();
  const imageBox = presentation.locator("[data-presentation-text-box-shell][data-presentation-text-box-kind='image']").first();
  await expect(imageBox).toBeVisible();
  await expect(imageBox.locator(".presentation-free-text-box")).toContainText("Image Placeholder");
  await expect(imageBox.locator("[data-presentation-resize-text-box]")).toHaveCount(8);
  await imageBox.focus();
  await page.keyboard.press("Delete");
  await expect(presentation.locator("[data-presentation-text-box-shell][data-presentation-text-box-kind='image']")).toHaveCount(0);
  await presentation.locator(".presentation-slide-info").click({ button: "right", position: { x: 320, y: 240 } });
  await expect(presentation.locator("[data-presentation-context-menu]")).toBeVisible();
  await expect(presentation.locator('[data-presentation-context-action="text"]')).toBeVisible();
  await expect(presentation.locator('[data-presentation-context-action="image"]')).toBeVisible();
  await expect(presentation.locator('[data-presentation-context-action="video"]')).toBeVisible();
  await expect(presentation.locator('[data-presentation-context-action="shape:rect"]')).toBeVisible();
  await presentation.locator('[data-presentation-context-action="video"]').click();
  const videoBox = presentation.locator("[data-presentation-text-box-shell][data-presentation-text-box-kind='video']").first();
  await expect(videoBox).toBeVisible();
  await expect(videoBox.locator(".presentation-free-text-box")).toContainText("Video Placeholder");
  await expect(videoBox.locator("[data-presentation-resize-text-box]")).toHaveCount(8);
  await videoBox.focus();
  await page.keyboard.press("Delete");
  await expect(presentation.locator("[data-presentation-text-box-shell][data-presentation-text-box-kind='video']")).toHaveCount(0);
  await infoTitle.click();
  await expect(textToolbar).not.toContainText("New info slide");
  await expect(textToolbar.locator("[data-presentation-add-text-box]")).toBeVisible();
  await expect(textToolbar.locator("[data-presentation-symbol-menu]")).toBeVisible();
  await expect(textToolbar.locator("[data-presentation-shape-menu]")).toBeVisible();
  await expect(textToolbar.locator("[data-presentation-color-menu]")).toBeVisible();
  await expect(textToolbar.locator("[data-presentation-style-menu]")).toBeVisible();
  await expect(textToolbar.locator(".presentation-quick-style-controls")).toHaveCount(0);
  await expect(textToolbar.locator(".presentation-keynote-tool").filter({ hasText: "Text" })).toBeVisible();
  await expect(textToolbar.locator("[data-presentation-shape-menu] summary")).toContainText("Shape");
  await expect(textToolbar.locator("[data-presentation-symbol-menu] summary")).toContainText("Symbol");
  await expect(textToolbar.locator("[data-presentation-color-menu] summary")).toContainText("Color");
  await expect(textToolbar.locator("[data-presentation-style-menu] summary")).toContainText("Style");
  await expect(textToolbar.locator("[data-presentation-delete-text-box]")).toHaveCount(0);
  await expect(textToolbar.locator("[aria-label='Insert check']")).toBeHidden();
  const styleMenu = textToolbar.locator("[data-presentation-style-menu]");
  await styleMenu.locator("summary").click();
  await expect(infoTitle).toHaveAttribute("data-presentation-active-text", "true");
  await expect(styleMenu.locator(".presentation-tool-popover-panel")).toBeVisible();
  await expect(styleMenu.locator("[data-presentation-active-font-size]")).toBeVisible();
  await expect(styleMenu.locator("[data-presentation-active-font-size]")).toHaveValue("");
  await expect(styleMenu.locator("[data-presentation-active-font-size]")).toContainText("16 pt");
  await expect(styleMenu.locator("[data-presentation-active-font-size]")).toContainText("56 pt");
  await expect(styleMenu.locator("[data-presentation-active-font-size]")).toContainText("128 pt");
  await styleMenu.locator("[data-presentation-active-font-size]").selectOption("64");
  await expect(presentation.locator(".presentation-info-title")).toHaveAttribute("style", /--presentation-editable-font-size: 4rem/);
  await textToolbar.locator("[data-presentation-symbol-menu] summary").click();
  await expect(styleMenu).not.toHaveAttribute("open", "");
  await expect(textToolbar.locator("[data-presentation-symbol-menu] .presentation-tool-popover-panel")).toBeVisible();
  await expect(textToolbar.locator("[aria-label='Insert check']")).toBeVisible();
  await textToolbar.locator("[aria-label='Insert check']").click();
  const symbolBox = presentation.locator("[data-presentation-text-box-shell][data-presentation-text-box-kind='symbol']").first();
  await expect(symbolBox).toBeVisible();
  await expect(symbolBox.locator(".presentation-free-text-box")).toContainText("✓");
  await expect(textToolbar.locator("[data-presentation-symbol-menu] .presentation-tool-popover-panel")).toBeHidden();
  const symbolBefore = await symbolBox.boundingBox();
  await expect(symbolBox.locator("[data-presentation-resize-text-box]")).toHaveCount(8);
  const symbolResizeHandle = symbolBox.locator("[data-presentation-resize-axis='se']");
  const symbolResizeBox = await symbolResizeHandle.boundingBox();
  expect(symbolBefore).toBeTruthy();
  expect(symbolResizeBox).toBeTruthy();
  await page.mouse.move(symbolResizeBox.x + symbolResizeBox.width / 2, symbolResizeBox.y + symbolResizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(symbolResizeBox.x + symbolResizeBox.width / 2 + 110, symbolResizeBox.y + symbolResizeBox.height / 2 + 58, {
    steps: 6,
  });
  await page.mouse.up();
  const symbolAfter = await symbolBox.boundingBox();
  expect(symbolAfter?.width).toBeGreaterThan((symbolBefore?.width || 0) + 20);
  expect(symbolAfter?.height).toBeGreaterThan((symbolBefore?.height || 0) + 10);
  const storedSymbolBox = await page.evaluate(
    ({ key, date }) =>
      JSON.parse(window.localStorage.getItem(key) || "{}")?.decks?.[date]?.textBoxes?.["qa-info"]?.find(
        (box) => box.kind === "symbol" && box.text === "✓"
      ),
    { key: presentationKey, date: dateValue }
  );
  expect(Number(storedSymbolBox?.width)).toBeGreaterThan(14);
  expect(Number(storedSymbolBox?.height)).toBeGreaterThan(14);
  expect(Number(storedSymbolBox?.fontSize)).toBeGreaterThan(88);
  await symbolBox.focus();
  await page.keyboard.press("Delete");
  await expect(presentation.locator("[data-presentation-text-box-shell][data-presentation-text-box-kind='symbol']")).toHaveCount(0);
  await presentation.locator(".presentation-info-title").click();
  await textToolbar.locator("[data-presentation-shape-menu] summary").click();
  await expect(textToolbar.locator("[data-presentation-shape-menu] .presentation-tool-popover-panel")).toBeVisible();
  await textToolbar.locator("[data-presentation-add-shape='circle']").click();
  await expect(presentation).toHaveClass(/is-shape-tool-active/);
  const slideForShape = presentation.locator(".presentation-slide").first();
  const slideForShapeBox = await slideForShape.boundingBox();
  expect(slideForShapeBox).toBeTruthy();
  await page.mouse.move(slideForShapeBox.x + slideForShapeBox.width * 0.62, slideForShapeBox.y + slideForShapeBox.height * 0.48);
  await page.mouse.down();
  await page.mouse.move(slideForShapeBox.x + slideForShapeBox.width * 0.82, slideForShapeBox.y + slideForShapeBox.height * 0.72, { steps: 6 });
  await page.mouse.up();
  const slideShape = presentation.locator("[data-presentation-shape].is-circle").first();
  await expect(slideShape).toBeVisible();
  await expect(presentation).not.toHaveClass(/is-shape-tool-active/);
  const shapeBeforeResize = await slideShape.boundingBox();
  await expect(slideShape.locator("[data-presentation-resize-shape]")).toHaveCount(8);
  const shapeResizeHandle = slideShape.locator("[data-presentation-resize-axis='se']");
  const shapeResizeBox = await shapeResizeHandle.boundingBox();
  expect(shapeBeforeResize).toBeTruthy();
  expect(shapeResizeBox).toBeTruthy();
  await page.mouse.move(shapeResizeBox.x + shapeResizeBox.width / 2, shapeResizeBox.y + shapeResizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(shapeResizeBox.x + shapeResizeBox.width / 2 + 92, shapeResizeBox.y + shapeResizeBox.height / 2 + 54, {
    steps: 6,
  });
  await page.mouse.up();
  const shapeAfterResize = await slideShape.boundingBox();
  expect(shapeAfterResize?.width).toBeGreaterThan((shapeBeforeResize?.width || 0) + 20);
  expect(shapeAfterResize?.height).toBeGreaterThan((shapeBeforeResize?.height || 0) + 10);
  const colorMenu = textToolbar.locator("[data-presentation-color-menu]");
  await colorMenu.locator("summary").click();
  await expect(colorMenu.locator(".presentation-tool-popover-panel")).toBeVisible();
  await expect(colorMenu.locator("[data-presentation-active-shape-fill]")).toBeEnabled();
  await expect(colorMenu.locator("[data-presentation-active-shape-stroke]")).toBeEnabled();
  await expect(colorMenu.locator("[data-presentation-style-field='backgroundColor']")).toBeEnabled();
  await expect(textToolbar.locator("[data-presentation-active-shape-opacity]")).toBeEnabled();
  await colorMenu.locator("[data-presentation-active-shape-fill]").evaluate((input) => {
    input.value = "#f59e0b";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await colorMenu.locator("[data-presentation-active-shape-stroke]").evaluate((input) => {
    input.value = "#111827";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await textToolbar.locator("[data-presentation-active-shape-opacity]").evaluate((input) => {
    input.value = "35";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(textToolbar.locator("[data-presentation-active-shape-opacity-value]")).toHaveText("35%");
  const storedShape = await page.evaluate(
    ({ key, date }) => JSON.parse(window.localStorage.getItem(key) || "{}")?.decks?.[date]?.shapes?.["qa-info"]?.[0],
    { key: presentationKey, date: dateValue }
  );
  expect(storedShape).toMatchObject({ type: "circle", fillColor: "#f59e0b", opacity: 35, strokeColor: "#111827" });
  expect(Number(storedShape?.width)).toBeGreaterThan(22);
  expect(Number(storedShape?.height)).toBeGreaterThan(22);
  await expect(slideShape).toHaveCSS("opacity", "0.35");
  await slideShape.focus();
  await page.keyboard.press("Delete");
  await expect(presentation.locator("[data-presentation-shape]")).toHaveCount(0);
  await presentation.locator(".presentation-info-title").click();
  await textToolbar.locator("[data-presentation-add-text-box]").click();
  await expect(presentation.locator(".presentation-free-text-box")).toContainText("Text box");
  const textBoxShell = presentation.locator("[data-presentation-text-box-shell]").first();
  await expect(textBoxShell.locator("[data-presentation-resize-text-box]")).toHaveCount(8);
  const resizeTextBoxHandle = textBoxShell.locator("[data-presentation-resize-axis='se']");
  const resizeTextBoxBox = await resizeTextBoxHandle.boundingBox();
  expect(resizeTextBoxBox).toBeTruthy();
  const textBoxBeforeResize = await textBoxShell.boundingBox();
  const textFontBeforeResize = await textBoxShell.locator(".presentation-free-text-box").evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  await page.mouse.move(resizeTextBoxBox.x + resizeTextBoxBox.width / 2, resizeTextBoxBox.y + resizeTextBoxBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeTextBoxBox.x + resizeTextBoxBox.width / 2 + 52, resizeTextBoxBox.y + resizeTextBoxBox.height / 2 + 42, {
    steps: 6,
  });
  await page.mouse.up();
  const textBoxAfterResize = await textBoxShell.boundingBox();
  const textFontAfterResize = await textBoxShell.locator(".presentation-free-text-box").evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(textBoxAfterResize?.width).toBeGreaterThan((textBoxBeforeResize?.width || 0) + 20);
  expect(textBoxAfterResize?.height).toBeGreaterThan((textBoxBeforeResize?.height || 0) + 10);
  expect(textFontAfterResize).toBeGreaterThan(textFontBeforeResize);
  const rightEdgeHandle = textBoxShell.locator(".presentation-text-box-edge-handle.is-right");
  const beforeTextBoxDrag = await textBoxShell.boundingBox();
  const edgeHandleBox = await rightEdgeHandle.boundingBox();
  expect(beforeTextBoxDrag).toBeTruthy();
  expect(edgeHandleBox).toBeTruthy();
  await page.mouse.move(edgeHandleBox.x + edgeHandleBox.width / 2, edgeHandleBox.y + edgeHandleBox.height * 0.82);
  await page.mouse.down();
  await page.mouse.move(edgeHandleBox.x + edgeHandleBox.width / 2 + 96, edgeHandleBox.y + edgeHandleBox.height * 0.82 + 48, { steps: 6 });
  await page.mouse.up();
  const afterTextBoxDrag = await textBoxShell.boundingBox();
  expect(afterTextBoxDrag?.x).toBeGreaterThan((beforeTextBoxDrag?.x || 0) + 20);
  expect(afterTextBoxDrag?.y).toBeGreaterThan((beforeTextBoxDrag?.y || 0) + 10);
  const storedTextBox = await page.evaluate(
    ({ key, date }) =>
      JSON.parse(window.localStorage.getItem(key) || "{}")?.decks?.[date]?.textBoxes?.["qa-info"]?.find(
        (box) => box.kind === "text" && box.text === "Text box"
      ),
    { key: presentationKey, date: dateValue }
  );
  expect(storedTextBox?.x).toBeGreaterThan(56);
  expect(storedTextBox?.y).toBeGreaterThan(36);
  expect(Number(storedTextBox?.width)).toBeGreaterThan(30);
  expect(Number(storedTextBox?.height)).toBeGreaterThan(12);
  expect(Number(storedTextBox?.fontSize)).toBeGreaterThan(36);
  await textBoxShell.focus();
  await page.keyboard.press("Delete");
  await expect(presentation.locator("[data-presentation-text-box-shell]")).toHaveCount(0);
  await page.keyboard.press(undoShortcut);
  await expect(presentation.locator("[data-presentation-text-box-shell]")).toHaveCount(1);
  await expect(presentation.locator(".presentation-free-text-box")).toContainText("Text box");
  await page.keyboard.press(redoShortcut);
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
  await page.setViewportSize({ width: 857, height: 752 });
  await page.waitForFunction(() => {
    const stage = document.querySelector(".presentation-stage");
    const slide = document.querySelector(".presentation-slide-info");
    if (!stage || !slide) return false;
    const stageStyle = getComputedStyle(stage);
    const slideWidth = stageStyle.getPropertyValue("--presentation-slide-width").trim();
    const slideHeight = stageStyle.getPropertyValue("--presentation-slide-height").trim();
    const stageRect = stage.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();
    return (
      slideWidth.endsWith("px") &&
      slideHeight.endsWith("px") &&
      slideRect.width <= stageRect.width + 1 &&
      slideRect.height <= stageRect.height + 1
    );
  });
  const compactEditLayout = await presentation.evaluate(() => {
    const controlBar = document.querySelector(".presentation-control-bar");
    const toolbar = document.querySelector("[data-presentation-text-toolbar]");
    const passControls = document.querySelector(".presentation-pass-controls");
    const stage = document.querySelector(".presentation-stage");
    const slide = document.querySelector(".presentation-slide-info");
    const footer = document.querySelector(".presentation-footer-nav");
    const title = document.querySelector(".presentation-info-title");
    const body = document.querySelector(".presentation-info-body");
    if (!controlBar || !toolbar || !passControls || !stage || !slide || !footer || !title || !body) return null;
    const controlRect = controlBar.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const passRect = passControls.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const titleFontSize = Number.parseFloat(getComputedStyle(title).fontSize);
    const bodyFontSize = Number.parseFloat(getComputedStyle(body).fontSize);
    return {
      controlBarReasonable: controlRect.height <= 178,
      toolbarInsideControlBar: toolbarRect.top >= controlRect.top - 1 && toolbarRect.bottom <= controlRect.bottom + 1,
      toolbarDoesNotCoverPassControls: toolbarRect.bottom <= passRect.top || toolbarRect.top >= passRect.bottom || toolbarRect.right <= passRect.left || toolbarRect.left >= passRect.right,
      slideFitsStage: slideRect.left >= stageRect.left - 1 && slideRect.right <= stageRect.right + 1 && slideRect.top >= stageRect.top - 1 && slideRect.bottom <= stageRect.bottom + 1,
      slideKeepsRatio: Math.abs(slideRect.width / slideRect.height - 16 / 9) <= 0.03,
      footerBelowStage: footerRect.top >= stageRect.bottom - 1,
      titleScaledForEdit: titleFontSize <= 68,
      bodyScaledForEdit: bodyFontSize <= 48,
    };
  });
  expect(compactEditLayout).toMatchObject({
    controlBarReasonable: true,
    toolbarInsideControlBar: true,
    toolbarDoesNotCoverPassControls: true,
    slideFitsStage: true,
    slideKeepsRatio: true,
    footerBelowStage: true,
    titleScaledForEdit: true,
    bodyScaledForEdit: true,
  });
  await page.setViewportSize({ width: 1450, height: 728 });
  await page.waitForFunction(() => {
    const stage = document.querySelector(".presentation-stage");
    const slide = document.querySelector(".presentation-slide-info");
    if (!stage || !slide) return false;
    const stageRect = stage.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();
    return slideRect.width <= stageRect.width + 1 && slideRect.height <= stageRect.height + 1;
  });
  await expect(presentation).toContainText("Arrive ready");
  await presentation.locator("[data-presentation-delete-slide]").click();
  await expect(presentation.locator(".presentation-slide-info")).toHaveCount(0);
  await expect(presentation.locator(".presentation-slide-tabs")).not.toContainText("Daily Info");
  await expect(presentation).toContainText("Training Overview");
  const slideDragOrder = await presentation.evaluate(() => {
    const getLabels = () =>
      Array.from(document.querySelectorAll("[data-presentation-slide-tab]")).map(
        (tab) => tab.querySelector("strong")?.textContent?.trim() || ""
      );
    const dragSlide = (fromLabel, toLabel, side = "after") => {
      const tabs = Array.from(document.querySelectorAll("[data-presentation-slide-tab]"));
      const from = tabs.find((tab) => tab.querySelector("strong")?.textContent?.trim() === fromLabel);
      const to = tabs.find((tab) => tab.querySelector("strong")?.textContent?.trim() === toLabel);
      if (!from || !to) {
        return { moved: false };
      }
      const rect = to.getBoundingClientRect();
      const clientX = side === "after" ? rect.right - 1 : rect.left + 1;
      const dataTransfer = new DataTransfer();
      from.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
      to.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, clientX, dataTransfer }));
      const markerClass = side === "after" ? "is-drop-after" : "is-drop-before";
      const markerVisible = to.classList.contains(markerClass);
      to.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, clientX, dataTransfer }));
      const markerCleared = !document.querySelector(
        "[data-presentation-slide-tab].is-dragging, [data-presentation-slide-tab].is-drop-before, [data-presentation-slide-tab].is-drop-after"
      );
      return { markerCleared, markerVisible, moved: true };
    };
    const firstMove = dragSlide("Overview", "Block 1", "after");
    const afterMoveLabels = getLabels();
    const restoreMove = dragSlide("Overview", "Block 1", "before");
    const restoredLabels = getLabels();
    return { afterMoveLabels, firstMove, restoredLabels, restoreMove };
  });
  expect(slideDragOrder).toMatchObject({
    firstMove: { markerCleared: true, markerVisible: true, moved: true },
    restoreMove: { markerCleared: true, markerVisible: true, moved: true },
    afterMoveLabels: ["Cover", "Block 1", "Overview"],
    restoredLabels: ["Cover", "Overview", "Block 1"],
  });
  await expect(presentation.locator(".presentation-slide-overview .presentation-section-heading h2")).toHaveCount(0);
  await expect(presentation.locator(".presentation-overview-metric.is-load .presentation-load-gauge")).toHaveCount(1);
  await expect(presentation.locator(".presentation-overview-metric.is-load > span")).toHaveText("Planned Load");
  await expect(presentation.locator(".presentation-overview-metric.is-load .presentation-load-copy")).toHaveCount(0);
  await expect(presentation.locator(".presentation-overview-metric.is-load > span", { hasText: /^Load$/ })).toHaveCount(0);
  await expect(presentation.locator(".presentation-day-overview")).toContainText("Phase");
  await expect(presentation.locator(".presentation-day-overview")).toContainText("In Possession");
  await expect(presentation.locator(".presentation-day-subphase")).toContainText("(Build Up / Final Third)");
  await expect(presentation.locator(".presentation-overview-metric.is-phase")).toHaveCount(0);
  await expect(presentation.locator(".presentation-overview-metric.is-pitch")).toContainText("2/3 pitch");
  await expect(presentation.locator(".presentation-overview-metric.is-pitch .periodization-pitch-icon.is-2-3-pitch")).toBeVisible();
  await expect(presentation.locator(".presentation-overview-metric.is-video")).toContainText("Press trigger clips");
  await expect(presentation.locator(".presentation-overview-video-notes")).toContainText("First pass after regain");
  await expect(presentation.locator(".presentation-overview-video-notes")).toContainText("Fullback body shape");
  const videoNotesStyle = await presentation.locator(".presentation-overview-video-notes").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      text: element.textContent || "",
      whiteSpace: style.whiteSpace,
    };
  });
  expect(videoNotesStyle.text).toContain("\n\n");
  expect(videoNotesStyle.whiteSpace).toBe("pre-wrap");
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
    const pitchLabel = document.querySelector(".presentation-overview-metric.is-pitch > span");
    const matchLabel = document.querySelector(".presentation-overview-metric.is-match-day > span");
    const matchValue = document.querySelector(".presentation-overview-metric.is-match-day > strong");
    const gauge = document.querySelector(".presentation-load-gauge");
    const needle = document.querySelector(".presentation-load-needle");
    const phaseValue = document.querySelector(".presentation-day-phase-value");
    const subPhase = document.querySelector(".presentation-day-subphase");
    if (
      !load ||
      !video ||
      !matchDay ||
      !pitch ||
      !loadLabel ||
      !videoLabel ||
      !pitchLabel ||
      !matchLabel ||
      !matchValue ||
      !gauge ||
      !needle
    ) return null;
    const loadRect = load.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    const matchRect = matchDay.getBoundingClientRect();
    const pitchRect = pitch.getBoundingClientRect();
    const loadLabelRect = loadLabel.getBoundingClientRect();
    const videoLabelRect = videoLabel.getBoundingClientRect();
    const pitchLabelRect = pitchLabel.getBoundingClientRect();
    const matchLabelRect = matchLabel.getBoundingClientRect();
    const matchValueRect = matchValue.getBoundingClientRect();
    const phaseValueRect = phaseValue?.getBoundingClientRect();
    const subPhaseRect = subPhase?.getBoundingClientRect();
    const loadStyle = getComputedStyle(load);
    return {
      leftOfPitch: loadRect.right <= pitchRect.left,
      pitchLeftOfMatchDay: pitchRect.right <= matchRect.left,
      sameTopAsPitch: Math.abs(loadRect.top - pitchRect.top) <= 2,
      sameTopAsMatchDay: Math.abs(loadRect.top - matchRect.top) <= 2,
      pitchSameWidthAsLoad: Math.abs(pitchRect.width - loadRect.width) <= 2,
      pitchSameHeightAsLoad: Math.abs(pitchRect.height - loadRect.height) <= 2,
      pitchSameHeightAsMatchDay: Math.abs(pitchRect.height - matchRect.height) <= 2,
      labelAlignedWithPitch: Math.abs(loadLabelRect.top - pitchLabelRect.top) <= 2,
      labelAlignedWithMatchDay: Math.abs(loadLabelRect.top - matchLabelRect.top) <= 2,
      matchDayValueFitsCard:
        matchValueRect.top >= matchRect.top - 1 &&
        matchValueRect.left >= matchRect.left - 1 &&
        matchValueRect.right <= matchRect.right + 1 &&
        matchValueRect.bottom <= matchRect.bottom + 1,
      videoUnderTopCards: videoRect.top >= loadRect.bottom - 2,
      videoSpansTopCards: Math.abs(videoRect.left - loadRect.left) <= 2 && Math.abs(videoRect.right - matchRect.right) <= 2,
      videoLabelBelowTopCards: videoLabelRect.top >= loadLabelRect.bottom,
      subPhaseBesidePhase: Boolean(
        phaseValueRect &&
          subPhaseRect &&
          Math.abs(phaseValueRect.top - subPhaseRect.top) <= 8 &&
          subPhaseRect.left >= phaseValueRect.right - 3
      ),
      subPhaseSmallerThanPhase: Boolean(
        phaseValue &&
          subPhase &&
          Number.parseFloat(getComputedStyle(subPhase).fontSize) < Number.parseFloat(getComputedStyle(phaseValue).fontSize)
      ),
      loadColor: loadStyle.getPropertyValue("--presentation-load-color").trim(),
      loadAngle: loadStyle.getPropertyValue("--presentation-load-angle").trim(),
    };
  });
  expect(overviewLoadLayout).toMatchObject({
    leftOfPitch: true,
    pitchLeftOfMatchDay: true,
    sameTopAsPitch: true,
    sameTopAsMatchDay: true,
    pitchSameWidthAsLoad: true,
    pitchSameHeightAsLoad: true,
    pitchSameHeightAsMatchDay: true,
    labelAlignedWithPitch: true,
    labelAlignedWithMatchDay: true,
    matchDayValueFitsCard: true,
    videoUnderTopCards: true,
    videoSpansTopCards: true,
    videoLabelBelowTopCards: true,
    subPhaseBesidePhase: true,
    subPhaseSmallerThanPhase: true,
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
      valuesFitCards: cards.every((card) => {
        const cardRect = card.getBoundingClientRect();
        const valueRect = card.querySelector("strong")?.getBoundingClientRect();
        return Boolean(
          valueRect &&
            valueRect.top >= cardRect.top - 1 &&
            valueRect.left >= cardRect.left - 1 &&
            valueRect.right <= cardRect.right + 1 &&
            valueRect.bottom <= cardRect.bottom + 1
        );
      }),
    };
  });
  expect(overviewMetricCardsLayout).toMatchObject({
    compactCards: true,
    pitchHasVisual: true,
    valuesFitCards: true,
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
    const lastPlayerBottom = Math.max(...players.map((player) => player.getBoundingClientRect().bottom));
    return {
      rightOfVideo: medicalRect.left >= videoRect.right - 2,
      rightOfMatchDay: medicalRect.left >= matchRect.right - 2,
      widthRatio: gridRect ? medicalRect.width / gridRect.width : 0,
      spansOverviewContent: medicalRect.bottom >= firstPlayerRect.bottom,
      fillsMedicalHeight: Math.abs(medicalRect.bottom - lastPlayerBottom) <= 24,
      readableRows: players.every((player) => {
        const rect = player.getBoundingClientRect();
        return rect.height >= 28;
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
    fillsMedicalHeight: true,
    readableRows: true,
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
    const rowsVerticallyCentered = articles.every((article) => {
      const rowRect = article.getBoundingClientRect();
      const childRects = Array.from(article.children)
        .map((child) => child.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      if (!childRects.length) return false;
      const contentTop = Math.min(...childRects.map((rect) => rect.top));
      const contentBottom = Math.max(...childRects.map((rect) => rect.bottom));
      const contentCenter = contentTop + (contentBottom - contentTop) / 2;
      const rowCenter = rowRect.top + rowRect.height / 2;
      return Math.abs(contentCenter - rowCenter) <= Math.max(4, rowRect.height * 0.12);
    });
    const combinedLeft = Math.min(loadRect.left, pitchRect.left, matchRect.left, phaseRect.left);
    const combinedRight = Math.max(pitchRect.right, matchRect.right, phaseRect.right);
    return {
      sameLeft: Math.abs(blocksRect.left - combinedLeft) <= 2,
      sameRight: Math.abs(blocksRect.right - combinedRight) <= 2,
      phaseAboveBlocks: phaseRect.bottom <= blocksRect.top + 2,
      phaseAlignsToBlocks: Math.abs(phaseRect.left - blocksRect.left) <= 2 && Math.abs(phaseRect.right - blocksRect.right) <= 2,
      rowsAreWide: articleRects.every((rect) => rect.width > rect.height * 2.2),
      rowsVerticallyCentered,
    };
  });
  expect(overviewBlocksLayout).toMatchObject({
    sameLeft: true,
    sameRight: true,
    phaseAboveBlocks: true,
    phaseAlignsToBlocks: true,
    rowsAreWide: true,
    rowsVerticallyCentered: true,
  });
  await test.step("Overview keeps projector text inside cards", async () => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await waitForViewportSettle(page);
    await presentation.locator("[data-presentation-start]").click();
    await expect(presentation).toHaveClass(/is-presenting/);
    const projectorOverviewLayout = await presentation.evaluate(() => {
      const matchDay = document.querySelector(".presentation-overview-metric.is-match-day");
      const matchValue = matchDay?.querySelector("strong");
      const rows = Array.from(document.querySelectorAll(".presentation-block-flow article"));
      if (!matchDay || !matchValue || !rows.length) return null;
      const matchRect = matchDay.getBoundingClientRect();
      const matchValueRect = matchValue.getBoundingClientRect();
      const rowContentIsCentered = rows.every((row) => {
        const rowRect = row.getBoundingClientRect();
        const childRects = Array.from(row.children)
          .map((child) => child.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0);
        if (!childRects.length) return false;
        const top = Math.min(...childRects.map((rect) => rect.top));
        const bottom = Math.max(...childRects.map((rect) => rect.bottom));
        return Math.abs(top + (bottom - top) / 2 - (rowRect.top + rowRect.height / 2)) <= Math.max(5, rowRect.height * 0.12);
      });
      return {
        matchValueInsideCard:
          matchValueRect.top >= matchRect.top - 1 &&
          matchValueRect.left >= matchRect.left - 1 &&
          matchValueRect.right <= matchRect.right + 1 &&
          matchValueRect.bottom <= matchRect.bottom + 1,
        rowContentIsCentered,
      };
    });
    expect(projectorOverviewLayout).toMatchObject({
      matchValueInsideCard: true,
      rowContentIsCentered: true,
    });
    await presentation.locator("[data-presentation-exit-fullscreen]").click();
    await expect(presentation).not.toHaveClass(/is-presenting/);
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForViewportSettle(page);
  });
  await expect(presentation).not.toContainText("10 min");
  await expect(presentation).not.toContainText("Ready");
  await expect(presentation).not.toContainText("High");

  await page.keyboard.press("ArrowRight");
  await expect(presentation).toContainText("Possession (7v3)");
  await expect(presentation.locator(".presentation-slide-block .presentation-section-heading p")).toContainText("In Possession (Build Up, Creating Phase)");
  await expect(presentation.locator(".presentation-slide-block .presentation-section-heading p")).not.toContainText(" / ");
  await expect(presentation).not.toContainText("10 min");
  await expect(presentation.locator(".presentation-slide-block [data-presentation-text-field='block.label']")).toHaveText("Block 1");
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
