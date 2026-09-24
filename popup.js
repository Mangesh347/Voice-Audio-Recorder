const el = (id) => document.getElementById(id);
let timerInterval = null;
let currentIsPro = false;

const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const colorPreference = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(theme) {
  const normalizedTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalizedTheme;
  el("settingsTheme").textContent = normalizedTheme === "dark" ? "Dark" : "Light";
  const nextTheme = normalizedTheme === "dark" ? "light" : "dark";
  el("themeBtn").setAttribute("aria-label", `Switch to ${nextTheme} theme`);
  el("themeBtn").title = `Switch to ${nextTheme[0].toUpperCase()}${nextTheme.slice(1)} Theme`;
}

async function restoreTheme() {
  const preferredTheme = colorPreference.matches ? "dark" : "light";
  applyTheme(preferredTheme);
  try {
    const { theme } = await chrome.storage.local.get("theme");
    applyTheme(theme || preferredTheme);
  } catch {
    // Static previews have no extension storage; the system theme still applies.
  }
}

function syncRibbonMotion() {
  const ribbon = document.querySelector(".music-ribbon");
  if (!ribbon) return;
  if (motionPreference.matches) ribbon.pauseAnimations?.();
  else ribbon.unpauseAnimations?.();
}

syncRibbonMotion();
motionPreference.addEventListener?.("change", syncRibbonMotion);

async function send(msg) {
  return chrome.runtime.sendMessage(msg);
}

async function currentTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

function renderQuota({ quota, isPro, limits }) {
  currentIsPro = isPro;
  el("planBadge").textContent = isPro ? "Pro" : "Free";
  el("planBadge").className = "badge" + (isPro ? " pro" : "");
  el("planBadge").setAttribute("aria-label", isPro ? "Lifetime Pro plan" : "Free plan");
  document.querySelector(".profile-glyph").classList.toggle("is-pro", isPro);
  el("profileAvatar").classList.toggle("is-pro", isPro);
  el("quotaSection").classList.toggle("is-pro", isPro);
  el("upgradeLink").textContent = isPro ? "Lifetime Pro" : "Free plan";

  if (isPro) {
    el("qUsed").textContent = "∞";
    el("qLimit").textContent = "local";
    el("qRemaining").textContent = "Unlimited recordings";
    el("quotaSection").style.setProperty("--usage-progress", "360deg");
    el("quotaSection").setAttribute("aria-label", "Pro plan with unlimited local recordings");
    el("profilePlan").textContent = "Lifetime Pro";
    el("profileUsage").textContent = "Unlimited Local Recordings";
  } else {
    const used = Math.min(quota.recordings, limits.recordings);
    const remaining = Math.max(0, limits.recordings - used);
    const progress = limits.recordings ? (used / limits.recordings) * 360 : 0;
    el("qUsed").textContent = String(used);
    el("qLimit").textContent = `of ${limits.recordings}`;
    el("qRemaining").textContent = `${remaining} left this month`;
    el("quotaSection").style.setProperty("--usage-progress", `${progress}deg`);
    el("quotaSection").setAttribute(
      "aria-label",
      `${used} of ${limits.recordings} recordings used this month`
    );
    el("profilePlan").textContent = "Free Plan";
    el("profileUsage").textContent = `${quota.recordings} Of ${limits.recordings} Recordings Used This Month`;
  }
}

async function syncProfileAccount() {
  const button = el("googleLoginBtn");
  const label = button.querySelector("span");
  const configured = Boolean(
    globalThis.FENWICK_CONFIG?.supabaseUrl &&
    globalThis.FENWICK_CONFIG?.supabaseAnonKey
  );

  if (!configured) {
    button.disabled = true;
    label.textContent = "Continue With Google";
    el("profileAccountStatus").textContent = "Google sign-in becomes available after Supabase is configured.";
    return;
  }

  const { supabaseSession } = await chrome.storage.local.get("supabaseSession");
  if (supabaseSession?.user) {
    button.disabled = true;
    label.textContent = "Google Account Connected";
    el("profileAccountStatus").textContent =
      supabaseSession.user.email || "Your Google account is connected.";
  } else {
    button.disabled = false;
    label.textContent = "Continue With Google";
    el("profileAccountStatus").textContent = "Sign in to purchase or restore Lifetime access.";
  }
}

function renderState(state) {
  const idle = state.status === "idle";
  el("idleControls").classList.toggle("hidden", !idle);
  el("activeControls").classList.toggle("hidden", idle);

  if (!idle) {
    const paused = state.status === "paused";
    el("statusLine").textContent = paused ? "Recording Paused" : "Recording Now";
    const sourceLabels = {
      tab_only: "Audio",
      mic_only: "Voice",
      tab_and_mic: "Audio + Voice",
    };
    el("activeSource").textContent = sourceLabels[state.captureMode] || "Audio + Voice";
    el("activeControls").classList.toggle("is-paused", paused);
    el("pauseBtn").classList.toggle("hidden", state.status === "paused");
    el("resumeBtn").classList.toggle("hidden", state.status !== "paused");
    startTimer(state.startedAt);
  } else {
    stopTimer();
  }
}

function startTimer(startedAt) {
  stopTimer();
  const start = Number(startedAt) || Date.now();
  const update = () => {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    const text = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    el("recordingTimer").textContent = text;
    el("recordingTimer").dateTime = `PT${elapsedSeconds}S`;
  };
  update();
  timerInterval = window.setInterval(update, 1000);
}

function stopTimer() {
  if (timerInterval) window.clearInterval(timerInterval);
  timerInterval = null;
}

function showError(message) {
  el("errorMessage").textContent = message;
  el("errorMessage").classList.toggle("hidden", !message);
}

function setStartLabel(isStarting) {
  el("startBtn").classList.toggle("is-starting", isStarting);
  el("startBtn").setAttribute("aria-label", isStarting ? "Starting Recording" : "Start Recording");
}

async function refresh() {
  try {
    const res = await send({ type: "GET_STATE" });
    if (!res) throw new Error("Recorder state is unavailable.");
    renderQuota(res);
    renderState(res.state);
  } catch (error) {
    showError("Fenwick could not load. Close and reopen the recorder.");
  }
}

function selectedCaptureMode() {
  return document.querySelector('input[name="captureMode"]:checked')?.value || "tab_and_mic";
}

function updateCaptureHint(captureMode) {
  const hints = {
    tab_only: "Records This Browser Tab’s Audio. Your Audio Stays On This Device.",
    mic_only: "Records Your Microphone Voice. Your Audio Stays On This Device.",
    tab_and_mic: "Records This Browser Tab And Your Microphone. Your Audio Stays On This Device.",
  };
  el("recordHint").textContent = hints[captureMode] || hints.tab_and_mic;
  const labels = {
    tab_only: "Audio",
    mic_only: "Voice",
    tab_and_mic: "Audio + Voice",
  };
  el("settingsSource").textContent = labels[captureMode] || labels.tab_and_mic;
}

async function restoreCaptureMode() {
  const { captureMode = "tab_and_mic" } = await chrome.storage.local.get("captureMode");
  const input = document.querySelector(`input[name="captureMode"][value="${captureMode}"]`);
  if (input) input.checked = true;
  updateCaptureHint(selectedCaptureMode());
}

document.querySelectorAll('input[name="captureMode"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) {
      updateCaptureHint(input.value);
      chrome.storage.local.set({ captureMode: input.value });
    }
  });
});

el("startBtn").addEventListener("click", async () => {
  const startButton = el("startBtn");
  showError("");
  startButton.disabled = true;
  setStartLabel(true);

  try {
    const tabId = await currentTabId();
    const res = await send({
      type: "START_RECORDING",
      tabId,
      captureMode: selectedCaptureMode(),
    });
    if (!res?.ok) {
      const message = res?.error === "QUOTA_RECORDINGS"
        ? "You’ve used all 10 free recordings this month. Unlock unlimited recording to continue."
        : res?.error || "Recording could not start. Check this tab and try again.";
      showError(message);
      return;
    }
    await refresh();
  } catch (error) {
    showError("Recording could not start. Check Chrome’s audio permissions and try again.");
  } finally {
    startButton.disabled = false;
    setStartLabel(false);
  }
});

el("pauseBtn").addEventListener("click", async () => {
  await send({ type: "PAUSE_RECORDING" });
  await refresh();
});

el("resumeBtn").addEventListener("click", async () => {
  await send({ type: "RESUME_RECORDING" });
  await refresh();
});

el("endBtn").addEventListener("click", async () => {
  await send({ type: "END_RECORDING" });
  window.close(); // saving and downloading continue in the background
});

function showPopupPanel(panel) {
  const isSettings = panel === "settings";
  el("mainView").classList.add("hidden");
  el("panelView").classList.remove("hidden");
  el("settingsPanel").classList.toggle("hidden", !isSettings);
  el("profilePanel").classList.toggle("hidden", isSettings);
  el("panelTitle").textContent = isSettings ? "Settings" : "Profile";
  el("settingsBtn").classList.toggle("is-active", isSettings);
  el("profileBtn").classList.toggle("is-active", !isSettings);
  el("settingsBtn").setAttribute("aria-pressed", String(isSettings));
  el("profileBtn").setAttribute("aria-pressed", String(!isSettings));
  el("panelBackBtn").focus();
}

function showUpgradeDialog() {
  const title = el("upgradeTitle");
  const description = el("upgradeDescription");
  const action = el("testUpgradeBtn");
  const note = el("upgradeTestNote");

  if (currentIsPro) {
    title.textContent = "Lifetime Pro Is Active";
    description.textContent = "You have unlimited local recordings with no monthly recording limit.";
    action.classList.add("hidden");
    note.textContent = "Your Lifetime Pro access is active on this browser.";
  } else {
    title.textContent = "You’re On The Free Plan";
    description.textContent =
      "Upgrade once to Lifetime Pro and record without monthly limits. Your recordings always stay on this device.";
    action.classList.remove("hidden");
    action.disabled = false;
    action.textContent = "Upgrade To Lifetime Pro";
    note.textContent = "Tap Upgrade to unlock Lifetime Pro on this browser.";
  }

  if (!el("upgradeDialog").open) el("upgradeDialog").showModal();
}

async function activateLifetimePro(button) {
  const action = button || el("testUpgradeBtn");
  const note = el("upgradeTestNote");
  const previousLabel = action.textContent;
  action.disabled = true;
  action.textContent = "Activating…";
  if (note) note.textContent = "Unlocking Lifetime Pro…";

  try {
    let result = await send({ type: "UNLOCK_LIFETIME_PRO" });
    if (!result?.ok) {
      result = await send({ type: "TEST_UNLOCK_LIFETIME" });
    }

    if (!result?.ok) {
      // Local fallback so Free → Lifetime Pro still works if the worker is waking up.
      await chrome.storage.local.set({
        isPro: true,
        entitlementCache: {
          status: "lifetime",
          source: "local_upgrade",
          plan: "lifetime_pro",
          unlockedAt: Date.now(),
          expiresAt: Date.now() + (3650 * 24 * 60 * 60 * 1000),
        },
      });
    }

    await refresh();
    showUpgradeDialog();
    if (note) note.textContent = "Lifetime Pro is now active.";
  } catch (error) {
    action.disabled = false;
    action.textContent = previousLabel || "Try Again";
    if (note) {
      note.textContent =
        error instanceof Error ? error.message : "Lifetime Pro could not be activated.";
    }
  }
}

el("upgradeLink").addEventListener("click", showUpgradeDialog);
el("planBadge").addEventListener("click", showUpgradeDialog);
el("upgradeCloseBtn").addEventListener("click", () => el("upgradeDialog").close());
el("upgradeDialog").addEventListener("click", (event) => {
  if (event.target === el("upgradeDialog")) el("upgradeDialog").close();
});
el("testUpgradeBtn").addEventListener("click", () => activateLifetimePro());

el("profileBtn").addEventListener("click", () => showPopupPanel("profile"));
el("settingsBtn").addEventListener("click", () => showPopupPanel("settings"));
el("panelBackBtn").addEventListener("click", () => {
  el("panelView").classList.add("hidden");
  el("mainView").classList.remove("hidden");
  el("settingsBtn").classList.remove("is-active");
  el("profileBtn").classList.remove("is-active");
  el("settingsBtn").removeAttribute("aria-pressed");
  el("profileBtn").removeAttribute("aria-pressed");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !el("panelView").classList.contains("hidden")) {
    el("panelBackBtn").click();
  }
});
el("themeBtn").addEventListener("click", async () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  try {
    await chrome.storage.local.set({ theme: nextTheme });
  } catch {
    // The visual toggle still works in static previews without extension storage.
  }
});
el("googleLoginBtn").addEventListener("click", async () => {
  const button = el("googleLoginBtn");
  const label = button.querySelector("span");
  button.disabled = true;
  label.textContent = "Connecting…";
  el("profileAccountStatus").textContent = "Opening secure Google sign-in…";

  try {
    const result = await send({ type: "GOOGLE_SIGN_IN" });
    if (!result?.ok) throw new Error(result?.error || "Google sign-in failed.");
    await refresh();
    await syncProfileAccount();
  } catch (error) {
    button.disabled = false;
    label.textContent = "Continue With Google";
    el("profileAccountStatus").textContent =
      error instanceof Error ? error.message : "Google sign-in could not start.";
  }
});

Promise.allSettled([restoreCaptureMode(), restoreTheme(), syncProfileAccount()]).finally(refresh);
