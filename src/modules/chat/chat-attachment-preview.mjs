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

function triggerDownload(url, name) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name || "attachment";
  anchor.rel = "noopener noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function createDashboardChatAttachmentPreview() {
  let previewRoot = null;
  const close = () => {
    previewRoot?.remove();
    previewRoot = null;
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
  const open = ({ url, name = "Attachment", mimeType = "" } = {}) => {
    if (!url) return;
    close();
    previewRoot = document.createElement("div");
    previewRoot.className = "dashboard-chat-attachment-preview";
    previewRoot.innerHTML = `
      <div class="dashboard-chat-attachment-preview-backdrop" data-chat-attachment-preview-close></div>
      <section class="dashboard-chat-attachment-preview-card" role="dialog" aria-modal="true" aria-label="Attachment preview">
        <header>
          <div><span>Attachment</span><strong>${html(name)}</strong></div>
          <div class="dashboard-chat-attachment-preview-actions">
            <button type="button" data-chat-attachment-preview-print>Print</button>
            <button type="button" data-chat-attachment-preview-download>Download</button>
            <button type="button" data-chat-attachment-preview-save>Save as</button>
            <a href="${html(url)}" target="_blank" rel="noopener noreferrer">Open tab</a>
            <button type="button" class="is-close" data-chat-attachment-preview-close aria-label="Close attachment preview">&times;</button>
          </div>
        </header>
        <div class="dashboard-chat-attachment-preview-body">
          ${isImage(mimeType, name)
            ? `<img src="${html(url)}" alt="${html(name)}">`
            : `<iframe src="${html(url)}" title="${html(name)}"></iframe>`}
        </div>
      </section>`;
    previewRoot.addEventListener("click", (event) => {
      if (event.target.closest("[data-chat-attachment-preview-close]")) close();
      if (event.target.closest("[data-chat-attachment-preview-download],[data-chat-attachment-preview-save]")) triggerDownload(url, name);
      if (event.target.closest("[data-chat-attachment-preview-print]")) print(url, name, mimeType);
    });
    document.body.append(previewRoot);
  };
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && previewRoot) close();
  });
  return { open, close };
}
