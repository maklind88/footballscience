import { createReadOnlyStorageAdapter, storageAdapterKinds } from "../../core/storage-adapters.mjs";
import {
  createHomeTaskCounts,
  homeTasksStorageKey,
  normalizeHomeTasks,
  selectHomeTaskQueues,
} from "./tasks.mjs";

function assertReadableAdapter(storageAdapter) {
  if (!storageAdapter || typeof storageAdapter.read !== "function") {
    throw new TypeError("Home Tasks adapter requires a readable storage adapter.");
  }
}

export function createHomeTasksReadAdapter(storageAdapter, defaultOptions = {}) {
  assertReadableAdapter(storageAdapter);

  return Object.freeze({
    storageKey: homeTasksStorageKey,
    kind: storageAdapter.kind || storageAdapterKinds.legacyAppState,
    async readAllTasks(options = {}) {
      const rawValue = await storageAdapter.read(homeTasksStorageKey);
      return normalizeHomeTasks(rawValue, { ...defaultOptions, ...options });
    },
    async readTaskQueuesForUser(currentUserId, options = {}) {
      const tasks = await this.readAllTasks(options);
      const queues = selectHomeTaskQueues(tasks, currentUserId || options.currentUserId || defaultOptions.currentUserId);
      return Object.freeze({
        ...queues,
        counts: createHomeTaskCounts(queues),
      });
    },
    async writeTask() {
      throw new Error("Home Tasks adapter is read-only until migration is explicitly enabled.");
    },
    async removeTask() {
      throw new Error("Home Tasks adapter is read-only until migration is explicitly enabled.");
    },
  });
}

export function createHomeTasksLegacyReadAdapter({ read }, options = {}) {
  return createHomeTasksReadAdapter(
    createReadOnlyStorageAdapter({
      kind: storageAdapterKinds.legacyAppState,
      read,
    }),
    options
  );
}

