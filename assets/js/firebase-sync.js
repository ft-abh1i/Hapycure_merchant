(() => {
  "use strict";

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCzD-QcA0K-rSXM5VZYsGB2bE3FEfhkyX0",
    authDomain: "nutrilious-ceebd.firebaseapp.com",
    projectId: "nutrilious-ceebd",
    storageBucket: "nutrilious-ceebd.firebasestorage.app",
    messagingSenderId: "904909524137",
    appId: "1:904909524137:web:e20913ddbd9aa3d3856db8"
  };

  const PENDING_DELETE_KEY_PREFIX = "hapycurePendingDishDeletes_";
  const USER_KEY = "hapycurePartnerUser";
  let readyPromise = null;

  function requireFirebase() {
    if (!window.firebase?.initializeApp || !window.firebase?.auth || !window.firebase?.firestore) {
      throw new Error("Firebase failed to load.");
    }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    return firebase;
  }

  function storedUserId() {
    try {
      return String(JSON.parse(localStorage.getItem(USER_KEY) || "{}")?.uid || "").trim();
    } catch (_) {
      return "";
    }
  }

  function pendingDeleteKey(userId = storedUserId()) {
    return `${PENDING_DELETE_KEY_PREFIX}${String(userId || "").trim()}`;
  }

  function waitForAuthenticatedUser(auth) {
    if (auth.currentUser && !auth.currentUser.isAnonymous) return Promise.resolve(auth.currentUser);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error("Partner sign-in session expired. Please log in again."));
      }, 8000);
      const unsubscribe = auth.onAuthStateChanged(user => {
        if (!user || user.isAnonymous) return;
        clearTimeout(timeout);
        unsubscribe();
        resolve(user);
      }, error => {
        clearTimeout(timeout);
        unsubscribe();
        reject(error);
      });
    });
  }

  function ready() {
    if (readyPromise) return readyPromise;

    readyPromise = (async () => {
      const firebaseSdk = requireFirebase();
      const auth = firebaseSdk.auth();

      try {
        await auth.setPersistence(firebaseSdk.auth.Auth.Persistence.LOCAL);
      } catch (_) {
        // Persistence may already be locked by another Firebase page on this origin.
      }

      const user = await waitForAuthenticatedUser(auth);
      const expectedUserId = storedUserId();
      if (!expectedUserId || user.uid !== expectedUserId) {
        throw new Error("Partner account mismatch. Please log in again.");
      }

      return {
        db: firebaseSdk.firestore(),
        firebase: firebaseSdk,
        user
      };
    })().catch(error => {
      readyPromise = null;
      throw error;
    });

    return readyPromise;
  }

  function timestamp(firebaseSdk) {
    return firebaseSdk.firestore.FieldValue.serverTimestamp();
  }

  function dishDocumentId(userId, dishId) {
    return `${userId}_${String(dishId).replaceAll("/", "_")}`;
  }

  function planDocumentId(userId, planId) {
    return `${userId}_${String(planId).replaceAll("/", "_")}`;
  }

  function businessPayload(state, userId, firebaseSdk) {
    const business = state.business || {};
    return {
      ownerId: userId,
      service: state.service,
      name: String(business.name || "").trim(),
      subtype: String(business.subtype || ""),
      foodType: String(business.foodType || ""),
      phone: String(business.phone || ""),
      address: String(business.address || ""),
      latitude: Number(business.latitude),
      longitude: Number(business.longitude),
      accuracy: Number(business.accuracy) || null,
      openTime: String(business.openTime || ""),
      closeTime: String(business.closeTime || ""),
      image: String(business.bannerImage || business.image || ""),
      bannerImage: String(business.bannerImage || business.image || ""),
      bannerPublicId: String(business.bannerPublicId || business.imagePublicId || ""),
      open: business.open !== false,
      published: true,
      source: "hapycure-merchant",
      updatedAt: timestamp(firebaseSdk)
    };
  }

  function dishPayload(dish, state, userId, firebaseSdk) {
    return {
      ownerId: userId,
      restaurantId: userId,
      name: String(dish.name || "").trim(),
      category: String(dish.category || ""),
      dietType: String(dish.dietType || ""),
      price: Number(dish.price) || 0,
      description: String(dish.description || ""),
      image: String(dish.image || ""),
      imagePublicId: String(dish.imagePublicId || ""),
      active: dish.active !== false,
      source: "hapycure-merchant",
      updatedAt: timestamp(firebaseSdk)
    };
  }

  function planPayload(plan, userId, firebaseSdk) {
    const menu = plan?.menu && typeof plan.menu === "object" && !Array.isArray(plan.menu)
      ? Object.fromEntries(Object.entries(plan.menu).map(([day, item]) => [
        String(day || "").trim(),
        String(item || "").trim()
      ]).filter(([day]) => day))
      : {};
    const mealMenus = plan?.mealMenus && typeof plan.mealMenus === "object" && !Array.isArray(plan.mealMenus)
      ? Object.fromEntries(Object.entries(plan.mealMenus).map(([meal, days]) => [
        String(meal || "").trim(),
        days && typeof days === "object" && !Array.isArray(days)
          ? Object.fromEntries(Object.entries(days).map(([day, item]) => [
            String(day || "").trim(),
            String(item || "").trim()
          ]).filter(([day]) => day))
          : {}
      ]).filter(([meal]) => meal))
      : {};
    return {
      ownerId: userId,
      restaurantId: userId,
      name: String(plan?.name || "").trim(),
      cycle: String(plan?.cycle || ""),
      price: Number(plan?.price) || 0,
      meals: String(plan?.meals || ""),
      deliveryDays: String(plan?.deliveryDays || ""),
      menu,
      mealMenus,
      active: plan?.active !== false,
      source: "hapycure-merchant",
      updatedAt: timestamp(firebaseSdk)
    };
  }

  async function syncBusiness(state) {
    if (!state?.business) return;
    const context = await ready();
    await context.db.collection("restaurants").doc(context.user.uid).set(
      businessPayload(state, context.user.uid, context.firebase),
      { merge: true }
    );
  }

  async function syncDish(dish, state) {
    if (!dish || state?.service !== "food" || !state?.business) return;
    const context = await ready();
    await context.db.collection("dishes")
      .doc(dishDocumentId(context.user.uid, dish.id))
      .set(dishPayload(dish, state, context.user.uid, context.firebase), { merge: true });
  }

  async function syncPlan(plan, state) {
    if (!plan || state?.service !== "mess" || !state?.business) return;
    const context = await ready();
    const userId = context.user.uid;
    const batch = context.db.batch();

    // A customer listing needs both the mess profile and its plan. Publishing
    // them in one commit prevents an orphaned plan when onboarding/profile sync
    // was interrupted or still pending.
    batch.set(
      context.db.collection("restaurants").doc(userId),
      businessPayload(state, userId, context.firebase),
      { merge: true }
    );
    batch.set(
      context.db.collection("messPlans").doc(planDocumentId(userId, plan.id)),
      planPayload(plan, userId, context.firebase),
      { merge: true }
    );

    await batch.commit();
  }

  function readPendingDeletes(userId = storedUserId()) {
    try {
      const value = JSON.parse(localStorage.getItem(pendingDeleteKey(userId)) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function queuePendingDelete(dishId, userId = storedUserId()) {
    const ids = [...new Set([...readPendingDeletes(userId), String(dishId)])];
    localStorage.setItem(pendingDeleteKey(userId), JSON.stringify(ids));
  }

  async function deleteDish(dishId) {
    try {
      const context = await ready();
      await context.db.collection("dishes")
        .doc(dishDocumentId(context.user.uid, dishId))
        .delete();
      const remaining = readPendingDeletes(context.user.uid).filter(id => id !== String(dishId));
      localStorage.setItem(pendingDeleteKey(context.user.uid), JSON.stringify(remaining));
    } catch (error) {
      queuePendingDelete(dishId);
      throw error;
    }
  }

  async function deletePlan(planId) {
    const context = await ready();
    await context.db.collection("messPlans")
      .doc(planDocumentId(context.user.uid, planId))
      .delete();
  }

  async function flushPendingDeletes(context) {
    const ids = readPendingDeletes(context.user.uid);
    if (!ids.length) return;
    await Promise.all(ids.map(id =>
      context.db.collection("dishes").doc(dishDocumentId(context.user.uid, id)).delete()
    ));
    localStorage.removeItem(pendingDeleteKey(context.user.uid));
  }

  function localDocumentId(documentId, userId) {
    const prefix = `${userId}_`;
    return documentId.startsWith(prefix) ? documentId.slice(prefix.length) : documentId;
  }

  function localBusiness(data) {
    return {
      name: String(data.name || ""),
      subtype: String(data.subtype || ""),
      foodType: String(data.foodType || ""),
      phone: String(data.phone || ""),
      address: String(data.address || ""),
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      accuracy: data.accuracy == null ? null : Number(data.accuracy),
      openTime: String(data.openTime || ""),
      closeTime: String(data.closeTime || ""),
      image: String(data.image || ""),
      imagePublicId: String(data.bannerPublicId || ""),
      bannerImage: String(data.bannerImage || data.image || ""),
      bannerPublicId: String(data.bannerPublicId || ""),
      open: data.open !== false
    };
  }

  function localListing(document, userId) {
    const data = document.data() || {};
    const { ownerId, restaurantId, source, updatedAt, ...listing } = data;
    return { id: localDocumentId(document.id, userId), ...listing };
  }

  async function loadRemoteState() {
    const context = await ready();
    const userId = context.user.uid;
    const [businessDocument, dishSnapshot, planSnapshot] = await Promise.all([
      context.db.collection("restaurants").doc(userId).get(),
      context.db.collection("dishes").where("restaurantId", "==", userId).get(),
      context.db.collection("messPlans").where("restaurantId", "==", userId).get()
    ]);

    if (!businessDocument.exists) {
      return { onboarded: false, service: null, business: null, dishes: [], plans: [] };
    }

    const businessData = businessDocument.data() || {};
    return {
      onboarded: true,
      service: businessData.service === "mess" ? "mess" : "food",
      business: localBusiness(businessData),
      dishes: dishSnapshot.docs.map(document => localListing(document, userId)),
      plans: planSnapshot.docs.map(document => localListing(document, userId))
    };
  }

  async function deleteDocuments(context, documents) {
    for (let index = 0; index < documents.length; index += 450) {
      const batch = context.db.batch();
      documents.slice(index, index + 450).forEach(document => batch.delete(document.ref));
      await batch.commit();
    }
  }

  async function syncAllState(state) {
    if (!state?.business) return;
    const context = await ready();
    const userId = context.user.uid;

    await context.db.collection("restaurants").doc(userId).set(
      businessPayload(state, userId, context.firebase),
      { merge: true }
    );

    const localDishes = state.service === "food" ? (state.dishes || []) : [];
    await Promise.all(localDishes.map(dish =>
      context.db.collection("dishes")
        .doc(dishDocumentId(userId, dish.id))
        .set(dishPayload(dish, state, userId, context.firebase), { merge: true })
    ));

    const remoteSnapshot = await context.db.collection("dishes")
      .where("restaurantId", "==", userId)
      .get();
    const localIds = new Set(localDishes.map(dish => dishDocumentId(userId, dish.id)));
    const staleDocuments = remoteSnapshot.docs.filter(document => !localIds.has(document.id));
    await deleteDocuments(context, staleDocuments);

    const localPlans = state.service === "mess" ? (state.plans || []) : [];
    await Promise.all(localPlans.map(plan =>
      context.db.collection("messPlans")
        .doc(planDocumentId(userId, plan.id))
        .set(planPayload(plan, userId, context.firebase), { merge: true })
    ));

    const remotePlanSnapshot = await context.db.collection("messPlans")
      .where("restaurantId", "==", userId)
      .get();
    const localPlanIds = new Set(localPlans.map(plan => planDocumentId(userId, plan.id)));
    const stalePlanDocuments = remotePlanSnapshot.docs.filter(document => !localPlanIds.has(document.id));
    await deleteDocuments(context, stalePlanDocuments);
    await flushPendingDeletes(context);
  }

  async function removePartnerData() {
    const context = await ready();
    const [dishSnapshot, planSnapshot] = await Promise.all([
      context.db.collection("dishes").where("restaurantId", "==", context.user.uid).get(),
      context.db.collection("messPlans").where("restaurantId", "==", context.user.uid).get()
    ]);
    await deleteDocuments(context, [...dishSnapshot.docs, ...planSnapshot.docs]);
    await context.db.collection("restaurants").doc(context.user.uid).delete();
    localStorage.removeItem(pendingDeleteKey(context.user.uid));
  }

  window.HapycureFirebase = {
    ready,
    loadRemoteState,
    syncBusiness,
    syncDish,
    syncPlan,
    deleteDish,
    deletePlan,
    syncAllState,
    removePartnerData
  };
})();
