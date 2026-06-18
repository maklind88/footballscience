function safeText(value) {
  return String(value || "");
}

function html(value) {
  return safeText(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function normalizeAttachmentItem(value = {}) {
  return {
    url: safeText(value.url || value.href).trim(),
    name: safeText(value.name || value.fileName || value.file_name || "Attachment").trim() || "Attachment",
    mimeType: safeText(value.mimeType || value.mime_type || value.type).trim().toLowerCase(),
  };
}

function extensionForName(name = "") {
  const match = safeText(name).toLowerCase().match(/\.([a-z0-9]{2,8})$/);
  return match ? match[1] : "";
}

function getPreviewKind(mimeType = "", name = "") {
  const type = safeText(mimeType).toLowerCase();
  const extension = extensionForName(name);
  if (type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "avif"].includes(extension)) return "image";
  if (type.includes("pdf") || extension === "pdf") return "pdf";
  if (type.startsWith("video/") || ["mp4", "mov", "m4v", "webm"].includes(extension)) return "video";
  if (type.startsWith("audio/") || ["mp3", "wav", "m4a", "ogg"].includes(extension)) return "audio";
  if (type.startsWith("text/") || ["txt", "csv", "md", "json"].includes(extension)) return "text";
  return "file";
}

function getKindLabel(kind = "file") {
  return {
    image: "Image preview",
    pdf: "PDF preview",
    video: "Video preview",
    audio: "Audio preview",
    text: "Text preview",
    file: "File ready",
  }[kind] || "File ready";
}

function triggerDownload(url, name) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name || "attachment";
  anchor.rel = "noopener noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

async function saveAttachmentAs(url, name) {
  if (!window.showSaveFilePicker) {
    triggerDownload(url, name);
    return;
  }
  const response = await fetch(url);
  if (!response.ok) {
    triggerDownload(url, name);
    return;
  }
  const blob = await response.blob();
  const handle = await window.showSaveFilePicker({
    suggestedName: name || "attachment",
  });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function previewUnavailableMarkup(name, message = "This file type cannot be previewed here.") {
  return `
    <div class="dashboard-chat-attachment-preview-empty" role="status" aria-live="polite">
      <span aria-hidden="true">FILE</span>
      <strong>${html(name)}</strong>
      <p>${html(message)} Use Download, Save as, or Open tab.</p>
      <button type="button" data-chat-attachment-preview-retry aria-label="Retry attachment preview">Retry preview</button>
    </div>
  `;
}

export function renderDashboardChatAttachmentPreviewShell() {
  return `
      <div class="dashboard-chat-attachment-preview-backdrop" data-chat-attachment-preview-close></div>
      <section class="dashboard-chat-attachment-preview-card" role="dialog" aria-modal="true" aria-labelledby="dashboardChatAttachmentPreviewTitle" aria-describedby="dashboardChatAttachmentPreviewStatus" aria-keyshortcuts="Escape ArrowLeft ArrowRight">
        <header>
          <div class="dashboard-chat-attachment-preview-title-block">
            <span data-chat-attachment-preview-label>Preparing preview</span>
            <strong id="dashboardChatAttachmentPreviewTitle" data-chat-attachment-preview-title>Attachment</strong>
            <small id="dashboardChatAttachmentPreviewStatus" data-chat-attachment-preview-count aria-live="polite" aria-atomic="true">1 file</small>
          </div>
          <div class="dashboard-chat-attachment-preview-actions" role="toolbar" aria-label="Attachment actions">
            <button type="button" data-chat-attachment-preview-previous aria-label="Previous attachment" aria-keyshortcuts="ArrowLeft">Prev</button>
            <button type="button" data-chat-attachment-preview-next aria-label="Next attachment" aria-keyshortcuts="ArrowRight">Next</button>
            <button type="button" data-chat-attachment-preview-print>Print</button>
            <button type="button" data-chat-attachment-preview-download>Download</button>
            <button type="button" data-chat-attachment-preview-save>Save as</button>
            <a href="#" target="_blank" rel="noopener noreferrer" data-chat-attachment-preview-open>Open tab</a>
            <button type="button" class="is-close" data-chat-attachment-preview-close aria-label="Close attachment preview">&times;</button>
          </div>
        </header>
        <div class="dashboard-chat-attachment-preview-body" data-chat-attachment-preview-body></div>
      </section>`;
}

export function createDashboardChatAttachmentPreview() {
  let previewRoot = null;
  let previewObjectUrl = "";
  let previewLoadToken = 0;
  let previousActiveElement = null;
  let previousBodyOverflow = "";
  let state = { items: [], index: 0 };

  const currentItem = () => state.items[state.index] || null;
  const canNavigatePreview = () => state.items.length > 1;

  const revokeObjectUrl = () => {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = "";
  };

  const close = () => {
    previewLoadToken += 1;
    revokeObjectUrl();
    previewRoot?.remove();
    previewRoot = null;
    document.body.style.overflow = previousBodyOverflow;
    previousBodyOverflow = "";
    previousActiveElement?.focus?.();
    previousActiveElement = null;
    state = { items: [], index: 0 };
  };

  const setToolbarState = () => {
    if (!previewRoot) return;
    const item = currentItem();
    const total = state.items.length;
    const kind = getPreviewKind(item?.mimeType, item?.name);
    const title = previewRoot.querySelector("[data-chat-attachment-preview-title]");
    const label = previewRoot.querySelector("[data-chat-attachment-preview-label]");
    const count = previewRoot.querySelector("[data-chat-attachment-preview-count]");
    const openLink = previewRoot.querySelector("[data-chat-attachment-preview-open]");
    const previous = previewRoot.querySelector("[data-chat-attachment-preview-previous]");
    const next = previewRoot.querySelector("[data-chat-attachment-preview-next]");
    const singleAttachment = total <= 1;
    if (title) title.textContent = item?.name || "Attachment";
    if (label) label.textContent = getKindLabel(kind);
    if (count) count.textContent = total > 1 ? `${state.index + 1} of ${total}` : "1 file";
    if (openLink) openLink.href = item?.url || "#";
    if (previous) {
      previous.disabled = singleAttachment;
      previous.setAttribute("aria-disabled", String(singleAttachment));
      previous.title = singleAttachment ? "Only one attachment" : "Previous attachment";
    }
    if (next) {
      next.disabled = singleAttachment;
      next.setAttribute("aria-disabled", String(singleAttachment));
      next.title = singleAttachment ? "Only one attachment" : "Next attachment";
    }
  };

  const renderPreview = (body) => {
    const bodyNode = previewRoot?.querySelector("[data-chat-attachment-preview-body]");
    if (bodyNode) bodyNode.innerHTML = body;
  };

  const renderFilePreview = (url, name, mimeType) => {
    const kind = getPreviewKind(mimeType, name);
    setToolbarState();
    if (kind === "image") {
      renderPreview(`<img src="${html(url)}" alt="${html(name)}">`);
      return;
    }
    if (kind === "pdf") {
      renderPreview(`<iframe src="${html(url)}#toolbar=1&navpanes=0" title="${html(name)}"></iframe>`);
      return;
    }
    if (kind === "video") {
      renderPreview(`<video controls playsinline src="${html(url)}" aria-label="${html(name)}"></video>`);
      return;
    }
    if (kind === "audio") {
      renderPreview(`<div class="dashboard-chat-attachment-preview-empty"><span aria-hidden="true">AUDIO</span><strong>${html(name)}</strong><audio controls src="${html(url)}"></audio></div>`);
      return;
    }
    if (kind === "text") {
      renderPreview(`<iframe src="${html(url)}" title="${html(name)}"></iframe>`);
      return;
    }
    renderPreview(previewUnavailableMarkup(name));
  };

  const loadPreviewBlob = async (item) => {
    if (!item?.url) return;
    const loadToken = previewLoadToken + 1;
    previewLoadToken = loadToken;
    revokeObjectUrl();
    renderPreview(`
      <div class="dashboard-chat-attachment-preview-empty is-loading" role="status" aria-live="polite">
        <span aria-hidden="true">...</span>
        <strong>Preparing preview</strong>
        <p>Securely loading the attachment.</p>
      </div>
    `);
    try {
      const response = await fetch(item.url, { credentials: "same-origin" });
      if (loadToken !== previewLoadToken) return;
      if (!response.ok) throw new Error("Preview request failed.");
      const blob = await response.blob();
      if (loadToken !== previewLoadToken) return;
      previewObjectUrl = URL.createObjectURL(blob);
      renderFilePreview(previewObjectUrl, item.name, blob.type || item.mimeType);
    } catch {
      if (loadToken !== previewLoadToken) return;
      const kind = getPreviewKind(item.mimeType, item.name);
      if (kind === "image" || kind === "video" || kind === "audio") {
        renderFilePreview(item.url, item.name, item.mimeType);
        return;
      }
      renderPreview(previewUnavailableMarkup(item.name, "The browser blocked the embedded preview."));
    }
  };

  const showIndex = (nextIndex) => {
    if (!state.items.length || !canNavigatePreview()) return;
    state.index = (nextIndex + state.items.length) % state.items.length;
    setToolbarState();
    void loadPreviewBlob(currentItem());
  };

  const print = (item) => {
    if (!item?.url) return;
    const printableUrl = previewObjectUrl || item.url;
    const kind = getPreviewKind(item.mimeType, item.name);
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1100,height=800");
    if (!printWindow) return;
    const body = kind === "image"
      ? `<img src="${html(printableUrl)}" alt="${html(item.name)}" style="max-width:100%;height:auto;display:block;margin:auto">`
      : `<iframe src="${html(printableUrl)}" title="${html(item.name)}" style="width:100%;height:100vh;border:0"></iframe>`;
    printWindow.document.write(`<!doctype html><title>${html(item.name)}</title><body style="margin:0;background:#fff">${body}<script>setTimeout(()=>{focus();print();},900)<\/script></body>`);
    printWindow.document.close();
  };

  const keepFocusInsidePreview = (event) => {
    if (!previewRoot || event.key !== "Tab") return;
    const focusable = [...previewRoot.querySelectorAll("button,a,input,select,textarea,[tabindex]:not([tabindex='-1'])")]
      .filter((node) => !node.disabled && node.offsetParent !== null);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const open = ({ url, name = "Attachment", mimeType = "", items = [], index = 0 } = {}) => {
    const normalizedItems = (Array.isArray(items) ? items : [])
      .map(normalizeAttachmentItem)
      .filter((item) => item.url);
    const fallbackItem = normalizeAttachmentItem({ url, name, mimeType });
    const nextItems = normalizedItems.length ? normalizedItems : fallbackItem.url ? [fallbackItem] : [];
    if (!nextItems.length) return;
    const safeIndex = Math.max(0, Math.min(Number(index) || 0, nextItems.length - 1));
    close();
    state = { items: nextItems, index: safeIndex };
    previousActiveElement = document.activeElement;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    previewRoot = document.createElement("div");
    previewRoot.className = "dashboard-chat-attachment-preview";
    previewRoot.innerHTML = renderDashboardChatAttachmentPreviewShell();
    previewRoot.addEventListener("click", (event) => {
      const item = currentItem();
      if (event.target.closest("[data-chat-attachment-preview-close]")) {
        close();
        return;
      }
      if (event.target.closest("[data-chat-attachment-preview-previous]")) {
        showIndex(state.index - 1);
        return;
      }
      if (event.target.closest("[data-chat-attachment-preview-next]")) {
        showIndex(state.index + 1);
        return;
      }
      if (event.target.closest("[data-chat-attachment-preview-download]") && item) {
        triggerDownload(previewObjectUrl || item.url, item.name);
        return;
      }
      if (event.target.closest("[data-chat-attachment-preview-save]") && item) {
        saveAttachmentAs(previewObjectUrl || item.url, item.name).catch(() => triggerDownload(previewObjectUrl || item.url, item.name));
        return;
      }
      if (event.target.closest("[data-chat-attachment-preview-print]") && item) {
        print(item);
        return;
      }
      if (event.target.closest("[data-chat-attachment-preview-retry]") && item) {
        void loadPreviewBlob(item);
      }
    });
    document.body.append(previewRoot);
    setToolbarState();
    previewRoot.querySelector("[data-chat-attachment-preview-close]")?.focus();
    void loadPreviewBlob(currentItem());
  };

  document.addEventListener("keydown", (event) => {
    keepFocusInsidePreview(event);
    if (!previewRoot) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (canNavigatePreview()) showIndex(state.index - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (canNavigatePreview()) showIndex(state.index + 1);
    }
  });

  return { open, close };
}
