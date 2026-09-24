import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const storage = {};
let messageListener;
let tabCaptureRequests = 0;

const localStorageMock = {
  async get(keys) {
    if (typeof keys === "string") return { [keys]: storage[keys] };
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map((key) => [key, storage[key]]));
    }
    return { ...storage };
  },
  async set(values) {
    Object.assign(storage, values);
  },
  async remove(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
  },
};

const chrome = {
  storage: { local: localStorageMock },
  runtime: {
    async getContexts() { return []; },
    async sendMessage(message) {
      if (message?.target === "offscreen" && message.type === "START_RECORDING") {
        return {
          ok: true,
          micIncluded: message.captureMode !== "tab_only",
          tabIncluded: message.captureMode !== "mic_only",
        };
      }
      return { ok: true };
    },
    onMessage: {
      addListener(listener) { messageListener = listener; },
    },
  },
  offscreen: {
    async createDocument() {},
    async closeDocument() {},
  },
  tabCapture: {
    async getMediaStreamId() {
      tabCaptureRequests += 1;
      return "test-stream";
    },
  },
  action: {
    async setBadgeText() {},
    async setBadgeBackgroundColor() {},
  },
  downloads: {
    async download() { return 1; },
  },
  notifications: {
    create() {},
  },
  tabs: {
    onRemoved: { addListener() {} },
  },
};

const source = fs.readFileSync(new URL("../background.js", import.meta.url), "utf8");
vm.runInNewContext(source, {
  chrome,
  console,
  Date,
  Number,
  String,
  Error,
  FENWICK_CONFIG: { testLifetimeUpgrade: true },
});
await Promise.resolve();

async function send(message) {
  return new Promise((resolve) => {
    messageListener(message, {}, resolve);
  });
}

async function completeRecording(index) {
  const captureModes = ["tab_only", "mic_only", "tab_and_mic"];
  const captureMode = captureModes[index % captureModes.length];
  const started = await send({
    type: "START_RECORDING",
    tabId: 100 + index,
    captureMode,
  });
  assert.equal(started.ok, true);
  const whilePopupClosed = await send({ type: "GET_STATE" });
  assert.equal(whilePopupClosed.state.status, "recording");
  assert.equal(whilePopupClosed.state.captureMode, captureMode);
  assert.equal(
    whilePopupClosed.state.tabId,
    captureMode === "mic_only" ? null : 100 + index,
  );
  await send({ type: "END_RECORDING" });
  const finished = await send({
    type: "RECORDING_FINISHED",
    base64Data: "dGVzdA==",
    mimeType: "audio/webm",
    reason: "user",
  });
  assert.equal(finished.ok, true);
}

const initial = await send({ type: "GET_STATE" });
assert.equal(initial.quota.recordings, 0);
assert.equal(initial.limits.recordings, 10);
assert.equal(initial.isPro, false);

for (let index = 0; index < 10; index += 1) {
  await completeRecording(index);
}

const full = await send({ type: "GET_STATE" });
assert.equal(full.quota.recordings, 10);
assert.equal(tabCaptureRequests, 7);

const blocked = await send({ type: "START_RECORDING", tabId: 999 });
assert.equal(blocked.ok, false);
assert.equal(blocked.error, "QUOTA_RECORDINGS");

storage.quota = { month: "1999-12", recordings: 10 };
const rolledOver = await send({ type: "GET_STATE" });
assert.equal(rolledOver.quota.recordings, 0);
assert.notEqual(rolledOver.quota.month, "1999-12");

storage.quota.recordings = 10;
storage.entitlementCache = {
  status: "lifetime",
  expiresAt: Date.now() + 60_000,
};
const lifetimeStart = await send({ type: "START_RECORDING", tabId: 1000 });
assert.equal(lifetimeStart.ok, true);

delete storage.isPro;
delete storage.entitlementCache;
const testUpgrade = await send({ type: "TEST_UNLOCK_LIFETIME" });
assert.equal(testUpgrade.ok, true);
const upgraded = await send({ type: "GET_STATE" });
assert.equal(upgraded.isPro, true);
assert.equal(storage.entitlementCache.source, "local_upgrade");

const unlockAlias = await send({ type: "UNLOCK_LIFETIME_PRO" });
assert.equal(unlockAlias.ok, true);
assert.equal(unlockAlias.plan, "Lifetime Pro");

console.log("Background quota tests passed.");
