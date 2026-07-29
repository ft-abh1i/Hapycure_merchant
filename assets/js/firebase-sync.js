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

  const PENDING_DELETE_KEY = "hapycurePendingDishDeletes";
  let readyPromise = null;

  function requireFirebase() {
    if (!window.firebase?.initializeApp || !window.firebase?.auth || !window.firebase?.firestore) {
      throw new Error("Firebase failed to load.");
    }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    return firebase;
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

      let user = auth.currentUser;
      if (!user) {
        const credential = await auth.signInAnonymously();
        user = credential.user;
      }
      if (!user) throw new Error("Partner authentication failed.");

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

  function readPendingDeletes() {
    try {
      const value = JSON.parse(localStorage.getItem(PENDING_DELETE_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function queuePendingDelete(dishId) {
    const ids = [...new Set([...readPendingDeletes(), String(dishId)])];
    localStorage.setItem(PENDING_DELETE_KEY, JSON.stringify(ids));
  }

  async function deleteDish(dishId) {
    try {
      const context = await ready();
      await context.db.collection("dishes")
        .doc(dishDocumentId(context.user.uid, dishId))
        .delete();
      const remaining = readPendingDeletes().filter(id => id !== String(dishId));
      localStorage.setItem(PENDING_DELETE_KEY, JSON.stringify(remaining));
    } catch (error) {
      queuePendingDelete(dishId);
      throw error;
    }
  }

  async function flushPendingDeletes(context) {
    const ids = readPendingDeletes();
    if (!ids.length) return;
    await Promise.all(ids.map(id =>
      context.db.collection("dishes").doc(dishDocumentId(context.user.uid, id)).delete()
    ));
    localStorage.removeItem(PENDING_DELETE_KEY);
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
    await flushPendingDeletes(context);
  }

  async function removePartnerData() {
    const context = await ready();
    const snapshot = await context.db.collection("dishes")
      .where("restaurantId", "==", context.user.uid)
      .get();
    await deleteDocuments(context, snapshot.docs);
    await context.db.collection("restaurants").doc(context.user.uid).delete();
    localStorage.removeItem(PENDING_DELETE_KEY);
  }

  window.HapycureFirebase = {
    ready,
    syncBusiness,
    syncDish,
    deleteDish,
    syncAllState,
    removePartnerData
  };
})();
