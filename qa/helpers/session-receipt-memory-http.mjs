// Synthetic PostgREST for API contracts; real transaction proof is in native tests.
export function sessionReceiptMemoryHttp(storage, key) {
  let entry = structuredClone(storage.objects.get(`global/${key}.json`));
  const receipts = new Map(), effects = new Map();
  const response = (body) => new Response(JSON.stringify(body), { status: 200 });
  const row = () => ({ organization_id: entry.organizationId || "global", state_key: entry.key,
    module_id: entry.moduleId, merge_policy: entry.mergePolicy, revision: entry.revision, value: entry.value,
    removed: Boolean(entry.removed), updated_by: entry.updatedBy, updated_at: entry.updatedAt,
    value_hash: entry.hash, metadata: entry.metadata || {} });
  return async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/rest/v1/platform_app_state_records") {
      const filter = parsed.searchParams.get("state_key");
      return response(!filter || filter.includes(key) ? [row()] : []);
    }
    if (parsed.pathname === "/rest/v1/session_save_receipts") {
      const receipt = receipts.get(parsed.searchParams.get("operation_id")?.slice(3));
      return response(receipt ? [receipt] : []);
    }
    if (parsed.pathname === "/rest/v1/session_save_effects") return response([...effects.values()]);
    if (parsed.pathname === "/rest/v1/rpc/commit_session_save") {
      const body = JSON.parse(options.body), receipt = receipts.get(body.p_operation_id);
      if (receipt) return response({ status: receipt.operation_hash === body.p_operation_hash ? "duplicate" : "identity-mismatch", entry: row(), acceptedRevision: receipt.accepted_revision });
      if (body.p_base_revision !== entry.revision) return response({ status: "conflict", currentRevision: entry.revision });
      entry = structuredClone(body.p_entry);
      receipts.set(body.p_operation_id, { operation_hash: body.p_operation_hash, session_date: body.p_session_date, accepted_revision: entry.revision });
      effects.set(body.p_operation_id, { payload: body.p_effects, created_at: new Date().toISOString() });
      return response({ status: "committed", entry: row(), acceptedRevision: entry.revision });
    }
    return storage.fetchMock(url, options);
  };
}
