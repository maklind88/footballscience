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

function isSvgLogoFile(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  return type === "image/svg+xml" || name.endsWith(".svg");
}

function validateImageFile(file) {
  if (!file || (!String(file.type || "").startsWith("image/") && !isSvgLogoFile(file))) {
    throw new Error("Choose an image file.");
  }
  if (file.size > 18 * 1024 * 1024) {
    throw new Error("Choose an image under 18 MB.");
  }
}

function assertSafeSvgLogo(svgText) {
  const source = String(svgText || "").trim();
  if (!source || !/<svg[\s>]/i.test(source)) {
    throw new Error("The logo could not be read.");
  }
  const unsafePattern =
    /<\s*(script|foreignObject|iframe|object|embed)\b|\son[a-z]+\s*=|javascript:|data:text\/html|url\(\s*['"]?(?:https?:|javascript:|data:text\/html)|(?:href|xlink:href)\s*=\s*["']\s*(?!#|data:image\/(?:png|jpe?g|gif|webp);base64,)/i;
  if (unsafePattern.test(source)) {
    throw new Error("Choose a simpler SVG logo without scripts or external references.");
  }
  return source;
}

async function createSvgLogoDataUrl(file, maxUploadDataUrlLength) {
  if (typeof file.text !== "function") {
    throw new Error("The logo could not be read.");
  }
  const svgText = assertSafeSvgLogo(await file.text());
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  if (dataUrl.length > maxUploadDataUrlLength) {
    throw new Error("Team logo is too large. Choose a simpler SVG or image under 1 MB.");
  }
  return dataUrl;
}

function createRasterTeamLogoDataUrl(file, options) {
  const {
    documentRef = globalThis.document,
    ImageCtor = globalThis.Image,
    maxUploadDataUrlLength = 900000,
    URLRef = globalThis.URL,
  } = options;
  return new Promise((resolve, reject) => {
    if (!ImageCtor || !documentRef?.createElement || !URLRef?.createObjectURL) {
      reject(new Error("The logo could not be prepared."));
      return;
    }
    const image = new ImageCtor();
    const objectUrl = URLRef.createObjectURL(file);
    image.onload = () => {
      try {
        const naturalWidth = image.naturalWidth;
        const naturalHeight = image.naturalHeight;
        if (!naturalWidth || !naturalHeight) {
          throw new Error("The logo could not be read.");
        }
        const outputSizes = [512, 448, 384, 320, 256, 192, 128];
        const outputFormats = [
          ["image/webp", [0.86, 0.76, 0.66, 0.56]],
          ["image/png", [undefined]],
        ];
        const logoCanvas = documentRef.createElement("canvas");
        const logoContext = logoCanvas.getContext("2d");
        if (!logoContext) {
          throw new Error("The logo could not be prepared.");
        }
        logoContext.imageSmoothingEnabled = true;
        logoContext.imageSmoothingQuality = "high";
        let fallbackDataUrl = "";
        for (const outputSize of outputSizes) {
          logoCanvas.width = outputSize;
          logoCanvas.height = outputSize;
          logoContext.imageSmoothingEnabled = true;
          logoContext.imageSmoothingQuality = "high";
          logoContext.clearRect(0, 0, outputSize, outputSize);
          const inset = Math.max(10, Math.round(outputSize * 0.07));
          const availableSize = outputSize - inset * 2;
          const scale = Math.min(availableSize / naturalWidth, availableSize / naturalHeight);
          const targetWidth = Math.max(1, Math.round(naturalWidth * scale));
          const targetHeight = Math.max(1, Math.round(naturalHeight * scale));
          const targetX = Math.round((outputSize - targetWidth) / 2);
          const targetY = Math.round((outputSize - targetHeight) / 2);
          logoContext.drawImage(image, 0, 0, naturalWidth, naturalHeight, targetX, targetY, targetWidth, targetHeight);
          for (const [format, qualities] of outputFormats) {
            for (const quality of qualities) {
              const candidate =
                typeof quality === "number" ? logoCanvas.toDataURL(format, quality) : logoCanvas.toDataURL(format);
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
        throw new Error("Team logo is too large. Choose a simpler SVG or image under 1 MB.");
      } catch (error) {
        reject(error);
      } finally {
        URLRef.revokeObjectURL?.(objectUrl);
      }
    };
    image.onerror = () => {
      URLRef.revokeObjectURL?.(objectUrl);
      reject(new Error("The logo could not be read."));
    };
    image.src = objectUrl;
  });
}

export async function createTeamLogoDataUrl(file, options = {}) {
  const { maxUploadDataUrlLength = 900000 } = options;
  validateImageFile(file);
  if (isSvgLogoFile(file)) {
    return createSvgLogoDataUrl(file, maxUploadDataUrlLength);
  }
  return createRasterTeamLogoDataUrl(file, options);
}
