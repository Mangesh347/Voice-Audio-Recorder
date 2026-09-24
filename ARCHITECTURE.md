# Architecture

Fenwick Recorder has four runtime surfaces:

- `popup.html`, `popup.css`, `popup.js`: source selection, local recording controls, timer, plan badge, and monthly usage.
- `background.js`: MV3 recording state, calendar-month quota, cached Lifetime entitlement, downloads, and notifications.
- `offscreen.html`, `offscreen.js`: tab/microphone capture, optional audio mixing, MediaRecorder, local chunk recovery, and finalization.
- `options.html`, `options.css`, `options.js`, `auth.js`: optional Supabase login, Profile, Settings, entitlement refresh, and checkout launch.

## Privacy boundary

Recording data flows only from Chrome capture APIs to the offscreen document and then to a local browser download. Five-second chunks are cached in local IndexedDB only while needed for interrupted-session recovery. Supabase receives account, entitlement, and payment metadata only.

Closing the popup does not affect capture because MediaRecorder runs in the offscreen document. A normal stop or tab closure downloads immediately. After a browser or PC shutdown, `runtime.onStartup` reconstructs the completed chunks and downloads the recovered WebM; the unfinished chunk can be lost.

## Quota

Anonymous usage is stored in `chrome.storage.local` as:

```json
{ "month": "YYYY-MM", "recordings": 0 }
```

`background.js` compares this key with the current local calendar month and resets usage when the key changes. A non-expired cached Lifetime entitlement bypasses the Free limit.

## Entitlement

Supabase Auth provides Google and email-code login. Row-level security allows a user to read only their entitlement. PayPal and Razorpay webhooks run as Supabase Edge Functions and are the only code allowed to grant or revoke Lifetime.
