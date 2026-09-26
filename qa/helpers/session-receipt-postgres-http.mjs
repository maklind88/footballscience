// A local-only PostgREST boundary for exercising the real API and real SQL
// together. Auth/Storage are synthetic; there is no fallback to network fetch.
export function receiptPostgresHttp(db) {
  const objects = new Map();
  const user = { id: "receipt-coach", email: "receipt@example.invalid", user_metadata: { firstName: "QA", lastName: "Coach" },
    app_metadata: { role: "coach", status: "active" } };
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;
  let loseRpc = false;
  let rpcCalls = 0;
  const query = async (sql) => JSON.parse(await db.pg.sql(db.source, `set role service_role; ${sql}; reset role;`));
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
  return {
    user, objects,
    loseNextRpcReply() { loseRpc = true; },
    rpcCalls: () => rpcCalls,
    async fetch(url, options = {}) {
      const parsed = new URL(url), method = options.method || "GET";
      if (parsed.hostname !== "example.supabase.co") throw new Error("External network is forbidden in this test");
      if (parsed.pathname === "/auth/v1/user") return response(user);
      if (parsed.pathname === "/storage/v1/bucket/footballscience-app-state") return response({ id: "footballscience-app-state" });
      const storagePrefix = "/storage/v1/object/footballscience-app-state/";
      if (parsed.pathname.startsWith(storagePrefix)) {
        const path = decodeURIComponent(parsed.pathname.slice(storagePrefix.length));
        if (method === "GET") return response(objects.get(path) || {}, objects.has(path) ? 200 : 404);
        if (["PUT", "POST"].includes(method)) { objects.set(path, JSON.parse(options.body)); return response({ Key: path }); }
      }
      if (parsed.pathname === "/storage/v1/object/footballscience-app-state" && method === "DELETE") {
        for (const path of JSON.parse(options.body).prefixes) objects.delete(path);
        return response({});
      }
      const table = parsed.pathname.replace("/rest/v1/", "");
      if (parsed.pathname === "/rest/v1/rpc/snapshot_session_saves" && method === "POST") {
        const body = JSON.parse(options.body);
        return response(await query(`select public.snapshot_session_saves(${quote(body.p_organization_id)})`));
      }
      if (method === "GET" && ["platform_app_state_records", "session_save_receipts", "session_save_effects"].includes(table)) {
        const filters = [];
        for (const column of ["organization_id", "state_key", "actor_id", "operation_id"]) {
          const value = parsed.searchParams.get(column);
          if (!value) continue;
          if (!value.startsWith("eq.")) throw new Error("Unsupported local filter");
          filters.push(`${column} = ${quote(value.slice(3))}`);
        }
        const order = table === "session_save_effects" ? "order by created_at desc" : "";
        const limit = Number(parsed.searchParams.get("limit") || 200);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error("Invalid local limit");
        return response(await query(`select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from
          (select * from public.${table} ${filters.length ? `where ${filters.join(" and ")}` : ""} ${order} limit ${limit}) r`));
      }
      if (parsed.pathname === "/rest/v1/rpc/commit_session_save" && method === "POST") {
        rpcCalls++;
        const b = JSON.parse(options.body);
        const result = await query(`select public.commit_session_save(${json(b.p_entry)}, ${Number(b.p_base_revision)},
          ${quote(b.p_operation_id)}, ${quote(b.p_operation_hash)}, ${quote(b.p_session_date)}::date,
          ${quote(b.p_actor_id)}, ${json(b.p_effects)})`);
        if (loseRpc) { loseRpc = false; throw new TypeError("Synthetic RPC reply lost after database commit"); }
        return response(result);
      }
      throw new Error(`Unexpected synthetic request: ${method} ${parsed.pathname}`);
    },
  };
}
