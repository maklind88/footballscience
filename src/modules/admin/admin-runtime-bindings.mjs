import { confirmPlatformAction } from "../../core/platform-confirm-dialog.mjs";

function getStateValue(state = {}, key, fallback = undefined) {
  const getter = state[`get${key}`];
  return typeof getter === "function" ? getter() : fallback;
}

function setStateValue(state = {}, key, value) {
  const setter = state[`set${key}`];
  if (typeof setter === "function") setter(value);
}

function getUsers(actions = {}) {
  return actions.getPlatformUsers?.() ?? [];
}

function getCurrentUser(actions = {}) {
  return actions.getCurrentPlatformUser?.() ?? null;
}

function getStructure(actions = {}) {
  return actions.syncPlatformStructureWithUsers?.(getUsers(actions));
}

export function bindAdminRuntimeBindings(deps = {}) {
  const { actions = {}, state = {}, win = globalThis, workspaceElement = null } = deps;
  if (!workspaceElement?.addEventListener) return {};
  const renderAdmin = actions.renderAdminWorkspace ?? (() => {});

  const canRunAdminUserAction = (adminUser, options = {}) => {
    if (actions.canAdminManageUser?.(getCurrentUser(actions), adminUser, getStructure(actions), options)) return true;
    renderAdmin("This user is outside your admin scope.");
    return false;
  };

  function snapshotCreateUserDraft(createUserForm) {
    if (!createUserForm) return;
    const values = actions.getPlatformFormValues?.(createUserForm) ?? {};
    setStateValue(state, "AdminCreateUserDraft", values);
  }

  function clearCreateUserDraft() {
    setStateValue(state, "AdminCreateUserDraft", null);
  }

  async function createAdminUserFromForm(createUserForm) {
    if (!createUserForm) return;
    snapshotCreateUserDraft(createUserForm);
    if (!actions.isCurrentPlatformUserAdmin?.()) {
      renderAdmin("Admin access required. Sign in as an admin and try again.");
      return;
    }
    const values = actions.getPlatformFormValues?.(createUserForm);
    const passwordError = actions.getPasswordValidationMessage?.(values);
    if (passwordError) {
      renderAdmin(passwordError);
      return;
    }
    const authStore = actions.getPlatformAuthStore?.();
    if (!authStore?.createUser) {
      renderAdmin("Supabase user creation is not ready yet. Reload the page and try again.");
      return;
    }
    const submissionValues = actions.normalizeAdminUserSubmissionValues?.(
      actions.stripPasswordConfirmation?.(values),
      getCurrentUser(actions),
      null,
      getStructure(actions)
    );
    actions.setFormSubmitButtonState?.(createUserForm, { isSubmitting: true, submittingLabel: "Creating...", defaultLabel: "Create user" });
    try {
      const result = await authStore.createUser(submissionValues);
      if (!result?.ok) {
        renderAdmin(result?.reason ?? "User could not be created.");
        return;
      }
      setStateValue(state, "SelectedAdminUserId", result.user?.id ?? null);
      setStateValue(state, "AdminCreateUserEditorOpen", false);
      setStateValue(state, "AdminUserEditorOpen", Boolean(result.user?.id ?? null));
      clearCreateUserDraft();
      createUserForm.reset();
      actions.renderWorkspaceChrome?.();
      const generatedPassword = result.generatedPassword || "";
      const passwordForMessage = submissionValues.password || generatedPassword;
      const copied = passwordForMessage
        ? await actions.maybeCopyToClipboard?.(
          [
            "Website: https://footballscience.xyz/",
            `Username: ${result.user?.username || submissionValues.username}`,
            `Email: ${result.user?.email || submissionValues.email}`,
            `Password: ${passwordForMessage}`,
          ].join("\n")
        )
        : false;
      renderAdmin(
        passwordForMessage
          ? `User created in Supabase. Password: ${passwordForMessage}.${copied ? " Copied to clipboard." : ""} Use "Send login" only if you want to replace this password with a fresh temporary one.`
          : `User created in Supabase. Use "Send login" to create and email a temporary password.`
      );
    } catch (error) {
      renderAdmin(error?.message || "User could not be created in Supabase.");
    } finally {
      actions.setFormSubmitButtonState?.(createUserForm, { isSubmitting: false, defaultLabel: "Create user" });
    }
  }

  async function generateTemporaryPassword(adminUser) {
    const result = await actions.getPlatformAuthStore?.()?.updateUser?.(adminUser.id, { generatePassword: true });
    if (!result?.ok) {
      renderAdmin(result?.reason || "Could not generate a temporary password.");
      return;
    }
    if (!result.generatedPassword) {
      renderAdmin(`Password generated for ${adminUser.email}, but no password was returned.`);
      return;
    }
    const copied = await actions.maybeCopyToClipboard?.(
      [
        "Website: https://footballscience.xyz/",
        `Username: ${adminUser.username}`,
        `Email: ${adminUser.email}`,
        `Temporary password: ${result.generatedPassword}`,
      ].join("\n")
    );
    renderAdmin(`Temporary password for ${adminUser.email}: ${result.generatedPassword}. This replaces any previous password.${copied ? " Copied to clipboard." : ""}`);
  }

  async function sendTemporaryLogin(adminUser) {
    if (!adminUser.email) {
      renderAdmin("No email saved for this user.");
      return;
    }
    const result = await actions.getPlatformAuthStore?.()?.updateUser?.(adminUser.id, { generatePassword: true });
    if (!result?.ok) {
      renderAdmin(result?.reason || "Could not create a temporary password.");
      return;
    }
    if (!result.generatedPassword) {
      renderAdmin(`Temporary password was created for ${adminUser.email}, but no password was returned.`);
      return;
    }
    const nextUser = result.user || adminUser;
    const sendResult = await actions.openCredentialsMailto?.(nextUser, result.generatedPassword);
    renderAdmin(actions.buildTemporaryLoginMessage?.(nextUser, result.generatedPassword, Boolean(sendResult?.copied)));
  }

  const onClick = async (event) => {
    const passwordToggle = event.target.closest("[data-toggle-password-visibility]");
    if (passwordToggle) {
      actions.togglePasswordInputVisibility?.(passwordToggle);
      return;
    }
    const openCreateUserButton = event.target.closest("[data-admin-open-create-user]");
    if (openCreateUserButton) {
      const teamId = openCreateUserButton.dataset.adminOpenCreateUser || actions.getUserTeamId?.(getCurrentUser(actions), actions.getPlatformStructureState?.());
      setStateValue(state, "AdminCreateUserTeamId", teamId);
      setStateValue(state, "AdminCreateUserDraft", { teamId });
      setStateValue(state, "AdminCreateUserEditorOpen", true);
      setStateValue(state, "AdminUserEditorOpen", false);
      renderAdmin();
      return;
    }
    const closeCreateUserButton = event.target.closest("[data-admin-close-create-user]");
    if (closeCreateUserButton) {
      setStateValue(state, "AdminCreateUserEditorOpen", false);
      clearCreateUserDraft();
      renderAdmin();
      return;
    }
    const createUserOverlay = event.target.closest("[data-admin-create-user-overlay]");
    if (createUserOverlay && event.target === createUserOverlay) {
      createUserOverlay.querySelector(".admin-create-user-modal")?.focus?.({ preventScroll: true });
      return;
    }
    const createUserButton = event.target.closest("[data-admin-create-user-submit]");
    if (createUserButton) {
      event.preventDefault();
      await createAdminUserFromForm(createUserButton.closest("#adminCreateUserForm"));
      return;
    }
    const closeUserEditorButton = event.target.closest("[data-admin-close-user-editor]");
    if (closeUserEditorButton) {
      setStateValue(state, "AdminUserEditorOpen", false);
      renderAdmin();
      return;
    }
    const userEditorOverlay = event.target.closest("[data-admin-user-editor-overlay]");
    if (userEditorOverlay && event.target === userEditorOverlay) {
      setStateValue(state, "AdminUserEditorOpen", false);
      renderAdmin();
      return;
    }
    const selectButton = event.target.closest("[data-admin-select-user]");
    if (selectButton) {
      setStateValue(state, "SelectedAdminUserId", selectButton.dataset.adminSelectUser);
      setStateValue(state, "AdminUserEditorOpen", true);
      setStateValue(state, "AdminCreateUserEditorOpen", false);
      clearCreateUserDraft();
      renderAdmin();
      return;
    }
    const refreshAuditButton = event.target.closest("[data-admin-refresh-audit]");
    if (refreshAuditButton) {
      if (!actions.isPlatformAdminUser?.(getCurrentUser(actions))) {
        renderAdmin("Platform admin required.");
        return;
      }
      await actions.loadAdminAuditLog?.({ force: true });
      return;
    }
    const refreshReadinessButton = event.target.closest("[data-pr-refresh]");
    if (refreshReadinessButton) {
      if (!actions.isPlatformAdminUser?.(getCurrentUser(actions))) {
        renderAdmin("Platform admin required.");
        return;
      }
      await actions.loadPlatformReadinessReport?.({ force: true });
      return;
    }
    const appearanceResetButton = event.target.closest("[data-platform-appearance-reset]");
    if (appearanceResetButton) {
      if (!actions.isPlatformAdminUser?.(getCurrentUser(actions))) {
        renderAdmin("Platform admin required.");
        return;
      }
      await actions.publishPlatformAppearanceConfig?.(
        actions.createDefaultPlatformAppearanceConfig?.({
          updatedAt: new Date().toISOString(),
          updatedBy: getCurrentUser(actions)?.id || "",
        }),
        "Defaults reset."
      );
      return;
    }
    const removeButton = event.target.closest("[data-admin-remove-user]");
    const sendButton = event.target.closest("[data-admin-send-credentials]");
    const sendSelectedButton = event.target.closest("[data-admin-send-selected]");
    const resetPasswordButton = event.target.closest("[data-admin-reset-password]");
    const generatePasswordButton = event.target.closest("[data-admin-generate-password]");
    const generateSelectedPasswordButton = event.target.closest("[data-admin-generate-selected-password]");
    if (!actions.isCurrentPlatformUserAdmin?.()) return;
    const actionButton = generatePasswordButton || generateSelectedPasswordButton || resetPasswordButton || sendButton || sendSelectedButton || removeButton;
    if (!actionButton) return;
    const userId =
      generatePasswordButton?.dataset.adminGeneratePassword ||
      generateSelectedPasswordButton?.dataset.adminGenerateSelectedPassword ||
      resetPasswordButton?.dataset.adminResetPassword ||
      sendButton?.dataset.adminSendCredentials ||
      sendSelectedButton?.dataset.adminSendSelected ||
      removeButton?.dataset.adminRemoveUser;
    const adminUser = getUsers(actions).find((user) => user.id === userId);
    if (!adminUser || !canRunAdminUserAction(adminUser, removeButton ? { remove: true } : {})) return;
    if (generatePasswordButton || generateSelectedPasswordButton) {
      await generateTemporaryPassword(adminUser);
      return;
    }
    if (resetPasswordButton) {
      const result = await actions.getPlatformAuthStore?.()?.sendPasswordReset?.(adminUser.id);
      renderAdmin(result?.ok ? `Password reset sent to ${adminUser.email}.` : result?.reason || "Could not send reset email.");
      return;
    }
    if (sendButton || sendSelectedButton) {
      await sendTemporaryLogin(adminUser);
      return;
    }
    const confirmed = await confirmPlatformAction({
      eyebrow: "Admin",
      title: "Remove user?",
      message: `Remove ${actions.formatUserName?.(adminUser)}?`,
      confirmLabel: "Remove",
      tone: "danger",
      win,
    });
    if (!confirmed) return;
    const result = await actions.getPlatformAuthStore?.()?.removeUser?.(userId);
    if (!result?.ok) {
      renderAdmin(result?.reason ?? "User could not be removed.");
      return;
    }
    setStateValue(state, "SelectedAdminUserId", null);
    actions.renderWorkspaceChrome?.();
    renderAdmin("User removed.");
  };

  const onSubmit = async (event) => {
    const clubForm = event.target.closest("#adminClubForm");
    if (clubForm) {
      event.preventDefault();
      actions.createAdminClubFromForm?.(clubForm);
      return;
    }
    const teamForm = event.target.closest("#adminTeamForm");
    if (teamForm) {
      event.preventDefault();
      actions.createAdminTeamFromForm?.(teamForm);
      return;
    }
    const createUserForm = event.target.closest("#adminCreateUserForm");
    if (createUserForm) {
      event.preventDefault();
      await createAdminUserFromForm(createUserForm);
      return;
    }
    const appearanceForm = event.target.closest("#platformAppearanceForm");
    if (appearanceForm) {
      event.preventDefault();
      if (!actions.isPlatformAdminUser?.(getCurrentUser(actions))) {
        renderAdmin("Platform admin required.");
        return;
      }
      actions.setFormSubmitButtonState?.(appearanceForm, { isSubmitting: true, submittingLabel: "Publishing...", defaultLabel: "Publish" });
      try {
        await actions.publishPlatformAppearanceConfig?.(actions.buildPlatformAppearanceConfigFromForm?.(appearanceForm, actions.readPlatformAppearanceState?.()));
      } catch (error) {
        renderAdmin(error?.message || "Could not publish.");
      } finally {
        actions.setFormSubmitButtonState?.(appearanceForm, { isSubmitting: false, defaultLabel: "Publish" });
      }
      return;
    }
    const userForm = event.target.closest("#adminUserForm");
    if (userForm) {
      await submitAdminUserForm(event, userForm);
      return;
    }
    const transferRoomAccessForm = event.target.closest("#adminTransferRoomAccessForm");
    if (transferRoomAccessForm) {
      submitTransferRoomAccessForm(event, transferRoomAccessForm);
      return;
    }
    const accessForm = event.target.closest("#adminAccessForm");
    if (accessForm) submitAccessForm(event, accessForm);
  };

  const onDraftInput = (event) => {
    const createUserForm = event.target.closest?.("#adminCreateUserForm");
    if (createUserForm) snapshotCreateUserDraft(createUserForm);
  };

  async function submitAdminUserForm(event, userForm) {
    event.preventDefault();
    if (!actions.isCurrentPlatformUserAdmin?.()) {
      renderAdmin("Admin access required. Sign in as an admin and try again.");
      return;
    }
    const selectedUser = getUsers(actions).find((user) => user.id === getStateValue(state, "SelectedAdminUserId"));
    if (!selectedUser) return;
    const currentAdminUser = getCurrentUser(actions);
    const structure = getStructure(actions);
    if (!actions.canAdminManageUser?.(currentAdminUser, selectedUser, structure)) {
      renderAdmin("This user is outside your admin scope.");
      return;
    }
    const values = actions.getPlatformFormValues?.(userForm);
    const passwordError = actions.getPasswordValidationMessage?.(values);
    if (passwordError) {
      renderAdmin(passwordError);
      return;
    }
    if (actions.hasUserFieldConflict?.(selectedUser.id, values)) {
      renderAdmin("Username or email already exists.");
      return;
    }
    const submissionValues = actions.normalizeAdminUserSubmissionValues?.(actions.stripPasswordConfirmation?.(values), currentAdminUser, selectedUser, structure);
    try {
      const authStore = actions.getPlatformAuthStore?.();
      if (!authStore?.updateUser) {
        renderAdmin("Supabase user update is not ready yet. Reload the page and try again.");
        return;
      }
      actions.setFormSubmitButtonState?.(userForm, { isSubmitting: true, submittingLabel: "Saving...", defaultLabel: "Save user" });
      const result = await actions.withUiTimeout?.(
        authStore.updateUser(selectedUser.id, submissionValues),
        26000,
        "Saving took too long. Refresh the page and check if the change was saved."
      );
      if (!result?.ok) {
        renderAdmin(result?.reason ?? "User could not be saved.");
        return;
      }
      actions.syncPlatformUserFromAuth?.();
      actions.renderWorkspaceChrome?.();
      const generatedPassword = result.generatedPassword ? ` Temporary password: ${result.generatedPassword}.` : "";
      const successMessage = submissionValues.password ? "User saved and password updated in Supabase. Only the latest saved or reset password works." : "User saved.";
      renderAdmin(`${successMessage}${generatedPassword}`);
    } catch (error) {
      renderAdmin(error?.message || "User could not be saved.");
    } finally {
      actions.setFormSubmitButtonState?.(userForm, { isSubmitting: false, defaultLabel: "Save" });
    }
  }

  function submitTransferRoomAccessForm(event, transferRoomAccessForm) {
    event.preventDefault();
    if (!actions.isPlatformAdminUser?.(getCurrentUser(actions)) || !actions.transferRoomRuntime?.canManageAccess?.(getCurrentUser(actions))) {
      renderAdmin("Platform admin required.");
      return;
    }
    const controls = Array.from(transferRoomAccessForm.querySelectorAll("[data-admin-transfer-room-access-user]"));
    const editableIds = new Set(controls.map((control) => control.dataset.adminTransferRoomAccessUser).filter(Boolean));
    const nextSelectedIds = new Set(controls.filter((control) => control.checked).map((control) => control.dataset.adminTransferRoomAccessUser).filter(Boolean));
    const transferRoomState = actions.ensureTransferRoomState?.();
    const teamId = actions.getAdminTransferRoomAccessTeamId?.(transferRoomState, actions.getPlatformStructureState?.());
    const currentSelectedIds = new Set(transferRoomState.accessByTeam?.[teamId]?.userIds || []);
    let hasChanges = false;
    currentSelectedIds.forEach((userId) => {
      if (editableIds.has(userId) && !nextSelectedIds.has(userId)) {
        actions.transferRoomRuntime?.toggleAccessUser?.(userId, false);
        hasChanges = true;
      }
    });
    nextSelectedIds.forEach((userId) => {
      if (!currentSelectedIds.has(userId)) {
        actions.transferRoomRuntime?.toggleAccessUser?.(userId, true);
        hasChanges = true;
      }
    });
    actions.renderWorkspaceChrome?.();
    renderAdmin(hasChanges ? "Transfer Room access saved." : "Transfer Room access is already up to date.");
  }

  function submitAccessForm(event, accessForm) {
    event.preventDefault();
    if (!actions.isPlatformAdminUser?.(getCurrentUser(actions))) {
      renderAdmin("Platform admin required.");
      return;
    }
    const roles = actions.getPlatformRoles?.();
    const controls = Array.from(accessForm.querySelectorAll("[data-admin-access-workspace][data-admin-access-role]"));
    const nextAccess = { ...actions.getWorkspaceAccessConfig?.() };
    actions.getAdminManagedWorkspaces?.().forEach((workspace) => {
      if (workspace.requiresAdmin) {
        nextAccess[workspace.id] = { view: ["admin"], edit: ["admin"] };
        return;
      }
      const viewRoles = new Set(["admin"]);
      const editRoles = new Set(["admin"]);
      controls.filter((control) => control.dataset.adminAccessWorkspace === workspace.id).forEach((control) => {
        const role = control.dataset.adminAccessRole;
        if (!roles.includes(role)) return;
        if (control.value === "view" || control.value === "edit") viewRoles.add(role);
        if (control.value === "edit") editRoles.add(role);
      });
      nextAccess[workspace.id] = { view: Array.from(viewRoles), edit: Array.from(editRoles).filter((role) => viewRoles.has(role)) };
    });
    const nextHubState = { ...getStateValue(state, "HubState"), workspaceAccess: nextAccess };
    setStateValue(state, "HubState", actions.repairWorkspaceState?.(nextHubState));
    actions.writeWorkspaceHubState?.();
    actions.renderWorkspaceChrome?.();
    renderAdmin("Access saved.");
  }

  workspaceElement.addEventListener("click", onClick);
  workspaceElement.addEventListener("input", onDraftInput);
  workspaceElement.addEventListener("change", onDraftInput);
  workspaceElement.addEventListener("submit", onSubmit);

  return { click: onClick, input: onDraftInput, change: onDraftInput, submit: onSubmit, createAdminUserFromForm };
}
