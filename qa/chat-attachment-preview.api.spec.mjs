import { expect, test } from "@playwright/test";
import { createDashboardChatAttachmentRenderer } from "../src/modules/chat/chat-attachment-renderer.mjs";
import { renderDashboardChatAttachmentPreviewShell } from "../src/modules/chat/chat-attachment-preview.mjs";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

test("chat attachment preview shell has a render target and classic file actions", () => {
  const html = renderDashboardChatAttachmentPreviewShell();

  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-modal="true"');
  expect(html).toContain('aria-labelledby="dashboardChatAttachmentPreviewTitle"');
  expect(html).toContain('aria-describedby="dashboardChatAttachmentPreviewStatus"');
  expect(html).toContain('aria-keyshortcuts="Escape ArrowLeft ArrowRight"');
  expect(html).toContain('id="dashboardChatAttachmentPreviewTitle"');
  expect(html).toContain('id="dashboardChatAttachmentPreviewStatus"');
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain('aria-atomic="true"');
  expect(html).toContain("data-chat-attachment-preview-body");
  expect(html).toContain("data-chat-attachment-preview-previous");
  expect(html).toContain("data-chat-attachment-preview-next");
  expect(html).toContain('aria-keyshortcuts="ArrowLeft"');
  expect(html).toContain('aria-keyshortcuts="ArrowRight"');
  expect(html).toContain("data-chat-attachment-preview-download");
  expect(html).toContain("data-chat-attachment-preview-save");
  expect(html).toContain("data-chat-attachment-preview-print");
  expect(html).toContain("data-chat-attachment-preview-open");
  expect(html).toContain("data-chat-attachment-preview-close");
});

test("chat message attachments render as evidence cards without losing preview wiring", () => {
  const renderer = createDashboardChatAttachmentRenderer({
    escapeHtml,
    getSupabaseClient: () => null,
  });
  const html = renderer.renderMessageAttachments({
    attachments: [
      {
        bucket: "chat-attachments",
        path: "qa/final-third-map.png",
        fileName: "final-third-map.png",
        mimeType: "image/png",
        byte_size: 2048,
        status: "ready",
      },
    ],
  });

  expect(html).toContain("dashboard-chat-evidence-card");
  expect(html).toContain("dashboard-chat-evidence-icon is-image");
  expect(html).toContain("Image evidence");
  expect(html).toContain("data-dashboard-chat-attachment-preview");
  expect(html).toContain("data-dashboard-chat-attachment-status");
  expect(html).toContain("2 KB · preparing");
});
