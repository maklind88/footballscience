import { expect, test } from "@playwright/test";
import { bindScoutingDragAndDrop, resetScoutingDragDropRouterForTests } from "../src/modules/scouting/index.mjs";

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    values,
    add(...tokens) {
      tokens.forEach((token) => values.add(token));
    },
    remove(...tokens) {
      tokens.forEach((token) => values.delete(token));
    },
    has(token) {
      return values.has(token);
    },
  };
}

function createNode(dataset = {}, closestMap = {}) {
  const node = {
    dataset,
    classList: createClassList(),
    closest(selector) {
      return Object.prototype.hasOwnProperty.call(closestMap, selector) ? closestMap[selector] : null;
    },
  };
  closestMap.self = node;
  return node;
}

function createTarget(matches = {}) {
  return {
    closest(selector) {
      return Object.prototype.hasOwnProperty.call(matches, selector) ? matches[selector] : null;
    },
  };
}

function createRoot(nodes = []) {
  const listeners = {};
  return {
    listeners,
    addEventListener(type, listener) {
      listeners[type] ||= [];
      listeners[type].push(listener);
    },
    contains(node) {
      return nodes.includes(node);
    },
    querySelectorAll() {
      return nodes;
    },
  };
}

function createDataTransfer() {
  return {
    data: new Map(),
    dragImage: null,
    dropEffect: "",
    setData(type, value) {
      this.data.set(type, value);
    },
    getData(type) {
      return this.data.get(type) || "";
    },
    setDragImage(node, x, y) {
      this.dragImage = { node, x, y };
    },
  };
}

function createEvent(target, extra = {}) {
  return {
    target,
    dataTransfer: createDataTransfer(),
    prevented: 0,
    stopped: 0,
    preventDefault() {
      this.prevented += 1;
    },
    stopPropagation() {
      this.stopped += 1;
    },
    ...extra,
  };
}

test.beforeEach(() => {
  resetScoutingDragDropRouterForTests();
});

test("Scouting drag/drop router binds delegates once per root", () => {
  const root = createRoot();
  const deps = { canEdit: () => true };

  expect(bindScoutingDragAndDrop(root, deps)).toBe(true);
  const initialListenerCount = Object.values(root.listeners).flat().length;
  expect(initialListenerCount).toBeGreaterThan(0);

  expect(bindScoutingDragAndDrop(root, deps)).toBe(false);
  expect(Object.values(root.listeners).flat()).toHaveLength(initialListenerCount);
});

test("Scouting drag/drop router routes My Team player drops into target slots", () => {
  const playerNode = createNode({ scoutingDragMyTeamPlayer: "player-1" });
  const slotNode = createNode({ scoutingMyTeamDropSlot: "cf" });
  const beforeNode = createNode({ scoutingMyTeamDropBefore: "player-2" });
  const root = createRoot([playerNode, slotNode, beforeNode]);
  const assignments = [];
  bindScoutingDragAndDrop(root, {
    assignMyTeamPlayerToSlot: (...args) => assignments.push(args),
    canEdit: () => true,
  });

  const dragStartEvent = createEvent(createTarget({ "[data-scouting-drag-my-team-player]": playerNode }));
  root.listeners.dragstart[0](dragStartEvent);
  expect(JSON.parse(dragStartEvent.dataTransfer.getData("text/plain"))).toEqual({ type: "my-team", playerId: "player-1" });
  expect(playerNode.classList.has("is-dragging")).toBe(true);

  const dropEvent = createEvent(
    createTarget({
      "[data-scouting-my-team-drop-slot]": slotNode,
      "[data-scouting-my-team-drop-before]": beforeNode,
    })
  );
  root.listeners.drop[0](dropEvent);

  expect(dropEvent.prevented).toBe(1);
  expect(assignments).toEqual([["player-1", "cf", "player-2"]]);
});

test("Scouting drag/drop router saves moved pitch slot positions", () => {
  const pitchNode = {
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 100 }),
  };
  const slotNode = createNode();
  const handleNode = createNode(
    { scoutingDragMyTeamSlot: "rb" },
    {
      "[data-scouting-drag-my-team-slot]": null,
      ".scouting-shadow-slot": slotNode,
      ".scouting-shadow-pitch": pitchNode,
    }
  );
  handleNode.closest = (selector) => {
    if (selector === "[data-scouting-drag-my-team-slot]") {
      return handleNode;
    }
    if (selector === ".scouting-shadow-slot") {
      return slotNode;
    }
    if (selector === ".scouting-shadow-pitch") {
      return pitchNode;
    }
    return null;
  };
  handleNode.setPointerCapture = () => {};
  handleNode.releasePointerCapture = () => {};
  const root = createRoot([handleNode, slotNode, pitchNode]);
  const savedPositions = [];
  const previews = [];
  bindScoutingDragAndDrop(root, {
    canEdit: () => true,
    getPointerPitchPosition: (event) => ({ x: event.clientX, y: event.clientY }),
    previewSlotPitchPosition: (node, position) => previews.push([node, position]),
    setMyTeamSlotPitchPosition: (...args) => savedPositions.push(args),
  });

  root.listeners.pointerdown[0](createEvent(handleNode, { pointerId: 7, clientX: 11, clientY: 22 }));
  root.listeners.pointermove[0](createEvent(handleNode, { pointerId: 7, clientX: 33, clientY: 44 }));
  root.listeners.pointerup[0](createEvent(handleNode, { pointerId: 7, clientX: 33, clientY: 44 }));

  expect(previews).toHaveLength(2);
  expect(savedPositions).toEqual([["rb", 33, 44]]);
  expect(slotNode.classList.has("is-position-dragging")).toBe(false);
});
