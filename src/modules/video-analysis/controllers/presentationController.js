import { normalizeClipInstance } from "../domain/clipInstance.model.js";
import {
  buildPresentationPayload,
  buildSmartCollectionPayload,
  createDefaultPresentation,
  defaultShareTargets,
  duplicateSmartCollection,
  normalizePresentation,
  normalizeSmartCollection,
  presentationQueue,
  smartCollectionTitle,
  toggleSmartCollectionPinned,
} from "../services/presentationService.js";
import {
  findSmartCollection,
  shareTargetFromDraft,
  smartCollectionDraftFromCollection,
  sortSmartCollections,
} from "../services/presentationSmartCollectionService.js";

export function createPresentationController(options = {}) {
  const ensureRuntime = options.ensureRuntime || (() => null);
  const getRuntime = options.getRuntime || (() => null);
  const shouldLoadMetadata = options.shouldLoadMetadata || (() => true);
  const optionalRuntime = () => getRuntime();
  const runtimeFor = (context = {}) => ensureRuntime(context);

  async function loadPresentations(options = {}) {
    const run = optionalRuntime();
    if (!run) return;
    if (!shouldLoadMetadata(run.context, run.store.getState())) return;
    try {
      const payload = await run.presentations.list(40);
      run.store.update((current) => ({
        ...current,
        presentation: {
          ...(current.presentation || {}),
          status: "ready",
          presentations: payload.presentations || [],
          smartCollections: sortSmartCollections(payload.smartCollections || []),
          error: "",
        },
      }));
      if (!options.skipSources) await loadPresentationSources(null, { silent: true });
    } catch (error) {
      run.store.update((current) => ({
        ...current,
        presentation: {
          ...(current.presentation || {}),
          status: "error",
          error: error.message || "Could not load presentations.",
        },
      }));
    }
  }

  async function loadPresentation(id = "") {
    const run = optionalRuntime();
    if (!run || !id) return false;
    try {
      run.store.update((current) => ({
        ...current,
        presentation: { ...(current.presentation || {}), status: "loading", error: "" },
      }));
      const payload = await run.presentations.get(id);
      const presentation = normalizePresentation(payload.presentation || {});
      const queue = presentationQueue(presentation);
      run.store.update((current) => ({
        ...current,
        presentation: {
          ...(current.presentation || {}),
          status: "ready",
          activePresentationId: presentation.id,
          activeSectionId: presentation.sections[0]?.id || "",
          selectedItemId: queue[0]?.id || "",
          selectedClipId: queue[0]?.clipId || "",
          current: presentation,
          smartCollections: sortSmartCollections(payload.presentation?.smartCollections || current.presentation?.smartCollections || []),
          error: "",
        },
      }));
      return true;
    } catch (error) {
      run.store.update((current) => ({
        ...current,
        presentation: { ...(current.presentation || {}), status: "error", error: error.message || "Could not load presentation." },
      }));
      return false;
    }
  }

  async function loadPresentationSources(nextFilters = null, options = {}) {
    const run = optionalRuntime();
    if (!run) return;
    const state = run.store.getState();
    if (!shouldLoadMetadata(run.context, state)) return;
    const currentFilters = state.presentation?.sourceFilters || {};
    const incomingFilters = nextFilters || currentFilters;
    const limit = Math.max(20, Math.min(200, Number(incomingFilters.limit || currentFilters.limit || 80)));
    const offset = options.append ? Number(state.presentation?.sourceOffset || 0) : 0;
    const filters = { ...incomingFilters, limit, offset };
    const searchParts = [filters.search, filters.tag].map((value) => String(value || "").trim()).filter(Boolean);
    run.store.update((current) => ({
      ...current,
      presentation: {
        ...(current.presentation || {}),
        status: options.silent ? current.presentation?.status || "ready" : "loading-sources",
        sourceFilters: filters,
        error: "",
      },
    }));
    try {
      const payload = await run.presentations.listClips({
        search: searchParts.join(" "),
        phase: filters.phase,
        outcome: filters.outcome,
        playerId: filters.playerId,
        date: filters.date,
        type: filters.type,
        limit,
        offset,
      });
      const clips = (payload.clips || []).map(normalizeClipInstance);
      const pageSize = Math.max(0, Number(payload.pageSize ?? clips.length));
      run.store.update((current) => ({
        ...current,
        presentation: {
          ...(current.presentation || {}),
          status: "ready",
          sourceClips: options.append ? [...(current.presentation?.sourceClips || []), ...clips] : clips,
          sourceTotal: options.append ? (current.presentation?.sourceClips || []).length + clips.length : clips.length,
          sourceOffset: offset + pageSize,
          sourceHasMore: pageSize >= limit,
          sourceFilters: filters,
          error: "",
        },
      }));
    } catch (error) {
      run.store.update((current) => ({
        ...current,
        presentation: { ...(current.presentation || {}), status: "error", error: error.message || "Could not load presentation clips." },
      }));
    }
  }

  async function saveCurrentPresentation(context = {}) {
    const run = runtimeFor(context);
    const state = run.store.getState();
    const currentPresentation = state.presentation?.current || createDefaultPresentation();
    try {
      run.store.update((current) => ({
        ...current,
        presentation: { ...(current.presentation || {}), status: "saving", error: "" },
      }));
      const payload = await run.presentations.save(buildPresentationPayload(currentPresentation));
      const presentation = normalizePresentation(payload.presentation || currentPresentation);
      run.store.update((current) => ({
        ...current,
        message: "Presentation saved.",
        presentation: {
          ...(current.presentation || {}),
          status: "ready",
          activePresentationId: presentation.id,
          current: presentation,
          presentations: [
            presentation,
            ...(current.presentation?.presentations || []).filter((item) => item.id !== presentation.id),
          ],
          error: "",
        },
      }));
      return true;
    } catch (error) {
      run.store.update((current) => ({
        ...current,
        presentation: { ...(current.presentation || {}), status: "error", error: error.message || "Could not save presentation." },
      }));
      return false;
    }
  }

  async function saveCurrentSmartCollection(context = {}) {
    const run = runtimeFor(context);
    const state = run.store.getState();
    const filters = state.presentation?.sourceFilters || {};
    const draft = state.presentation?.smartCollectionDraft || {};
    try {
      const payload = await run.presentations.saveSmartCollection(buildSmartCollectionPayload({
        ...draft,
        title: draft.title || smartCollectionTitle(filters),
        description: draft.description || "Live playlist generated from Data Explorer filters.",
        sortMode: draft.sortMode || "newest",
        metadata: {
          ...(draft.metadata || {}),
          kind: "live-playlist",
          source: "presentation-data-explorer",
          pinned: Boolean(draft.pinned),
        },
        shareTargets: Array.isArray(draft.shareTargets) ? draft.shareTargets : defaultShareTargets(draft.visibility || "coach-analyst"),
      }, filters, state.presentation?.current?.id || ""));
      const savedCollection = normalizeSmartCollection(payload.smartCollection || {});
      run.store.update((current) => ({
        ...current,
        message: "Smart collection saved.",
        presentation: {
          ...(current.presentation || {}),
          activeSmartCollectionId: savedCollection.id || current.presentation?.activeSmartCollectionId || "",
          sharePanelTargetId: current.presentation?.sharePanelTargetId || "",
          smartCollectionDraft: {
            ...smartCollectionDraftFromCollection(savedCollection),
            title: "",
            description: "",
          },
          smartCollections: sortSmartCollections([
            savedCollection,
            ...(current.presentation?.smartCollections || []).filter((item) => item.id !== payload.smartCollection?.id),
          ].filter(Boolean)),
          error: "",
        },
      }));
      return true;
    } catch (error) {
      run.store.update((current) => ({
        ...current,
        presentation: { ...(current.presentation || {}), status: "error", error: error.message || "Could not save smart collection." },
      }));
      return false;
    }
  }

  async function saveSmartCollectionObject(collection = {}, context = {}) {
    const run = runtimeFor(context);
    const state = run.store.getState();
    const payload = await run.presentations.saveSmartCollection(buildSmartCollectionPayload(
      normalizeSmartCollection(collection),
      collection.searchJson || collection.search_json || state.presentation?.sourceFilters || {},
      state.presentation?.current?.id || ""
    ));
    const savedCollection = normalizeSmartCollection(payload.smartCollection || {});
    run.store.update((current) => ({
      ...current,
      message: "Smart collection updated.",
      presentation: {
        ...(current.presentation || {}),
        activeSmartCollectionId: savedCollection.id || current.presentation?.activeSmartCollectionId || "",
        smartCollections: sortSmartCollections([
          savedCollection,
          ...(current.presentation?.smartCollections || []).filter((item) => item.id !== savedCollection.id),
        ]),
        error: "",
      },
    }));
    return savedCollection;
  }

  async function applySmartCollection(collectionId = "") {
    const run = optionalRuntime();
    if (!run) return false;
    const state = run.store.getState();
    const collection = findSmartCollection(state, collectionId);
    const filters = collection?.searchJson || {};
    run.store.update((current) => ({
      ...current,
      presentation: {
        ...(current.presentation || {}),
        activeSmartCollectionId: collection?.id || current.presentation?.activeSmartCollectionId || "",
        smartCollectionDraft: collection ? smartCollectionDraftFromCollection(collection) : current.presentation?.smartCollectionDraft,
      },
    }));
    await loadPresentationSources({ ...(state.presentation?.sourceFilters || {}), ...filters });
    return true;
  }

  async function pinSmartCollection(collectionId = "", context = {}) {
    const run = runtimeFor(context);
    const collection = findSmartCollection(run.store.getState(), collectionId);
    if (!collection) return false;
    try {
      await saveSmartCollectionObject(toggleSmartCollectionPinned(collection), context);
      return true;
    } catch (error) {
      run.store.update((state) => ({
        ...state,
        presentation: { ...(state.presentation || {}), error: error.message || "Could not pin smart collection." },
      }));
      return false;
    }
  }

  async function duplicateSmartCollectionById(collectionId = "", context = {}) {
    const run = runtimeFor(context);
    const collection = findSmartCollection(run.store.getState(), collectionId);
    if (!collection) return false;
    try {
      await saveSmartCollectionObject(duplicateSmartCollection(collection), context);
      return true;
    } catch (error) {
      run.store.update((state) => ({
        ...state,
        presentation: { ...(state.presentation || {}), error: error.message || "Could not duplicate smart collection." },
      }));
      return false;
    }
  }

  function openSmartCollectionShare(collectionId = "", context = {}) {
    const run = runtimeFor(context);
    run.store.update((state) => {
      const collection = findSmartCollection(state, collectionId);
      if (!collection) return state;
      return {
        ...state,
        presentation: {
          ...(state.presentation || {}),
          activeSmartCollectionId: collection.id,
          sharePanelTargetId: state.presentation?.sharePanelTargetId === collection.id ? "" : collection.id,
          smartCollectionDraft: smartCollectionDraftFromCollection(collection),
        },
      };
    });
    return true;
  }

  function addSmartCollectionShareTarget(collectionId = "", context = {}) {
    const run = runtimeFor(context);
    run.store.update((state) => {
      const collection = findSmartCollection(state, collectionId);
      if (!collection) return state;
      const draft = state.presentation?.smartCollectionDraft || {};
      const { target, error } = shareTargetFromDraft(draft);
      if (error) return { ...state, presentation: { ...(state.presentation || {}), error } };
      if (!target) return state;
      const shareTargets = [
        ...(collection.shareTargets || []).filter((item) => !(item.targetType === target.targetType && item.targetId === target.targetId)),
        target,
      ];
      return {
        ...state,
        presentation: {
          ...(state.presentation || {}),
          smartCollectionDraft: { ...draft, targetId: "", shareTargets },
          smartCollections: sortSmartCollections((state.presentation?.smartCollections || []).map((item) => (
            item.id === collection.id ? { ...collection, shareTargets } : item
          ))),
          error: "",
        },
      };
    });
    return true;
  }

  function removeSmartCollectionShareTarget(payload = "", context = {}) {
    const run = runtimeFor(context);
    const [collectionId, targetType, targetId] = String(payload || "").split(":");
    run.store.update((state) => {
      const collection = findSmartCollection(state, collectionId);
      if (!collection) return state;
      const shareTargets = (collection.shareTargets || []).filter((target) => (
        !(target.targetType === targetType && target.targetId === targetId)
      ));
      return {
        ...state,
        presentation: {
          ...(state.presentation || {}),
          smartCollectionDraft: { ...(state.presentation?.smartCollectionDraft || {}), shareTargets },
          smartCollections: sortSmartCollections((state.presentation?.smartCollections || []).map((item) => (
            item.id === collection.id ? { ...collection, shareTargets } : item
          ))),
        },
      };
    });
    return true;
  }

  async function saveSmartCollectionSharing(collectionId = "", context = {}) {
    const run = runtimeFor(context);
    const collection = findSmartCollection(run.store.getState(), collectionId);
    if (!collection?.id) return false;
    try {
      const payload = await run.presentations.saveSmartCollectionShareTargets(collection.id, collection.shareTargets || []);
      const shareTargets = payload.shareTargets || collection.shareTargets || [];
      run.store.update((state) => ({
        ...state,
        message: "Smart collection sharing saved.",
        presentation: {
          ...(state.presentation || {}),
          smartCollections: sortSmartCollections((state.presentation?.smartCollections || []).map((item) => (
            item.id === collection.id ? { ...collection, shareTargets } : item
          ))),
          error: "",
        },
      }));
      return true;
    } catch (error) {
      run.store.update((state) => ({
        ...state,
        presentation: { ...(state.presentation || {}), error: error.message || "Could not save sharing." },
      }));
      return false;
    }
  }

  function addPresentationShareTarget(context = {}) {
    const run = runtimeFor(context);
    run.store.update((state) => {
      const draft = state.presentation?.presentationShareDraft || {};
      const { target, error } = shareTargetFromDraft(draft, "Choose an access target first.");
      if (error) return { ...state, presentation: { ...(state.presentation || {}), error } };
      if (!target) return state;
      const current = state.presentation?.current || createDefaultPresentation();
      const shareTargets = [
        ...(current.shareTargets || []).filter((item) => !(item.targetType === target.targetType && item.targetId === target.targetId)),
        target,
      ];
      return {
        ...state,
        presentation: {
          ...(state.presentation || {}),
          presentationShareDraft: { ...draft, targetId: "" },
          current: { ...current, shareTargets },
          error: "",
        },
      };
    });
    return true;
  }

  function removePresentationShareTarget(payload = "", context = {}) {
    const run = runtimeFor(context);
    const [targetType, targetId] = String(payload || "").split(":");
    run.store.update((state) => {
      const current = state.presentation?.current || createDefaultPresentation();
      return {
        ...state,
        presentation: {
          ...(state.presentation || {}),
          current: {
            ...current,
            shareTargets: (current.shareTargets || []).filter((target) => (
              !(target.targetType === targetType && target.targetId === targetId)
            )),
          },
        },
      };
    });
    return true;
  }

  async function savePresentationShareTargets(context = {}) {
    const run = runtimeFor(context);
    const state = run.store.getState();
    const presentation = state.presentation?.current || {};
    if (!presentation.id) return saveCurrentPresentation(context);
    try {
      const payload = await run.presentations.saveShareTargets(presentation.id, presentation.shareTargets || []);
      run.store.update((current) => ({
        ...current,
        message: "Presentation access saved.",
        presentation: {
          ...(current.presentation || {}),
          current: {
            ...(current.presentation?.current || {}),
            shareTargets: payload.shareTargets || presentation.shareTargets || [],
          },
          error: "",
        },
      }));
      return true;
    } catch (error) {
      run.store.update((current) => ({
        ...current,
        presentation: { ...(current.presentation || {}), error: error.message || "Could not save presentation access." },
      }));
      return false;
    }
  }

  return {
    applySmartCollection,
    duplicateSmartCollectionById,
    loadPresentation,
    loadPresentations,
    loadPresentationSources,
    openSmartCollectionShare,
    pinSmartCollection,
    saveCurrentPresentation,
    saveCurrentSmartCollection,
    addPresentationShareTarget,
    addSmartCollectionShareTarget,
    removePresentationShareTarget,
    removeSmartCollectionShareTarget,
    savePresentationShareTargets,
    saveSmartCollectionSharing,
  };
}
