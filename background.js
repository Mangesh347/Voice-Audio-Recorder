// background.js — Fenwick Recorder MV3 service worker.
// Coordinates local recording, calendar-month quota, local downloads,
// and a cached Supabase-verified Lifetime entitlement.

if (typeof importScripts === "function") {
  importScripts("supabase-config.js", "auth.js");
}

const OFFSCREEN_URL = "offscreen.html";
const FREE_RECORDINGS_PER_MONTH = 10;

let state = {
  status: "idle", // idle | recording | paused
  tabId: null,
  startedAt: null,
  captureMode: null,
};

const stateReady = chrome.storage.local.get("liveState").then(({ liveState }) => {
  if (liveState) state = liveState;
});

function calendarMonthKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

async function getQuota() {
  const { quota } = await chrome.storage.local.get("quota");
  const month = calendarMonthKey();

  if (!quota || quota.month !== month) {
    const resetQuota = { month, recordings: 0 };
    await chrome.storage.local.set({ quota: resetQuota });
    return resetQuota;
  }

  return {
    month,
    recordings: Math.max(0, Number(quota.recordings) || 0),
  };
}

async function hasLifetimeAccess() {
  const { entitlementCache, isPro } = await chrome.storage.local.get([
    "entitlementCache",
    "isPro",
  ]);

  // Preserve existing local Pro users while migrating to Supabase entitlement.
  if (isPro) return true;
  if (entitlementCache?.status !== "lifetime") return false;

  const expiresAt = Number(entitlementCache.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

async function canStartRecording() {
  if (await hasLifetimeAccess()) return true;
  const quota = await getQuota();
  return quota.recordings < FREE_RECORDINGS_PER_MONTH;
}

async function incrementRecordingUsage() {
  if (await hasLifetimeAccess()) return;
  const quota = await getQuota();
  quota.recordings += 1;
  await chrome.storage.local.set({ quota });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (existing.length === 0) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      // USER_MEDIA: mic + tab capture. AUDIO_PLAYBACK: monitor tab audio while recording.
      reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
      justification: "Record tab audio and microphone locally, and play captured tab audio to the speakers.",
    });
  }

  // Wait until the offscreen script has registered its message listener.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const ping = await chrome.runtime.sendMessage({ target: "offscreen", type: "PING" });
      if (ping?.ok) return;
    } catch {
      // Document still booting.
    }
    await sleep(50);
  }
  throw new Error("Recorder engine failed to start. Reload the extension and try again.");
}

async function sendToOffscreen(message) {
  await ensureOffscreen();
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const result = await chrome.runtime.sendMessage({ target: "offscreen", ...message });
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(40);
  }
  throw lastError || new Error("Could not reach the recorder engine.");
}

async function closeOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (existing.length > 0) await chrome.offscreen.closeDocument();
}

async function startRecording(tabId, captureMode = "tab_and_mic") {
  if (state.status !== "idle") throw new Error("Already recording.");
  if (!(await canStartRecording())) throw new Error("QUOTA_RECORDINGS");

  const supportedModes = new Set(["tab_only", "mic_only", "tab_and_mic"]);
  const normalizedMode = supportedModes.has(captureMode) ? captureMode : "tab_and_mic";
  const needsTabAudio = normalizedMode !== "mic_only";
  if (needsTabAudio && !tabId) throw new Error("No active tab is available.");

  await ensureOffscreen();

  let streamId = null;
  if (needsTabAudio) {
    try {
      streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    } catch (error) {
      throw new Error(
        "Could not capture this tab. Use a normal https tab (not chrome://), reload it, and try again.",
      );
    }
  }

  // Stream id expires quickly — capture immediately after minting it.
  state = {
    status: "recording",
    tabId: needsTabAudio ? tabId : null,
    startedAt: Date.now(),
    captureMode: normalizedMode,
  };
  await chrome.storage.local.set({ liveState: state });

  let captureResult;
  try {
    captureResult = await sendToOffscreen({
      type: "START_RECORDING",
      streamId,
      captureMode: state.captureMode,
    });
    if (!captureResult?.ok) {
      throw new Error(captureResult?.error || "Audio capture could not start.");
    }
  } catch (error) {
    state = { status: "idle", tabId: null, startedAt: null, captureMode: null };
    await chrome.storage.local.remove("liveState");
    await closeOffscreen();
    throw error;
  }

  const needsMic = state.captureMode !== "tab_only";
  if (needsMic && !captureResult.micIncluded) {
    await sendToOffscreen({ type: "STOP_RECORDING", reason: "mic_missing" }).catch(() => {});
    state = { status: "idle", tabId: null, startedAt: null, captureMode: null };
    await chrome.storage.local.remove("liveState");
    await closeOffscreen();
    throw new Error(
      "Microphone permission is required. Allow the microphone for Fenwick Recorder, then try again.",
    );
  }

  await chrome.action.setBadgeText({ text: "REC" });
  await chrome.action.setBadgeBackgroundColor({ color: "#e5526f" });
}

async function pauseRecording() {
  if (state.status !== "recording") return;
  state.status = "paused";
  await chrome.storage.local.set({ liveState: state });
  await sendToOffscreen({ type: "PAUSE_RECORDING" });
  await chrome.action.setBadgeText({ text: "II" });
  await chrome.action.setBadgeBackgroundColor({ color: "#d89033" });
}

async function resumeRecording() {
  if (state.status !== "paused") return;
  state.status = "recording";
  await chrome.storage.local.set({ liveState: state });
  await sendToOffscreen({ type: "RESUME_RECORDING" });
  await chrome.action.setBadgeText({ text: "REC" });
  await chrome.action.setBadgeBackgroundColor({ color: "#e5526f" });
}

async function stopRecording(reason = "user") {
  if (state.status === "idle") return;
  await sendToOffscreen({ type: "STOP_RECORDING", reason });

  state = { status: "idle", tabId: null, startedAt: null, captureMode: null };
  await chrome.storage.local.remove("liveState");
  await chrome.action.setBadgeText({ text: "" });
}

async function handleRecordingFinished({ base64Data, mimeType, reason }) {
  if (!base64Data) {
    state = { status: "idle", tabId: null, startedAt: null, captureMode: null };
    await chrome.storage.local.remove("liveState");
    await chrome.action.setBadgeText({ text: "" });
    notify(
      "Recording could not be saved",
      reason === "empty_recording"
        ? "No audio was captured. Allow the microphone and make sure the tab is playing sound."
        : "No audio data was captured.",
    );
    return;
  }

  const safeMimeType = mimeType || "audio/webm";
  const extension = safeMimeType.includes("webm") ? "webm" : "audio";
  const filename = `Fenwick Recorder/fenwick-recording-${Date.now()}.${extension}`;

  await chrome.downloads.download({
    url: `data:${safeMimeType};base64,${base64Data}`,
    filename,
    saveAs: false,
  });

  await incrementRecordingUsage();
  state = { status: "idle", tabId: null, startedAt: null, captureMode: null };
  await chrome.storage.local.remove("liveState");
  await chrome.action.setBadgeText({ text: "" });

  if (reason === "tab_closed") {
    notify(
      "Recording saved",
      "The tab closed, so Fenwick saved the audio captured up to that point.",
    );
  } else if (reason === "browser_recovery") {
    notify(
      "Interrupted recording recovered",
      "Fenwick restored the locally cached audio after Chrome restarted.",
    );
  } else {
    notify("Recording saved", "Your recording was downloaded locally.");
  }
}

async function recoverInterruptedRecording() {
  const result = await sendToOffscreen({ type: "RECOVER_RECORDING" });

  if (!result?.recovered) {
    state = { status: "idle", tabId: null, startedAt: null, captureMode: null };
    await chrome.storage.local.remove("liveState");
    await chrome.action.setBadgeText({ text: "" });
  }
  await closeOffscreen();
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
  });
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await stateReady;
  if (state.tabId === tabId && state.status !== "idle") {
    await stopRecording("tab_closed");
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await stateReady;
    try {
      switch (message.type) {
        case "GET_STATE": {
          const quota = await getQuota();
          const isPro = await hasLifetimeAccess();
          sendResponse({
            state,
            quota,
            isPro,
            limits: { recordings: FREE_RECORDINGS_PER_MONTH },
          });
          break;
        }
        case "START_RECORDING":
          await startRecording(message.tabId, message.captureMode);
          sendResponse({ ok: true });
          break;
        case "PAUSE_RECORDING":
          await pauseRecording();
          sendResponse({ ok: true });
          break;
        case "RESUME_RECORDING":
          await resumeRecording();
          sendResponse({ ok: true });
          break;
        case "END_RECORDING":
          await stopRecording("user");
          sendResponse({ ok: true });
          break;
        case "RECORDING_FINISHED":
          await handleRecordingFinished(message);
          sendResponse({ ok: true });
          break;
        case "OFFSCREEN_CLEANUP_COMPLETE":
          await closeOffscreen();
          sendResponse({ ok: true });
          break;
        case "GOOGLE_SIGN_IN": {
          if (typeof FenwickAuth === "undefined") {
            throw new Error("Auth module is unavailable.");
          }
          if (!(await FenwickAuth.isConfigured())) {
            throw new Error("Google sign-in is temporarily unavailable.");
          }
          const userSession = await FenwickAuth.signInWithGoogle();
          const entitlement = await FenwickAuth.refreshEntitlement();
          const user = userSession?.user || (await FenwickAuth.getUser(userSession));
          sendResponse({ ok: true, user, entitlement });
          break;
        }
        case "GOOGLE_SIGN_OUT": {
          await chrome.storage.local.remove(["supabaseSession"]);
          sendResponse({ ok: true });
          break;
        }
        case "GET_GOOGLE_REDIRECT_URL": {
          sendResponse({
            ok: true,
            redirectUrl:
              typeof FenwickAuth !== "undefined"
                ? FenwickAuth.getExtensionRedirectUrl()
                : "",
          });
          break;
        }
        case "TEST_UNLOCK_LIFETIME":
        case "UNLOCK_LIFETIME_PRO": {
          if (typeof FenwickAuth === "undefined") {
            throw new Error("Auth module is unavailable.");
          }
          const session = await FenwickAuth.getSession();
          if (!session) {
            throw new Error("Sign in with Google before unlocking Lifetime Pro.");
          }

          const config = globalThis.FENWICK_CONFIG || self.FENWICK_CONFIG;
          const allowLocalUnlock =
            config?.testLifetimeUpgrade !== false &&
            (!config?.supabaseUrl || config.testLifetimeUpgrade === true);

          if (!allowLocalUnlock) {
            throw new Error("Lifetime Pro unlock is not available in this build.");
          }

          const user = session.user || (await FenwickAuth.getUser(session));
          await chrome.storage.local.set({
            isPro: true,
            entitlementCache: {
              status: "lifetime",
              source: "local_upgrade",
              plan: "lifetime_pro",
              userId: user?.id || null,
              email: user?.email || null,
              unlockedAt: Date.now(),
              expiresAt: Date.now() + (3650 * 24 * 60 * 60 * 1000),
            },
          });
          sendResponse({ ok: true, isPro: true, plan: "Lifetime Pro", user });
          break;
        }
        default:
          sendResponse({ ok: false, error: "Unknown message." });
      }
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected recorder error.",
      });
    }
  })();

  return true;
});

chrome.runtime.onStartup?.addListener(() => {
  stateReady.then(recoverInterruptedRecording).catch(() => {
    notify(
      "Recording recovery needs attention",
      "Open Fenwick Recorder to retry recovering the interrupted recording.",
    );
  });
});
