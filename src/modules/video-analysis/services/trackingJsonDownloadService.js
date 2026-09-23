export function downloadTrackingJson(win = null, json = "", fileName = "artifact.json") {
  const anchor = win?.document?.createElement?.("a");
  const BlobConstructor = win?.Blob || globalThis.Blob;
  if (!anchor || !BlobConstructor || !win?.URL?.createObjectURL) return false;
  const objectUrl = win.URL.createObjectURL(new BlobConstructor([json], { type: "application/json" }));
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  win.document.body?.appendChild?.(anchor);
  anchor.click();
  anchor.remove?.();
  win.setTimeout?.(() => win.URL.revokeObjectURL?.(objectUrl), 0);
  return true;
}
