import { sameSnapshotContents } from "./distinct-snapshot-store.mjs";
import { DEFAULT_SNAPSHOT_BYTES, snapshotBudgetError, snapshotBytes } from "./snapshot-retention-policy.mjs";

export function createSnapshotFlightAdmission({ maxCount = 4, maxBytes = DEFAULT_SNAPSHOT_BYTES, onDrain = () => {} } = {}) {
  if (!Number.isSafeInteger(maxCount) || maxCount < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError("Invalid snapshot writer budget.");
  }
  const flights = new Set(); let bytes = 0;
  const busy = () => {
    const error = new Error("Browser snapshot copying is busy. This attempt was not saved; existing copies were retained.");
    error.name = "SnapshotBusyError"; return error;
  };
  return {
    submit(snapshot, prepare, persist) {
      for (const flight of flights) if (sameSnapshotContents(flight.snapshot, snapshot)) return flight.promise;
      if (flights.size >= maxCount) throw busy();
      prepare(snapshot);
      const size = snapshotBytes(snapshot);
      if (size > maxBytes) throw snapshotBudgetError();
      if (bytes + size > maxBytes) throw busy();
      const flight = { snapshot, size, promise: null };
      flights.add(flight); bytes += size;
      flight.promise = (async () => persist(snapshot))().finally(() => {
        flights.delete(flight); bytes -= size;
        if (!flights.size) onDrain();
      });
      return flight.promise;
    },
  };
}
