(() => {
  const entryPath = "/sessions-offline-shell.html";
  const manifestPath = "/sessions-offline-package.json";
  const desktopLaunchMarker = '<meta name="sessions-offline-desktop-launch" content="supported">';
  const virtualRoot = "/__sessions-offline/";
  const databaseName = "football-science-sessions-offline-code-v1";
  const manifestLimit = 64 * 1024;
  const codeLimit = 8 * 1024 * 1024;
  const retainedCodeLimit = 32 * 1024 * 1024;
  const packageLimit = 8;
  const digestPattern = /^[a-f0-9]{64}$/;
  const types = new Map([
    ["html", "text/html; charset=utf-8"], ["js", "text/javascript; charset=utf-8"],
    ["mjs", "text/javascript; charset=utf-8"], ["css", "text/css; charset=utf-8"],
    ["json", "application/json"], ["png", "image/png"], ["svg", "image/svg+xml"],
    ["webp", "image/webp"], ["gif", "image/gif"], ["woff2", "font/woff2"],
  ]);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const encoder = new TextEncoder();

  function codePath(path) {
    return [entryPath, "/styles.css", "/platform-feedback.css", "/session-planner-overrides.css"].includes(path) ||
      /^\/(?:src|assets)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:mjs|js|css|json|png|svg|webp|gif|woff2)$/.test(path);
  }

  async function digest(bytes) {
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
  }

  async function checkManifest(value, expectedId = value?.packageId) {
    if (value?.schema !== 1 || value.packageId !== expectedId || !digestPattern.test(expectedId || "") ||
        !Array.isArray(value.assets) || value.assets.length < 1 || value.assets.length > 128) {
      throw new Error("Sessions offline code manifest is unavailable or invalid.");
    }
    let previousPath = "", bytes = 0, hasEntry = false;
    const assets = value.assets.map(({ path, bytes: length, sha256 }) => {
      if (typeof path !== "string" || !codePath(path) || path <= previousPath ||
          !Number.isSafeInteger(length) || length < 1 || !digestPattern.test(sha256 || "")) {
        throw new Error("Sessions offline code manifest contains an invalid asset.");
      }
      previousPath = path;
      hasEntry ||= path === entryPath;
      bytes += length;
      return { path, bytes: length, sha256 };
    });
    if (!hasEntry || bytes > codeLimit ||
        await digest(encoder.encode(JSON.stringify({ schema: 1, assets }))) !== expectedId) {
      throw new Error("Sessions offline code manifest did not verify.");
    }
    return { schema: 1, assets, packageId: expectedId, bytes };
  }

  function openCodeDatabase(create = false) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        if (!create) { request.transaction.abort(); return; }
        for (const name of ["packages", "files", "state"]) request.result.createObjectStore(name);
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async function codeTransaction(stores, mode, useTransaction, { create = false } = {}) {
    const database = await openCodeDatabase(create);
    try {
      return await new Promise((resolve, reject) => {
        const tx = mode === "readwrite"
          ? database.transaction(stores, mode, { durability: "strict" })
          : database.transaction(stores, mode);
        let result, reason;
        tx.oncomplete = () => resolve(result?.());
        tx.onabort = () => reject(reason || tx.error || new Error("Sessions offline code transaction aborted."));
        const fail = message => { reason = new Error(message); tx.abort(); };
        if (mode === "readwrite" && tx.durability !== "strict") {
          fail("This browser could not verify offline code durability.");
          return;
        }
        try { result = useTransaction(tx, fail); } catch (error) {
          reason = error;
          tx.abort();
        }
      });
    } finally {
      database.close();
    }
  }

  function readHead({ create = false } = {}) {
    return codeTransaction(["state"], "readonly", tx => {
      const request = tx.objectStore("state").get("active");
      return () => request.result;
    }, { create });
  }

  function readStoredFiles(packageId, paths) {
    return codeTransaction(["packages", "files"], "readonly", tx => {
      const manifest = tx.objectStore("packages").get(packageId);
      const store = tx.objectStore("files");
      const requests = paths.map(path => store.get([packageId, path]));
      return () => ({ manifest: manifest.result, bodies: requests.map(request => request.result) });
    });
  }

  async function verifyFile(body, asset) {
    if (!asset || !(body instanceof ArrayBuffer) || body.byteLength !== asset.bytes ||
        await digest(body) !== asset.sha256) throw new Error("A Sessions offline code asset did not verify.");
    return body;
  }

  async function fetchPublicBytes(path, limit) {
    const response = await fetch(new URL(path, self.location.origin), {
      credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok || response.type === "opaque" || !response.body) {
      throw new Error("A public Sessions offline code asset was unavailable.");
    }
    const chunks = [];
    let bytes = 0;
    // Safari versions without stream async iteration still support getReader().
    const reader = response.body.getReader();
    try {
      let result = await reader.read();
      while (!result.done) {
        const chunk = result.value;
        bytes += chunk.byteLength;
        if (bytes > limit) {
          await reader.cancel().catch(() => {});
          throw new Error("A Sessions offline code asset exceeded its declared size.");
        }
        chunks.push(chunk);
        result = await reader.read();
      }
    } finally {
      reader.releaseLock();
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return body.buffer;
  }

  function storeCandidate(manifest, bodies) {
    return codeTransaction(["packages", "files"], "readwrite", (tx, fail) => {
      const packages = tx.objectStore("packages");
      const files = tx.objectStore("files");
      const request = packages.getAll();
      request.onsuccess = () => {
        const retained = request.result.filter(record => record.packageId !== manifest.packageId);
        const bytes = retained.reduce((total, record) => total + (record.bytes || 0), manifest.bytes);
        if (retained.length >= packageLimit || bytes > retainedCodeLimit) {
          fail("The Sessions offline code package reached its storage limit.");
          return;
        }
        packages.put(manifest, manifest.packageId);
        for (const [index, asset] of manifest.assets.entries()) {
          files.put(bodies[index], [manifest.packageId, asset.path]);
        }
      };
    });
  }

  async function verifyCandidate(manifest) {
    const { manifest: stored, bodies } = await readStoredFiles(manifest.packageId, manifest.assets.map(asset => asset.path));
    await checkManifest(stored, manifest.packageId);
    await Promise.all(bodies.map((body, index) => verifyFile(body, manifest.assets[index])));
  }

  function publishCandidate(packageId, previousId) {
    return codeTransaction(["state"], "readwrite", (tx, fail) => {
      const state = tx.objectStore("state");
      const request = state.get("active");
      request.onsuccess = () => {
        const currentId = request.result?.packageId;
        if (currentId !== previousId && currentId !== packageId) {
          fail("The active Sessions offline code changed during preparation. Try again.");
          return;
        }
        if (currentId !== packageId) state.put({ packageId }, "active");
      };
    });
  }

  async function prepare() {
    const previous = await readHead({ create: true });
    const manifest = await checkManifest(JSON.parse(decoder.decode(await fetchPublicBytes(manifestPath, manifestLimit))));
    const { packageId, assets, bytes } = manifest;
    const alreadyStored = await verifyCandidate(manifest).then(() => true, () => false);
    if (!alreadyStored) {
      const bodies = [];
      for (let i = 0; i < assets.length; i += 6) {
        const batch = await Promise.all(assets.slice(i, i + 6).map(async asset =>
          verifyFile(await fetchPublicBytes(asset.path, asset.bytes), asset)));
        bodies.push(...batch);
      }
      // Each retained generation is complete. The previous pointer survives any
      // fetch, quota, durability or read-back failure before publication.
      await storeCandidate(manifest, bodies);
      await verifyCandidate(manifest);
    }
    await publishCandidate(packageId, previous?.packageId);
    if ((await readHead())?.packageId !== packageId) throw new Error("Sessions offline code readiness could not be confirmed.");
    return { ok: true, packageId, assetCount: assets.length, bytes };
  }

  async function loadAsset(packageId, path) {
    const { manifest: stored, bodies: [body] } = await readStoredFiles(packageId, [path]);
    const { assets } = await checkManifest(stored, packageId);
    return verifyFile(body, assets.find(asset => asset.path === path));
  }

  function offlineUnavailable() {
    return new Response("Sessions offline is unavailable. Reconnect to prepare this browser. Local work is retained.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  function staticResponse(path, body, base) {
    const headers = {
      "Content-Type": types.get(path.split(".").at(-1)), "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (base) {
      const assets = new URL(base, self.location.origin).href;
      headers["Content-Security-Policy"] = [
        "default-src 'none'", "base-uri " + assets, "script-src " + assets,
        "style-src " + assets + " 'unsafe-inline'", "img-src " + assets + " data: blob:",
        "font-src " + assets, "connect-src 'none'", "form-action 'none'", "frame-ancestors 'none'",
      ].join("; ");
    }
    return new Response(body, { headers });
  }

  async function sessionsNavigation(request, desktopLaunch) {
    try { return await fetch(request); } catch { /* an offline navigation may use a previously verified package */ }
    try {
      const { packageId } = await readHead() ?? {};
      if (!digestPattern.test(packageId || "")) return offlineUnavailable();
      const source = decoder.decode(await loadAsset(packageId, entryPath));
      // Older packages can still serve their Sessions entry. Their boot code
      // cannot display a Desktop landing without revealing the prepared date.
      if (desktopLaunch && !source.includes(desktopLaunchMarker)) return offlineUnavailable();
      const entry = desktopLaunch
        ? source.replace(desktopLaunchMarker, '<meta name="sessions-offline-desktop-launch" content="active">')
        : source;
      const base = virtualRoot + packageId + "/";
      const html = entry.replace(/<head(?:\s[^>]*)?>/i, head => head + '<base href="' + base +
        '"><meta name="sessions-offline-code-package" content="' + packageId + '">');
      return staticResponse(entryPath, html, base);
    } catch {
      return offlineUnavailable();
    }
  }

  let preparation;
  self.addEventListener("message", event => {
    const port = event.ports[0];
    if (!port || event.source?.type !== "window" || new URL(event.source.url).origin !== self.location.origin) return;
    if (event.data?.type === "sessions-offline-code-status") {
      port.postMessage({ protocol: 1 });
      return;
    }
    if (event.data?.type !== "sessions-offline-code-prepare") return;
    preparation ||= prepare().finally(() => { preparation = null; });
    event.waitUntil(preparation.then(result => port.postMessage(result), error => {
      const reason = error?.name === "QuotaExceededError" ? "Local storage is full. Sessions offline was not prepared."
        : "Sessions offline code could not be verified. The previous prepared code is retained.";
      port.postMessage({ ok: false, reason });
    }));
  });

  self.addEventListener("fetch", event => {
    const { request } = event;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin || request.method !== "GET") return;
    if (url.pathname.startsWith(virtualRoot)) {
      const [, packageId, suffix] = /^([a-f0-9]{64})(\/.+)$/.exec(url.pathname.slice(virtualRoot.length)) ?? [];
      if (request.mode === "navigate" || !packageId || !codePath(suffix) || suffix === entryPath) {
        event.respondWith(offlineUnavailable());
        return;
      }
      event.respondWith(loadAsset(packageId, suffix).then(body => staticResponse(suffix, body), offlineUnavailable));
      return;
    }
    if (request.mode !== "navigate") return;
    const desktopLaunch = url.pathname === "/" && (url.search === "" || url.search === "?workspace=home");
    const directSessions = ["/", "/index.html"].includes(url.pathname) &&
      url.searchParams.getAll("workspace").length === 1 && url.searchParams.get("workspace") === "session-planner";
    if (desktopLaunch || directSessions) event.respondWith(sessionsNavigation(request, desktopLaunch));
  });
})();
