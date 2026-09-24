const allowBtn = document.getElementById("allowBtn");
const status = document.getElementById("status");

function setStatus(message, kind = "") {
  status.textContent = message;
  status.className = kind ? `is-${kind}` : "";
}

async function grantMicrophone() {
  allowBtn.disabled = true;
  setStatus("Waiting for Chrome’s microphone prompt…");

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

    setStatus("Microphone allowed. You can close this tab and start recording.", "ok");
    allowBtn.textContent = "Done";
    window.setTimeout(() => window.close(), 900);
  } catch (error) {
    await chrome.storage.local.set({ micPermissionGranted: false });
    allowBtn.disabled = false;
    allowBtn.textContent = "Try Again";
    const denied = error?.name === "NotAllowedError";
    setStatus(
      denied
        ? "Microphone was blocked. Click the lock icon in the address bar, allow microphone, then try again."
        : (error?.message || "Microphone permission failed."),
      "error",
    );
  }
}

allowBtn.addEventListener("click", grantMicrophone);

// Auto-prompt once if opened from the extension (still requires a user gesture on some Chrome builds).
chrome.storage.local.get("micPermissionGranted").then(({ micPermissionGranted }) => {
  if (micPermissionGranted) {
    setStatus("Microphone is already allowed for this extension.", "ok");
    allowBtn.textContent = "Microphone Allowed";
  }
});
