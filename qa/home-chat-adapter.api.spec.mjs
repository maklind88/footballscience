import { expect, test } from "@playwright/test";
import {
  createHomeChatDirectThreadId,
  createHomeChatLegacyReadAdapter,
  getHomeChatUnreadCountForUser,
  homeChatStorageKey,
  homeChatTeamThreadId,
  normalizeHomeChatMessages,
  normalizeHomeChatThreadId,
  selectHomeChatThreadList,
} from "../src/modules/home/index.mjs";

const now = "2026-05-07T12:00:00.000Z";
const idFactory = (_message, index = 0) => `message-${index + 1}`;

const users = [
  { id: "coach-1", firstName: "Mak", lastName: "Lind", username: "mak", status: "active" },
  { id: "analyst-1", firstName: "Ana", lastName: "Lyst", username: "ana", status: "active" },
  { id: "medical-1", firstName: "Medi", lastName: "Cal", username: "med", status: "active" },
  { id: "archived-1", firstName: "Old", lastName: "Staff", username: "old", status: "inactive" },
];

test("Home Chat adapter normalizes current dashboard chat storage without changing shape", () => {
  const rawMessages = JSON.stringify([
    {
      id: "newer",
      userId: "analyst-1",
      threadId: "dm:coach-1:analyst-1",
      text: "  @mak urgent clip  ",
      createdAt: "2026-05-07T11:00:00.000Z",
      readBy: ["analyst-1", "analyst-1"],
      priority: "urgent",
      reactions: { agree: ["coach-1", "coach-1"], unknown: ["x"] },
      author: { id: "analyst-1", first_name: "Ana", last_name: "Lyst", profile_image_url: "https://example.com/a.png" },
    },
    {
      userId: "coach-1",
      threadId: "strange-thread",
      text: "Team note",
      createdAt: "2026-05-07T10:00:00.000Z",
    },
    {
      userId: "coach-1",
      text: "",
    },
  ]);

  const messages = normalizeHomeChatMessages(rawMessages, { currentUserId: "coach-1", users, now, idFactory });

  expect(messages).toHaveLength(2);
  expect(messages[0]).toMatchObject({
    id: "message-2",
    userId: "coach-1",
    threadId: homeChatTeamThreadId,
    text: "Team note",
    priority: "normal",
  });
  expect(messages[1]).toMatchObject({
    id: "newer",
    userId: "analyst-1",
    threadId: "dm:analyst-1:coach-1",
    text: "@mak urgent clip",
    priority: "urgent",
    readBy: ["analyst-1"],
    mentionedUserIds: ["coach-1"],
  });
  expect(messages[1].reactions.agree).toEqual(["coach-1"]);
  expect(messages[1].author).toMatchObject({ firstName: "Ana", lastName: "Lyst", profileImageUrl: "https://example.com/a.png" });
});

test("Home Chat thread list matches current team and direct message buckets", () => {
  const currentUser = users[0];
  const messages = normalizeHomeChatMessages(
    [
      {
        id: "team-unread",
        userId: "medical-1",
        threadId: "team",
        text: "@team readiness update",
        readBy: ["medical-1"],
        createdAt: "2026-05-07T09:00:00.000Z",
      },
      {
        id: "dm-unread",
        userId: "analyst-1",
        threadId: "dm:analyst-1:coach-1",
        text: "@mak video is ready",
        readBy: ["analyst-1"],
        createdAt: "2026-05-07T11:00:00.000Z",
      },
      {
        id: "dm-read",
        userId: "medical-1",
        threadId: "dm:coach-1:medical-1",
        text: "Player note read already",
        readBy: ["medical-1", "coach-1"],
        createdAt: "2026-05-07T10:00:00.000Z",
      },
    ],
    { currentUserId: "coach-1", users, now, idFactory }
  );

  const threads = selectHomeChatThreadList({ currentUser, users, messages });

  expect(threads.map((thread) => thread.threadId)).toEqual([
    "team",
    "dm:analyst-1:coach-1",
    "dm:coach-1:medical-1",
  ]);
  expect(threads[0]).toMatchObject({ label: "Team Chat", isTeamThread: true, unreadCount: 1, mentionCount: 1 });
  expect(threads[1]).toMatchObject({
    label: "Ana Lyst",
    messageCount: 1,
    unreadCount: 1,
    mentionCount: 1,
  });
  expect(threads[2]).toMatchObject({ label: "Medi Cal", messageCount: 1, unreadCount: 0, mentionCount: 0 });
  expect(getHomeChatUnreadCountForUser(currentUser, messages, users)).toBe(2);
});

test("Home Chat normalizes direct message thread ids deterministically", () => {
  expect(normalizeHomeChatThreadId("dm:user-b:user-a")).toBe("dm:user-a:user-b");
  expect(createHomeChatDirectThreadId("user-b", "user-a")).toBe("dm:user-a:user-b");
  expect(normalizeHomeChatThreadId("dm:user-a:user-a")).toBe(homeChatTeamThreadId);
  expect(normalizeHomeChatThreadId("not-a-dm")).toBe(homeChatTeamThreadId);
});

test("Home Chat legacy read adapter uses the protected storage key and blocks writes", async () => {
  const reads = [];
  const adapter = createHomeChatLegacyReadAdapter(
    {
      read: async (key) => {
        reads.push(key);
        return JSON.stringify([
          {
            id: "team-unread",
            userId: "analyst-1",
            threadId: "team",
            text: "Staff room note",
            readBy: ["analyst-1"],
            createdAt: now,
          },
        ]);
      },
    },
    { currentUserId: "coach-1", users, now, idFactory }
  );

  await expect(adapter.readAllMessages()).resolves.toHaveLength(1);
  await expect(adapter.readThreadMessages("team")).resolves.toHaveLength(1);
  await expect(adapter.readThreadListForUser(users[0])).resolves.toEqual(
    expect.arrayContaining([expect.objectContaining({ threadId: "team", unreadCount: 1 })])
  );
  await expect(adapter.readUnreadCountForUser("coach-1")).resolves.toBe(1);
  await expect(adapter.writeMessage({ text: "Nope" })).rejects.toThrow("read-only");
  await expect(adapter.markThreadRead("team")).rejects.toThrow("read-only");
  await expect(adapter.removeMessage("team-unread")).rejects.toThrow("read-only");
  expect(reads).toEqual([homeChatStorageKey, homeChatStorageKey, homeChatStorageKey, homeChatStorageKey]);
});

test("Home Chat adapter treats invalid legacy payloads as empty instead of destructive", () => {
  expect(normalizeHomeChatMessages("{not-json}", { currentUserId: "coach-1", users, now, idFactory })).toEqual([]);
  expect(normalizeHomeChatMessages({ unexpected: true }, { currentUserId: "coach-1", users, now, idFactory })).toEqual([]);
});
