# Changelog

## 2026-09-25

- Removed the separate options tab; Profile and Settings live only in the popup.
- Continue with Google opens Google signup/login from the popup (Chrome identity + Supabase).
- Baked in the Supabase publishable key; Settings no longer shows keys or redirect URLs.
- Switched Google sign-in to Chrome-native id_token flow; pass matching nonce to Supabase.
- Lifetime Pro now requires Google sign-in before unlock.
- Dark and light theme background curves use `#FF6800`.
- Rebuilt marketing site (features, Free vs Pro, pricing, how it works, FAQ) with recorder blue/orange theme.
- Bumped to v1.1.0 for a popup-only, store-ready build.

## 2026-09-24

- Logo is now the solid Deep Sky Blue (#00BFFF) mic everywhere (popup, options, website, toolbar icons) — no orange mark, no internal gaps.
- Logo is now transparent (no plate background) and larger across popup, options, record seal, website, and toolbar icons.
- Fixed silent Voice recordings: request microphone permission from the extension UI before capture, resume AudioContext, and stop silently falling back to tab-only when mic fails.
- Added `permission.html` mic grant page and offscreen readiness handshake.
- Applied the orange microphone brand mark (#FFA500) across popup, options, toolbar icons (16/32/48/128), and the marketing site.
- Shared SVG source of truth in `icons/fenwick-mic.svg` with a transparent mark variant for the record seal.

## 2026-09-23

- Simplified Fenwick Recorder to local recording only.
- Removed conversation transcription, PDF generation, summaries, model downloads, and processing backends.
- Added an anonymous ten-recordings-per-calendar-month quota that resets by `YYYY-MM`.
- Preserved local tab/microphone capture, pause, resume, timer, End & Save, and tab-close autosave.
- Added Profile and Settings controls without changing the established popup theme.
- Added optional Supabase Google/email login and cached Lifetime entitlement verification.
- Added a tax-inclusive `$20 USD` Lifetime checkout scaffold with PayPal primary and Razorpay secondary.
- Added idempotent Supabase payment event storage and signature-verifying webhook functions.
- Narrowed extension host access from all sites to Supabase only.
- Reduced the popup from a fixed 600px height to its natural content height.
- Fitted the animated background to the compact popup without distorting its curves.
- Increased the animated orange ribbon to a brighter medium-orange treatment.
- Brightened the recording seal with a Deep Sky Blue gradient.
- Replaced the extension artwork with microphone icons tuned for 16, 32, 48, and 128px.
- Updated popup copy to title case and limited decorative curves to Sky Blue and Orange.
- Made the top and bottom background shapes brighter and more transparent.
- Added working Audio, Voice, and Audio + Voice capture paths with a locally persisted preference.
- Replaced Sky Blue accents with a Material You Purple and Orange palette.
- Reworked the popup profile control as a purple Material person silhouette.
- Added a persistent Light/Dark popup theme toggle with dedicated dark tokens.
- Reordered popup actions to Plan, Theme, Settings, then Profile.
- Moved Settings and Profile into accessible internal popup tabs.
- Replaced the text gear with a Material settings icon and simplified the plan badge to Free or Pro.
- Added a Google sign-in control inside the popup Profile tab, backed by the service worker.
- Added a bright orange neon-style default avatar when Lifetime/Pro entitlement is active.
- Increased orange ribbon and recording-seal brightness in dark mode.
- Refined dark mode with vivid orange curves and a brighter lilac recording treatment.
- Polished dark-theme colors only: deeper plum canvas, brighter orange ribbon, and luminous lilac accents.
- Replaced the Start Recording text with the Fenwick orange microphone mark.
- Switched the UI accent palette to Royal Blue (#1D8BE7), Vibrant Orange (#F56600), and charcoal (#1A1A1A) in light and dark themes.
- Made Lifetime Pro activate when Upgrade is tapped, with a local unlock fallback.
- Set dark-theme blue accents to Deep Sky Blue (#00BFFF).
- Added a Vercel-ready marketing website with Lifetime-only pricing, Privacy, Terms, Refund, and Support pages.
- Removed the top ambient half-circles from the popup; only the bottom curve remains.
- Set background curves to orange `#FFA500` in light mode, and dark-theme orange accents to the same `#FFA500`.
- Replaced the simple quota counter with a circular monthly usage, remaining-recordings, and plan card.
- Restored a high-contrast official-style Google sign-in button in both themes.
- Added an in-popup Lifetime Pro upgrade dialog with a configuration-gated local test activation.
- Added local five-second chunk recovery for interrupted Chrome or PC sessions.
