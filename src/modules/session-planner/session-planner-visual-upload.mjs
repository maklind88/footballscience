export const sessionPlannerVisualUploadMaxSide = 1600;
export const sessionPlannerVisualUploadMaxPassthroughBytes = 700000;
export const sessionPlannerVisualUploadQuality = 0.84;
export const sessionPlannerVisualUploadPassthroughTypes = Object.freeze(["image/gif", "image/svg+xml"]);

export function createSessionPlannerVisualUploadHelpers(options = {}) {
  const getFileReader = typeof options.getFileReader === "function"
    ? options.getFileReader
    : () => new globalThis.FileReader();
  const getImage = typeof options.getImage === "function" ? options.getImage : () => new globalThis.Image();
  const getDocument = typeof options.getDocument === "function" ? options.getDocument : () => globalThis.document;
  const maxSide = Number(options.maxSide) || sessionPlannerVisualUploadMaxSide;
  const maxPassthroughBytes =
    Number(options.maxPassthroughBytes) || sessionPlannerVisualUploadMaxPassthroughBytes;
  const quality = Number(options.quality) || sessionPlannerVisualUploadQuality;
  const passthroughTypes = new Set(options.passthroughTypes || sessionPlannerVisualUploadPassthroughTypes);

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = getFileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")));
      reader.addEventListener("error", () => reject(reader.error || new Error("Image could not be read.")));
      reader.readAsDataURL(file);
    });
  }

  function loadUploadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = getImage();
      image.addEventListener("load", () => resolve(image));
      image.addEventListener("error", () => reject(new Error("Image could not be loaded.")));
      image.src = dataUrl;
    });
  }

  async function normalizeVisualUpload(file) {
    const originalDataUrl = await readFileAsDataUrl(file);
    if (passthroughTypes.has(file.type)) {
      return originalDataUrl;
    }
    try {
      const image = await loadUploadImage(originalDataUrl);
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      const largestSide = Math.max(sourceWidth, sourceHeight);
      if (file.size <= maxPassthroughBytes && largestSide <= maxSide) {
        return originalDataUrl;
      }
      const scale = Math.min(1, maxSide / largestSide);
      const canvas = getDocument().createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        return originalDataUrl;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", quality);
    } catch {
      return originalDataUrl;
    }
  }

  return Object.freeze({
    readFileAsDataUrl,
    loadUploadImage,
    normalizeVisualUpload,
  });
}
