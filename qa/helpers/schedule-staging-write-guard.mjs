import { isDeepStrictEqual } from "node:util";
import { mergeScheduleStatePreservingLocalUi, scheduleStorageKey } from "../../src/modules/schedule/schedule-state.mjs";

const ownedTitle = /^QA Live \d+-[a-f0-9-]+$/;
const ownedDate = /^\d{4}-\d{2}-\d{2}$/;
const eventFields = ["id", "date", "time", "type", "title", "note"];
const writeFields = ["key", "value", "removed", "baseRevision", "baseHash", "baseUpdatedAt", "metadata"];

function rejectWrite() {
  throw new Error("Schedule QA write is outside the run-owned event or current central revision.");
}

export function createScheduleStagingWriteGuard() {
  let record, ownedEvent;
  return {
    arm({ title, date }) {
      if (record || !ownedTitle.test(title) || !ownedDate.test(date)) rejectWrite();
      record = { title, date };
    },
    prepare(body, current, operation) {
      if (!record || !body || body.key !== scheduleStorageKey || body.removed !== false ||
          body.baseRevision !== current.revision || body.metadata?.baseRevision !== current.revision ||
          Object.keys(body).some(key => !writeFields.includes(key)) || typeof body.value !== "string") rejectWrite();
      let incoming;
      try { incoming = JSON.parse(body.value); } catch { rejectWrite(); }
      if (!Array.isArray(incoming?.events) || !Array.isArray(current.state?.events)) rejectWrite();

      const matches = event => event?.title === record.title && event?.date === record.date;
      const incomingOwn = incoming.events.filter(matches);
      const currentOwn = current.state.events.filter(matches);
      let events, candidate;
      if (operation === "create") {
        const event = incomingOwn[0];
        if (currentOwn.length || incomingOwn.length !== 1 || !/^event-\d+-[a-z0-9]{1,6}$/.test(event?.id || "") ||
            event.time !== "" || event.note !== "" || event.type !== "training" ||
            Object.keys(event).some(key => !eventFields.includes(key)) ||
            current.state.events.some(row => row.id === event.id || row.date === record.date) ||
            (ownedEvent && !isDeepStrictEqual(ownedEvent, event))) rejectWrite();
        candidate = event;
        events = [...current.state.events, event];
      } else if (operation === "cleanup") {
        if (!ownedEvent || currentOwn.length !== 1 || incomingOwn.length ||
            !isDeepStrictEqual(currentOwn[0], ownedEvent)) rejectWrite();
        events = current.state.events.filter(event => event.id !== ownedEvent.id);
      } else {
        rejectWrite();
      }

      const original = { ...current.state, events };
      // The probe navigates its own calendar. Keep the stored view and prove
      // the browser changed only its local view fields and the synthetic event.
      const fixedView = JSON.parse(mergeScheduleStatePreservingLocalUi(
        JSON.stringify(current.state), JSON.stringify(incoming)
      ));
      if (!isDeepStrictEqual(fixedView, original)) rejectWrite();
      if (candidate) ownedEvent = structuredClone(candidate);
      return { ...body, value: JSON.stringify(original) };
    },
  };
}
