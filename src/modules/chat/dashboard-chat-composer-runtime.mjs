export function createDashboardChatComposerRuntime({
  createDashboardId,
  dashboardChatAdvancedThreadTemplates,
  dashboardChatGroupNameMinLength = 2,
  dashboardChatTeamThreadId,
  dashboardChatThreadSettings = null,
  formatUserName,
  getCurrentPlatformUser,
  getDashboardChatActiveToastThreadId,
  getDashboardChatComposerAttachmentDraft,
  getDashboardChatParticipantIdsForApi,
  getDashboardChatThreadLabel,
  getDashboardChatThreadTypeForApi,
  getDashboardChatApiAccessToken,
  getDashboardSupabaseClient,
  logDashboardChatApiFailure,
  normalizeDashboardChatGroupAvatarInput = (value = "") => String(value ?? "").trim().replace(/\s+/g, " "),
  normalizeDashboardChatThreadId,
  normalizeDashboardChatGroupNameInput = (value = "") => String(value ?? "").trim().replace(/\s+/g, " "),
  refreshDashboardChatFromApi = null,
  queueDashboardChatThreadSummaryRefresh,
  readDashboardChatWidgetState,
  renderDashboardChatWidget,
  sendDashboardChatApiAction,
  setDashboardChatComposerAttachmentDraft,
  setDashboardChatGroupCreatorOpen,
  setDashboardChatMessageSearchQuery,
  showDashboardChatWidgetToast,
  syncDashboardChatDirectCreateForm = () => {},
  syncDashboardChatGroupCreateForm = () => {},
  writeDashboardChatWidgetState,
  focusDashboardChatWidgetComposer,
  applyDashboardChatApiPayload,
  uploadDashboardChatAttachmentFileWithClient,
}) {
  function setDashboardChatAttachmentDraft(next) {
    setDashboardChatComposerAttachmentDraft(next);
    renderDashboardChatWidget();
    focusDashboardChatWidgetComposer();
  }

  async function uploadDashboardChatAttachmentFile(file, attachment = {}) {
    return uploadDashboardChatAttachmentFileWithClient(
      file,
      attachment,
      getDashboardSupabaseClient(),
      getDashboardChatApiAccessToken
    );
  }

  async function createDashboardChatAttachmentIntent(file, threadId = dashboardChatTeamThreadId) {
    if (!file) {
      return null;
    }

    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    const fileMetadata = {
      fileName: file.name || "Attachment",
      byteSize: file.size || 0,
      mimeType: file.type || "application/octet-stream",
    };

    setDashboardChatAttachmentDraft({ id: createDashboardId("attachment"), status: "uploading", metadata: fileMetadata });

    const result = await sendDashboardChatApiAction({
      action: "createAttachmentIntent",
      threadId: normalizedThreadId,
      threadType: getDashboardChatThreadTypeForApi(normalizedThreadId),
      threadTitle: getDashboardChatThreadLabel(normalizedThreadId, getCurrentPlatformUser()),
      participantIds: getDashboardChatParticipantIdsForApi(normalizedThreadId),
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      byteSize: file.size || 0,
    });

    if (!result.ok) {
      logDashboardChatApiFailure("createAttachmentIntent", result);
      showDashboardChatWidgetToast(result.reason || "Attach failed.", normalizedThreadId);
      setDashboardChatAttachmentDraft({
        ...(getDashboardChatComposerAttachmentDraft() || {}),
        status: "failed",
        error: result.reason || "Attach failed.",
      });
      return null;
    }

    const uploadIntent = result.result?.upload || null;
    const attachment = result.result?.attachment
      ? {
          ...result.result.attachment,
          upload: uploadIntent,
          token: uploadIntent?.token || "",
        }
      : null;

    const upload = await uploadDashboardChatAttachmentFile(file, attachment);

    if (!upload.ok) {
      logDashboardChatApiFailure("uploadAttachment", upload);
      showDashboardChatWidgetToast(upload.reason || "Upload failed.", normalizedThreadId);
      setDashboardChatAttachmentDraft({
        ...(attachment || getDashboardChatComposerAttachmentDraft() || {}),
        status: "failed",
        error: upload.reason || "Upload failed.",
        metadata: {
          ...(getDashboardChatComposerAttachmentDraft()?.metadata || {}),
          ...(attachment?.metadata || {}),
        },
      });
      return null;
    }

    setDashboardChatAttachmentDraft(
      attachment
        ? {
            ...attachment,
            status: "uploaded",
            metadata: {
              ...(attachment.metadata || {}),
              uploadReady: true,
            },
          }
        : null
    );

    return getDashboardChatComposerAttachmentDraft();
  }

  async function handleDashboardChatAttachmentInputChange(attachmentInput) {
    if (!attachmentInput || attachmentInput.dataset.busy === "true") {
      return;
    }

    const file = attachmentInput.files?.[0] || null;
    if (!file) {
      return;
    }

    attachmentInput.dataset.busy = "true";

    try {
      const currentState = readDashboardChatWidgetState();
      const threadId = normalizeDashboardChatThreadId(currentState.selectedThreadId, dashboardChatTeamThreadId);
      await createDashboardChatAttachmentIntent(file, threadId);
    } catch (error) {
      setDashboardChatAttachmentDraft({
        id: createDashboardId("attachment"),
        status: "failed",
        error: error?.message || "Upload failed.",
        metadata: {
          fileName: file.name || "Attachment",
          byteSize: file.size || 0,
          mimeType: file.type || "application/octet-stream",
        },
      });
      showDashboardChatWidgetToast(
        getDashboardChatComposerAttachmentDraft()?.error,
        getDashboardChatActiveToastThreadId()
      );
    } finally {
      attachmentInput.value = "";
      delete attachmentInput.dataset.busy;
    }
  }

  async function createDashboardAdvancedChatThread(templateKey) {
    const template = dashboardChatAdvancedThreadTemplates.find((candidate) => candidate.key === templateKey);
    if (!template) {
      return null;
    }

    const legacyThreadId = template.key;
    const result = await sendDashboardChatApiAction({
      action: "createThread",
      threadId: legacyThreadId,
      type: template.type,
      title: template.title,
      visibility: template.visibility,
      participantIds: getDashboardChatParticipantIdsForApi(legacyThreadId),
    });

    if (!result.ok) {
      logDashboardChatApiFailure("createThread", result);
      return null;
    }

    applyDashboardChatApiPayload(result.result || {}, { threadId: legacyThreadId });
    setDashboardChatMessageSearchQuery("");
    setDashboardChatGroupCreatorOpen(false);
    writeDashboardChatWidgetState({
      isOpen: true,
      selectedThreadId: legacyThreadId,
    });

    renderDashboardChatWidget();
    focusDashboardChatWidgetComposer();
    return result.result?.thread || null;
  }

  function setDashboardChatGroupCreateError(form, message = "") {
    const errorElement = form?.querySelector("[data-dashboard-chat-group-create-error]");
    if (!errorElement) {
      return;
    }

    const normalizedMessage = String(message || "").trim();
    errorElement.textContent = normalizedMessage;
    errorElement.hidden = !normalizedMessage;
  }

  async function createDashboardDirectThreadFromForm(form) {
    if (!form || form.dataset.busy === "true") {
      return null;
    }

    const currentUser = getCurrentPlatformUser();
    const selectedInput = form.querySelector("input[name='participantId']:checked");
    const selectedParticipant = selectedInput
      ? {
          id: String(selectedInput.value || "").trim(),
          email: String(selectedInput.dataset.dashboardChatDirectParticipantEmail || "").trim().toLowerCase(),
          username: String(selectedInput.dataset.dashboardChatDirectParticipantUsername || "").trim(),
          name: String(selectedInput.dataset.dashboardChatDirectParticipantName || "").trim(),
        }
      : null;

    setDashboardChatGroupCreateError(form, "");

    if (!currentUser?.id) {
      setDashboardChatGroupCreateError(form, "Sign in before starting a private chat.");
      showDashboardChatWidgetToast("Sign in before starting a private chat.", getDashboardChatActiveToastThreadId());
      return null;
    }

    if (!selectedParticipant?.id && !selectedParticipant?.email && !selectedParticipant?.username) {
      setDashboardChatGroupCreateError(form, "Choose a teammate.");
      showDashboardChatWidgetToast("Choose a teammate.", getDashboardChatActiveToastThreadId());
      return null;
    }

    if (selectedParticipant.id && selectedParticipant.id === currentUser.id) {
      setDashboardChatGroupCreateError(form, "Choose another teammate.");
      showDashboardChatWidgetToast("Choose another teammate.", getDashboardChatActiveToastThreadId());
      return null;
    }

    const legacyThreadId = normalizeDashboardChatThreadId(
      `dm:${currentUser.id}:${selectedParticipant.id || selectedParticipant.email || selectedParticipant.username}`,
      dashboardChatTeamThreadId
    );
    if (!legacyThreadId || legacyThreadId === dashboardChatTeamThreadId) {
      setDashboardChatGroupCreateError(form, "This private chat could not be started.");
      showDashboardChatWidgetToast("This private chat could not be started.", getDashboardChatActiveToastThreadId());
      return null;
    }

    const participantIds = Array.from(new Set([currentUser.id, selectedParticipant.id].filter(Boolean)));
    const submitButton = form.querySelector("button[type='submit']");
    const previousSubmitState = submitButton
      ? {
          disabled: submitButton.disabled,
          ariaDisabled: submitButton.getAttribute("aria-disabled"),
          textContent: submitButton.textContent,
          title: submitButton.title,
        }
      : null;

    form.dataset.busy = "true";
    form.setAttribute("aria-busy", "true");
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.setAttribute("aria-disabled", "true");
      submitButton.title = "Starting chat...";
      submitButton.textContent = "Starting...";
    }
    syncDashboardChatDirectCreateForm(form);

    try {
      const result = await sendDashboardChatApiAction({
        action: "createThread",
        threadId: legacyThreadId,
        type: "dm",
        title: "Direct message",
        visibility: "private",
        participantIds,
        participants: [{
          id: currentUser.id,
          email: currentUser.email || "",
          username: currentUser.username || "",
          name: formatUserName(currentUser),
        }, selectedParticipant],
      });

      if (!result.ok) {
        logDashboardChatApiFailure("createDirectThread", result);
        setDashboardChatGroupCreateError(form, result.reason || "Could not start private chat.");
        showDashboardChatWidgetToast(result.reason || "Could not start private chat.", getDashboardChatActiveToastThreadId());
        return null;
      }

      const apiPayload = result.result || {};
      const rawCreatedThread = apiPayload.thread || {};
      const createdThreadCreatedAt = String(rawCreatedThread.createdAt || rawCreatedThread.created_at || new Date().toISOString()).trim();
      const createdThreadId = normalizeDashboardChatThreadId(
        rawCreatedThread.threadId || rawCreatedThread.legacyThreadId || rawCreatedThread.metadata?.legacyThreadId || legacyThreadId,
        legacyThreadId
      );
      const fallbackParticipants = participantIds.map((userId, index) => ({
        userId,
        id: userId,
        participantRole: index === 0 ? "owner" : "member",
        role: index === 0 ? "owner" : "member",
      }));
      const createdThread = {
        ...rawCreatedThread,
        threadId: createdThreadId,
        legacyThreadId: createdThreadId,
        type: rawCreatedThread.type || "dm",
        title: rawCreatedThread.title || "Direct message",
        visibility: rawCreatedThread.visibility || "private",
        createdAt: createdThreadCreatedAt,
        created_at: rawCreatedThread.created_at || createdThreadCreatedAt,
        participants: Array.isArray(rawCreatedThread.participants) && rawCreatedThread.participants.length
          ? rawCreatedThread.participants
          : fallbackParticipants,
        permissions: rawCreatedThread.permissions || {},
        metadata: {
          ...(rawCreatedThread.metadata || {}),
          legacyThreadId: createdThreadId,
        },
      };
      const payloadThreads = Array.isArray(apiPayload.threads)
        ? apiPayload.threads.filter((thread) => {
            const threadId = normalizeDashboardChatThreadId(
              thread?.threadId || thread?.legacyThreadId || thread?.metadata?.legacyThreadId || "",
              ""
            );
            return threadId !== createdThreadId;
          })
        : [];

      applyDashboardChatApiPayload(
        {
          ...apiPayload,
          thread: createdThread,
          threads: [createdThread, ...payloadThreads],
        },
        { threadId: createdThreadId }
      );
      setDashboardChatMessageSearchQuery("");
      writeDashboardChatWidgetState({
        isOpen: true,
        selectedThreadId: createdThreadId,
      });
      setDashboardChatGroupCreatorOpen(false);
      form.reset();
      renderDashboardChatWidget();
      focusDashboardChatWidgetComposer();
      showDashboardChatWidgetToast(`Chat opened${selectedParticipant.name ? ` with ${selectedParticipant.name}` : ""}.`, createdThreadId);
      queueDashboardChatThreadSummaryRefresh({ delayMs: 0, render: true });
      if (typeof refreshDashboardChatFromApi === "function") {
        void refreshDashboardChatFromApi({ threadId: createdThreadId, forceNetwork: true });
      }
      return result.result?.thread || null;
    } catch (error) {
      logDashboardChatApiFailure("createDirectThread", {
        ok: false,
        status: 0,
        reason: error?.message || "Could not start private chat.",
        retryable: true,
      });
      setDashboardChatGroupCreateError(form, error?.message || "Could not start private chat.");
      showDashboardChatWidgetToast(error?.message || "Could not start private chat.", getDashboardChatActiveToastThreadId());
      return null;
    } finally {
      delete form.dataset.busy;
      form.removeAttribute("aria-busy");
      if (submitButton) {
        submitButton.disabled = Boolean(previousSubmitState?.disabled);
        if (previousSubmitState?.ariaDisabled === null) {
          submitButton.removeAttribute("aria-disabled");
        } else if (previousSubmitState?.ariaDisabled) {
          submitButton.setAttribute("aria-disabled", previousSubmitState.ariaDisabled);
        }
        submitButton.title = previousSubmitState?.title || "";
        submitButton.textContent = previousSubmitState?.textContent || "Start chat";
      }
      syncDashboardChatDirectCreateForm(form);
    }
  }

  async function createDashboardCustomGroupThreadFromForm(form) {
    if (!form || form.dataset.busy === "true") {
      return null;
    }

    const currentUser = getCurrentPlatformUser();
    const formData = new FormData(form);
    const title = normalizeDashboardChatGroupNameInput(formData.get("title")).slice(0, 80);
    const titleInput = form.querySelector("[data-dashboard-chat-group-name-input]");
    if (titleInput && titleInput.value !== title) {
      titleInput.value = title;
    }
    const avatarValue = normalizeDashboardChatGroupAvatarInput(formData.get("avatar")).slice(0, 800);
    const avatarInput = form.querySelector("[data-dashboard-chat-group-avatar-input]");
    if (avatarInput && avatarInput.value !== avatarValue) {
      avatarInput.value = avatarValue;
    }
    const avatarLabelValue = avatarValue.replace(/\s+/g, "").slice(0, 2).toUpperCase();
    const avatarPatch = avatarValue
      ? /^https?:\/\//i.test(avatarValue)
        ? { avatarUrl: avatarValue, avatarLabel: "" }
        : { avatarLabel: avatarLabelValue, avatarUrl: "" }
      : {};

    setDashboardChatGroupCreateError(form, "");

    const selectedParticipantInputs = Array.from(form.querySelectorAll("input[name='participantIds']:checked"));
    const selectedParticipants = selectedParticipantInputs
      .map((input) => ({
        id: String(input.value || "").trim(),
        email: String(input.dataset.dashboardChatGroupParticipantEmail || "").trim().toLowerCase(),
        username: String(input.dataset.dashboardChatGroupParticipantUsername || "").trim(),
        name: String(input.dataset.dashboardChatGroupParticipantName || "").trim(),
      }))
      .filter((participant) => participant.id || participant.email || participant.username);

    const selectedParticipantIds = Array.from(new Set(selectedParticipants.map((participant) => participant.id).filter(Boolean)));

    if (!currentUser?.id) {
      setDashboardChatGroupCreateError(form, "Sign in before creating a group.");
      showDashboardChatWidgetToast("Sign in before creating a group.", getDashboardChatActiveToastThreadId());
      return null;
    }

    if (title.length < dashboardChatGroupNameMinLength) {
      const message = `Add a group name with at least ${dashboardChatGroupNameMinLength} characters.`;
      setDashboardChatGroupCreateError(form, message);
      showDashboardChatWidgetToast(message, getDashboardChatActiveToastThreadId());
      return null;
    }

    if (!selectedParticipants.length) {
      setDashboardChatGroupCreateError(form, "Choose at least one teammate.");
      showDashboardChatWidgetToast("Choose at least one teammate.", getDashboardChatActiveToastThreadId());
      return null;
    }

    const legacyThreadId = createDashboardId("group");
    const participantIds = Array.from(new Set([currentUser.id, ...selectedParticipantIds].filter(Boolean)));
    const submitButton = form.querySelector("button[type='submit']");
    const previousSubmitState = submitButton
      ? {
          disabled: submitButton.disabled,
          ariaDisabled: submitButton.getAttribute("aria-disabled"),
          textContent: submitButton.textContent,
          title: submitButton.title,
        }
      : null;

    form.dataset.busy = "true";
    form.setAttribute("aria-busy", "true");
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.setAttribute("aria-disabled", "true");
      submitButton.title = "Creating group...";
      submitButton.textContent = "Creating...";
    }

    try {
      const result = await sendDashboardChatApiAction({
        action: "createThread",
        threadId: legacyThreadId,
        type: "group",
        title,
        visibility: "members",
        ...avatarPatch,
        participantIds,
        participants: [{
          id: currentUser.id,
          email: currentUser.email || "",
          username: currentUser.username || "",
          name: formatUserName(currentUser),
        },
        ...selectedParticipants],
      });

      if (!result.ok) {
        logDashboardChatApiFailure("createGroupThread", result);
        setDashboardChatGroupCreateError(form, result.reason || "Could not create group.");
        showDashboardChatWidgetToast(result.reason || "Could not create group.", getDashboardChatActiveToastThreadId());
        return null;
      }

      const apiPayload = result.result || {};
      const rawCreatedThread = apiPayload.thread || {};
      const createdThreadCreatedAt = String(rawCreatedThread.createdAt || rawCreatedThread.created_at || new Date().toISOString()).trim();
      const createdThreadId = normalizeDashboardChatThreadId(
        rawCreatedThread.threadId || rawCreatedThread.legacyThreadId || rawCreatedThread.metadata?.legacyThreadId || legacyThreadId,
        legacyThreadId
      );
      const fallbackParticipants = participantIds.map((userId, index) => ({
        userId,
        id: userId,
        participantRole: index === 0 ? "owner" : "member",
        role: index === 0 ? "owner" : "member",
      }));
      const createdThread = {
        ...rawCreatedThread,
        threadId: createdThreadId,
        legacyThreadId: createdThreadId,
        type: rawCreatedThread.type || "group",
        title: rawCreatedThread.title || title,
        visibility: rawCreatedThread.visibility || "members",
        createdAt: createdThreadCreatedAt,
        created_at: rawCreatedThread.created_at || createdThreadCreatedAt,
        participants: Array.isArray(rawCreatedThread.participants) && rawCreatedThread.participants.length
          ? rawCreatedThread.participants
          : fallbackParticipants,
        permissions: rawCreatedThread.permissions || { canManageParticipants: true },
        metadata: {
          ...(rawCreatedThread.metadata || {}),
          legacyThreadId: createdThreadId,
          ...avatarPatch,
        },
      };
      const payloadThreads = Array.isArray(apiPayload.threads)
        ? apiPayload.threads.filter((thread) => {
            const threadId = normalizeDashboardChatThreadId(
              thread?.threadId || thread?.legacyThreadId || thread?.metadata?.legacyThreadId || "",
              ""
            );
            return threadId !== createdThreadId;
          })
        : [];
      if (dashboardChatThreadSettings?.write) {
        dashboardChatThreadSettings.write(createdThreadId, {
          customTitle: title,
          avatarLabel: avatarPatch.avatarLabel || createdThread.metadata?.avatarLabel || "",
          avatarUrl: avatarPatch.avatarUrl || createdThread.metadata?.avatarUrl || "",
          createdAt: createdThreadCreatedAt,
        });
      }
      applyDashboardChatApiPayload(
        {
          ...apiPayload,
          thread: createdThread,
          threads: [createdThread, ...payloadThreads],
        },
        { threadId: createdThreadId }
      );
      setDashboardChatMessageSearchQuery("");
      writeDashboardChatWidgetState({
        isOpen: true,
        selectedThreadId: createdThreadId,
      });
      setDashboardChatGroupCreatorOpen(false);
      form.reset();
      renderDashboardChatWidget();
      focusDashboardChatWidgetComposer();
      showDashboardChatWidgetToast("Group created.", createdThreadId);
      queueDashboardChatThreadSummaryRefresh({ delayMs: 0, render: true });
      if (typeof refreshDashboardChatFromApi === "function") {
        void refreshDashboardChatFromApi({ threadId: createdThreadId, forceNetwork: true });
      }
      return result.result?.thread || null;
    } catch (error) {
      logDashboardChatApiFailure("createGroupThread", {
        ok: false,
        status: 0,
        reason: error?.message || "Could not create group.",
        retryable: true,
      });
      setDashboardChatGroupCreateError(form, error?.message || "Could not create group.");
      showDashboardChatWidgetToast(error?.message || "Could not create group.", getDashboardChatActiveToastThreadId());
      return null;
    } finally {
      delete form.dataset.busy;
      form.removeAttribute("aria-busy");
      if (submitButton) {
        submitButton.disabled = Boolean(previousSubmitState?.disabled);
        if (previousSubmitState?.ariaDisabled === null) {
          submitButton.removeAttribute("aria-disabled");
        } else if (previousSubmitState?.ariaDisabled) {
          submitButton.setAttribute("aria-disabled", previousSubmitState.ariaDisabled);
        }
        submitButton.title = previousSubmitState?.title || "";
        submitButton.textContent = previousSubmitState?.textContent || "Create group";
      }
      syncDashboardChatGroupCreateForm(form);
    }
  }

  return {
    setDashboardChatAttachmentDraft,
    uploadDashboardChatAttachmentFile,
    createDashboardChatAttachmentIntent,
    handleDashboardChatAttachmentInputChange,
    createDashboardAdvancedChatThread,
    setDashboardChatGroupCreateError,
    createDashboardDirectThreadFromForm,
    createDashboardCustomGroupThreadFromForm,
  };
}
