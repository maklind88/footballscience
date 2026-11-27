// Explicit synthetic UI harness, not a native persistence or provider-auth claim.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
if (!process.argv.includes("--synthetic-ui-only")) throw new Error("Synthetic UI opt-in required.");
const allowed = new Set(["conflict-panel.mjs", "conflict-controller.mjs", "conflict-panel.css", "desktop-bridge-contract.mjs", "conflict-contract.mjs", "tauri-invoke.mjs"]);
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/conflict-panel.css"><title>Synthetic desktop conflict UI</title><body><h1>Synthetic desktop conflict UI verification</h1><p>No native database or external service is connected.</p><script type="module" src="/fixture.mjs"></script></body></html>`;
const fixture = `import { mountConflictPanel } from '/conflict-panel.mjs';
import { createDesktopBridge } from '/desktop-bridge-contract.mjs';
const review = await (await fetch('/review.json')).json();
const bridge = createDesktopBridge({ isDesktop: true, native: {
 runtimeInfo: async () => ({}),
 sessionAuthority: async () => ({state:'online',syntheticIdentity:true,actorId:'actor',organizationId:'organization',tenantId:'tenant',teamId:'team',partitionKey:review.partitionKey,authEpoch:2,offlineLeaseExpiresAtUnixMs:Date.now()+300000,canReadOffline:true,canSync:true}),
 bootstrapStatus: async () => ({activeBuildId:'synthetic-review-test'}),
 sessionConflict: async (context, token) => token ? {schema:'fs-desktop-conflict-recovered-v1',partitionKey:review.partitionKey,recoveryId:'00000000-0000-4000-8000-000000009901',requeuedOperationCount:1,uploaded:false} : review
}});
mountConflictPanel(bridge);`;
createServer(async (req, res) => {
  try {
    const name = new URL(req.url, "http://127.0.0.1").pathname.slice(1);
    const content = name === "" ? page : name === "fixture.mjs" ? fixture : name === "review.json"
      ? await readFile(new URL("../tests/fixtures/conflict-review.json", import.meta.url))
      : allowed.has(name) ? await readFile(new URL(`../candidates/shared/${name}`, import.meta.url)) : null;
    if (!content) { res.writeHead(404).end(); return; }
    res.setHeader("Content-Type", name.endsWith(".mjs") ? "text/javascript" : name.endsWith(".css") ? "text/css" : name.endsWith(".json") ? "application/json" : "text/html");
    res.setHeader("Cache-Control", "no-store");
    res.end(content);
  } catch { res.writeHead(500).end(); }
}).listen(47890, "127.0.0.1", () => console.log("Synthetic-only UI: http://127.0.0.1:47890/"));
