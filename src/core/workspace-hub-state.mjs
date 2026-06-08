export function createWorkspaceHubStateHelpers(options = {}) {
  const defaultHubState = options.defaultHubState ?? { profile: {}, workspaces: [] };
  const defaultWorkspaceAccess = options.defaultWorkspaceAccess ?? {};
  const mergeWorkspaceDefinitions =
    typeof options.mergeWorkspaceDefinitions === "function"
      ? options.mergeWorkspaceDefinitions
      : (workspaces = []) => (Array.isArray(workspaces) ? workspaces : []);

  function cloneHubState(source = defaultHubState) {
    const sourceState = source ?? defaultHubState;
    return {
      activeWorkspaceId: sourceState.activeWorkspaceId,
      sidebarCollapsed: Boolean(sourceState.sidebarCollapsed),
      profile: {
        name: sourceState.profile?.name ?? defaultHubState.profile?.name,
        shortName: sourceState.profile?.shortName ?? defaultHubState.profile?.shortName,
        role: sourceState.profile?.role ?? defaultHubState.profile?.role,
      },
      workspaces: mergeWorkspaceDefinitions(sourceState.workspaces ?? defaultHubState.workspaces).map((workspace) => ({
        id: workspace.id,
        kind: workspace.kind,
        title: workspace.title,
        meta: workspace.meta,
        description: workspace.description,
        status: workspace.status,
        icon: workspace.icon,
        requiresAdmin: Boolean(workspace.requiresAdmin),
        hiddenFromNav: Boolean(workspace.hiddenFromNav),
      })),
      workspaceAccess: {
        ...defaultWorkspaceAccess,
        ...(sourceState.workspaceAccess ?? {}),
      },
    };
  }

  function clonePersistableWorkspaceHubState(source = defaultHubState) {
    const clonedState = cloneHubState(source ?? defaultHubState);
    delete clonedState.activeWorkspaceId;
    return clonedState;
  }

  return {
    cloneHubState,
    clonePersistableWorkspaceHubState,
  };
}
