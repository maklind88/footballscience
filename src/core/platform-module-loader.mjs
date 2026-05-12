function getDefaultAssetVersion() {
  return globalThis.window?.__assetVersion || "";
}

function normalizeAssetHref(href, assetVersion = getDefaultAssetVersion()) {
  const value = String(href || "").trim();
  if (!value || !assetVersion || /(?:\?|&)v=/.test(value)) {
    return value;
  }

  const separator = value.includes("?") ? "&" : "?";
  return `${value}${separator}v=${encodeURIComponent(assetVersion)}`;
}

function createLoadError(kind, key, href) {
  return new Error(`Failed to load ${kind} "${key}" from ${href}`);
}

function resolveExistingElement(documentRef, id) {
  if (!id || typeof documentRef?.getElementById !== "function") {
    return null;
  }

  return documentRef.getElementById(id);
}

export function createPlatformModuleLoader(options = {}) {
  const documentRef = options.documentRef ?? globalThis.document;
  const assetVersion = options.assetVersion ?? getDefaultAssetVersion();
  const stylesheets = new Map();
  const scripts = new Map();
  const modules = new Map();

  function versionedHref(href) {
    return normalizeAssetHref(href, assetVersion);
  }

  function loadStylesheet(key, href, attributes = {}) {
    const resourceKey = String(key || href || "").trim();
    if (!resourceKey) {
      return Promise.resolve(null);
    }

    if (stylesheets.has(resourceKey)) {
      return stylesheets.get(resourceKey);
    }

    const resolvedHref = versionedHref(href);
    const existing = resolveExistingElement(documentRef, attributes.id);
    if (existing) {
      const promise = Promise.resolve(existing);
      stylesheets.set(resourceKey, promise);
      return promise;
    }

    if (!documentRef?.createElement || !documentRef?.head?.appendChild) {
      const promise = Promise.resolve(null);
      stylesheets.set(resourceKey, promise);
      return promise;
    }

    const link = documentRef.createElement("link");
    link.rel = "stylesheet";
    link.href = resolvedHref;
    if (attributes.id) {
      link.id = attributes.id;
    }
    if (attributes.media) {
      link.media = attributes.media;
    }

    const promise = new Promise((resolve, reject) => {
      link.onload = () => resolve(link);
      link.onerror = () => {
        if (attributes.required) {
          reject(createLoadError("stylesheet", resourceKey, resolvedHref));
          return;
        }
        resolve(null);
      };
    });

    stylesheets.set(resourceKey, promise);
    documentRef.head.appendChild(link);
    return promise;
  }

  function loadScript(key, src, attributes = {}) {
    const resourceKey = String(key || src || "").trim();
    if (!resourceKey) {
      return Promise.resolve(null);
    }

    if (scripts.has(resourceKey)) {
      return scripts.get(resourceKey);
    }

    const resolvedSrc = versionedHref(src);
    const existing = resolveExistingElement(documentRef, attributes.id);
    if (existing) {
      const promise = Promise.resolve(existing);
      scripts.set(resourceKey, promise);
      return promise;
    }

    if (!documentRef?.createElement || !documentRef?.head?.appendChild) {
      const promise = Promise.resolve(null);
      scripts.set(resourceKey, promise);
      return promise;
    }

    const script = documentRef.createElement("script");
    script.src = resolvedSrc;
    script.async = attributes.async !== false;
    if (attributes.id) {
      script.id = attributes.id;
    }
    if (attributes.type) {
      script.type = attributes.type;
    }

    const promise = new Promise((resolve, reject) => {
      script.onload = () => resolve(script);
      script.onerror = () => {
        if (attributes.required) {
          reject(createLoadError("script", resourceKey, resolvedSrc));
          return;
        }
        resolve(null);
      };
    });

    scripts.set(resourceKey, promise);
    documentRef.head.appendChild(script);
    return promise;
  }

  function loadModule(key, importer) {
    const moduleKey = String(key || "").trim();
    if (!moduleKey || typeof importer !== "function") {
      return Promise.reject(new Error("A module key and importer are required."));
    }

    if (!modules.has(moduleKey)) {
      modules.set(
        moduleKey,
        Promise.resolve()
          .then(importer)
          .catch((error) => {
            modules.delete(moduleKey);
            throw error;
          })
      );
    }

    return modules.get(moduleKey);
  }

  function preloadModule(key, importer) {
    return loadModule(key, importer).catch(() => null);
  }

  return {
    versionedHref,
    loadStylesheet,
    loadScript,
    loadModule,
    preloadModule,
    hasStylesheet: (key) => stylesheets.has(key),
    hasScript: (key) => scripts.has(key),
    hasModule: (key) => modules.has(key),
  };
}

export { normalizeAssetHref };
