import { expect, test } from "@playwright/test";
import { createContext, runInContext } from "node:vm";
import { observeScheduleWrite } from "./helpers/schedule-write-observer.mjs";

const key = "football-schedule-v1";
const secret = "private-content-and-token";
function fixture(error) {
  class Storage {
    get length() { return Object.keys(this).length; }
    key(index) { return Object.keys(this)[index]; }
    getItem() { return "in-memory-view"; }
    setItem(name, value) {
      if (error) throw error;
      this[name] = String(value);
      return "original-result";
    }
  }
  const localStorage = new Storage();
  Object.assign(localStorage, { [key]: "native-copy", [secret]: secret });
  const context = createContext({ Storage, window: { localStorage } });
  const page = { evaluate: (fn, input) => {
    context.input = input;
    return runInContext(`(${fn})(input)`, context);
  } };
  return { page, localStorage, original: Storage.prototype.setItem, Storage,
    report: () => context.window.__qaScheduleWriteObservation?.report };
}

for (const [index, [message, category]] of [
  ["Quota exceeded", "quota"],
  ["Edit was not queued: recovery metadata could not be saved.", "metadata-persist"],
  ["Local save metadata could not be verified.", "metadata-invalid"],
  ["Edit remains local: pending sync metadata could not be saved.", "queue-metadata"],
  ["This central view is read-only.", "read-only"],
  [secret, "other"],
].entries()) {
  test(`Schedule observer preserves the exact thrown error and reports only ${category} (case ${index + 1})`, async () => {
    const error = new Error(message);
    const f = fixture(error);
    const restore = await observeScheduleWrite(f.page, key);
    expect(() => f.localStorage.setItem(key, secret)).toThrow(error);
    expect(f.report()).toMatchObject({ attempts: 1, succeeded: false, error: category, attemptedLength: secret.length });
    expect(JSON.stringify(f.report())).not.toContain(secret);
    expect(f.localStorage[key]).toBe("native-copy");
    await restore();
    expect(f.Storage.prototype.setItem).toBe(f.original);
    expect(f.report()).toBeUndefined();
  });
}

test("Schedule observer measures native storage without exporting keys or cached values", async () => {
  const f = fixture();
  const restore = await observeScheduleWrite(f.page, key);
  const scheduleSize = key.length + "native-copy".length;
  expect(f.report().sizes).toEqual({ schedule: scheduleSize, other: secret.length * 2,
    total: scheduleSize + secret.length * 2, entries: 2 });
  expect(f.localStorage.setItem("unrelated", "value")).toBe("original-result");
  expect(f.report().attempts).toBe(0);
  expect(f.localStorage.setItem(key, "new value")).toBe("original-result");
  expect(f.report()).toMatchObject({ attempts: 1, succeeded: true, error: "none" });
  expect(f.localStorage[key]).toBe("new value");
  expect(JSON.stringify(f.report())).not.toContain(secret);
  await restore();
});

test("Schedule observer does not observe sessionStorage or replace a later wrapper", async () => {
  const f = fixture();
  const restore = await observeScheduleWrite(f.page, key);
  new f.Storage().setItem(key, "session-only");
  expect(f.report().attempts).toBe(0);
  const laterWrapper = () => {};
  f.Storage.prototype.setItem = laterWrapper;
  await restore();
  expect(f.Storage.prototype.setItem).toBe(laterWrapper);
});
