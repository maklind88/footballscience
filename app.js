const appRuntimeVersion =
  new URL(import.meta.url).searchParams.get("v") ||
  globalThis.__assetVersion ||
  String(Date.now());

await import(`./app-runtime.js?v=${encodeURIComponent(appRuntimeVersion)}`);
