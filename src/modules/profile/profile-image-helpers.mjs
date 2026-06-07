export function createProfileImageDataUrl(file, options = {}) {
  const {
    documentRef = globalThis.document,
    ImageCtor = globalThis.Image,
    maxUploadDataUrlLength = 900000,
    URLRef = globalThis.URL,
  } = options;
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith("image/")) {
      reject(new Error("Choose an image file."));
      return;
    }
    if (file.size > 18 * 1024 * 1024) {
      reject(new Error("Choose an image under 18 MB."));
      return;
    }
    if (!ImageCtor || !documentRef?.createElement || !URLRef?.createObjectURL) {
      reject(new Error("The image could not be prepared."));
      return;
    }
    const image = new ImageCtor();
    const objectUrl = URLRef.createObjectURL(file);
    image.onload = () => {
      try {
        const naturalWidth = image.naturalWidth;
        const naturalHeight = image.naturalHeight;
        if (!naturalWidth || !naturalHeight) {
          throw new Error("The image could not be read.");
        }
        const outputSizes = [512, 448, 384, 320, 256, 192, 128];
        const outputFormats = [
          ["image/webp", [0.82, 0.72, 0.62, 0.52]],
          ["image/jpeg", [0.78, 0.68, 0.58, 0.48]],
        ];
        const sourceSize = Math.min(naturalWidth, naturalHeight);
        const sourceX = (naturalWidth - sourceSize) / 2;
        const sourceY = (naturalHeight - sourceSize) / 2;
        const imageCanvas = documentRef.createElement("canvas");
        const imageContext = imageCanvas.getContext("2d");
        if (!imageContext) {
          throw new Error("The image could not be prepared.");
        }
        let fallbackDataUrl = "";
        for (const outputSize of outputSizes) {
          imageCanvas.width = outputSize;
          imageCanvas.height = outputSize;
          imageContext.clearRect(0, 0, outputSize, outputSize);
          imageContext.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize);
          for (const [format, qualities] of outputFormats) {
            for (const quality of qualities) {
              const candidate = imageCanvas.toDataURL(format, quality);
              if (!fallbackDataUrl || candidate.length < fallbackDataUrl.length) {
                fallbackDataUrl = candidate;
              }
              if (candidate.length <= maxUploadDataUrlLength) {
                resolve(candidate);
                return;
              }
            }
          }
        }
        if (fallbackDataUrl.length <= maxUploadDataUrlLength) {
          resolve(fallbackDataUrl);
          return;
        }
        throw new Error("Profile image is still too large. Choose a simpler image under 1 MB.");
      } catch (error) {
        reject(error);
      } finally {
        URLRef.revokeObjectURL?.(objectUrl);
      }
    };
    image.onerror = () => {
      URLRef.revokeObjectURL?.(objectUrl);
      reject(new Error("The image could not be read."));
    };
    image.src = objectUrl;
  });
}
