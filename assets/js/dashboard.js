(() => {
  "use strict";

  const app = window.Hapycure;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  let imageUploadInProgress = false;
  let localPreviewUrl = null;
  let bannerUploadInProgress = false;
  let bannerPreviewUrl = null;
  let planMealMenus = {};
  let activePlanMeal = "";
  let state = app.loadState();

  if (localStorage.getItem("hapycurePartnerAuthenticated") !== "true") {
    location.replace("../");
    return;
  }

  if (!state.onboarded || !state.business) {
    location.replace("../onboarding/");
    return;
  }

  function renderDashboard() {
    const isMess = state.service === "mess";
    const items = isMess ? state.plans : state.dishes;
    const prices = items.map(item => Number(item.price)).filter(Number.isFinite);
    const business = state.business;

    $(".hero").classList.add("hidden");
    $(".stats").classList.toggle("hidden", isMess);
    $("#heroLabel").textContent = isMess ? "MESS PARTNER" : "FOOD PARTNER";
    $("#heroTitle").textContent = isMess ? "Manage your meal plans" : "Manage your dishes";
    $("#heroDescription").textContent = isMess
      ? "Create weekly or monthly subscriptions and keep each plan's day-wise menu updated."
      : "Add dishes, update prices and control what customers can order today.";
    $("#heroAdd").textContent = isMess ? "+ Add mess plan" : "+ Add dish";
    $("#sectionAdd").textContent = isMess ? "+ Add plan" : "+ Add dish";
    $("#totalLabel").textContent = isMess ? "Total plans" : "Total dishes";
    $("#catalogueEyebrow").textContent = isMess ? "YOUR SUBSCRIPTIONS" : "YOUR CATALOGUE";
    $("#catalogueTitle").textContent = isMess ? "Mess plans" : "Food items";
    $("#catalogueSearch").placeholder = isMess ? "Search plans" : "Search dishes";
    $("#businessTypeLabel").textContent = business.subtype.toUpperCase();
    $("#businessName").textContent = business.name;
    $("#businessMeta").textContent = isMess
      ? `${business.foodType} • ${business.address}`
      : `${business.foodType} • ${business.address} • ${app.formatTime(business.openTime)}–${app.formatTime(business.closeTime)}`;
    $("#businessStatus").textContent = business.open ? "Accepting orders" : "Temporarily closed";
    $("#businessStatus").classList.toggle("closed", !business.open);
    $("#totalCount").textContent = items.length;
    $("#activeCount").textContent = items.filter(item => item.active).length;
    $("#startingPrice").textContent = prices.length ? app.formatPrice(Math.min(...prices)) : "₹0";

    renderFilter();
    renderCatalogue();
  }

  function renderFilter() {
    const filter = $("#catalogueFilter");
    const current = filter.value;
    const values = state.service === "mess"
      ? ["Weekly", "Monthly"]
      : [...new Set(state.dishes.map(item => item.category).filter(Boolean))].sort();
    filter.innerHTML = '<option value="all">All</option>' +
      values.map(value => `<option value="${app.escapeHTML(value)}">${app.escapeHTML(value)}</option>`).join("");
    if (values.includes(current)) filter.value = current;
  }

  function renderCatalogue() {
    const isMess = state.service === "mess";
    const items = isMess ? state.plans : state.dishes;
    const query = $("#catalogueSearch").value.trim().toLowerCase();
    const filter = $("#catalogueFilter").value;
    const visible = items.filter(item => {
      const haystack = isMess
        ? `${item.name} ${item.cycle} ${item.meals} ${Object.values(item.menu || {}).join(" ")}`
        : `${item.name} ${item.category} ${item.dietType || ""} ${item.description}`;
      const group = isMess ? item.cycle : item.category;
      return (!query || haystack.toLowerCase().includes(query)) &&
        (filter === "all" || group === filter);
    });

    if (!items.length) {
      $("#catalogue").innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${isMess ? "📅" : "🍲"}</div>
          <h3>${isMess ? "No mess plans yet" : "Your food catalogue is empty"}</h3>
          <p>${isMess
            ? "Create a weekly or monthly plan and add the menu customers receive each day."
            : "Add your first dish with its category, price and availability."}</p>
          <button class="primary" data-empty-add type="button">${isMess ? "Create first plan" : "Add first dish"}</button>
        </div>`;
      return;
    }

    if (!visible.length) {
      $("#catalogue").innerHTML =
        '<div class="empty-state"><h3>No matching results</h3><p>Try another search or filter.</p></div>';
      return;
    }

    $("#catalogue").innerHTML = visible.map(item =>
      isMess ? planCard(item) : dishCard(item)
    ).join("");
  }

  function itemActions(item) {
    return `
      <div class="item-actions">
        <div class="availability ${item.active ? "" : "off"}">
          <button class="toggle" data-action="toggle" data-id="${item.id}" type="button" aria-label="Toggle availability"></button>
          ${item.active ? "Active" : "Inactive"}
        </div>
        <div class="small-actions">
          <button data-action="edit" data-id="${item.id}" type="button">Edit</button>
          <button class="delete" data-action="delete" data-id="${item.id}" type="button">Delete</button>
        </div>
      </div>`;
  }

  function dishCard(item) {
    const dietType = item.dietType || "Not specified";
    const dietClass = dietType === "Non-veg" ? "non-veg" : dietType === "Veg" ? "" : "unspecified";
    return `
      <article class="item-card dish-card">
        <div class="item-image">${item.image
          ? `<img src="${app.escapeHTML(item.image)}" alt="${app.escapeHTML(item.name)}" onerror="this.parentElement.innerHTML='🍽️'">`
          : "🍽️"}</div>
        <div class="item-copy">
          <div class="item-title">
            <h3>${app.escapeHTML(item.name)}</h3>
            <span class="price">${app.formatPrice(item.price)}</span>
          </div>
          <div class="dish-tags">
            <span class="tag">${app.escapeHTML(item.category)}</span>
            <span class="diet-badge ${dietClass}">${app.escapeHTML(dietType)}</span>
          </div>
          <p>${app.escapeHTML(item.description || "Freshly prepared by your kitchen.")}</p>
          ${itemActions(item)}
        </div>
      </article>`;
  }

  function planCard(item) {
    const preview = days.slice(0, 3).map(day =>
      `<b>${day.slice(0, 3)}:</b> ${app.escapeHTML(item.menu?.[day] || "Menu not added")}`
    ).join("<br>");
    return `
      <article class="item-card">
        <div class="plan-head">
          <div><span class="eyebrow">${app.escapeHTML(item.cycle)} PLAN</span><h3>${app.escapeHTML(item.name)}</h3></div>
          <div class="plan-price">${app.formatPrice(item.price)}<small>PER ${item.cycle === "Weekly" ? "WEEK" : "MONTH"}</small></div>
        </div>
        <div class="plan-details">
          <div class="plan-meta">
            <span class="tag">${app.escapeHTML(item.meals)}</span>
            <span class="tag">${app.escapeHTML(item.deliveryDays)}</span>
          </div>
          <div class="menu-preview">${preview}<br><b>+ 4 more days</b></div>
          ${itemActions(item)}
        </div>
      </article>`;
  }

  function openAddForm(item = null) {
    if (state.service === "mess") openPlanForm(item);
    else openDishForm(item);
  }

  function openDishForm(item = null) {
    const form = $("#dishForm");
    form.reset();
    form.elements.active.checked = true;
    $("#dishFormTitle").textContent = item ? "Edit dish" : "Add a dish";
    if (item) {
      ["id", "name", "category", "dietType", "price", "description"].forEach(key => {
        form.elements[key].value = item[key] || "";
      });
      form.elements.active.checked = item.active;
    }
    resetDishImageUploader(item);
    app.showModal("dishModal");
  }

  function setDishImagePreview(url) {
    const image = $("#dishImagePreviewImage");
    const placeholder = $("#dishImagePlaceholder");
    image.hidden = !url;
    placeholder.classList.toggle("hidden", Boolean(url));
    if (url) image.src = url;
    else image.removeAttribute("src");
    $("#removeDishImage").classList.toggle("hidden", !url);
  }

  function setImageUploadStatus(message, type = "") {
    const status = $("#imageUploadStatus");
    status.textContent = message;
    status.classList.toggle("error", type === "error");
    status.classList.toggle("success", type === "success");
  }

  function formatFileSize(bytes) {
    return `${Math.max(1, Math.round(Number(bytes || 0) / 1024))} KB`;
  }

  function resetDishImageUploader(item = null) {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
      localPreviewUrl = null;
    }
    imageUploadInProgress = false;
    $("#dishImageFile").value = "";
    $("#dishForm").elements.image.value = item?.image || "";
    $("#dishForm").elements.imagePublicId.value = item?.imagePublicId || "";
    $("#dishSaveButton").disabled = false;
    $("#chooseDishImage").disabled = false;
    $("#imageUploadProgress").classList.add("hidden");
    $("#imageUploadProgressBar").style.width = "0%";
    setImageUploadStatus("");
    setDishImagePreview(item?.image || "");
  }

  async function uploadSelectedDishImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      window.HapycureCloudinary.validateImage(file);
    } catch (error) {
      setImageUploadStatus(error.message, "error");
      event.target.value = "";
      return;
    }

    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    localPreviewUrl = URL.createObjectURL(file);
    setDishImagePreview(localPreviewUrl);
    imageUploadInProgress = true;
    $("#dishSaveButton").disabled = true;
    $("#chooseDishImage").disabled = true;
    $("#imageUploadProgress").classList.remove("hidden");
    setImageUploadStatus("Uploading image…");

    try {
      const uploaded = await window.HapycureCloudinary.uploadImage(
        file,
        progress => {
          $("#imageUploadProgressBar").style.width = `${progress}%`;
          setImageUploadStatus(`Uploading WebP… ${progress}%`);
        },
        stage => {
          if (stage.stage === "optimizing") {
            setImageUploadStatus("Optimizing image to WebP…");
          }
          if (stage.stage === "uploading") {
            setImageUploadStatus(`Optimized to ${formatFileSize(stage.optimizedBytes)} WebP • Uploading…`);
          }
        }
      );
      $("#dishForm").elements.image.value = uploaded.secureUrl;
      $("#dishForm").elements.imagePublicId.value = uploaded.publicId;
      setDishImagePreview(uploaded.secureUrl);
      $("#imageUploadProgressBar").style.width = "100%";
      setImageUploadStatus(`Image uploaded • ${formatFileSize(uploaded.optimizedBytes)} WebP`, "success");
    } catch (error) {
      $("#dishForm").elements.image.value = "";
      $("#dishForm").elements.imagePublicId.value = "";
      setDishImagePreview("");
      $("#imageUploadProgress").classList.add("hidden");
      setImageUploadStatus(error.message || "Image upload failed.", "error");
    } finally {
      imageUploadInProgress = false;
      $("#dishSaveButton").disabled = false;
      $("#chooseDishImage").disabled = false;
    }
  }

  function removeDishImage() {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
      localPreviewUrl = null;
    }
    $("#dishImageFile").value = "";
    $("#dishForm").elements.image.value = "";
    $("#dishForm").elements.imagePublicId.value = "";
    $("#imageUploadProgress").classList.add("hidden");
    $("#imageUploadProgressBar").style.width = "0%";
    setImageUploadStatus("");
    setDishImagePreview("");
  }

  function includedMeals(value) {
    if (value === "Lunch & Dinner") return ["Lunch", "Dinner"];
    if (value === "Breakfast, Lunch & Dinner") return ["Breakfast", "Lunch", "Dinner"];
    return [value || "Lunch"];
  }

  function ensurePlanMeal(meal) {
    if (!planMealMenus[meal]) {
      planMealMenus[meal] = Object.fromEntries(days.map(day => [day, ""]));
    }
  }

  function captureActivePlanMeal() {
    if (!activePlanMeal) return;
    ensurePlanMeal(activePlanMeal);
    const form = $("#planForm");
    days.forEach(day => {
      planMealMenus[activePlanMeal][day] = form.elements[day].value.trim();
    });
  }

  function showActivePlanMeal() {
    const form = $("#planForm");
    ensurePlanMeal(activePlanMeal);
    days.forEach(day => {
      form.elements[day].value = planMealMenus[activePlanMeal][day] || "";
      form.elements[day].placeholder = `Enter ${activePlanMeal.toLowerCase()} menu for ${day}`;
    });
    $$("#mealMenuTabs [data-meal]").forEach(button => {
      const selected = button.dataset.meal === activePlanMeal;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function renderPlanMealTabs() {
    captureActivePlanMeal();
    const meals = includedMeals($("#planForm").elements.meals.value);
    meals.forEach(ensurePlanMeal);
    if (!meals.includes(activePlanMeal)) activePlanMeal = meals[0];
    $("#mealMenuTabs").innerHTML = meals.map(meal => `
      <button class="meal-menu-tab" data-meal="${meal}" type="button" aria-pressed="false">${meal}</button>
    `).join("");
    showActivePlanMeal();
  }

  function switchPlanMeal(meal) {
    if (!includedMeals($("#planForm").elements.meals.value).includes(meal)) return;
    captureActivePlanMeal();
    activePlanMeal = meal;
    showActivePlanMeal();
  }

  function resetPlanMealMenus(item = null) {
    const meals = includedMeals($("#planForm").elements.meals.value);
    planMealMenus = {};
    meals.forEach(meal => {
      const savedMenu = item?.mealMenus?.[meal];
      planMealMenus[meal] = Object.fromEntries(days.map(day => [
        day,
        typeof savedMenu?.[day] === "string" ? savedMenu[day] : ""
      ]));
    });
    if (item?.menu && !item.mealMenus) {
      days.forEach(day => {
        planMealMenus[meals[0]][day] = typeof item.menu[day] === "string" ? item.menu[day] : "";
      });
    }
    activePlanMeal = "";
    renderPlanMealTabs();
  }

  function openPlanForm(item = null) {
    const form = $("#planForm");
    form.reset();
    form.elements.active.checked = true;
    $("#planFormTitle").textContent = item ? "Edit mess plan" : "Add a mess plan";
    if (item) {
      ["id", "name", "cycle", "price", "meals", "deliveryDays"].forEach(key => {
        form.elements[key].value = item[key] || "";
      });
      form.elements.active.checked = item.active;
    }
    resetPlanMealMenus(item);
    app.showModal("planModal");
  }

  async function saveDish(event) {
    event.preventDefault();
    if (imageUploadInProgress) {
      app.toast("Wait for the image upload to finish");
      return;
    }
    const form = event.currentTarget;
    if (!form.elements.image.value) {
      setImageUploadStatus("Dish image is required.", "error");
      app.toast("Upload a dish image before saving");
      return;
    }
    const item = Object.fromEntries(new FormData(form).entries());
    item.id = item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    item.active = form.elements.active.checked;
    const index = state.dishes.findIndex(dish => dish.id === item.id);
    if (index >= 0) state.dishes[index] = item;
    else state.dishes.unshift(item);
    app.saveState(state);
    app.closeModal("dishModal");
    renderDashboard();
    app.toast("Publishing dish to Hapycure…");
    try {
      await window.HapycureFirebase.syncDish(item, state);
      app.toast(index >= 0 ? "Dish updated on Hapycure" : "Dish published on Hapycure");
    } catch (error) {
      console.error("Firebase dish sync failed:", error);
      app.toast("Saved locally; customer sync pending");
    }
  }

  async function savePlan(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    captureActivePlanMeal();
    const meals = includedMeals(data.meals);
    const missingMenu = meals.flatMap(meal =>
      days.map(day => ({ meal, day, value: planMealMenus[meal]?.[day]?.trim() || "" }))
    ).find(entry => !entry.value);
    if (missingMenu) {
      switchPlanMeal(missingMenu.meal);
      form.elements[missingMenu.day].focus();
      app.toast(`Add ${missingMenu.meal.toLowerCase()} menu for ${missingMenu.day}`);
      return;
    }
    const mealMenus = Object.fromEntries(meals.map(meal => [meal,
      Object.fromEntries(days.map(day => [day, planMealMenus[meal][day].trim()]))
    ]));
    const item = {
      id: data.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: data.name.trim(),
      cycle: data.cycle,
      price: data.price,
      meals: data.meals,
      deliveryDays: data.deliveryDays,
      active: form.elements.active.checked,
      mealMenus,
      menu: Object.fromEntries(days.map(day => [day,
        meals.length === 1
          ? mealMenus[meals[0]][day]
          : meals.map(meal => `${meal}: ${mealMenus[meal][day]}`).join(" • ")
      ]))
    };
    const index = state.plans.findIndex(plan => plan.id === item.id);
    if (index >= 0) state.plans[index] = item;
    else state.plans.unshift(item);
    app.saveState(state);
    app.closeModal("planModal");
    renderDashboard();
    app.toast("Publishing mess plan to Hapycure…");
    try {
      await window.HapycureFirebase.syncPlan(item, state);
      app.toast(index >= 0 ? "Mess plan updated on Hapycure" : "Mess plan published on Hapycure");
    } catch (error) {
      console.error("Firebase mess-plan sync failed:", error);
      const code = String(error?.code || "").replace("firestore/", "");
      app.toast(code ? `Customer sync failed: ${code}` : "Customer sync failed. Please try again");
    }
  }

  function openProfileForm() {
    const form = $("#profileForm");
    const business = state.business;
    const isMess = state.service === "mess";
    ["name", "foodType", "phone", "openTime", "closeTime"].forEach(key => {
      form.elements[key].value = business[key] || "";
    });
    $("#businessHoursFields").classList.toggle("hidden", isMess);
    $("#messBannerField").classList.toggle("hidden", !isMess);
    form.elements.openTime.required = !isMess;
    form.elements.closeTime.required = !isMess;
    resetMessBannerUploader();
    form.elements.open.checked = business.open;
    const picker = document.querySelector('[data-location-picker="profile"]');
    app.resetLocationPicker(picker);
    if (business.address) app.setLocationData(picker, business);
    app.showModal("profileModal");
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (bannerUploadInProgress) {
      app.toast("Wait for the banner upload to finish");
      return;
    }
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const isMess = state.service === "mess";
    const picker = document.querySelector('[data-location-picker="profile"]');
    if (!data.address || !data.latitude || !data.longitude) {
      app.setLocationStatus(picker, "Detect your current location before saving.", true);
      app.toast("Current location is required");
      return;
    }
    state.business = {
      ...state.business,
      name: data.name.trim(),
      foodType: data.foodType,
      phone: data.phone,
      address: data.address,
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      accuracy: Number(data.accuracy) || null,
      openTime: isMess ? "" : data.openTime,
      closeTime: isMess ? "" : data.closeTime,
      image: isMess ? data.bannerImage : (state.business.image || ""),
      imagePublicId: isMess ? data.bannerPublicId : (state.business.imagePublicId || ""),
      bannerImage: isMess ? data.bannerImage : (state.business.bannerImage || ""),
      bannerPublicId: isMess ? data.bannerPublicId : (state.business.bannerPublicId || ""),
      open: form.elements.open.checked
    };
    app.saveState(state);
    app.closeModal("profileModal");
    renderDashboard();
    app.toast("Publishing profile changes…");
    try {
      await window.HapycureFirebase.syncBusiness(state);
      app.toast("Business profile updated on Hapycure");
    } catch (error) {
      console.error("Firebase business sync failed:", error);
      app.toast("Saved locally; customer sync pending");
    }
  }

  function setMessBannerPreview(url) {
    const image = $("#messBannerPreviewImage");
    const placeholder = $("#messBannerPlaceholder");
    image.hidden = !url;
    placeholder.classList.toggle("hidden", Boolean(url));
    if (url) image.src = url;
    else image.removeAttribute("src");
    $("#removeMessBanner").classList.toggle("hidden", !url);
  }

  function setMessBannerStatus(message, type = "") {
    const status = $("#messBannerStatus");
    status.textContent = message;
    status.classList.toggle("error", type === "error");
    status.classList.toggle("success", type === "success");
  }

  function resetMessBannerUploader() {
    if (bannerPreviewUrl) {
      URL.revokeObjectURL(bannerPreviewUrl);
      bannerPreviewUrl = null;
    }
    const business = state.business || {};
    const bannerImage = business.bannerImage || business.image || "";
    const bannerPublicId = business.bannerPublicId || business.imagePublicId || "";
    bannerUploadInProgress = false;
    $("#messBannerFile").value = "";
    $("#profileForm").elements.bannerImage.value = bannerImage;
    $("#profileForm").elements.bannerPublicId.value = bannerPublicId;
    $("#profileSaveButton").disabled = false;
    $("#chooseMessBanner").disabled = false;
    $("#messBannerProgress").classList.add("hidden");
    $("#messBannerProgressBar").style.width = "0%";
    setMessBannerStatus("");
    setMessBannerPreview(bannerImage);
  }

  async function uploadMessBanner(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = $("#profileForm");
    const previousImage = form.elements.bannerImage.value;
    const previousPublicId = form.elements.bannerPublicId.value;

    try {
      window.HapycureCloudinary.validateImage(file);
    } catch (error) {
      setMessBannerStatus(error.message, "error");
      event.target.value = "";
      return;
    }

    if (bannerPreviewUrl) URL.revokeObjectURL(bannerPreviewUrl);
    bannerPreviewUrl = URL.createObjectURL(file);
    setMessBannerPreview(bannerPreviewUrl);
    bannerUploadInProgress = true;
    $("#profileSaveButton").disabled = true;
    $("#chooseMessBanner").disabled = true;
    $("#messBannerProgress").classList.remove("hidden");
    setMessBannerStatus("Uploading banner…");

    try {
      const uploaded = await window.HapycureCloudinary.uploadBanner(
        file,
        progress => {
          $("#messBannerProgressBar").style.width = `${progress}%`;
          setMessBannerStatus(`Uploading WebP… ${progress}%`);
        },
        stage => {
          if (stage.stage === "optimizing") setMessBannerStatus("Optimizing banner to WebP…");
          if (stage.stage === "uploading") {
            setMessBannerStatus(`Optimized to ${formatFileSize(stage.optimizedBytes)} WebP • Uploading…`);
          }
        }
      );
      form.elements.bannerImage.value = uploaded.secureUrl;
      form.elements.bannerPublicId.value = uploaded.publicId;
      setMessBannerPreview(uploaded.secureUrl);
      $("#messBannerProgressBar").style.width = "100%";
      setMessBannerStatus(`Banner uploaded • ${formatFileSize(uploaded.optimizedBytes)} WebP`, "success");
    } catch (error) {
      form.elements.bannerImage.value = previousImage;
      form.elements.bannerPublicId.value = previousPublicId;
      setMessBannerPreview(previousImage);
      $("#messBannerProgress").classList.add("hidden");
      setMessBannerStatus(error.message || "Banner upload failed.", "error");
    } finally {
      bannerUploadInProgress = false;
      $("#profileSaveButton").disabled = false;
      $("#chooseMessBanner").disabled = false;
    }
  }

  function removeMessBanner() {
    if (bannerPreviewUrl) {
      URL.revokeObjectURL(bannerPreviewUrl);
      bannerPreviewUrl = null;
    }
    $("#messBannerFile").value = "";
    $("#profileForm").elements.bannerImage.value = "";
    $("#profileForm").elements.bannerPublicId.value = "";
    $("#messBannerProgress").classList.add("hidden");
    $("#messBannerProgressBar").style.width = "0%";
    setMessBannerStatus("");
    setMessBannerPreview("");
  }

  async function catalogueAction(event) {
    if (event.target.closest("[data-empty-add]")) {
      openAddForm();
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const collection = state.service === "mess" ? state.plans : state.dishes;
    const item = collection.find(entry => entry.id === button.dataset.id);
    if (!item) return;

    if (button.dataset.action === "edit") openAddForm(item);
    if (button.dataset.action === "toggle") {
      item.active = !item.active;
      app.saveState(state);
      renderDashboard();
      try {
        if (state.service === "food") await window.HapycureFirebase.syncDish(item, state);
        else await window.HapycureFirebase.syncPlan(item, state);
        app.toast(item.active ? "Listing activated on Hapycure" : "Listing paused on Hapycure");
      } catch (error) {
        console.error("Firebase availability sync failed:", error);
        app.toast("Saved locally; customer sync pending");
      }
    }
    if (button.dataset.action === "delete" && confirm(`Delete "${item.name}"?`)) {
      collection.splice(collection.findIndex(entry => entry.id === item.id), 1);
      app.saveState(state);
      renderDashboard();
      try {
        if (state.service === "food") await window.HapycureFirebase.deleteDish(item.id);
        else await window.HapycureFirebase.deletePlan(item.id);
        app.toast("Listing removed from Hapycure");
      } catch (error) {
        console.error("Firebase listing deletion failed:", error);
        app.toast("Deleted locally; customer removal pending");
      }
    }
  }

  $("#heroAdd").addEventListener("click", () => openAddForm());
  $("#sectionAdd").addEventListener("click", () => openAddForm());
  $("#catalogue").addEventListener("click", catalogueAction);
  $("#catalogueSearch").addEventListener("input", renderCatalogue);
  $("#catalogueFilter").addEventListener("change", renderCatalogue);
  $("#openProfile").addEventListener("click", openProfileForm);
  $("#editBusiness").addEventListener("click", openProfileForm);
  $("#profileForm").addEventListener("submit", saveProfile);
  $("#chooseMessBanner").addEventListener("click", () => $("#messBannerFile").click());
  $("#messBannerFile").addEventListener("change", uploadMessBanner);
  $("#removeMessBanner").addEventListener("click", removeMessBanner);
  $("#dishForm").addEventListener("submit", saveDish);
  $("#planForm").addEventListener("submit", savePlan);
  $("#planForm").elements.meals.addEventListener("change", renderPlanMealTabs);
  $("#mealMenuTabs").addEventListener("click", event => {
    const button = event.target.closest("[data-meal]");
    if (button) switchPlanMeal(button.dataset.meal);
  });
  $("#chooseDishImage").addEventListener("click", () => $("#dishImageFile").click());
  $("#dishImageFile").addEventListener("change", uploadSelectedDishImage);
  $("#removeDishImage").addEventListener("click", removeDishImage);
  $("#detectProfileLocation").addEventListener("click", () =>
    app.detectLocation(document.querySelector('[data-location-picker="profile"]'), "Update current location")
  );
  $("#logoutPartner").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Logging out…";
    try {
      if (window.firebase?.auth) await firebase.auth().signOut();
    } catch (error) {
      console.warn("Firebase sign-out failed; clearing the local session.", error);
    } finally {
      localStorage.removeItem("hapycurePartnerAuthenticated");
      localStorage.removeItem("hapycurePartnerUser");
      localStorage.removeItem("hapycurePartnerV2");
      sessionStorage.removeItem("hapycurePartnerGoogleRedirectPending");
      location.replace("../");
    }
  });
  $$("[data-close]").forEach(button =>
    button.addEventListener("click", () => app.closeModal(button.dataset.close))
  );
  $$(".modal").forEach(modal =>
    modal.addEventListener("click", event => {
      if (event.target === modal) app.closeModal(modal.id);
    })
  );
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") $$(".modal.show").forEach(modal => app.closeModal(modal.id));
  });

  renderDashboard();
  window.HapycureFirebase.syncAllState(state).catch(error => {
    console.error("Firebase startup sync failed:", error);
    app.toast("Customer sync unavailable. Check Firebase setup.");
  });
})();
