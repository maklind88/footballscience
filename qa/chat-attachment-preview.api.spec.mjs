import { expect, test } from "@playwright/test";
import { renderDashboardChatAttachmentPreviewShell } from "../src/modules/chat/chat-attachment-preview.mjs";

test("chat attachment preview shell has a render target and classic file actions", () => {
  const html = renderDashboardChatAttachmentPreviewShell();

  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-modal="true"');
  expect(html).toContain("data-chat-attachment-preview-body");
  expect(html).toContain("data-chat-attachment-preview-previous");
  expect(html).toContain("data-chat-attachment-preview-next");
  expect(html).toContain("data-chat-attachment-preview-download");
  expect(html).toContain("data-chat-attachment-preview-save");
  expect(html).toContain("data-chat-attachment-preview-print");
  expect(html).toContain("data-chat-attachment-preview-open");
  expect(html).toContain("data-chat-attachment-preview-close");
});
