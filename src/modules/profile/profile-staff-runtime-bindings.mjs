import { confirmPlatformAction } from "../../core/platform-confirm-dialog.mjs";

async function waitForAuthReady(win = globalThis) {
  if (win.platformAuthReadyPromise instanceof Promise) {
    try {
      await win.platformAuthReadyPromise;
    } catch {
      // Auth readiness failures are surfaced by the caller's auth store checks.
    }
  }
}

function callOptional(fn, ...args) {
  return typeof fn === "function" ? fn(...args) : undefined;
}

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

export function bindProfileStaffRuntimeBindings(deps = {}) {
  const { actions = {}, state = {}, ui = {}, win = globalThis } = deps;
  const controllers = {};

  function snapshotStaffCreateUserDraft(createUserForm) {
    if (!createUserForm) return;
    const values = actions.getPlatformFormValues?.(createUserForm) ?? {};
    setStateValue(state, "StaffCreateUserDraft", values);
  }

  function clearStaffCreateUserDraft() {
    setStateValue(state, "StaffCreateUserDraft", null);
  }

  if (ui.profileMenu?.addEventListener) {
    controllers.profileMenuClick = (event) => {
      const trigger = event.target.closest("[data-open-workspace]");
      if (!trigger) return;
      actions.setProfileMenuOpen?.(false);
      actions.setActiveWorkspace?.(trigger.dataset.openWorkspace);
    };
    ui.profileMenu.addEventListener("click", controllers.profileMenuClick);
  }

  if (win.addEventListener) {
    controllers.openWorkspace = (event) => {
      const workspaceId = event.detail?.workspaceId;
      if (!workspaceId) return;
      win.__pendingWorkspaceId = workspaceId;
      if (!actions.hasHubState?.()) return;
      actions.setProfileMenuOpen?.(false);
      actions.setActiveWorkspace?.(workspaceId);
    };
    win.addEventListener("platform:open-workspace", controllers.openWorkspace);
  }

  if (ui.profileWorkspace?.addEventListener) {
    controllers.profileSubmit = async (event) => {
      event.preventDefault();
      await waitForAuthReady(win);
      const todoForm = event.target.closest("#profileTodoForm");
      if (todoForm) {
        const user = actions.getCurrentPlatformUser?.();
        const values = actions.getPlatformFormValues?.(todoForm);
        if (!user || !values.title) return;
        actions.createDashboardTask?.({ title: values.title, assignedTo: user.id, scope: "personal" });
        actions.refreshDashboardSurfaces?.();
        return;
      }
      const form = event.target.closest("#profileForm");
      if (!form) return;
      const user = actions.getCurrentPlatformUser?.();
      const authStore = actions.getPlatformAuthStore?.();
      if (!user || !authStore) return;
      const values = actions.getPlatformFormValues?.(form);
      const profileValues = { ...values };
      delete profileValues.role;
      delete profileValues.status;
      actions.setFormSubmitButtonState?.(form, { isSubmitting: true, submittingLabel: "Saving...", defaultLabel: "Save" });
      if (actions.hasUserFieldConflict?.(user.id, values)) {
        actions.setFormSubmitButtonState?.(form, { isSubmitting: false });
        actions.renderProfileWorkspace?.("Username or email already exists.");
        return;
      }
      try {
        const result = await authStore.updateUser(user.id, profileValues);
        if (!result?.ok) {
          actions.renderProfileWorkspace?.(result?.reason || "Profile could not be saved.");
          return;
        }
        actions.updatePlatformUserFromPayload?.({ ...user, ...(result.user || result.payload?.user), ...profileValues });
        actions.syncPlatformUserFromAuth?.();
        actions.renderWorkspaceChrome?.();
        actions.renderProfileWorkspace?.("Saved.");
      } catch (error) {
        actions.renderProfileWorkspace?.(
          error?.message || "Profile details could not be saved right now. Make sure you are signed in and try again."
        );
      } finally {
        actions.setFormSubmitButtonState?.(form, { isSubmitting: false, defaultLabel: "Save" });
      }
    };

    controllers.profileChange = async (event) => {
      const imageInput = event.target.closest("#profileImageUpload");
      if (!imageInput) return;
      await waitForAuthReady(win);
      const file = imageInput.files?.[0];
      if (!file) return;
      const user = actions.getCurrentPlatformUser?.();
      const authStore = actions.getPlatformAuthStore?.();
      if (!user || !authStore) return;
      const form = imageInput.closest("#profileForm");
      const values = form ? actions.getPlatformFormValues?.(form) : {};
      if (form && actions.hasUserFieldConflict?.(user.id, values)) {
        actions.renderProfileWorkspace?.("Username or email already exists.");
        return;
      }
      try {
        const profileImageUrl = await actions.createProfileImageDataUrl?.(file);
        const profileValues = { ...values };
        delete profileValues.role;
        delete profileValues.status;
        actions.renderProfileWorkspace?.("Uploading profile image...");
        const uploadImage = authStore.uploadProfileImage || ((userId, imageDataUrl, patch) =>
          authStore.updateUser?.(userId, { ...patch, profileImageUrl: imageDataUrl }));
        const result = await uploadImage(user.id, profileImageUrl, profileValues);
        if (!result?.ok) {
          actions.renderProfileWorkspace?.(result?.reason || "Profile image could not be saved.");
          return;
        }
        actions.updatePlatformUserFromPayload?.(result.user || result.payload?.user);
        actions.syncPlatformUserFromAuth?.();
        actions.renderWorkspaceChrome?.();
        actions.renderProfileWorkspace?.("Profile image saved.");
      } catch (error) {
        const message =
          error?.name === "QuotaExceededError"
            ? "Profile image could not be saved because local storage is full."
            : error?.message ?? "Profile image could not be saved.";
        actions.renderProfileWorkspace?.(message);
      }
    };

    controllers.profileClick = async (event) => {
      const removePhotoButton = event.target.closest("[data-profile-remove-photo]");
      if (removePhotoButton) {
        await waitForAuthReady(win);
        const user = actions.getCurrentPlatformUser?.();
        const authStore = actions.getPlatformAuthStore?.();
        if (!user || !authStore) return;
        try {
          const removeImage = authStore.removeProfileImage || ((userId) => authStore.updateUser?.(userId, { profileImageUrl: "" }));
          const result = await removeImage(user.id);
          if (!result?.ok) {
            actions.renderProfileWorkspace?.(result?.reason || "Profile image could not be removed.");
            return;
          }
          actions.updatePlatformUserFromPayload?.(result.user || result.payload?.user);
          actions.syncPlatformUserFromAuth?.();
          actions.renderWorkspaceChrome?.();
          actions.renderProfileWorkspace?.("Profile image removed.");
        } catch (error) {
          actions.renderProfileWorkspace?.(error?.message || "Profile image could not be removed.");
        }
        return;
      }
      const toggleTaskButton = event.target.closest("[data-dashboard-toggle-task]");
      if (toggleTaskButton) {
        const task = actions.readDashboardTasks?.().find((candidate) => candidate.id === toggleTaskButton.dataset.dashboardToggleTask);
        if (!task) return;
        actions.updateDashboardTask?.(task.id, { status: task.status === "done" ? "open" : "done" });
        actions.refreshDashboardSurfaces?.();
        return;
      }
      const removeTaskButton = event.target.closest("[data-dashboard-remove-task]");
      if (!removeTaskButton) return;
      const confirmed = await confirmPlatformAction({
        eyebrow: "Profile",
        title: "Remove To-Do?",
        message: "Remove this To-Do?",
        confirmLabel: "Remove",
        tone: "danger",
        win,
      });
      if (confirmed) {
        actions.removeDashboardTask?.(removeTaskButton.dataset.dashboardRemoveTask);
        actions.refreshDashboardSurfaces?.();
      }
    };

    ui.profileWorkspace.addEventListener("submit", controllers.profileSubmit);
    ui.profileWorkspace.addEventListener("change", controllers.profileChange);
    ui.profileWorkspace.addEventListener("click", controllers.profileClick);
  }

  if (ui.staffWorkspace?.addEventListener) {
    controllers.staffClick = async (event) => {
      const passwordToggle = event.target.closest("[data-toggle-password-visibility]");
      if (passwordToggle) {
        actions.togglePasswordInputVisibility?.(passwordToggle);
        return;
      }
      const openCreateUserButton = event.target.closest("[data-staff-open-create-user]");
      if (openCreateUserButton) {
        setStateValue(state, "StaffCreateUserEditorOpen", true);
        actions.renderStaffWorkspace?.();
        return;
      }
      const closeCreateUserButton = event.target.closest("[data-staff-close-create-user]");
      if (closeCreateUserButton) {
        setStateValue(state, "StaffCreateUserEditorOpen", false);
        clearStaffCreateUserDraft();
        actions.renderStaffWorkspace?.();
        return;
      }
      const createUserOverlay = event.target.closest("[data-staff-create-user-overlay]");
      if (createUserOverlay && event.target === createUserOverlay) {
        createUserOverlay.querySelector(".staff-create-user-modal")?.focus?.({ preventScroll: true });
        return;
      }
      const selectButton = event.target.closest("[data-staff-select-user]");
      if (selectButton) {
        setStateValue(state, "SelectedStaffUserId", selectButton.dataset.staffSelectUser);
        setStateValue(state, "StaffCreateUserEditorOpen", false);
        clearStaffCreateUserDraft();
        actions.renderStaffWorkspace?.();
        return;
      }
      const removeButton = event.target.closest("[data-staff-remove-user]");
      if (!removeButton || !actions.isCurrentPlatformUserAdmin?.()) return;
      const userId = removeButton.dataset.staffRemoveUser;
      const staffUser = actions.getPlatformUsers?.().find((user) => user.id === userId);
      if (!staffUser) return;
      const structure = actions.syncPlatformStructureWithUsers?.(actions.getPlatformUsers?.());
      if (!actions.canAdminManageUser?.(actions.getCurrentPlatformUser?.(), staffUser, structure, { remove: true })) {
        actions.renderStaffWorkspace?.("This user is outside your admin scope.");
        return;
      }
      const confirmed = await confirmPlatformAction({
        eyebrow: "Staff",
        title: "Remove user?",
        message: `Remove ${actions.formatUserName?.(staffUser)}?`,
        confirmLabel: "Remove",
        tone: "danger",
        win,
      });
      if (!confirmed) return;
      const result = await actions.getPlatformAuthStore?.()?.removeUser?.(userId);
      if (!result?.ok) {
        actions.renderStaffWorkspace?.(result?.reason ?? "User could not be removed.");
        return;
      }
      setStateValue(state, "SelectedStaffUserId", null);
      actions.renderWorkspaceChrome?.();
      actions.renderStaffWorkspace?.("Removed.");
    };

    controllers.staffSubmit = async (event) => {
      const form = event.target.closest("#staffUserForm");
      if (!form || !actions.isCurrentPlatformUserAdmin?.()) return;
      event.preventDefault();
      snapshotStaffCreateUserDraft(form);
      const values = actions.getPlatformFormValues?.(form);
      const passwordError = actions.getPasswordValidationMessage?.(values);
      if (passwordError) {
        actions.renderStaffWorkspace?.(passwordError);
        return;
      }
      const authStore = actions.getPlatformAuthStore?.();
      if (!authStore?.createUser) {
        actions.renderStaffWorkspace?.("Supabase user creation is not ready yet. Reload the page and try again.");
        return;
      }
      const submissionValues = actions.normalizeAdminUserSubmissionValues?.(
        actions.stripPasswordConfirmation?.({ ...values, status: "active" }),
        getCurrentUser(actions),
        null,
        getStructure(actions)
      );
      actions.setFormSubmitButtonState?.(form, { isSubmitting: true, submittingLabel: "Adding...", defaultLabel: "Add user" });
      try {
        const result = await authStore.createUser(submissionValues);
        if (!result?.ok) {
          actions.renderStaffWorkspace?.(result?.reason ?? "User could not be added.");
          return;
        }
        setStateValue(state, "SelectedStaffUserId", result.user?.id ?? null);
        setStateValue(state, "StaffCreateUserEditorOpen", false);
        clearStaffCreateUserDraft();
        form.reset();
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
        actions.renderStaffWorkspace?.(
          passwordForMessage
            ? `User added. Password: ${passwordForMessage}.${copied ? " Copied to clipboard." : ""}`
            : "User added."
        );
      } catch (error) {
        actions.renderStaffWorkspace?.(error?.message || "User could not be added.");
      } finally {
        actions.setFormSubmitButtonState?.(form, { isSubmitting: false, defaultLabel: "Add user" });
      }
    };

    controllers.staffInput = (event) => {
      const createUserForm = event.target.closest?.("#staffUserForm");
      if (createUserForm) snapshotStaffCreateUserDraft(createUserForm);
    };

    ui.staffWorkspace.addEventListener("click", controllers.staffClick);
    ui.staffWorkspace.addEventListener("submit", controllers.staffSubmit);
    ui.staffWorkspace.addEventListener("input", controllers.staffInput);
    ui.staffWorkspace.addEventListener("change", controllers.staffInput);
  }

  return controllers;
}
