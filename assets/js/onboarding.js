(() => {
  "use strict";

  const app = window.Hapycure;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  let selectedService = null;

  if (localStorage.getItem("hapycurePartnerAuthenticated") !== "true") {
    location.replace("../");
    return;
  }

  const existingState = app.loadState();
  if (existingState.onboarded) {
    const status = String(existingState.business?.approvalStatus || "pending").toLowerCase();
    location.replace(status === "approved" ? "../dashboard/" : "../approval/");
    return;
  }

  function selectService(service) {
    selectedService = service;
    $$(".service-card").forEach(card =>
      card.classList.toggle("selected", card.dataset.service === service)
    );
    $("#continueSetup").disabled = false;
  }

  function goToDetails() {
    if (!selectedService) return;
    $("#serviceStep").classList.add("hidden");
    $("#detailsStep").classList.remove("hidden");
    const isMess = selectedService === "mess";
    $("#foodSubtypeField").classList.toggle("hidden", isMess);
    $("#detailsTitle").textContent = isMess ? "Set up your mess service" : "Set up your food business";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function backToServices() {
    $("#detailsStep").classList.add("hidden");
    $("#serviceStep").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function finishOnboarding(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    const picker = document.querySelector('[data-location-picker="setup"]');

    if (!data.address || !data.latitude || !data.longitude) {
      app.setLocationStatus(picker, "Detect your current location before creating the profile.", true);
      app.toast("Current location is required");
      return;
    }

    const state = {
      onboarded: true,
      service: selectedService,
      business: {
        name: data.name.trim(),
        subtype: selectedService === "mess" ? "Mess Service" : data.subtype,
        foodType: data.foodType,
        phone: data.phone,
        address: data.address,
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        accuracy: Number(data.accuracy) || null,
        openTime: data.openTime,
        closeTime: data.closeTime,
        open: true,
        approvalStatus: "pending"
      },
      dishes: [],
      plans: []
    };

    app.saveState(state);
    submitButton.disabled = true;
    submitButton.textContent = "Submitting for review…";

    try {
      await window.HapycureFirebase.syncAllState(state);
      app.toast("Profile submitted for admin approval");
    } catch (error) {
      console.error("Firebase profile sync failed:", error);
      app.toast("Profile saved. Approval page will retry sync.");
    }

    setTimeout(() => location.replace("../approval/"), 350);
  }

  $$(".service-card").forEach(card =>
    card.addEventListener("click", () => selectService(card.dataset.service))
  );
  $("#continueSetup").addEventListener("click", goToDetails);
  $("#backToServices").addEventListener("click", backToServices);
  $("#detectSetupLocation").addEventListener("click", () =>
    app.detectLocation(document.querySelector('[data-location-picker="setup"]'), "Use current location")
  );
  $("#setupForm").addEventListener("submit", finishOnboarding);
})();
