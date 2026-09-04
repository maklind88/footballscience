import { expect, test } from "@playwright/test";

const presentationKey = "football-dashboard-presentation-mode-v1";
const mediaDatabaseName = "football-science-presentation-media";
const mediaStoreName = "attachments";

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
      modalRoot
        ?.querySelector(
          "button[data-dashboard-news-dismiss], button[data-dashboard-tutorial-never], button[data-dashboard-tutorial-save], button[data-dashboard-modal-close]"
        )
        ?.click();
    })
    .catch(() => {});
}

test("Presentation Mode keeps local edits after reload and can relink a missing image", async ({ page }) => {
  const localToday = new Date();
  const dateValue = [
    localToday.getFullYear(),
    String(localToday.getMonth() + 1).padStart(2, "0"),
    String(localToday.getDate()).padStart(2, "0"),
  ].join("-");

  await page.addInitScript(
    ({ date, key }) => {
      Object.defineProperty(window, "showOpenFilePicker", { configurable: true, value: undefined });
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(
        key,
        JSON.stringify({
          schema: "footballscience-presentation-mode-v1",
          version: 1,
          decks: {
            [date]: {
              updatedAt: new Date().toISOString(),
              infoSlides: [
                {
                  id: "qa-persistent-media",
                  layout: "media",
                  title: "Delete this title",
                  body: "Local media reload check",
                  mediaKind: "image",
                  accentColor: "#38bdf8",
                  textColor: "#f8fafc",
                },
              ],
            },
          },
        })
      );
    },
    { date: dateValue, key: presentationKey }
  );

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await dismissDashboardModal(page);
  await page
    .locator('[data-dashboard-presentation-card][data-dashboard-presentation-type="team"] [data-dashboard-open-presentation]')
    .click();

  const presentation = page.locator("[data-presentation-mode-shell]");
  await presentation.locator('[data-presentation-goto="1"]').click();
  const title = presentation.locator(".presentation-info-title");
  await expect(title).toHaveValue("Delete this title");
  await title.fill("");
  await title.blur();
  await expect(title).toHaveValue("");

  const chooserPromise = page.waitForEvent("filechooser");
  await presentation.locator("[data-presentation-info-media-pick='image']").click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "persistent-board.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEtwJ+gN7uXQAAAABJRU5ErkJggg==",
      "base64"
    ),
  });

  await expect(presentation.locator(".presentation-info-media-panel.is-image.has-media img")).toHaveAttribute("src", /^blob:/);
  await page.waitForFunction(
    async ({ key, date, databaseName, storeName }) => {
      const store = JSON.parse(window.localStorage.getItem(key) || "{}");
      const mediaId = store.decks?.[date]?.infoSlides?.find((slide) => slide.id === "qa-persistent-media")?.mediaId;
      if (!mediaId) return false;
      return new Promise((resolve) => {
        const openRequest = window.indexedDB.open(databaseName, 1);
        openRequest.onerror = () => resolve(false);
        openRequest.onsuccess = () => {
          const db = openRequest.result;
          const request = db.transaction(storeName, "readonly").objectStore(storeName).get(mediaId);
          request.onerror = () => {
            db.close();
            resolve(false);
          };
          request.onsuccess = () => {
            db.close();
            resolve(Boolean(request.result?.blob));
          };
        };
      });
    },
    { key: presentationKey, date: dateValue, databaseName: mediaDatabaseName, storeName: mediaStoreName }
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await dismissDashboardModal(page);
  await page
    .locator('[data-dashboard-presentation-card][data-dashboard-presentation-type="team"] [data-dashboard-open-presentation]')
    .click();
  await presentation.locator('[data-presentation-goto="1"]').click();

  await expect(presentation.locator(".presentation-info-title")).toHaveValue("");
  await expect(presentation.locator(".presentation-info-media-panel.is-image.has-media img")).toHaveAttribute("src", /^blob:/);
  await expect(presentation.locator(".presentation-info-media-panel.is-missing")).toHaveCount(0);

  await page.evaluate(
    async ({ key, date, databaseName, storeName }) => {
      const store = JSON.parse(window.localStorage.getItem(key) || "{}");
      const mediaId = store.decks?.[date]?.infoSlides?.find((slide) => slide.id === "qa-persistent-media")?.mediaId;
      if (!mediaId) throw new Error("Missing media id for local media QA.");
      await new Promise((resolve, reject) => {
        const openRequest = window.indexedDB.open(databaseName, 1);
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const db = openRequest.result;
          const request = db.transaction(storeName, "readwrite").objectStore(storeName).delete(mediaId);
          request.onerror = () => {
            db.close();
            reject(request.error);
          };
          request.onsuccess = () => {
            db.close();
            resolve();
          };
        };
      });
    },
    { key: presentationKey, date: dateValue, databaseName: mediaDatabaseName, storeName: mediaStoreName }
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await dismissDashboardModal(page);
  await page
    .locator('[data-dashboard-presentation-card][data-dashboard-presentation-type="team"] [data-dashboard-open-presentation]')
    .click();
  await presentation.locator('[data-presentation-goto="1"]').click();
  const missingPanel = presentation.locator(".presentation-info-media-panel.is-image.is-missing");
  await expect(missingPanel).toBeVisible();
  await expect(missingPanel).toContainText("Image file missing");
  await expect(missingPanel.locator("[data-presentation-info-media-pick='image']")).toHaveText("Relink Image");

  const relinkChooserPromise = page.waitForEvent("filechooser");
  await missingPanel.locator("[data-presentation-info-media-pick='image']").click();
  const relinkChooser = await relinkChooserPromise;
  await relinkChooser.setFiles({
    name: "relinked-board.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEtwJ+gN7uXQAAAABJRU5ErkJggg==",
      "base64"
    ),
  });
  await expect(presentation.locator(".presentation-info-media-panel.is-image.has-media img")).toHaveAttribute("src", /^blob:/);
  await expect(presentation.locator(".presentation-info-media-panel.is-missing")).toHaveCount(0);
});
