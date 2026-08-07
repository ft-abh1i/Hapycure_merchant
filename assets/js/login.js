(() => {
  "use strict";

  const AUTH_KEY = "hapycurePartnerAuthenticated";
  const USER_KEY = "hapycurePartnerUser";
  const REDIRECT_KEY = "hapycurePartnerGoogleRedirectPending";
  const STATE_KEY_PREFIX = "hapycurePartnerV2_";
  const LEGACY_STATE_KEY = "hapycurePartnerV2";
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCzD-QcA0K-rSXM5VZYsGB2bE3FEfhkyX0",
    authDomain: "nutrilious-ceebd.firebaseapp.com",
    projectId: "nutrilious-ceebd",
    storageBucket: "nutrilious-ceebd.firebasestorage.app",
    messagingSenderId: "904909524137",
    appId: "1:904909524137:web:e20913ddbd9aa3d3856db8"
  };

  const phoneNumber = document.getElementById("phoneNumber");
  const continueLogin = document.getElementById("continueLogin");
  const googleLogin = document.getElementById("googleLogin");
  const loginMsg = document.getElementById("loginMsg");
  let signInCompleted = false;
  let auth = null;

  function stateKey(userId) {
    return `${STATE_KEY_PREFIX}${String(userId || "").trim()}`;
  }

  function cachedPartnerState(userId) {
    let state = {};
    try {
      state = JSON.parse(localStorage.getItem(stateKey(userId)) || "{}");
    } catch (_) {}
    return state;
  }

  function partnerDestination(userId) {
    const state = cachedPartnerState(userId);
    return state.onboarded
      ? "./dashboard/?v=2026-08-07-account-state-v2"
      : "./onboarding/?v=2026-08-07-account-state-v2";
  }

  function enterPartnerApp(userId) {
    location.replace(partnerDestination(userId));
  }

  function setMessage(message, success = false) {
    loginMsg.style.color = success ? "#267e3e" : "#E35336";
    loginMsg.textContent = message || "";
  }

  function setBusy(isBusy) {
    googleLogin.disabled = isBusy;
    continueLogin.disabled = isBusy;
    googleLogin.setAttribute("aria-busy", String(isBusy));
  }

  function getAuth() {
    if (!window.firebase?.initializeApp || !window.firebase?.auth) {
      throw new Error("Firebase Authentication failed to load.");
    }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    if (!auth) auth = firebase.auth();
    return auth;
  }

  function friendlyGoogleError(error) {
    const code = error?.code || "";
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "Google sign-in was cancelled.";
    if (code === "auth/popup-blocked") return "Your browser blocked the sign-in window. Redirecting to Google sign-in…";
    if (code === "auth/unauthorized-domain") return "This website domain is not authorized in Firebase Authentication.";
    if (code === "auth/network-request-failed") return "Network error. Check your internet connection and try again.";
    if (code === "auth/account-exists-with-different-credential" || code === "auth/credential-already-in-use") {
      return "This Google account is already connected. Please try signing in again.";
    }
    return error?.message || "Google sign-in failed. Please try again.";
  }

  async function completeGoogleSignIn(user) {
    if (signInCompleted || !user || user.isAnonymous) return;
    signInCompleted = true;
    localStorage.setItem(USER_KEY, JSON.stringify({
      uid: user.uid || "",
      name: user.displayName || "",
      email: user.email || "",
      phone: user.phoneNumber || "",
      photoURL: user.photoURL || "",
      provider: "google"
    }));
    sessionStorage.removeItem(REDIRECT_KEY);
    setBusy(true);
    setMessage("Loading your partner profile…", true);

    try {
      const remoteState = await window.HapycureFirebase.loadRemoteState();
      localStorage.setItem(stateKey(user.uid), JSON.stringify(remoteState));
      localStorage.removeItem(LEGACY_STATE_KEY);
    } catch (error) {
      if (!cachedPartnerState(user.uid).onboarded) {
        signInCompleted = false;
        localStorage.removeItem(AUTH_KEY);
        setMessage("Could not load your partner profile. Check your connection and try again.");
        setBusy(false);
        return;
      }
      console.warn("Using this account's cached partner profile.", error);
    }

    localStorage.setItem(AUTH_KEY, "true");
    setMessage("Signed in successfully.", true);
    enterPartnerApp(user.uid);
  }

  async function popupGoogleSignIn(currentAuth, provider) {
    if (currentAuth.currentUser?.isAnonymous) {
      return currentAuth.currentUser.linkWithPopup(provider);
    }
    return currentAuth.signInWithPopup(provider);
  }

  async function redirectGoogleSignIn(currentAuth, provider) {
    sessionStorage.setItem(REDIRECT_KEY, "true");
    setMessage("Redirecting to Google sign-in…", true);
    if (currentAuth.currentUser?.isAnonymous) {
      await currentAuth.currentUser.linkWithRedirect(provider);
      return;
    }
    await currentAuth.signInWithRedirect(provider);
  }

  async function startGoogleSignIn() {
    if (googleLogin.disabled) return;
    setBusy(true);
    setMessage("Opening Google sign-in…", true);

    try {
      const currentAuth = getAuth();
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await popupGoogleSignIn(currentAuth, provider);
      await completeGoogleSignIn(result?.user);
    } catch (error) {
      signInCompleted = false;
      const code = error?.code || "";
      if ((code === "auth/credential-already-in-use" || code === "auth/account-exists-with-different-credential") && error?.credential) {
        try {
          const result = await getAuth().signInWithCredential(error.credential);
          await completeGoogleSignIn(result?.user);
          return;
        } catch (credentialError) {
          setMessage(friendlyGoogleError(credentialError));
          return;
        }
      }
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        try {
          await redirectGoogleSignIn(getAuth(), new firebase.auth.GoogleAuthProvider());
          return;
        } catch (redirectError) {
          setMessage(friendlyGoogleError(redirectError));
        }
      } else {
        setMessage(friendlyGoogleError(error));
      }
    } finally {
      if (!signInCompleted) setBusy(false);
    }
  }

  phoneNumber.addEventListener("input", () => {
    phoneNumber.value = phoneNumber.value.replace(/[^0-9]/g, "").slice(0, 10);
    setMessage("");
  });

  phoneNumber.addEventListener("keydown", event => {
    if (event.key === "Enter") event.preventDefault();
  });

  continueLogin.addEventListener("click", () => {
    const digits = phoneNumber.value.replace(/[^0-9]/g, "");
    if (digits.length !== 10) {
      setMessage("Enter a valid 10-digit mobile number.");
      phoneNumber.focus();
      return;
    }
    setMessage("Phone login is not available yet. Continue with Google.");
  });

  googleLogin.addEventListener("click", startGoogleSignIn);

  try {
    const currentAuth = getAuth();
    currentAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
    currentAuth.getRedirectResult().then(result => {
      if (result?.user) completeGoogleSignIn(result.user);
    }).catch(error => {
      if (sessionStorage.getItem(REDIRECT_KEY) === "true") setMessage(friendlyGoogleError(error));
      sessionStorage.removeItem(REDIRECT_KEY);
    });
    currentAuth.onAuthStateChanged(user => {
      if (user && !user.isAnonymous) completeGoogleSignIn(user);
      else if (!user) {
        localStorage.removeItem(AUTH_KEY);
        localStorage.removeItem(USER_KEY);
      }
    });
  } catch (error) {
    setMessage(friendlyGoogleError(error));
  }
})();
