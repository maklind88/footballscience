(function () {
  window.createCentralMedicalStateMerger = function createCentralMedicalStateMerger({
    parseCentralObjectStateValue,
    preserveCentralStateMediaFields,
  }) {
    return function mergeCentralMedicalStateValues(localValue, centralValue) {
      const localState = parseCentralObjectStateValue(localValue);
      const centralStateValue = parseCentralObjectStateValue(centralValue);
      if (!localState || !centralStateValue) return { value: centralValue, changed: false };
      const ts = (item = {}) => Math.max(0, ...["updatedAt", "createdAt", "date", "startDate"].map((field) => Date.parse(String(item?.[field] || ""))).filter(Number.isFinite));
      const keyed = (item = {}, fields = []) => {
        const id = String(item?.id || "").trim();
        const values = fields.map((field) => String(item?.[field] || "").trim());
        return id ? `id:${id}` : values.every(Boolean) ? `fields:${values.join("|")}` : "";
      };
      const mergeEntity = (centralItem = {}, localItem = {}, preserveMedia = false) => {
        const merged = ts(localItem) >= ts(centralItem) ? { ...centralItem, ...localItem } : { ...localItem, ...centralItem };
        return preserveMedia ? preserveCentralStateMediaFields(merged, localItem).record : merged;
      };
      const mergeList = (localItems = [], centralItems = [], fields = [], preserveMedia = false) => {
        const merged = new Map();
        const order = [];
        const append = (item, source) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return;
          const key = keyed(item, fields) || `unkeyed:${source}:${order.length}`;
          if (!merged.has(key)) {
            order.push(key);
            merged.set(key, item);
            return;
          }
          const current = merged.get(key);
          merged.set(key, source === "local" ? mergeEntity(current, item, preserveMedia) : mergeEntity(item, current, preserveMedia));
        };
        centralItems.forEach((item) => append(item, "central"));
        localItems.forEach((item) => append(item, "local"));
        return order.map((key) => merged.get(key)).filter(Boolean);
      };
      const mergePolicy = (localPolicy = {}, centralPolicy = {}) => {
        const local = localPolicy && typeof localPolicy === "object" && !Array.isArray(localPolicy) ? localPolicy : {};
        const central = centralPolicy && typeof centralPolicy === "object" && !Array.isArray(centralPolicy) ? centralPolicy : {};
        return !Object.keys(local).length ? central : !Object.keys(central).length ? local : ts(local) >= ts(central) ? { ...central, ...local } : { ...local, ...central };
      };
      const players = mergeList(Array.isArray(localState.players) ? localState.players : [], Array.isArray(centralStateValue.players) ? centralStateValue.players : [], ["name"], true);
      const playerIds = new Set(players.map((player) => String(player?.id || "").trim()).filter(Boolean));
      const localSelected = String(localState.selectedPlayerId || "").trim();
      const centralSelected = String(centralStateValue.selectedPlayerId || "").trim();
      const selectedPlayerId = playerIds.has(localSelected) ? localState.selectedPlayerId : playerIds.has(centralSelected) ? centralStateValue.selectedPlayerId : players[0]?.id || "";
      const records = mergeList(Array.isArray(localState.records) ? localState.records : [], Array.isArray(centralStateValue.records) ? centralStateValue.records : [], ["playerId", "date", "createdAt"]).sort((first, second) => ts(second) - ts(first));
      const injuryPlans = mergeList(Array.isArray(localState.injuryPlans) ? localState.injuryPlans : [], Array.isArray(centralStateValue.injuryPlans) ? centralStateValue.injuryPlans : [], ["playerId", "startDate", "endDate", "injuryType"]).sort((first, second) => String(second?.startDate || "").localeCompare(String(first?.startDate || "")) || ts(second) - ts(first));
      const mergedValue = JSON.stringify({ ...centralStateValue, selectedDate: localState.selectedDate || centralStateValue.selectedDate, selectedPlayerId, players, records, injuryPlans, policy: mergePolicy(localState.policy, centralStateValue.policy) });
      return { value: mergedValue, changed: mergedValue !== centralValue };
    };
  };
})();
