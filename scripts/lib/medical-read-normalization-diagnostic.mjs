import { createMedicalRuntimeService } from '../../src/modules/medical/medical-runtime-service.mjs';
import * as options from '../../src/modules/medical/medical-options.mjs';
import { formatScheduleDateValue, parseScheduleDateValue } from '../../src/modules/schedule/schedule-state.mjs';

// In-memory read only. No fetch, storage, source mutation or clinical values in the result.
export function diagnoseMedicalReadNormalization(medical = {}, squad = {}, targetIds = [], date = '') {
  const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')
    && formatScheduleDateValue(parseScheduleDateValue(value)) === value;
  const runtime = createMedicalRuntimeService({
    ...options, getPlayerProfilesState: () => squad,
    isMedicalDateValue: isDate, formatDateValue: formatScheduleDateValue,
    parseDateValue: parseScheduleDateValue, canEditMedicalTeam: () => true,
    getCurrentPlatformUser: () => ({ id: 'diagnostic-only' }),
    getScheduleEventsForDate: () => [],
  });
  // Inspect normalization independently of lazy initialization order.
  const helpers = runtime.helpers;
  void runtime.facade;
  const collections = {};
  for (const [field, normalizer] of [['players', 'normalizeMedicalPlayer'], ['records', 'normalizeMedicalRecord'], ['injuryPlans', 'normalizeMedicalInjuryPlan']]) {
    const rows = Array.isArray(medical[field]) ? medical[field] : [];
    let accepted = 0, rejected = 0, errors = 0;
    for (const row of rows) {
      try { if (helpers[normalizer](row)) accepted++; else rejected++; }
      catch { errors++; }
    }
    collections[field] = { total: rows.length, accepted, rejected, errors };
  }
  try {
    const state = runtime.stateService.cloneMedicalState(medical);
    return { ok: true, collections, normalizedPlayers: state.players.length,
      normalizedRecords: state.records.length,
      activeTargetRecords: state.records.filter(row => targetIds.includes(row.playerId)
        && row.date === date && !row.archivedAt && !row.deletedAt).length };
  } catch (error) {
    return { ok: false, collections, errorType: ['TypeError', 'ReferenceError', 'RangeError'].includes(error?.name) ? error.name : 'Error' };
  }
}
