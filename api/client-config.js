const { readConfig, sendCorsHeaders, sendJson } = require("./_lib/supabase-admin.js");

module.exports = async (_, res) => {
  sendCorsHeaders(res);

  const { url, anonKey, serviceRoleKey } = readConfig();
  if (!url || !anonKey) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, reason: "Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment." }));
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      ok: true,
      url,
      anonKey,
      hasServiceRoleKey: Boolean(serviceRoleKey),
    })
  );
};
