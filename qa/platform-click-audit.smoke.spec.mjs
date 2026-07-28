import { expect, test } from "@playwright/test";

const workspaceHubKey = "football-workspace-hub-v3";
const performanceBudgetMultiplier = process.env.CI ? 1.25 : 1;
const workspacePerformanceBudgetMultiplier = process.env.CI ? 1.75 : 1;
const budget = (milliseconds) => Math.ceil(milliseconds * performanceBudgetMultiplier);
const workspaceBudget = (milliseconds) => Math.ceil(milliseconds * workspacePerformanceBudgetMultiplier);

test.describe.configure({ timeout: 180_000 });

const workspaceIds = [
  "home",
  "schedule",
  "gameplan",
  "periodization",
  "session-planner",
  "player-profiles",
  "scouting",
  "transfer-room",
  "analysis-room",
  "staff",
  "medical-team",
  "admin",
  "team-identity",
  "game-simulator",
  "my-profile",
  "settings",
];

const workspaceViewIds = {
  "my-profile": "profile",
  settings: "placeholder",
  "team-identity": "placeholder",
};

const clickBudgetMs = budget(1200);
const workspaceClickBudgetMs = workspaceBudget(1500);
const maxCandidatesPerWorkspace = Number(process.env.PLATFORM_CLICK_AUDIT_MAX || 16);
const idpAuditProfile = {
  playerId: "ncc-2026-kailen-sheridan",
  playerName: "Kailen Sheridan",
  position: "GK",
  role: "Goalkeeper",
  ownerId: "coach-audit",
};
const idpAuditFocus = {
  id: "focus-audit-distribution",
  playerId: idpAuditProfile.playerId,
  title: "Back-line distribution",
  category: "Technical",
  linkedPhase: "Build-up",
  linkedSubPhase: "First pass",
  ownerId: "coach-audit",
  status: "Active",
  evidenceStatus: "Needs Evidence",
  reviewDate: "2026-07-01",
};
const idpAuditPlayer = {
  profile: idpAuditProfile,
  focuses: [idpAuditFocus],
  clipBank: [
    {
      id: "clip-bank-audit-1",
      playerId: idpAuditProfile.playerId,
      clipInstanceId: "clip-audit-1",
      linkedFocusId: idpAuditFocus.id,
      status: "New",
      sourceModule: "video-analysis",
      createdAt: "2026-06-14T12:00:00.000Z",
    },
  ],
  evidence: [
    {
      id: "evidence-audit-1",
      playerId: idpAuditProfile.playerId,
      focusId: idpAuditFocus.id,
      evidenceType: "Coach Note",
      sourceModule: "idp",
      note: "Static audit fixture.",
      createdAt: "2026-06-14T12:00:00.000Z",
    },
  ],
  reviews: [],
  nextActions: [
    {
      id: "next-action-audit-1",
      playerId: idpAuditProfile.playerId,
      focusId: idpAuditFocus.id,
      actionType: "Add Evidence",
      title: "Review clipped distribution",
      ownerId: "coach-audit",
      dueOn: "2026-07-01",
      status: "open",
    },
  ],
  milestones: [
    {
      id: "milestone-audit-1",
      playerId: idpAuditProfile.playerId,
      focusId: idpAuditFocus.id,
      milestoneType: "Focus Created",
      title: "IDP started",
      occurredOn: "2026-06-14",
    },
  ],
  ownership: [{ ownerId: "coach-audit", role: "primary" }],
};

function viewIdForWorkspace(workspaceId) {
  return workspaceViewIds[workspaceId] || workspaceId;
}

async function mockIdpApi(route) {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method().toUpperCase();
  let action = url.searchParams.get("action") || "";
  if (method !== "GET") {
    try {
      action = JSON.parse(request.postData() || "{}")?.action || action;
    } catch {
      action = "";
    }
  }

  const payload =
    action === "dashboard"
      ? {
          players: [
            {
              profile: idpAuditProfile,
              focus: idpAuditFocus,
              evidenceCount: idpAuditPlayer.evidence.length,
              newClipCount: idpAuditPlayer.clipBank.length,
              nextAction: "Review clipped distribution",
              overallStatus: "On Track",
            },
          ],
        }
      : action === "player"
        ? idpAuditPlayer
        : { ok: true };

  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function dismissDashboardModal(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const closeButton = page
      .locator(
        "button[data-dashboard-news-dismiss], button[data-dashboard-tutorial-never], button[data-dashboard-tutorial-save], button[data-dashboard-modal-close], [data-dashboard-news-dismiss]"
      )
      .first();

    if ((await closeButton.count()) > 0) {
      await closeButton.click({ force: true }).catch(() => {});
    }

    await page.waitForTimeout(50);
  }
}

async function bootApp(page) {
  const pageErrors = [];
  const consoleErrors = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      consoleErrors.push({
        text: message.text(),
        url: location.url || "",
        lineNumber: location.lineNumber || 0,
        columnNumber: location.columnNumber || 0,
      });
    }
  });
  page.on("dialog", async (dialog) => {
    await dialog.dismiss().catch(() => {});
  });
  await page.route("**/api/idp**", mockIdpApi);

  await page.addInitScript(
    ({ key, ids }) => {
      const allRoles = ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"];
      const workspaceAccess = ids.reduce((access, workspaceId) => {
        access[workspaceId] = { view: allRoles, edit: allRoles };
        return access;
      }, {});
      window.localStorage.setItem(
        key,
        JSON.stringify({
          activeWorkspaceId: "home",
          workspaceAccess,
        })
      );
    },
    { key: workspaceHubKey, ids: workspaceIds }
  );

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await expect(page.locator("#loginScreen")).toBeHidden();
  await page.waitForFunction(() => Boolean(window.footballScienceDataSafety), null, { timeout: 15_000 });
  await dismissDashboardModal(page);

  return { pageErrors, consoleErrors };
}

async function openWorkspace(page, workspaceId) {
  const viewId = viewIdForWorkspace(workspaceId);
  await page.evaluate((targetWorkspaceId) => {
    window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: targetWorkspaceId } }));
  }, workspaceId);
  await dismissDashboardModal(page);
  await expect(page.locator(`[data-workspace-view="${viewId}"].is-active`)).toBeVisible();
}

async function closeTransientUi(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => {
    for (const selector of [
      "[data-dashboard-modal-close]",
      ".modal-close",
      ".profile-modal-close",
      ".squad-profile-modal-close",
      ".scouting-profile-close",
      "[data-player-profile-modal-close]",
      "[data-player-profile-new-modal-close]",
      "[data-periodization-close]",
      "[aria-label='Close']",
      "[aria-label='Close modal']",
    ]) {
      for (const node of document.querySelectorAll(selector)) {
        if (node instanceof HTMLElement && !node.hidden && !node.disabled) {
          node.click();
        }
      }
    }
    for (const details of document.querySelectorAll("details[open]")) {
      details.open = false;
    }
  });
}

async function collectWorkspaceNavigation(page) {
  return page.evaluate(() => {
    const unique = new Map();
    for (const node of document.querySelectorAll("[data-open-workspace]")) {
      if (!(node instanceof HTMLElement) || node.disabled) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      if (rect.width < 8 || rect.height < 8 || style.display === "none" || style.visibility === "hidden") {
        continue;
      }
      const workspaceId = node.dataset.openWorkspace || "";
      const label = String(node.getAttribute("aria-label") || node.textContent || workspaceId).replace(/\s+/g, " ").trim();
      if (!workspaceId || unique.has(workspaceId)) {
        continue;
      }
      unique.set(workspaceId, {
        workspaceId: "navigation",
        viewId: "home",
        signature: `nav|${workspaceId}`,
        targetWorkspaceId: workspaceId,
        label,
        tag: node.tagName.toLowerCase(),
        type: "data-open-workspace",
        data: `openWorkspace:${workspaceId}`,
        href: "",
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        smallTarget: rect.width < 32 || rect.height < 32,
        missingLabel: !label,
      });
    }
    return Array.from(unique.values());
  });
}

async function collectVisibleCandidates(page, workspaceId) {
  const viewId = viewIdForWorkspace(workspaceId);
  return page.evaluate(
    ({ targetWorkspaceId, targetViewId, limit }) => {
      const workspace = document.querySelector(`[data-workspace-view="${CSS.escape(targetViewId)}"].is-active`);
      const scopes = [workspace].filter(Boolean);
      const selector = [
        "button",
        "a[href]",
        "summary",
        "[role='button']",
        "input[type='button']",
        "input[type='submit']",
        "input[type='checkbox']",
        "input[type='radio']",
      ].join(",");
      const destructivePattern = /delete|remove|logout|reset|clear|restore|rollback|import|export|download|upload|password|never/i;
      const workflowRowSelector = [
        "[data-scouting-record-row]",
        "[data-scouting-drag-favorite-record]",
        "[data-scouting-drag-target]",
        "[data-scouting-my-team-drop-slot]",
        "[data-scouting-shadow-drop-slot]",
        "[data-scouting-target-drop-status]",
        "[data-transfer-target-card]",
        "[data-transfer-squad-player-row]",
        "[data-player-profile-select]",
        ".squad-player-row",
        "[data-medical-roster-row]",
        ".session-player-board-token",
      ].join(",");
      const preferredDataKeys = [
        "openWorkspace",
        "scoutingTab",
        "scheduleView",
        "periodizationView",
        "openSessionPlanner",
        "sessionPlannerTab",
        "medicalBoardView",
        "openMedicalRecommendation",
        "openSquadProfile",
        "simAction",
      ];

      function isVisible(node) {
        if (!(node instanceof HTMLElement)) {
          return false;
        }
        if (node.disabled || node.getAttribute("aria-disabled") === "true") {
          return false;
        }
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return rect.width >= 8 && rect.height >= 8 && style.display !== "none" && style.visibility !== "hidden" && style.pointerEvents !== "none";
      }

      function cleanText(value) {
        return String(value || "").replace(/\s+/g, " ").trim().slice(0, 90);
      }

      function labelFor(node) {
        if (node instanceof HTMLInputElement && ["checkbox", "radio"].includes(node.type)) {
          const label = node.closest("label")?.textContent || document.querySelector(`label[for="${CSS.escape(node.id || "")}"]`)?.textContent || "";
          return cleanText(label || node.getAttribute("aria-label") || node.name || node.value || node.type);
        }
        return cleanText(node.getAttribute("aria-label") || node.getAttribute("title") || node.textContent || node.value || node.id || "");
      }

      function dataIdentity(node) {
        for (const key of preferredDataKeys) {
          if (node.dataset?.[key]) {
            return `${key}:${node.dataset[key]}`;
          }
        }
        const keys = Object.keys(node.dataset || {}).filter((key) => !key.startsWith("clickAudit")).sort();
        return keys.slice(0, 4).join(",");
      }

      const unique = new Map();
      for (const scope of scopes) {
        for (const node of scope.querySelectorAll(selector)) {
          if (!isVisible(node)) {
            continue;
          }
          if (node instanceof HTMLInputElement && node.type === "file") {
            continue;
          }
          if (node.closest(workflowRowSelector)) {
            continue;
          }
          const label = labelFor(node);
          const href = node instanceof HTMLAnchorElement ? node.getAttribute("href") || "" : "";
          const type = node.getAttribute("type") || node.getAttribute("role") || "";
          const data = dataIdentity(node);
          if (data.startsWith("openWorkspace:")) {
            continue;
          }
          const signature = [node.tagName.toLowerCase(), type, data, label].join("|");
          const searchableText = `${label} ${data} ${href} ${node.className || ""}`;
          if (destructivePattern.test(searchableText)) {
            continue;
          }
          if (href && (/^https?:\/\//i.test(href) || /^mailto:/i.test(href) || /^tel:/i.test(href))) {
            continue;
          }
          if (!unique.has(signature)) {
            const rect = node.getBoundingClientRect();
            unique.set(signature, {
              workspaceId: targetWorkspaceId,
              viewId: targetViewId,
              signature,
              label,
              tag: node.tagName.toLowerCase(),
              type,
              data,
              href,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              smallTarget: rect.width < 32 || rect.height < 32,
              missingLabel: !label,
            });
          }
        }
      }
      return Array.from(unique.values()).slice(0, limit);
    },
    { targetWorkspaceId: workspaceId, targetViewId: viewId, limit: maxCandidatesPerWorkspace }
  );
}

async function clickCandidate(page, candidate) {
  if (candidate.workspaceId === "navigation") {
    return page.evaluate(async (target) => {
      const node = Array.from(document.querySelectorAll("[data-open-workspace]")).find((entry) => entry.dataset?.openWorkspace === target.targetWorkspaceId);
      if (!(node instanceof HTMLElement)) {
        return { ...target, skipped: true, reason: "stale" };
      }
      node.scrollIntoView({ block: "center", inline: "center" });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const startedAt = performance.now();
      node.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { ...target, ms: Math.round(performance.now() - startedAt) };
    }, candidate);
  }

  return page.evaluate(async (target) => {
    const selector = [
      "button",
      "a[href]",
      "summary",
      "[role='button']",
      "input[type='button']",
      "input[type='submit']",
      "input[type='checkbox']",
      "input[type='radio']",
    ].join(",");

    function cleanText(value) {
      return String(value || "").replace(/\s+/g, " ").trim().slice(0, 90);
    }

    function labelFor(node) {
      if (node instanceof HTMLInputElement && ["checkbox", "radio"].includes(node.type)) {
        const label = node.closest("label")?.textContent || document.querySelector(`label[for="${CSS.escape(node.id || "")}"]`)?.textContent || "";
        return cleanText(label || node.getAttribute("aria-label") || node.name || node.value || node.type);
      }
      return cleanText(node.getAttribute("aria-label") || node.getAttribute("title") || node.textContent || node.value || node.id || "");
    }

    function dataIdentity(node) {
      const preferredDataKeys = [
        "openWorkspace",
        "scoutingTab",
        "scheduleView",
        "periodizationView",
        "openSessionPlanner",
        "sessionPlannerTab",
        "medicalBoardView",
        "openMedicalRecommendation",
        "openSquadProfile",
        "simAction",
      ];
      for (const key of preferredDataKeys) {
        if (node.dataset?.[key]) {
          return `${key}:${node.dataset[key]}`;
        }
      }
      const keys = Object.keys(node.dataset || {}).filter((key) => !key.startsWith("clickAudit")).sort();
      return keys.slice(0, 4).join(",");
    }

    function isVisible(node) {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      if (node.disabled || node.getAttribute("aria-disabled") === "true") {
        return false;
      }
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width >= 8 && rect.height >= 8 && style.display !== "none" && style.visibility !== "hidden" && style.pointerEvents !== "none";
    }

    function signatureFor(node) {
      const type = node.getAttribute("type") || node.getAttribute("role") || "";
      return [node.tagName.toLowerCase(), type, dataIdentity(node), labelFor(node)].join("|");
    }

    const workspace = document.querySelector(`[data-workspace-view="${CSS.escape(target.viewId)}"].is-active`);
    const scopes = [workspace].filter(Boolean);
    const node = scopes.flatMap((scope) => Array.from(scope.querySelectorAll(selector))).find((entry) => isVisible(entry) && signatureFor(entry) === target.signature);
    if (!node) {
      return { ...target, skipped: true, reason: "stale" };
    }

    node.scrollIntoView({ block: "center", inline: "center" });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const startedAt = performance.now();
    node.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const ms = Math.round(performance.now() - startedAt);
    return { ...target, ms };
  }, candidate);
}

test("platform visible click audit keeps distinct controls responsive and labelled", async ({ page }, testInfo) => {
  const runtime = await bootApp(page);
  const results = [];
  const navigationCandidates = await collectWorkspaceNavigation(page);
  const availableWorkspaceIds = new Set(navigationCandidates.map((candidate) => candidate.targetWorkspaceId));
  const missingLabels = [];
  const smallTargets = [];
  for (const candidate of navigationCandidates) {
    const result = await clickCandidate(page, candidate);
    if (!result.skipped) {
      results.push(result);
    }
  }

  const testableWorkspaceIds = workspaceIds.filter((workspaceId) => availableWorkspaceIds.has(workspaceId));
  for (const workspaceId of testableWorkspaceIds) {
    await openWorkspace(page, workspaceId);
    const candidates = await collectVisibleCandidates(page, workspaceId);
    console.log(`[platform-click-audit] ${workspaceId}: ${candidates.length} controls`);
    for (const candidate of candidates) {
      if (candidate.missingLabel) {
        missingLabels.push(candidate);
      }
      if (candidate.smallTarget) {
        smallTargets.push(candidate);
      }
      await closeTransientUi(page);
      const result = await clickCandidate(page, candidate);
      if (!result.skipped) {
        results.push(result);
      }
    }
  }

  const slowClicks = results.filter((result) => result.ms > (result.data.startsWith("openWorkspace:") ? workspaceClickBudgetMs : clickBudgetMs));
  const report = {
    budgets: {
      clickBudgetMs,
      workspaceClickBudgetMs,
      maxCandidatesPerWorkspace,
    },
    totals: {
      clicked: results.length,
      slow: slowClicks.length,
      missingLabels: missingLabels.length,
      smallTargets: smallTargets.length,
      pageErrors: runtime.pageErrors.length,
      consoleErrors: runtime.consoleErrors.length,
    },
    slowClicks,
    missingLabels,
    smallTargets,
    results,
    pageErrors: runtime.pageErrors,
    consoleErrors: runtime.consoleErrors,
  };

  console.log(`[platform-click-audit] ${JSON.stringify(report.totals)}`);
  for (const result of slowClicks.slice(0, 20)) {
    console.log(`[platform-click-audit] slow ${result.workspaceId} :: ${result.label || result.signature} :: ${result.ms}ms`);
  }
  for (const candidate of missingLabels.slice(0, 20)) {
    console.log(`[platform-click-audit] missing-label ${candidate.workspaceId} :: ${candidate.signature}`);
  }
  await testInfo.attach("platform-click-audit.json", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });

  expect(runtime.pageErrors).toEqual([]);
  expect(runtime.consoleErrors).toEqual([]);
  expect(missingLabels, "Visible click targets need an accessible label or visible text.").toEqual([]);
  expect(slowClicks, "Visible click targets should resolve inside the interaction budget.").toEqual([]);
});
