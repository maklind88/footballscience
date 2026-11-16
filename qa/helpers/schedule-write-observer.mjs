export async function observeScheduleWrite(page, key) {
  await page.evaluate(key => {
    const storage = window.localStorage;
    const original = Storage.prototype.setItem;
    const categories = {
      "football-schedule-v1": "schedule",
      "football-data-safety-v1": "manifest",
      "football-player-profiles-v1": "profiles",
      "football-session-planner-v3": "sessions",
      "football-session-exercise-library-v1": "exercises",
    };
    const sizes = { total: 0, other: 0, entries: storage.length };
    // Named-property reads bypass the app's in-memory read view. Export sizes only.
    for (let index = 0; index < storage.length; index++) {
      const name = storage.key(index);
      const size = name.length + String(storage[name] ?? "").length;
      sizes.total += size;
      const category = categories[name] || "other";
      sizes[category] = (sizes[category] || 0) + size;
    }
    const report = { sizes, attempts: 0, succeeded: false, attemptedLength: 0, error: "none" };
    const classify = error => {
      const message = String(error?.message || "");
      if (/quota/i.test(error?.name || "") || /quota/i.test(message)) return "quota";
      if (/metadata could not be verified/i.test(message)) return "metadata-invalid";
      if (/pending sync metadata could not be saved/i.test(message)) return "queue-metadata";
      if (/metadata could not be saved/i.test(message)) return "metadata-persist";
      if (/read.only/i.test(message)) return "read-only";
      if (/central sync is not ready/i.test(message)) return "not-ready";
      if (/sign.in|session|authenticated/i.test(message)) return "authentication";
      return "other";
    };
    const wrapped = function(name, value) {
      if (this !== storage || name !== key) return original.apply(this, arguments);
      report.attempts++;
      report.attemptedLength = String(value).length;
      try {
        const result = original.apply(this, arguments);
        report.succeeded = true;
        report.error = "none";
        return result;
      } catch (error) {
        report.succeeded = false;
        report.error = classify(error);
        throw error;
      }
    };
    Storage.prototype.setItem = wrapped;
    window.__qaScheduleWriteObservation = {
      report,
      restore() {
        if (Storage.prototype.setItem === wrapped) Storage.prototype.setItem = original;
        delete window.__qaScheduleWriteObservation;
      },
    };
  }, key);
  return () => page.evaluate(() => window.__qaScheduleWriteObservation?.restore());
}
