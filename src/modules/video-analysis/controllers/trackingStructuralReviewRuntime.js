import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { trackingPrompt } from "../services/trackingReviewService.js";
import {
  patchTrackingState,
  replacePresentationItem,
  selectedTrackingItem,
} from "./trackingControllerHelpers.js";

function remapGraphics(graphics = [], transaction = {}, direction = "after") {
  if (direction === "before") {
    const migrations = [];
    const mapped = graphics.map((graphic) => ({
      ...graphic,
      bindings: (graphic.bindings || []).map((binding, index) => {
        const trackId = transaction.bindingFallbacks?.[binding.trackId];
        if (!trackId) return binding;
        migrations.push({ graphicId: graphic.id, index, from: binding.trackId, to: trackId });
        return { ...binding, trackId };
      }),
    }));
    transaction.bindingMigrations = migrations;
    return mapped;
  }
  const migrations = transaction.bindingMigrations || [];
  return graphics.map((graphic) => ({
    ...graphic,
    bindings: (graphic.bindings || []).map((binding, index) => {
      const migration = migrations.find((entry) => entry.graphicId === graphic.id && entry.index === index);
      return migration && binding.trackId === migration.to
        ? { ...binding, trackId: migration.from }
        : binding;
    }),
  }));
}

function tracksFromSnapshots(liveTracks = [], snapshots = [], affectedTrackIds = []) {
  const affected = new Set(affectedTrackIds);
  const tracks = liveTracks.filter((track) => !affected.has(track.id));
  [...snapshots].sort((first, second) => first.index - second.index).forEach((snapshot) => {
    tracks.splice(Math.min(snapshot.index, tracks.length), 0, normalizeObjectTrack(snapshot.track));
  });
  return tracks;
}

function operationOutputs(transaction, direction = "after") {
  const target = direction === "before" ? transaction.before : transaction.after;
  const outputs = target.map((snapshot) => ({ logicalId: snapshot.track.id, track: snapshot.track }));
  if (direction === "before") {
    const retained = new Set(target.map((snapshot) => snapshot.track.id));
    transaction.after.filter((snapshot) => !retained.has(snapshot.track.id)).forEach((snapshot) => {
      outputs.push({
        logicalId: snapshot.track.id,
        track: normalizeObjectTrack({ ...snapshot.track, status: "archived" }),
      });
    });
  }
  return outputs;
}

function operationAudits(transaction, direction, initial, createOperationId) {
  if (initial) return transaction.audits;
  const snapshots = direction === "before" ? transaction.before : transaction.after;
  const correctionType = transaction.type === "identity-swap"
    ? "identity-swap"
    : transaction.type === "split" ? (direction === "before" ? "merge" : "split") : "position";
  const reason = direction === "before"
    ? transaction.type === "split" ? "Undid trajectory split" : "Undid identity swap"
    : transaction.type === "split" ? "Redid trajectory split" : "Redid identity swap";
  const operationGroupId = createOperationId(`history-${direction}`);
  return snapshots.map((snapshot, index) => ({
    operationId: `${operationGroupId}:${index + 1}`,
    trackId: snapshot.track.id,
    atMs: transaction.atMs,
    correctionType,
    reason,
    metadata: {
      historyAction: direction === "before" ? "undo" : "redo",
      operationGroupId,
      structuralAction: transaction.type,
    },
  }));
}

export function createTrackingStructuralReviewRuntime(options = {}) {
  function applyState(transaction, direction = "after") {
    options.updateState((state) => {
      const item = selectedTrackingItem(state);
      if (!item || item.id !== transaction.itemId) return state;
      const snapshots = direction === "before" ? transaction.before : transaction.after;
      const objectTracks = tracksFromSnapshots(item.objectTracks || [], snapshots, transaction.affectedTrackIds);
      const selected = direction === "before" ? transaction.selectedBefore : transaction.selectedAfter;
      const available = new Set(objectTracks.map((track) => track.id));
      const selectedTrackIds = selected.filter((trackId) => available.has(trackId));
      const primary = objectTracks.find((track) => track.id === selectedTrackIds[0]) || null;
      const existingPrompt = state.presentation?.tracking?.prompt || {};
      const prompt = primary ? trackingPrompt({
        ...existingPrompt,
        entityType: primary.entityType,
        playerId: primary.playerId,
        playerLabel: primary.playerLabel,
        teamSide: primary.teamSide,
        shirtNumber: primary.shirtNumber,
      }) : existingPrompt;
      const next = replacePresentationItem(state, item.id, {
        objectTracks,
        dynamicGraphics: remapGraphics(item.dynamicGraphics || [], transaction, direction),
      });
      return patchTrackingState(next, {
        selectedTrackIds,
        prompt,
        reviewHistory: options.historyDescriptor(item.id, selectedTrackIds[0] || ""),
        error: "",
      });
    });
  }

  function persist(transaction, direction = "after", initial = false) {
    if (!options.persistTrack && !options.persistCorrection) return;
    const revisions = new Map(transaction.affectedTrackIds.map((trackId) => (
      [trackId, options.bumpRevision(trackId)]
    )));
    const outputs = operationOutputs(transaction, direction);
    const audits = operationAudits(transaction, direction, initial, options.createOperationId);
    const task = async () => {
      const savedByTrackId = new Map();
      const errors = [];
      for (const output of outputs) {
        let savedTrack = output.track;
        try {
          if (options.persistTrack) {
            savedTrack = normalizeObjectTrack(await options.persistTrack(output.track) || output.track);
          }
          savedByTrackId.set(output.logicalId, savedTrack);
          if (savedTrack.status !== "archived"
            && options.getRevision(output.logicalId) === revisions.get(output.logicalId)) {
            options.replaceTrack(transaction.itemId, output.logicalId, savedTrack);
          }
        } catch (error) {
          errors.push(error);
        }
      }
      for (const audit of audits) {
        if (!options.persistCorrection) continue;
        const savedTrack = savedByTrackId.get(audit.trackId)
          || outputs.find((entry) => entry.logicalId === audit.trackId)?.track;
        if (!savedTrack || savedTrack.status === "archived") continue;
        try {
          await options.persistCorrection({
            ...audit,
            objectTrackId: savedTrack.id,
            localWorkspaceTrackKey: savedTrack.metadata?.localWorkspaceTrackKey || "",
            localWorkspaceStatus: savedTrack.metadata?.localWorkspaceStatus || "",
          });
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw errors[0];
    };
    options.enqueuePersistence(task, (error) => {
      const stillCurrent = [...revisions].some(([trackId, revision]) => (
        options.getRevision(trackId) === revision
      ));
      if (stillCurrent) {
        options.setError(`${error?.message || "Structural correction could not be saved."} The correction remains local.`);
      }
    });
  }

  return { applyState, persist };
}
