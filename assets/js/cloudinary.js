(() => {
  "use strict";

  const cloudName = "woo17b49";
  const uploadPreset = "hapycure_dishes";
  const maxFileSize = 5 * 1024 * 1024;
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  const targetMinBytes = 30 * 1024;
  const targetMaxBytes = 50 * 1024;
  const maxDimension = 1200;
  const minDimension = 420;

  function validateImage(file) {
    if (!file) throw new Error("Choose an image first.");
    if (!allowedTypes.includes(file.type)) {
      throw new Error("Only JPG, PNG and WebP images are allowed.");
    }
    if (file.size > maxFileSize) {
      throw new Error("Image must be smaller than 5 MB.");
    }
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error("This browser could not optimize the image."));
      }, "image/webp", quality);
    });
  }

  async function decodeImage(file) {
    if ("createImageBitmap" in window) {
      let bitmap;
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch (_) {
        bitmap = await createImageBitmap(file);
      }
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close()
      };
    }

    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: () => URL.revokeObjectURL(objectUrl)
      });
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("The selected image could not be opened."));
      };
      image.src = objectUrl;
    });
  }

  function fitDimensions(width, height, limit) {
    const scale = Math.min(1, limit / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    };
  }

  async function compressToWebP(file) {
    validateImage(file);
    const decoded = await decodeImage(file);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      decoded.release();
      throw new Error("Image optimization is not supported by this browser.");
    }

    let dimensions = fitDimensions(decoded.width, decoded.height, maxDimension);
    let bestBlob = null;
    let bestWidth = dimensions.width;
    let bestHeight = dimensions.height;
    let bestQuality = .88;

    try {
      for (let resizeAttempt = 0; resizeAttempt < 8; resizeAttempt += 1) {
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

        let lowQuality = .42;
        let highQuality = .92;
        let attemptBlob = null;
        let attemptQuality = lowQuality;

        for (let qualityAttempt = 0; qualityAttempt < 8; qualityAttempt += 1) {
          const quality = (lowQuality + highQuality) / 2;
          const blob = await canvasToBlob(canvas, quality);

          if (blob.size <= targetMaxBytes) {
            attemptBlob = blob;
            attemptQuality = quality;
            lowQuality = quality;
          } else {
            highQuality = quality;
          }
        }

        if (attemptBlob) {
          bestBlob = attemptBlob;
          bestWidth = canvas.width;
          bestHeight = canvas.height;
          bestQuality = attemptQuality;
          break;
        }

        const longestSide = Math.max(dimensions.width, dimensions.height);
        if (longestSide <= minDimension) break;
        dimensions = {
          width: Math.max(1, Math.round(dimensions.width * .82)),
          height: Math.max(1, Math.round(dimensions.height * .82))
        };
      }

      if (!bestBlob) {
        bestBlob = await canvasToBlob(canvas, .38);
        bestWidth = canvas.width;
        bestHeight = canvas.height;
        bestQuality = .38;
      }
    } finally {
      decoded.release();
    }

    const cleanName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-") || "dish";
    return {
      file: new File([bestBlob], `${cleanName}.webp`, { type: "image/webp" }),
      originalBytes: file.size,
      optimizedBytes: bestBlob.size,
      width: bestWidth,
      height: bestHeight,
      quality: bestQuality,
      withinTargetRange: bestBlob.size >= targetMinBytes && bestBlob.size <= targetMaxBytes
    };
  }

  async function uploadImage(file, onProgress = () => {}, onStage = () => {}) {
    validateImage(file);
    onStage({ stage: "optimizing" });
    const optimized = await compressToWebP(file);
    onStage({
      stage: "uploading",
      originalBytes: optimized.originalBytes,
      optimizedBytes: optimized.optimizedBytes,
      width: optimized.width,
      height: optimized.height
    });

    const uploaded = await new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", optimized.file);
      formData.append("upload_preset", uploadPreset);

      const request = new XMLHttpRequest();
      request.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);

      request.upload.addEventListener("progress", event => {
        if (!event.lengthComputable) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      });

      request.addEventListener("load", () => {
        let response;
        try {
          response = JSON.parse(request.responseText);
        } catch (_) {
          reject(new Error("Cloudinary returned an invalid response."));
          return;
        }

        if (request.status < 200 || request.status >= 300 || !response.secure_url) {
          reject(new Error(response?.error?.message || "Image upload failed."));
          return;
        }

        resolve({
          secureUrl: response.secure_url,
          publicId: response.public_id,
          width: response.width,
          height: response.height,
          format: response.format
        });
      });

      request.addEventListener("error", () => {
        reject(new Error("Network error while uploading the image."));
      });

      request.send(formData);
    });

    return {
      ...uploaded,
      originalBytes: optimized.originalBytes,
      optimizedBytes: optimized.optimizedBytes,
      optimizedWidth: optimized.width,
      optimizedHeight: optimized.height,
      optimizedFormat: "webp"
    };
  }

  window.HapycureCloudinary = Object.freeze({
    cloudName,
    uploadPreset,
    maxFileSize,
    allowedTypes,
    targetMinBytes,
    targetMaxBytes,
    validateImage,
    compressToWebP,
    uploadImage
  });
})();
