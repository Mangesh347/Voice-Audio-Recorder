const el = (id) => document.getElementById(id);
let timerInterval = null;
let currentIsPro = false;
let pausedAt = null;
let pausedTotalMs = 0;

const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const colorPreference = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(theme) {
  const normalizedTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalizedTheme;
  el("settingsTheme").textContent = normalizedTheme === "dark" ? "Dark" : "Light";
  const nextTheme = normalizedTheme === "dark" ? "light" : "dark";
  el("themeBtn").setAttribute("aria-label", `Switch to ${nextTheme} theme`);
  el("themeBtn").title = `Switch to ${nextTheme[0].toUpperCase()}${nextTheme.slice(1)} Theme`;

  // SVG stop-color via CSS is unreliable — set accent curves directly.
  const ribbonStops = document.querySelectorAll("#ribbonGradient stop");
  const sealStops = document.querySelectorAll("#sealGradient stop");
  const sealColor = normalizedTheme === "dark" ? "#00BFFF" : "#1D8BE7";
  // Accent curves stay #FF6800 in both light and dark themes.
  ribbonStops.forEach((stop) => stop.setAttribute("stop-color", "#FF6800"));
  sealStops.forEach((stop) => stop.setAttribute("stop-color", sealColor));
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
  const signOut = el("googleSignOutBtn");
  const { supabaseSession } = await chrome.storage.local.get(["supabaseSession"]);
  const configured = Boolean(
    globalThis.FENWICK_CONFIG?.supabaseUrl && globalThis.FENWICK_CONFIG?.supabaseAnonKey,
  );

  if (!configured) {
    button.disabled = true;
    label.textContent = "Continue With Google";
    signOut.classList.add("hidden");
    el("profileAccountStatus").textContent =
      "Google sign-in is temporarily unavailable.";
    return;
  }

  if (supabaseSession?.user) {
    button.disabled = true;
    label.textContent = "Google Account Connected";
    signOut.classList.remove("hidden");
    el("profileAccountStatus").textContent =
      supabaseSession.user.email || "Your Google account is connected.";
  } else {
    button.disabled = false;
    label.textContent = "Continue With Google";
    signOut.classList.add("hidden");
    el("profileAccountStatus").textContent =
      "Tap Continue with Google to sign up or sign in.";
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
    startTimer(state.startedAt, state.status === "paused");
  } else {
    pausedAt = null;
    pausedTotalMs = 0;
    stopTimer();
  }
}

function startTimer(startedAt, isPaused = false) {
  stopTimer();
  const start = Number(startedAt) || Date.now();

  if (isPaused) {
    if (pausedAt == null) pausedAt = Date.now();
  } else if (pausedAt != null) {
    pausedTotalMs += Date.now() - pausedAt;
    pausedAt = null;
  }

  const update = () => {
    const freezeAt = pausedAt != null ? pausedAt : Date.now();
    const elapsedSeconds = Math.max(
      0,
      Math.floor((freezeAt - start - pausedTotalMs) / 1000),
    );
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    const text = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    el("recordingTimer").textContent = text;
    el("recordingTimer").dateTime = `PT${elapsedSeconds}S`;
  };
  update();
  if (!isPaused) timerInterval = window.setInterval(update, 1000);
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

function modeNeedsMicrophone(captureMode = selectedCaptureMode()) {
  return captureMode !== "tab_only";
}

async function openMicrophonePermissionPage() {
  const url = chrome.runtime.getURL("permission.html");
  const existing = await chrome.tabs.query({ url });
  if (existing[0]?.id) {
    await chrome.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId) {
      await chrome.windows.update(existing[0].windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url });
}

async function ensureMicrophoneAccess() {
  if (!modeNeedsMicrophone()) return true;

  const { micPermissionGranted } = await chrome.storage.local.get("micPermissionGranted");

  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: "microphone" });
      if (status.state === "denied") {
        showError("Microphone is blocked for this extension. Allow it in Chrome site settings, then try again.");
        await openMicrophonePermissionPage();
        return false;
      }
      if (status.state === "granted") {
        await chrome.storage.local.set({ micPermissionGranted: true });
        return true;
      }
    }
  } catch {
    // permissions.query is not always available for microphone; fall through to getUserMedia.
  }

  if (micPermissionGranted) return true;

  showError("Allow microphone access when Chrome asks, then Fenwick will start recording.");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    stream.getTracks().forEach((track) => track.stop());
    await chrome.storage.local.set({
      micPermissionGranted: true,
      micPermissionCheckedAt: Date.now(),
    });
    showError("");
    return true;
  } catch (error) {
    await chrome.storage.local.set({ micPermissionGranted: false });
    await openMicrophonePermissionPage();
    const denied = error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError";
    showError(
      denied
        ? "Allow the microphone in the permission tab, then press Start Recording again."
        : (error?.message || "Microphone permission is required for Voice recording."),
    );
    return false;
  }
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
    const captureMode = selectedCaptureMode();
    if (!(await ensureMicrophoneAccess())) return;

    const tabId = await currentTabId();
    if (captureMode !== "mic_only" && !tabId) {
      showError("Open a browser tab to record, then try again.");
      return;
    }

    const res = await send({
      type: "START_RECORDING",
      tabId,
      captureMode,
    });
    if (!res?.ok) {
      const message = res?.error === "QUOTA_RECORDINGS"
        ? "You’ve used all 10 free recordings this month. Unlock unlimited recording to continue."
        : res?.error || "Recording could not start. Check this tab and try again.";
      if (/microphone/i.test(message)) {
        await chrome.storage.local.set({ micPermissionGranted: false });
        await openMicrophonePermissionPage();
      }
      showError(message);
      return;
    }
    await refresh();
  } catch (error) {
    showError(
      error instanceof Error
        ? error.message
        : "Recording could not start. Check Chrome’s audio permissions and try again.",
    );
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
  const endButton = el("endBtn");
  endButton.disabled = true;
  try {
    await send({ type: "END_RECORDING" });
  } finally {
    window.close();
  }
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

async function isSignedInWithGoogle() {
  const { supabaseSession } = await chrome.storage.local.get("supabaseSession");
  return Boolean(supabaseSession?.user || supabaseSession?.accessToken);
}

async function showUpgradeDialog() {
  const title = el("upgradeTitle");
  const description = el("upgradeDescription");
  const action = el("testUpgradeBtn");
  const note = el("upgradeTestNote");
  const signedIn = await isSignedInWithGoogle();

  if (currentIsPro) {
    title.textContent = "Lifetime Pro Is Active";
    description.textContent = "You have unlimited local recordings with no monthly recording limit.";
    action.classList.add("hidden");
    note.textContent = "Your Lifetime Pro access is active on this browser.";
  } else if (!signedIn) {
    title.textContent = "Sign In To Unlock Lifetime";
    description.textContent =
      "Continue with Google first, then unlock Lifetime Pro. Your recordings still stay on this device.";
    action.classList.remove("hidden");
    action.disabled = false;
    action.textContent = "Continue With Google";
    action.dataset.mode = "google";
    note.textContent = "Google signup or login is required before Lifetime Pro.";
  } else {
    title.textContent = "You’re On The Free Plan";
    description.textContent =
      "Upgrade once to Lifetime Pro and record without monthly limits. Your recordings always stay on this device.";
    action.classList.remove("hidden");
    action.disabled = false;
    action.textContent = "Upgrade To Lifetime Pro";
    action.dataset.mode = "upgrade";
    note.textContent = "Tap Upgrade to unlock Lifetime Pro on this browser.";
  }

  if (!el("upgradeDialog").open) el("upgradeDialog").showModal();
}

async function signInWithGoogleFromPopup() {
  const result = await send({ type: "GOOGLE_SIGN_IN" });
  if (!result?.ok) throw new Error(result?.error || "Google sign-in failed.");
  await refresh();
  await syncProfileAccount();
  return result;
}

async function activateLifetimePro(button) {
  const action = button || el("testUpgradeBtn");
  const note = el("upgradeTestNote");
  const previousLabel = action.textContent;
  const mode = action.dataset.mode || "upgrade";

  action.disabled = true;

  try {
    if (mode === "google" || !(await isSignedInWithGoogle())) {
      action.textContent = "Opening Google…";
      if (note) note.textContent = "Complete Google sign-in in the window that opens.";
      await signInWithGoogleFromPopup();
      el("upgradeDialog").close();
      await showUpgradeDialog();
      return;
    }

    action.textContent = "Activating…";
    if (note) note.textContent = "Unlocking Lifetime Pro…";

    let result = await send({ type: "UNLOCK_LIFETIME_PRO" });
    if (!result?.ok) {
      result = await send({ type: "TEST_UNLOCK_LIFETIME" });
    }
    if (!result?.ok) {
      throw new Error(result?.error || "Lifetime Pro could not be activated.");
    }

    await refresh();
    await showUpgradeDialog();
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

el("upgradeLink").addEventListener("click", () => {
  showUpgradeDialog();
});
el("planBadge").addEventListener("click", () => {
  showUpgradeDialog();
});
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
  label.textContent = "Opening Google…";
  el("profileAccountStatus").textContent = "Complete Google sign-in in the window that opens.";

  try {
    const result = await send({ type: "GOOGLE_SIGN_IN" });
    if (!result?.ok) throw new Error(result?.error || "Google sign-in failed.");
    await refresh();
    await syncProfileAccount();
    el("profileAccountStatus").textContent =
      result.user?.email || "Google account connected.";
  } catch (error) {
    button.disabled = false;
    label.textContent = "Continue With Google";
    el("profileAccountStatus").textContent =
      error instanceof Error ? error.message : "Google sign-in could not start.";
  }
});

el("googleSignOutBtn")?.addEventListener("click", async () => {
  await send({ type: "GOOGLE_SIGN_OUT" });
  await chrome.storage.local.remove(["supabaseSession", "entitlementCache"]);
  await syncProfileAccount();
  el("profileAccountStatus").textContent = "Signed out of Google.";
});

Promise.allSettled([
  restoreCaptureMode(),
  restoreTheme(),
  syncProfileAccount(),
]).finally(refresh);
