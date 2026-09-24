# Voice & Audio Recorder

Local-first Chrome extension for recording browser tab audio, microphone voice, or both.

## Contents

- Extension (Manifest V3) at the repository root
- Marketing site in [`website/`](./website) — Vercel-ready, Lifetime plan only

## Extension

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked → select this folder

Free plan: 10 recordings per calendar month. Lifetime Pro unlocks unlimited local recording.

## Website

```bash
cd website
python -m http.server 4177
```

Vercel is configured by the root `vercel.json` (`outputDirectory: website`).  
If the homepage is blank after import, open **Project Settings → General → Root Directory**, set it to `website`, then Redeploy.
## Repo

https://github.com/Mangesh347/Voice-Audio-Recorder
