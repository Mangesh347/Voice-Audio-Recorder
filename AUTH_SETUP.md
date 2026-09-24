# Google sign-in setup (developers only)

Users never see keys or redirect URLs. Those stay in this doc and Google/Supabase dashboards.

## 1. Bake public config

`supabase-config.js` already has:
- Supabase URL
- Publishable key (`sb_publishable_…`)
- Google Client ID

Never put the Google Client Secret in the extension — only in Supabase → Authentication → Providers → Google.

## 2. Fix `redirect_uri_mismatch` (required)

Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client ID  
(Web application or Chrome extension — same Client ID used in the extension)

**Authorized redirect URIs** — add exactly (no trailing slash):

```
https://hkdemnmkbohfcbghbnpdfmopjopkfljc.chromiumapp.org
```

Also add the Supabase callback (needed if you ever use Supabase-hosted OAuth):

```
https://cejsodtkyhnlfxptktfg.supabase.co/auth/v1/callback
```

Save, wait 1–2 minutes, reload the unpacked extension, then try Continue with Google again.

## 3. Supabase

- Authentication → Providers → Google: enabled, Client ID + Client Secret filled
- Optional: Authentication → URL Configuration → Redirect URLs can include the chromiumapp.org URL above

## 4. After Chrome Web Store publish

Extension ID may change. Update the Authorized redirect URI to:

`https://<new-extension-id>.chromiumapp.org`
