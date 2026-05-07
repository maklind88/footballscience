export function createPlatformEventBus() {
  const listeners = new Map();

  function getListeners(eventName) {
    const key = String(eventName || "").trim();
    if (!listeners.has(key)) {
      listeners.set(key, new Set());
    }
    return listeners.get(key);
  }

  return Object.freeze({
    on(eventName, listener) {
      if (typeof listener !== "function") {
        throw new TypeError("Platform event listener must be a function.");
      }
      const eventListeners = getListeners(eventName);
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    emit(eventName, payload = {}) {
      const eventListeners = [...getListeners(eventName)];
      for (const listener of eventListeners) {
        listener(Object.freeze({ eventName, payload }));
      }
      return eventListeners.length;
    },
    listenerCount(eventName) {
      return getListeners(eventName).size;
    },
    clear() {
      listeners.clear();
    },
  });
}

