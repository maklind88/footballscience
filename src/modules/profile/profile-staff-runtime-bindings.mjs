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

export function bindProfileStaffRuntimeBindings(deps = {}) {
  const { actions = {}, state = {}, ui = {}, win = globalThis } = deps;
  const controllers = {};

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
      if (win.confirm?.("Remove this To-Do?")) {
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
        actions.renderStaffWorkspace?.();
        return;
      }
      const createUserOverlay = event.target.closest("[data-staff-create-user-overlay]");
      if (createUserOverlay && event.target === createUserOverlay) {
        setStateValue(state, "StaffCreateUserEditorOpen", false);
        actions.renderStaffWorkspace?.();
        return;
      }
      const selectButton = event.target.closest("[data-staff-select-user]");
      if (selectButton) {
        setStateValue(state, "SelectedStaffUserId", selectButton.dataset.staffSelectUser);
        setStateValue(state, "StaffCreateUserEditorOpen", false);
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
      if (!win.confirm?.(`Remove ${actions.formatUserName?.(staffUser)}?`)) return;
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
      const values = actions.getPlatformFormValues?.(form);
      const passwordError = actions.getPasswordValidationMessage?.(values);
      if (passwordError) {
        actions.renderStaffWorkspace?.(passwordError);
        return;
      }
      const submissionValues = actions.normalizeAdminUserSubmissionValues?.(
        actions.stripPasswordConfirmation?.({ ...values, status: "active" }),
        actions.getCurrentPlatformUser?.(),
        null,
        actions.syncPlatformStructureWithUsers?.(actions.getPlatformUsers?.())
      );
      const result = await actions.getPlatformAuthStore?.()?.createUser?.(submissionValues);
      if (!result?.ok) {
        actions.renderStaffWorkspace?.(result?.reason ?? "User could not be added.");
        return;
      }
      setStateValue(state, "SelectedStaffUserId", result.user?.id ?? null);
      setStateValue(state, "StaffCreateUserEditorOpen", false);
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
    };

    ui.staffWorkspace.addEventListener("click", controllers.staffClick);
    ui.staffWorkspace.addEventListener("submit", controllers.staffSubmit);
  }

  return controllers;
}
