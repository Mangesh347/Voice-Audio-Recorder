// offscreen.js — runs inside the hidden offscreen document.
// Does the actual capture + mixing + MediaRecorder work, since the
// background service worker has no DOM/media APIs in MV3.

let mediaRecorder = null;
let chunks = [];
let audioContext = null;
let tabStream = null;
let micStream = null;
let isFinalizing = false;
let stopReason = "user";

const TIMESLICE_MS = 1000;
const RECOVERY_DB = "fenwick-recorder-recovery";
const RECOVERY_STORE = "recording";
let chunkIndex = 0;
let pendingChunkWrites = [];

function preferredMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function openRecoveryDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RECOVERY_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(RECOVERY_STORE)) {
        request.result.createObjectStore(RECOVERY_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeRecoveryEntry(entry) {
  const db = await openRecoveryDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(RECOVERY_STORE, "readwrite");
    transaction.objectStore(RECOVERY_STORE).put(entry);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function readRecoveryEntries() {
  const db = await openRecoveryDb();
  const entries = await new Promise((resolve, reject) => {
    const request = db.transaction(RECOVERY_STORE, "readonly")
      .objectStore(RECOVERY_STORE)
      .getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return entries;
}

async function clearRecovery() {
  const db = await openRecoveryDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(RECOVERY_STORE, "readwrite");
    transaction.objectStore(RECOVERY_STORE).clear();
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function getMicrophoneStream() {
  const constraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  };

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (primaryError) {
    // Fallback for older Chrome constraint handling.
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      const name = primaryError?.name || "Error";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        throw new Error(
          "Microphone permission is blocked. Allow the microphone for Fenwick Recorder, then try again.",
        );
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        throw new Error("No microphone was found on this device.");
      }
      if (name === "NotReadableError" || name === "TrackStartError") {
        throw new Error("Your microphone is in use by another app. Close it and try again.");
      }
      throw new Error(primaryError?.message || "Microphone could not be opened.");
    }
  }
}

async function startCapture(streamId, captureMode = "tab_and_mic") {
  stopReason = "user";
  isFinalizing = false;
  chunkIndex = 0;
  pendingChunkWrites = [];
  tabStream = null;
  micStream = null;

  const needsTab = captureMode !== "mic_only";
  const needsMic = captureMode !== "tab_only";

  if (needsTab) {
    if (!streamId) throw new Error("Browser audio is unavailable for this tab.");
    try {
      tabStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: streamId,
          },
        },
        video: false,
      });
    } catch (error) {
      throw new Error(
        error?.message ||
          "Could not capture this tab’s audio. Reload the tab and try again.",
      );
    }
  }

  if (needsMic) {
    micStream = await getMicrophoneStream();
  }

  if (!tabStream && !micStream) {
    throw new Error("No audio source is available to record.");
  }

  const mimeType = preferredMimeType() || "audio/webm";

  await clearRecovery();
  await writeRecoveryEntry({
    key: "meta",
    startedAt: Date.now(),
    mimeType,
    captureMode,
  });

  // Mix selected sources. Resume AudioContext — a suspended context records silence.
  audioContext = new AudioContext();
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
  const destination = audioContext.createMediaStreamDestination();

  if (tabStream) {
    const tabSource = audioContext.createMediaStreamSource(tabStream);
    const tabGain = audioContext.createGain();
    tabGain.gain.value = 1;
    tabSource.connect(tabGain);
    tabGain.connect(destination);
    // Pipe tab audio back to speakers (Chrome mutes the tab while capturing).
    tabGain.connect(audioContext.destination);
  }

  if (micStream) {
    const micSource = audioContext.createMediaStreamSource(micStream);
    const micGain = audioContext.createGain();
    micGain.gain.value = 1;
    micSource.connect(micGain);
    micGain.connect(destination);
  }

  const mixedTracks = destination.stream.getAudioTracks();
  if (!mixedTracks.length || mixedTracks.every((track) => track.readyState !== "live")) {
    cleanupStreams();
    throw new Error("The mixed audio stream has no live tracks.");
  }

  if (tabStream) {
    tabStream.getAudioTracks()[0].onended = () => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        stopCapture("tab_closed");
      }
    };
  }
  if (captureMode === "mic_only" && micStream) {
    micStream.getAudioTracks()[0].onended = () => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        stopCapture("microphone_closed");
      }
    };
  }

  chunks = [];
  mediaRecorder = new MediaRecorder(
    destination.stream,
    mimeType ? { mimeType } : undefined,
  );
  mediaRecorder.ondataavailable = (e) => {
    if (!e.data || e.data.size === 0) return;
    chunks.push(e.data);
    const index = chunkIndex;
    chunkIndex += 1;
    const write = writeRecoveryEntry({
      key: `chunk:${String(index).padStart(8, "0")}`,
      index,
      blob: e.data,
    }).catch(() => null);
    pendingChunkWrites.push(write);
  };
  mediaRecorder.onerror = () => {
    stopCapture("recorder_error");
  };
  mediaRecorder.onstop = () => finalize(stopReason);
  mediaRecorder.start(TIMESLICE_MS);

  return {
    micIncluded: Boolean(micStream),
    tabIncluded: Boolean(tabStream),
    mimeType,
  };
}

function pauseCapture() {
  if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.pause();
}

function resumeCapture() {
  if (mediaRecorder && mediaRecorder.state === "paused") mediaRecorder.resume();
  if (audioContext?.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
}

function stopCapture(reason) {
  stopReason = reason || "user";
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
}

async function finalize(reason) {
  if (isFinalizing) return;
  isFinalizing = true;
  await Promise.allSettled(pendingChunkWrites);
  const mimeType = preferredMimeType() || "audio/webm";
  const blob = new Blob(chunks, { type: mimeType });
  chunks = [];

  cleanupStreams();

  if (!blob.size) {
    chrome.runtime.sendMessage({
      type: "RECORDING_FINISHED",
      base64Data: "",
      mimeType,
      reason: reason === "user" ? "empty_recording" : reason,
    }).catch(() => {});
    return;
  }

  const base64Data = await blobToBase64(blob);

  const response = await chrome.runtime.sendMessage({
    type: "RECORDING_FINISHED",
    base64Data,
    mimeType,
    reason,
  });
  if (response?.ok) {
    await clearRecovery();
    chrome.runtime.sendMessage({ type: "OFFSCREEN_CLEANUP_COMPLETE" }).catch(() => {});
  }
}

async function recoverInterruptedCapture() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    return { recovered: false, active: true };
  }

  const entries = await readRecoveryEntries();
  const meta = entries.find((entry) => entry.key === "meta");
  const recoveredChunks = entries
    .filter((entry) => Number.isInteger(entry.index) && entry.blob)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.blob);

  if (!meta || recoveredChunks.length === 0) {
    if (entries.length > 0) await clearRecovery();
    return { recovered: false };
  }

  const mimeType = meta.mimeType || "audio/webm";
  const blob = new Blob(recoveredChunks, { type: mimeType });
  if (!blob.size) {
    await clearRecovery();
    return { recovered: false };
  }

  const base64Data = await blobToBase64(blob);
  const response = await chrome.runtime.sendMessage({
    type: "RECORDING_FINISHED",
    base64Data,
    mimeType,
    reason: "browser_recovery",
  });

  if (response?.ok) await clearRecovery();
  return { recovered: Boolean(response?.ok) };
}

function cleanupStreams() {
  [tabStream, micStream].forEach((s) => s && s.getTracks().forEach((t) => t.stop()));
  if (audioContext) {
    audioContext.close().catch(() => {});
  }
  tabStream = null;
  micStream = null;
  audioContext = null;
  mediaRecorder = null;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = String(reader.result || "").split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== "offscreen") return;
  (async () => {
    switch (msg.type) {
      case "PING":
        sendResponse({ ok: true, ready: true });
        break;
      case "START_RECORDING":
        sendResponse({
          ok: true,
          ...(await startCapture(msg.streamId, msg.captureMode)),
        });
        break;
      case "PAUSE_RECORDING":
        pauseCapture();
        sendResponse({ ok: true });
        break;
      case "RESUME_RECORDING":
        resumeCapture();
        sendResponse({ ok: true });
        break;
      case "STOP_RECORDING":
        stopCapture(msg.reason);
        sendResponse({ ok: true });
        break;
      case "RECOVER_RECORDING":
        sendResponse({ ok: true, ...(await recoverInterruptedCapture()) });
        break;
      default:
        sendResponse({ ok: false, error: "Unknown offscreen command." });
    }
  })().catch((error) => {
    cleanupStreams();
    sendResponse({ ok: false, error: error?.message || "Offscreen recorder failed." });
  });
  return true;
});
