(() => {
  "use strict";

  const STORAGE_KEY_PREFIX = "hapycurePartnerV2_";
  const LEGACY_STORAGE_KEY = "hapycurePartnerV2";
  const USER_KEY = "hapycurePartnerUser";
  const REVERSE_CACHE_KEY = "hapycureReverseGeocodeCache";
  const REVERSE_GEOCODER_URL = "https://nominatim.openstreetmap.org/reverse";
  let lastGeocodeRequest = 0;

  function blankState() {
    return {
      onboarded: false,
      service: null,
      business: null,
      dishes: [],
      plans: []
    };
  }

  function partnerUserId() {
    try {
      const user = JSON.parse(localStorage.getItem(USER_KEY) || "{}");
      return String(user?.uid || "").trim();
    } catch (_) {
      return "";
    }
  }

  function stateStorageKey(userId = partnerUserId()) {
    const normalizedUserId = String(userId || "").trim();
    return normalizedUserId ? `${STORAGE_KEY_PREFIX}${normalizedUserId}` : "";
  }

  function loadState() {
    const storageKey = stateStorageKey();
    if (!storageKey) return blankState();
    try {
      return { ...blankState(), ...JSON.parse(localStorage.getItem(storageKey) || "{}") };
    } catch (_) {
      return blankState();
    }
  }

  function saveState(state) {
    const storageKey = stateStorageKey();
    if (!storageKey) throw new Error("Partner account is not available.");
    localStorage.setItem(storageKey, JSON.stringify(state));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function formatPrice(value) {
    return `₹${Number(value || 0).toLocaleString("en-IN")}`;
  }

  function formatTime(value) {
    if (!value) return "";
    const [hours, minutes] = value.split(":").map(Number);
    return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
  }

  function toast(message) {
    const element = document.querySelector("#toast");
    if (!element) return;
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove("show"), 2200);
  }

  function showModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function setLocationStatus(picker, message, isError = false) {
    const status = picker.querySelector("[data-location-status]");
    status.textContent = message;
    status.classList.toggle("error", isError);
  }

  function setLocationData(picker, locationData) {
    const form = picker.closest("form");
    form.elements.address.value = locationData.address || "";
    form.elements.latitude.value = locationData.latitude ?? "";
    form.elements.longitude.value = locationData.longitude ?? "";
    form.elements.accuracy.value = locationData.accuracy ?? "";
    picker.querySelector("[data-location-address]").textContent = locationData.address || "";
    picker.querySelector("[data-location-result]").classList.toggle("hidden", !locationData.address);
    setLocationStatus(picker, "");
  }

  function resetLocationPicker(picker) {
    if (!picker) return;
    picker.querySelector("[data-location-result]").classList.add("hidden");
    picker.querySelector("[data-location-address]").textContent = "";
    setLocationStatus(picker, "");
  }

  function readReverseCache() {
    try {
      return JSON.parse(localStorage.getItem(REVERSE_CACHE_KEY) || "{}");
    } catch (_) {
      return {};
    }
  }

  async function reverseGeocode(latitude, longitude) {
    const cacheKey = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
    const cache = readReverseCache();
    if (cache[cacheKey]) return cache[cacheKey];

    const wait = Math.max(0, 1100 - (Date.now() - lastGeocodeRequest));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastGeocodeRequest = Date.now();

    const url = new URL(REVERSE_GEOCODER_URL);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", latitude);
    url.searchParams.set("lon", longitude);
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("layer", "address");
    url.searchParams.set("accept-language", navigator.language || "en");

    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Reverse geocoding failed");
    const result = await response.json();
    if (!result.display_name) throw new Error("Address not found");

    cache[cacheKey] = result.display_name;
    const recentEntries = Object.entries(cache).slice(-20);
    localStorage.setItem(REVERSE_CACHE_KEY, JSON.stringify(Object.fromEntries(recentEntries)));
    return result.display_name;
  }

  function locationError(error) {
    if (error?.code === 1) return "Location permission was denied. Allow access and try again.";
    if (error?.code === 2) return "Turn on device location and try again.";
    if (error?.code === 3) return "Location request timed out. Please try again.";
    return "Unable to access your location. Please try again.";
  }

  function detectLocation(picker, idleText) {
    const button = picker.querySelector(".location-button");
    const text = button.querySelector("span");

    if (!navigator.geolocation) {
      setLocationStatus(picker, "Geolocation is not supported by this browser.", true);
      return;
    }

    if (!window.isSecureContext && !["localhost", "127.0.0.1"].includes(location.hostname)) {
      setLocationStatus(picker, "Location requires HTTPS.", true);
      return;
    }

    button.disabled = true;
    text.textContent = "Detecting location…";
    setLocationStatus(picker, "Waiting for your device location…");

    navigator.geolocation.getCurrentPosition(async position => {
      const { latitude, longitude, accuracy } = position.coords;
      setLocationStatus(picker, "Finding your address…");
      try {
        const address = await reverseGeocode(latitude, longitude);
        setLocationData(picker, { address, latitude, longitude, accuracy });
      } catch (_) {
        setLocationStatus(picker, "Location found, but the address could not be generated. Try again.", true);
      } finally {
        button.disabled = false;
        text.textContent = idleText;
      }
    }, error => {
      setLocationStatus(picker, locationError(error), true);
      button.disabled = false;
      text.textContent = idleText;
    }, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000
    });
  }

  window.Hapycure = {
    blankState,
    partnerUserId,
    stateStorageKey,
    loadState,
    saveState,
    escapeHTML,
    formatPrice,
    formatTime,
    toast,
    showModal,
    closeModal,
    setLocationStatus,
    setLocationData,
    resetLocationPicker,
    detectLocation
  };

  // Dashboard is available only after the business profile has been approved.
  // This client-side gate complements Firestore approval rules and prevents a
  // pending/rejected partner from bypassing the waiting screen with a direct URL.
  const currentPage = location.pathname.split("/").filter(Boolean).pop();
  if (currentPage === "dashboard") {
    const state = loadState();
    const status = String(state.business?.approvalStatus || "pending").toLowerCase();
    if (state.onboarded && state.business && status !== "approved") {
      location.replace("../approval/");
    }
  }
})();
