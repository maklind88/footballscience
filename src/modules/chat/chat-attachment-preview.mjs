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

function isImage(mimeType = "", name = "") {
  return String(mimeType).startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/i.test(String(name));
}

function isPdf(mimeType = "", name = "") {
  return String(mimeType).includes("pdf") || /\.pdf$/i.test(String(name));
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

export function createDashboardChatAttachmentPreview() {
  let previewRoot = null;
  let previewObjectUrl = "";
  const close = () => {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = "";
    previewRoot?.remove();
    previewRoot = null;
  };
  const setOpenLink = (url) => {
    const openLink = previewRoot?.querySelector("[data-chat-attachment-preview-open]");
    if (openLink) openLink.href = url;
  };
  const print = (url, name, mimeType) => {
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1100,height=800");
    if (!printWindow) return;
    const body = isImage(mimeType, name)
      ? `<img src="${html(url)}" alt="${html(name)}" style="max-width:100%;height:auto;display:block;margin:auto">`
      : `<iframe src="${html(url)}" title="${html(name)}" style="width:100%;height:100vh;border:0"></iframe>`;
    printWindow.document.write(`<!doctype html><title>${html(name)}</title><body style="margin:0;background:#fff">${body}<script>setTimeout(()=>{focus();print();},900)<\/script></body>`);
    printWindow.document.close();
  };
  const renderPreview = (body, label = "Preview") => {
    if (!previewRoot) return;
    const labelNode = previewRoot.querySelector("[data-chat-attachment-preview-label]");
    const bodyNode = previewRoot.querySelector("[data-chat-attachment-preview-body]");
    if (labelNode) labelNode.textContent = label;
    if (bodyNode) bodyNode.innerHTML = body;
  };
  const renderFilePreview = (url, name, mimeType) => {
    setOpenLink(url);
    if (isImage(mimeType, name)) {
      renderPreview(`<img src="${html(url)}" alt="${html(name)}">`);
      return;
    }
    if (isPdf(mimeType, name) || String(mimeType).startsWith("text/")) {
      renderPreview(`<iframe src="${html(url)}" title="${html(name)}"></iframe>`);
      return;
    }
    renderPreview(
      `<div style="display:grid;gap:.7rem;place-items:center;text-align:center;color:#334155"><strong>Preview unavailable</strong><span>This file type cannot be previewed here. Use Download, Save as, or Open tab.</span></div>`,
      "File ready"
    );
  };
  const loadPreviewBlob = async (url, name, mimeType) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Preview request failed.");
      const blob = await response.blob();
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = URL.createObjectURL(blob);
      renderFilePreview(previewObjectUrl, name, blob.type || mimeType);
    } catch {
      if (isImage(mimeType, name)) {
        renderFilePreview(url, name, mimeType);
        return;
      }
      renderPreview(
        `<div style="display:grid;gap:.7rem;place-items:center;text-align:center;color:#334155"><strong>Preview blocked</strong><span>The file cannot be embedded in this browser. Download it or open it in a new tab.</span></div>`,
        "Preview blocked"
      );
    }
  };
  const open = ({ url, name = "Attachment", mimeType = "" } = {}) => {
    if (!url) return;
    close();
    previewRoot = document.createElement("div");
    previewRoot.className = "dashboard-chat-attachment-preview";
    previewRoot.innerHTML = `
      <div class="dashboard-chat-attachment-preview-backdrop" data-chat-attachment-preview-close></div>
      <section class="dashboard-chat-attachment-preview-card" role="dialog" aria-modal="true" aria-label="Attachment preview">
        <header>
          <div><span data-chat-attachment-preview-label>Preparing preview</span><strong>${html(name)}</strong></div>
          <div class="dashboard-chat-attachment-preview-actions">
            <button type="button" data-chat-attachment-preview-print>Print</button>
            <button type="button" data-chat-attachment-preview-download>Download</button>
            <button type="button" data-chat-attachment-preview-save>Save as</button>
            <a href="${html(url)}" target="_blank" rel="noopener noreferrer" data-chat-attachment-preview-open>Open tab</a>
            <button type="button" class="is-close" data-chat-attachment-preview-close aria-label="Close attachment preview">&times;</button>
          </div>
        </header>
        <div class="dashboard-chat-attachment-preview-body" data-chat-attachment-preview-body>
          <div style="display:grid;gap:.7rem;place-items:center;text-align:center;color:#334155"><strong>Preparing preview...</strong><span>Securely loading the attachment.</span></div>
        </div>
      </section>`;
    previewRoot.addEventListener("click", (event) => {
      if (event.target.closest("[data-chat-attachment-preview-close]")) close();
      if (event.target.closest("[data-chat-attachment-preview-download]")) triggerDownload(previewObjectUrl || url, name);
      if (event.target.closest("[data-chat-attachment-preview-save]")) saveAttachmentAs(previewObjectUrl || url, name).catch(() => triggerDownload(previewObjectUrl || url, name));
      if (event.target.closest("[data-chat-attachment-preview-print]")) print(previewObjectUrl || url, name, mimeType);
    });
    document.body.append(previewRoot);
    void loadPreviewBlob(url, name, mimeType);
  };
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && previewRoot) close();
  });
  return { open, close };
}
