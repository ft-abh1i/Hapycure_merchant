(() => {
  "use strict";

  const app = window.Hapycure;
  const AUTH_KEY = "hapycurePartnerAuthenticated";
  const USER_KEY = "hapycurePartnerUser";
  const LEGACY_STATE_KEY = "hapycurePartnerV2";
  const $ = selector => document.querySelector(selector);
  let state = app.loadState();
  let unsubscribeApproval = null;
  let redirecting = false;

  if (localStorage.getItem(AUTH_KEY) !== "true") {
    location.replace("../");
    return;
  }

  if (!state.onboarded || !state.business) {
    location.replace("../onboarding/");
    return;
  }

  function setIcon(type) {
    const box = $("#statusIcon");
    box.className = `status-icon ${type}`;
    if (type === "approved") {
      $("#statusSvg").innerHTML = '<path d="m6 12 4 4 8-8"/><circle cx="12" cy="12" r="9"/>';
    } else if (type === "rejected") {
      $("#statusSvg").innerHTML = '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>';
    } else if (type === "error") {
      $("#statusSvg").innerHTML = '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>';
    } else {
      $("#statusSvg").innerHTML = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';
    }
  }

  function render(status, message = "") {
    const normalized = String(status || "pending").toLowerCase();
    $("#businessName").textContent = state.business?.name || "Partner business";

    if (normalized === "approved") {
      setIcon("approved");
      $("#eyebrow").textContent = "APPLICATION APPROVED";
      $("#statusTitle").textContent = "You're approved!";
      $("#statusMessage").textContent = "Your Hapycure Partner dashboard is now unlocked. Opening your dashboard…";
      $("#reviewStep").className = "step done";
      $("#reviewDot").textContent = "✓";
      $("#reviewTitle").textContent = "Hapycure verification complete";
      $("#reviewText").textContent = "Your partner profile has been approved.";
      $("#dashboardStep").className = "step done";
      $("#dashboardDot").textContent = "✓";
      $("#dashboardText").textContent = "Dashboard access is unlocked.";
      $("#liveStatus").innerHTML = '<span class="live-dot"></span><span>Approval confirmed</span>';
      $("#checkStatus").disabled = true;
      $("#checkStatus").textContent = "Approved";
      return;
    }

    if (normalized === "rejected") {
      setIcon("rejected");
      $("#eyebrow").textContent = "APPLICATION UPDATE NEEDED";
      $("#statusTitle").textContent = "Application not approved";
      $("#statusMessage").textContent = message || "Your application could not be approved in its current form. Contact Hapycure Support for the reason and next steps.";
      $("#reviewStep").className = "step current";
      $("#reviewDot").textContent = "!";
      $("#reviewTitle").textContent = "Verification needs attention";
      $("#reviewText").textContent = "Please contact support before resubmitting your details.";
      $("#dashboardStep").className = "step locked";
      $("#dashboardDot").textContent = "3";
      $("#dashboardText").textContent = "Dashboard remains locked until approval.";
      $("#checkStatus").disabled = false;
      $("#checkStatus").textContent = "Check again";
      return;
    }

    if (normalized === "error") {
      setIcon("error");
      $("#eyebrow").textContent = "STATUS CHECK UNAVAILABLE";
      $("#statusTitle").textContent = "Couldn't check approval";
      $("#statusMessage").textContent = message || "We couldn't reach Hapycure right now. Your application is safe. Check your internet connection and try again.";
      $("#checkStatus").disabled = false;
      $("#checkStatus").textContent = "Retry";
      return;
    }

    setIcon("pending");
    $("#eyebrow").textContent = "APPLICATION SUBMITTED";
    $("#statusTitle").textContent = "Verification in progress";
    $("#statusMessage").textContent = "Thanks for joining Hapycure. Our team is reviewing your partner profile. Your dashboard will unlock automatically after approval.";
    $("#reviewStep").className = "step current";
    $("#reviewDot").textContent = "2";
    $("#reviewTitle").textContent = "Hapycure verification";
    $("#reviewText").textContent = "Our team is checking your business profile.";
    $("#dashboardStep").className = "step locked";
    $("#dashboardDot").textContent = "3";
    $("#dashboardText").textContent = "Unlocks after your application is approved.";
    $("#checkStatus").disabled = false;
    $("#checkStatus").textContent = "Check status";
  }

  async function persistRemoteStatus(status, data = {}) {
    state = app.loadState();
    if (!state.business) return;
    state.business = {
      ...state.business,
      approvalStatus: status,
      reviewedAt: data.reviewedAt || null,
      reviewedBy: String(data.reviewedBy || "")
    };
    app.saveState(state);
  }

  async function openDashboard() {
    if (redirecting) return;
    redirecting = true;
    try {
      const remoteState = await window.HapycureFirebase.loadRemoteState();
      if (remoteState?.business?.approvalStatus === "approved") {
        state = remoteState;
        app.saveState(state);
        render("approved");
        setTimeout(() => location.replace("../dashboard/"), 650);
        return;
      }
      redirecting = false;
      render(remoteState?.business?.approvalStatus || "pending");
    } catch (error) {
      redirecting = false;
      console.error("Unable to load approved partner profile:", error);
      render("error", "Approval was detected, but your profile could not be loaded. Tap Retry.");
    }
  }

  async function handleSnapshot(document) {
    if (!document.exists) {
      render("pending");
      return;
    }

    const data = document.data() || {};
    const status = String(data.approvalStatus || "pending").trim().toLowerCase();
    const normalized = status === "approved" || status === "rejected" ? status : "pending";
    await persistRemoteStatus(normalized, data);
    render(normalized);
    if (normalized === "approved") await openDashboard();
  }

  async function startApprovalListener() {
    try {
      const latestLocalState = app.loadState();
      if (latestLocalState?.business) {
        await window.HapycureFirebase.syncAllState(latestLocalState);
      }

      const context = await window.HapycureFirebase.ready();
      if (unsubscribeApproval) unsubscribeApproval();
      unsubscribeApproval = context.db.collection("restaurants")
        .doc(context.user.uid)
        .onSnapshot(handleSnapshot, error => {
          console.error("Approval status listener failed:", error);
          render("error");
        });
    } catch (error) {
      console.error("Approval status setup failed:", error);
      render("error");
    }
  }

  async function checkStatus() {
    const button = $("#checkStatus");
    button.disabled = true;
    button.textContent = "Checking…";
    try {
      const remoteState = await window.HapycureFirebase.loadRemoteState();
      if (!remoteState.onboarded || !remoteState.business) {
        await window.HapycureFirebase.syncAllState(app.loadState());
        render("pending");
        return;
      }
      state = remoteState;
      app.saveState(state);
      const status = state.business.approvalStatus || "pending";
      render(status);
      if (status === "approved") await openDashboard();
    } catch (error) {
      console.error("Manual approval check failed:", error);
      render("error");
    } finally {
      if (!redirecting && !button.disabled) button.disabled = false;
    }
  }

  async function logout() {
    const button = $("#logoutPartner");
    button.disabled = true;
    button.textContent = "Logging out…";
    try {
      if (window.firebase?.auth) await firebase.auth().signOut();
    } catch (error) {
      console.warn("Firebase sign-out failed; clearing local session.", error);
    } finally {
      if (unsubscribeApproval) unsubscribeApproval();
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(LEGACY_STATE_KEY);
      sessionStorage.removeItem("hapycurePartnerGoogleRedirectPending");
      location.replace("../");
    }
  }

  $("#checkStatus").addEventListener("click", checkStatus);
  $("#logoutPartner").addEventListener("click", logout);
  window.addEventListener("beforeunload", () => {
    if (unsubscribeApproval) unsubscribeApproval();
  });

  render(state.business?.approvalStatus || "pending");
  startApprovalListener();
})();
