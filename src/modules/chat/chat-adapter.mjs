import { createReadOnlyStorageAdapter, storageAdapterKinds } from "../../core/storage-adapters.mjs";
import {
  getHomeChatUnreadCountForUser,
  homeChatStorageKey,
  normalizeHomeChatMessages,
  selectHomeChatThreadList,
  selectHomeChatThreadMessages,
} from "./chat.mjs";

function assertReadableAdapter(storageAdapter) {
  if (!storageAdapter || typeof storageAdapter.read !== "function") {
    throw new TypeError("Chat adapter requires a readable storage adapter.");
  }
}

function resolveCurrentUser(currentUserOrId, options = {}, defaultOptions = {}) {
  if (currentUserOrId && typeof currentUserOrId === "object") {
    return currentUserOrId;
  }

  const id = String(currentUserOrId || options.currentUserId || defaultOptions.currentUserId || "").trim();
  if (!id) {
    return options.currentUser || defaultOptions.currentUser || null;
  }

  const users = options.users || defaultOptions.users || [];
  return users.find((user) => user.id === id) || { id, status: "active" };
}

export function createHomeChatReadAdapter(storageAdapter, defaultOptions = {}) {
  assertReadableAdapter(storageAdapter);

  return Object.freeze({
    storageKey: homeChatStorageKey,
    kind: storageAdapter.kind || storageAdapterKinds.legacyAppState,
    async readAllMessages(options = {}) {
      const rawValue = await storageAdapter.read(homeChatStorageKey);
      return normalizeHomeChatMessages(rawValue, { ...defaultOptions, ...options });
    },
    async readThreadMessages(threadId, options = {}) {
      const messages = await this.readAllMessages(options);
      return selectHomeChatThreadMessages(messages, threadId);
    },
    async readThreadListForUser(currentUserOrId, options = {}) {
      const currentUser = resolveCurrentUser(currentUserOrId, options, defaultOptions);
      const users = options.users || defaultOptions.users || [];
      const messages = await this.readAllMessages({
        ...options,
        currentUserId: currentUser?.id || options.currentUserId || defaultOptions.currentUserId,
        users,
      });
      return selectHomeChatThreadList({ currentUser, users, messages });
    },
    async readUnreadCountForUser(currentUserOrId, options = {}) {
      const currentUser = resolveCurrentUser(currentUserOrId, options, defaultOptions);
      const users = options.users || defaultOptions.users || [];
      const messages = await this.readAllMessages({
        ...options,
        currentUserId: currentUser?.id || options.currentUserId || defaultOptions.currentUserId,
        users,
      });
      return getHomeChatUnreadCountForUser(currentUser, messages, users);
    },
    async writeMessage() {
      throw new Error("Chat adapter is read-only until migration is explicitly enabled.");
    },
    async markThreadRead() {
      throw new Error("Chat adapter is read-only until migration is explicitly enabled.");
    },
    async removeMessage() {
      throw new Error("Chat adapter is read-only until migration is explicitly enabled.");
    },
  });
}

export const createChatReadAdapter = createHomeChatReadAdapter;
export const createChatLegacyReadAdapter = createHomeChatLegacyReadAdapter;

export function createHomeChatLegacyReadAdapter({ read }, options = {}) {
  return createHomeChatReadAdapter(
    createReadOnlyStorageAdapter({
      kind: storageAdapterKinds.legacyAppState,
      read,
    }),
    options
  );
}
