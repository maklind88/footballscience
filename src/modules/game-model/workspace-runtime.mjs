export function createGameModelWorkspaceRuntime({ root, loader, getAssetVersion, catalog, canEdit }) {
  let workspace = null;
  let loading = null;
  let activeScope = null;

  function render() {
    if (!root) return;
    const scope = catalog.getScopeKey();
    if (scope !== activeScope) {
      workspace?.reset();
      activeScope = scope;
    }
    if (workspace) {
      workspace.render();
      return;
    }
    if (loading) return;
    root.innerHTML = '<p role="status">Loading Game Model…</p>';
    loading = Promise.all([
      loader.loadStylesheet("game-model", "src/modules/game-model/game-model.css", {
        id: "gameModelStylesheet",
        required: true,
      }),
      loader.loadModule("game-model", () => import(`./index.mjs?v=${encodeURIComponent(getAssetVersion())}`)),
    ]).then(([, module]) => {
      workspace = module.createGameModelWorkspace({
        root,
        getCatalog: catalog.getCatalog,
        saveItem: catalog.saveItem,
        canEdit,
      });
      render();
    }).catch(() => {
      root.innerHTML = '<p role="alert">Game Model could not load. Reopen the module to try again.</p>';
    }).finally(() => {
      loading = null;
    });
  }

  return { render };
}
