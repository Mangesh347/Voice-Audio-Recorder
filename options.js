const optionEl = (id) => document.getElementById(id);

let currentSession = null;
let currentUser = null;
let currentEntitlement = { status: "free" };
let pendingEmail = "";

function showStatus(message, isError = false) {
  const status = optionEl("optionsStatus");
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function setBusy(button, busy, busyLabel) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.label;
}

function showSection(section) {
  const normalized = section === "settings" ? "settings" : "profile";
  optionEl("profileSection").classList.toggle("hidden", normalized !== "profile");
  optionEl("settingsSection").classList.toggle("hidden", normalized !== "settings");
  document.querySelectorAll(".section-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.section === normalized);
  });
}

async function renderUsage() {
  const { quota } = await chrome.storage.local.get("quota");
  const month = new Date();
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const used = quota?.month === monthKey ? Number(quota.recordings) || 0 : 0;
  optionEl("monthlyUsage").textContent = currentEntitlement.status === "lifetime"
    ? "Unlimited recordings with Lifetime"
    : `${used} of 10 recordings used this month`;
}

function renderAccount() {
  const signedIn = Boolean(currentSession && currentUser);
  const lifetime = currentEntitlement.status === "lifetime";

  optionEl("signedOutView").classList.toggle("hidden", signedIn);
  optionEl("signedInView").classList.toggle("hidden", !signedIn);
  optionEl("refreshPlanBtn").classList.toggle("hidden", !signedIn);
  optionEl("checkoutActions").classList.toggle("hidden", lifetime);
  optionEl("lifetimeActive").classList.toggle("hidden", !lifetime);
  optionEl("accountPlanBadge").textContent = lifetime ? "Lifetime" : "Free";
  optionEl("accountPlanBadge").classList.toggle("is-lifetime", lifetime);

  optionEl("paypalBtn").disabled = !signedIn;
  optionEl("razorpayBtn").disabled = !signedIn;

  if (signedIn) {
    const email = currentUser.email || "Signed-in user";
    const displayName = currentUser.user_metadata?.full_name
      || currentUser.user_metadata?.name
      || email.split("@")[0];
    optionEl("accountName").textContent = displayName;
    optionEl("accountEmail").textContent = email;
    optionEl("avatar").textContent = displayName.slice(0, 1).toUpperCase();
  }

  renderUsage();
}

async function loadAccount({ refreshPlan = false } = {}) {
  currentSession = await FenwickAuth.getSession();
  currentUser = currentSession ? await FenwickAuth.getUser(currentSession) : null;

  if (currentSession && refreshPlan) {
    currentEntitlement = await FenwickAuth.refreshEntitlement();
  } else {
    const { entitlementCache } = await chrome.storage.local.get("entitlementCache");
    currentEntitlement = entitlementCache?.expiresAt > Date.now()
      ? entitlementCache
      : { status: "free" };
  }

  renderAccount();
}

document.querySelectorAll(".section-tab").forEach((button) => {
  button.addEventListener("click", () => showSection(button.dataset.section));
});

optionEl("googleSignInBtn").addEventListener("click", async () => {
  const button = optionEl("googleSignInBtn");
  setBusy(button, true, "Opening Google…");
  showStatus("");
  try {
    await FenwickAuth.signInWithGoogle();
    await loadAccount({ refreshPlan: true });
    showStatus("Signed in successfully.");
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    setBusy(button, false);
  }
});

optionEl("emailForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = optionEl("sendCodeBtn");
  pendingEmail = optionEl("emailInput").value.trim();
  setBusy(button, true, "Sending…");
  showStatus("");
  try {
    await FenwickAuth.sendEmailCode(pendingEmail);
    optionEl("codeForm").classList.remove("hidden");
    optionEl("codeInput").focus();
    showStatus("Check your email for the verification code.");
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    setBusy(button, false);
  }
});

optionEl("codeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  setBusy(button, true, "Verifying…");
  showStatus("");
  try {
    await FenwickAuth.verifyEmailCode(
      pendingEmail || optionEl("emailInput").value.trim(),
      optionEl("codeInput").value.trim(),
    );
    await loadAccount({ refreshPlan: true });
    showStatus("Email verified. You are signed in.");
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    setBusy(button, false);
  }
});

optionEl("signOutBtn").addEventListener("click", async () => {
  await FenwickAuth.signOut();
  currentSession = null;
  currentUser = null;
  currentEntitlement = { status: "free" };
  renderAccount();
  showStatus("Signed out.");
});

optionEl("refreshPlanBtn").addEventListener("click", async () => {
  const button = optionEl("refreshPlanBtn");
  setBusy(button, true, "Refreshing…");
  showStatus("");
  try {
    await loadAccount({ refreshPlan: true });
    showStatus("Plan status refreshed.");
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    setBusy(button, false);
  }
});

optionEl("paypalBtn").addEventListener("click", async () => {
  showStatus("");
  try {
    if (globalThis.FENWICK_CONFIG?.testLifetimeUpgrade) {
      const result = await chrome.runtime.sendMessage({ type: "UNLOCK_LIFETIME_PRO" });
      if (!result?.ok) throw new Error(result?.error || "Lifetime Pro could not be activated.");
      await loadAccount({ refreshPlan: false });
      const { isPro } = await chrome.storage.local.get("isPro");
      currentEntitlement = { status: isPro ? "lifetime" : "free" };
      renderAccount();
      showStatus("Lifetime Pro is now active.");
      return;
    }
    await FenwickAuth.createCheckout("paypal");
    showStatus("PayPal checkout opened in a new tab.");
  } catch (error) {
    showStatus(error.message, true);
  }
});

optionEl("razorpayBtn").addEventListener("click", async () => {
  showStatus("");
  try {
    if (globalThis.FENWICK_CONFIG?.testLifetimeUpgrade) {
      const result = await chrome.runtime.sendMessage({ type: "UNLOCK_LIFETIME_PRO" });
      if (!result?.ok) throw new Error(result?.error || "Lifetime Pro could not be activated.");
      await loadAccount({ refreshPlan: false });
      const { isPro } = await chrome.storage.local.get("isPro");
      currentEntitlement = { status: isPro ? "lifetime" : "free" };
      renderAccount();
      showStatus("Lifetime Pro is now active.");
      return;
    }
    await FenwickAuth.createCheckout("razorpay");
    showStatus("Razorpay checkout opened in a new tab.");
  } catch (error) {
    showStatus(error.message, true);
  }
});

async function initialize() {
  const configured = await FenwickAuth.isConfigured();
  const testUpgrade = Boolean(globalThis.FENWICK_CONFIG?.testLifetimeUpgrade);
  optionEl("configNotice").classList.toggle("hidden", configured);
  document.querySelectorAll("#googleSignInBtn, #sendCodeBtn").forEach((button) => {
    button.disabled = !configured;
  });
  document.querySelectorAll("#paypalBtn, #razorpayBtn").forEach((button) => {
    button.disabled = !(configured || testUpgrade);
  });

  const redirectUrl = FenwickAuth.getExtensionRedirectUrl();
  optionEl("redirectUrlDisplay").textContent = redirectUrl;

  const config = await FenwickAuth.getConfig();
  if (config.supabaseAnonKey) {
    optionEl("supabaseKeyInput").value = config.supabaseAnonKey;
    optionEl("supabaseKeyInput").placeholder = "Key saved — paste a new one to replace";
  }

  const { optionsSection } = await chrome.storage.local.get("optionsSection");
  await chrome.storage.local.remove("optionsSection");
  showSection(optionsSection);

  await loadAccount({
    refreshPlan: configured && new URLSearchParams(location.search).get("checkout") === "success",
  });

  if (location.search.includes("checkout=success")) {
    showStatus(
      currentEntitlement.status === "lifetime"
        ? "Lifetime activated successfully."
        : "Payment received. Plan verification may take a moment; use Refresh plan.",
    );
  }
}

optionEl("saveSupabaseKeyBtn").addEventListener("click", async () => {
  const button = optionEl("saveSupabaseKeyBtn");
  setBusy(button, true, "Saving…");
  showStatus("");
  try {
    await FenwickAuth.saveSupabaseKey(optionEl("supabaseKeyInput").value);
    showStatus("Supabase key saved. Continue with Google is ready.");
    optionEl("configNotice").classList.add("hidden");
    optionEl("googleSignInBtn").disabled = false;
    optionEl("sendCodeBtn").disabled = false;
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    setBusy(button, false);
  }
});

optionEl("copyRedirectBtn").addEventListener("click", async () => {
  const url = optionEl("redirectUrlDisplay").textContent.trim();
  try {
    await navigator.clipboard.writeText(url);
    showStatus("Redirect URL copied. Paste it into Supabase Auth → Redirect URLs.");
  } catch {
    showStatus("Could not copy automatically — select and copy the URL manually.", true);
  }
});

initialize().catch((error) => showStatus(error.message, true));
