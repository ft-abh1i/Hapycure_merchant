(() => {
  "use strict";

  const cloudName = "woo17b49";
  const uploadPreset = "hapycure_dishes";
  const maxFileSize = 5 * 1024 * 1024;
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  function validateImage(file) {
    if (!file) throw new Error("Choose an image first.");
    if (!allowedTypes.includes(file.type)) {
      throw new Error("Only JPG, PNG and WebP images are allowed.");
    }
    if (file.size > maxFileSize) {
      throw new Error("Image must be smaller than 5 MB.");
    }
  }

  function uploadImage(file, onProgress = () => {}) {
    validateImage(file);

    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);
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
  }

  window.HapycureCloudinary = Object.freeze({
    cloudName,
    uploadPreset,
    maxFileSize,
    allowedTypes,
    validateImage,
    uploadImage
  });
})();
