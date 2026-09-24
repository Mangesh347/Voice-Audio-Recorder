# Project status

STATUS: v1.1.0 | DONE: nonce fix, Google-gated Lifetime, marketing site rebuild | NEXT: reload extension; test Google login; push live

DONE:
- Selectable Audio, Voice, and Audio + Voice recording
- Pause, resume, End & Save, and tab-close autosave
- Popup-close continuation and local interrupted-session recovery
- Anonymous ten-recordings-per-calendar-month quota
- Cached Lifetime bypass
- Profile and Settings surfaces
- Content-fitted compact popup
- Supabase Auth/entitlement integration
- PayPal and Razorpay Edge Function scaffolding
- In-popup Lifetime Pro offer with local test activation
- Shared orange microphone logo across extension UI, store icons, and website

BLOCKED:
- Live Google/email login requires Supabase project configuration
- Live checkout requires PayPal/Razorpay credentials and deployed webhooks

NEXT:
- Configure sandbox credentials
- Load unpacked in Chrome (reload extension to pick up new icons)
- Run real audio, OAuth, and payment sandbox tests
