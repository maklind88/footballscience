import { expect, test } from "@playwright/test";
import {
  createHomeTaskCounts,
  createHomeTasksLegacyReadAdapter,
  homeTasksStorageKey,
  normalizeHomeTasks,
  selectHomeTaskQueues,
} from "../src/modules/home/index.mjs";

const now = "2026-05-07T12:00:00.000Z";
const idFactory = (_task, index = 0) => `task-${index + 1}`;

test("Home Tasks adapter normalizes current dashboard task storage without changing shape", () => {
  const rawTasks = JSON.stringify([
    {
      id: "older",
      title: "  Older team task  ",
      note: "  trim me  ",
      assignedTo: "coach-1",
      createdBy: "admin-1",
      scope: "team",
      status: "open",
      createdAt: "2026-05-06T12:00:00.000Z",
    },
    {
      title: "Personal note",
      assignedTo: "coach-1",
      createdBy: "coach-1",
      scope: "personal",
      createdAt: "2026-05-07T12:00:00.000Z",
    },
    {
      title: "",
      assignedTo: "coach-1",
    },
  ]);

  const tasks = normalizeHomeTasks(rawTasks, { currentUserId: "coach-1", now, idFactory });

  expect(tasks).toHaveLength(2);
  expect(tasks[0]).toMatchObject({
    id: "task-2",
    title: "Personal note",
    scope: "personal",
    status: "open",
    createdAt: "2026-05-07T12:00:00.000Z",
  });
  expect(tasks[1]).toMatchObject({
    id: "older",
    title: "Older team task",
    note: "trim me",
    assignedTo: "coach-1",
    createdBy: "admin-1",
  });
});

test("Home Tasks queues match the current dashboard work buckets", () => {
  const tasks = normalizeHomeTasks(
    [
      {
        id: "mine",
        title: "Review session",
        assignedTo: "coach-1",
        createdBy: "admin-1",
        scope: "team",
        createdAt: "2026-05-07T10:00:00.000Z",
      },
      {
        id: "personal",
        title: "Call player",
        assignedTo: "coach-1",
        createdBy: "coach-1",
        scope: "personal",
        createdAt: "2026-05-07T11:00:00.000Z",
      },
      {
        id: "delegated",
        title: "Upload clips",
        assignedTo: "analyst-1",
        createdBy: "coach-1",
        scope: "team",
        createdAt: "2026-05-07T09:00:00.000Z",
      },
      {
        id: "done",
        title: "Done item",
        assignedTo: "coach-1",
        createdBy: "coach-1",
        scope: "team",
        status: "done",
        createdAt: "2026-05-07T08:00:00.000Z",
      },
    ],
    { currentUserId: "coach-1", now, idFactory }
  );

  const queues = selectHomeTaskQueues(tasks, "coach-1");

  expect(queues.myOpenTasks.map((task) => task.id)).toEqual(["mine"]);
  expect(queues.personalOpenTasks.map((task) => task.id)).toEqual(["personal"]);
  expect(queues.delegatedOpenTasks.map((task) => task.id)).toEqual(["delegated"]);
  expect(createHomeTaskCounts(queues)).toEqual({ mine: 1, personal: 1, delegated: 1 });
});

test("Home Tasks legacy read adapter uses the protected storage key and blocks writes", async () => {
  const reads = [];
  const adapter = createHomeTasksLegacyReadAdapter(
    {
      read: async (key) => {
        reads.push(key);
        return JSON.stringify([
          {
            id: "mine",
            title: "Prepare training",
            assignedTo: "coach-1",
            createdBy: "admin-1",
            createdAt: now,
          },
        ]);
      },
    },
    { currentUserId: "coach-1", now, idFactory }
  );

  await expect(adapter.readAllTasks()).resolves.toHaveLength(1);
  await expect(adapter.readTaskQueuesForUser("coach-1")).resolves.toMatchObject({
    counts: { mine: 1, personal: 0, delegated: 0 },
  });
  await expect(adapter.writeTask({ title: "Nope" })).rejects.toThrow("read-only");
  await expect(adapter.removeTask("mine")).rejects.toThrow("read-only");
  expect(reads).toEqual([homeTasksStorageKey, homeTasksStorageKey]);
});

test("Home Tasks adapter treats invalid legacy payloads as empty instead of destructive", () => {
  expect(normalizeHomeTasks("{not-json}", { currentUserId: "coach-1", now, idFactory })).toEqual([]);
  expect(normalizeHomeTasks({ unexpected: true }, { currentUserId: "coach-1", now, idFactory })).toEqual([]);
});

