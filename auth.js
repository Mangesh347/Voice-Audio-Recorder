const FenwickAuth = (() => {
  const SESSION_KEY = "supabaseSession";
  const CONFIG_KEYS = ["supabaseUrl", "supabaseAnonKey"];

  async function getConfig() {
    const base = globalThis.FENWICK_CONFIG || {};
    const stored = await chrome.storage.local.get(CONFIG_KEYS);
    return {
      supabaseUrl: String(stored.supabaseUrl || base.supabaseUrl || "").replace(/\/$/, ""),
      supabaseAnonKey: String(stored.supabaseAnonKey || base.supabaseAnonKey || "").trim(),
      entitlementCacheDays: Number(base.entitlementCacheDays) || 7,
      googleClientId: base.googleClientId || "",
    };
  }

  async function isConfigured() {
    const config = await getConfig();
    return Boolean(config.supabaseUrl && config.supabaseAnonKey);
  }

  function apiUrl(config, path) {
    return `${config.supabaseUrl}${path}`;
  }

  function baseHeaders(config, accessToken) {
    const headers = {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${accessToken || config.supabaseAnonKey}`,
      "Content-Type": "application/json",
    };
    return headers;
  }

  async function parseResponse(response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        body.msg || body.message || body.error_description || body.error || "Account request failed.",
      );
    }
    return body;
  }

  async function saveSession(session) {
    const normalized = {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: Date.now() + Number(session.expires_in || 3600) * 1000,
      user: session.user || null,
    };
    await chrome.storage.local.set({ [SESSION_KEY]: normalized });
    return normalized;
  }

  async function getStoredSession() {
    const data = await chrome.storage.local.get(SESSION_KEY);
    return data[SESSION_KEY] || null;
  }

  async function refreshSession(session) {
    if (!session?.refreshToken) return null;
    const config = await getConfig();
    const response = await fetch(apiUrl(config, "/auth/v1/token?grant_type=refresh_token"), {
      method: "POST",
      headers: baseHeaders(config),
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    return saveSession(await parseResponse(response));
  }

  async function getSession() {
    if (!(await isConfigured())) return null;
    const session = await getStoredSession();
    if (!session) return null;
    if (session.expiresAt > Date.now() + 60_000) return session;
    try {
      return await refreshSession(session);
    } catch {
      await chrome.storage.local.remove(SESSION_KEY);
      return null;
    }
  }

  async function sendEmailCode(email) {
    if (!(await isConfigured())) throw new Error("Supabase is not configured.");
    const config = await getConfig();
    const response = await fetch(apiUrl(config, "/auth/v1/otp"), {
      method: "POST",
      headers: baseHeaders(config),
      body: JSON.stringify({ email, create_user: true }),
    });
    await parseResponse(response);
  }

  async function verifyEmailCode(email, token) {
    const config = await getConfig();
    const response = await fetch(apiUrl(config, "/auth/v1/verify"), {
      method: "POST",
      headers: baseHeaders(config),
      body: JSON.stringify({ email, token, type: "email" }),
    });
    const session = await saveSession(await parseResponse(response));
    await getUser(session);
    return session;
  }

  function bytesToBase64Url(bytes) {
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function randomVerifier() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
  }

  function getGoogleRedirectUri() {
    // Google requires an exact match. Prefer no trailing slash (common Console entry).
    return `https://${chrome.runtime.id}.chromiumapp.org`;
  }

  function getExtensionRedirectUrl() {
    return getGoogleRedirectUri();
  }

  async function exchangeIdTokenForSession(config, idToken, nonce) {
    const response = await fetch(apiUrl(config, "/auth/v1/token?grant_type=id_token"), {
      method: "POST",
      headers: baseHeaders(config),
      body: JSON.stringify({
        provider: "google",
        id_token: idToken,
        ...(nonce ? { nonce } : {}),
      }),
    });
    return saveSession(await parseResponse(response));
  }

  async function signInWithGoogle() {
    if (!(await isConfigured())) {
      throw new Error("Google sign-in is not available right now. Try again in a moment.");
    }

    const config = await getConfig();
    const clientId = config.googleClientId;
    if (!clientId) {
      throw new Error("Google sign-in is not configured for this build.");
    }

    // Chrome-native Google flow: Google → chromiumapp.org id_token → Supabase.
    // Pass the same nonce Google embeds in the id_token, or Supabase rejects the exchange.
    const redirectUri = getGoogleRedirectUri();
    const nonce = randomVerifier();
    const authUrl = new URL("https://accounts.google.com/o/oauth2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "id_token");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("prompt", "select_account");
    authUrl.searchParams.set("nonce", nonce);

    let callbackUrl;
    try {
      callbackUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true,
      });
    } catch (error) {
      const message = String(error?.message || error || "");
      if (/canceled|cancelled|closed/i.test(message)) {
        throw new Error("Google sign-in was cancelled.");
      }
      if (/redirect_uri_mismatch|invalid_request|Authorization page could not be loaded/i.test(message)) {
        throw new Error(
          "Google redirect URL mismatch. In Google Cloud Console → Credentials → your OAuth client → Authorized redirect URIs, add exactly: " +
            redirectUri,
        );
      }
      throw new Error("Google sign-in failed. Check that Google login is enabled, then try again.");
    }

    if (!callbackUrl) throw new Error("Google sign-in was cancelled.");

    const callback = new URL(callbackUrl);
    const hashParams = new URLSearchParams(callback.hash.replace(/^#/, ""));
    const queryParams = callback.searchParams;

    const errorDescription =
      hashParams.get("error_description") ||
      queryParams.get("error_description") ||
      hashParams.get("error") ||
      queryParams.get("error");
    if (errorDescription) {
      if (/redirect_uri/i.test(errorDescription)) {
        throw new Error(
          "Google redirect URL mismatch. Add this exact URI in Google Cloud Console Authorized redirect URIs: " +
            redirectUri,
        );
      }
      throw new Error(errorDescription);
    }

    const idToken = hashParams.get("id_token") || queryParams.get("id_token");
    if (!idToken) {
      throw new Error("Google did not return a sign-in token. Try again.");
    }

    const session = await exchangeIdTokenForSession(config, idToken, nonce);
    await getUser(session);
    return session;
  }

  async function getUser(session) {
    if (!session) return null;
    if (session.user) return session.user;
    const config = await getConfig();
    const response = await fetch(apiUrl(config, "/auth/v1/user"), {
      headers: baseHeaders(config, session.accessToken),
    });
    const user = await parseResponse(response);
    session.user = user;
    await chrome.storage.local.set({ [SESSION_KEY]: session });
    return user;
  }

  async function refreshEntitlement() {
    const session = await getSession();
    if (!session) {
      // Keep local Lifetime unlocks; only clear when signed out via signOut.
      const { isPro, entitlementCache } = await chrome.storage.local.get([
        "isPro",
        "entitlementCache",
      ]);
      if (isPro || entitlementCache?.status === "lifetime") {
        return entitlementCache || { status: "lifetime" };
      }
      return { status: "free" };
    }

    const config = await getConfig();
    const user = await getUser(session);
    const query = new URL(apiUrl(config, "/rest/v1/entitlements"));
    query.searchParams.set("select", "status,updated_at");
    query.searchParams.set("user_id", `eq.${user.id}`);
    query.searchParams.set("limit", "1");

    let status = "free";
    try {
      const response = await fetch(query, {
        headers: {
          ...baseHeaders(config, session.accessToken),
          Prefer: "return=representation",
        },
      });
      const rows = await parseResponse(response);
      status = rows[0]?.status === "lifetime" ? "lifetime" : "free";
    } catch {
      // Entitlements table may not be applied yet — keep local Pro if present.
      const { isPro } = await chrome.storage.local.get("isPro");
      if (isPro) status = "lifetime";
    }

    const cacheDays = Number(config.entitlementCacheDays) || 7;
    const entitlementCache = {
      status,
      verifiedAt: Date.now(),
      expiresAt: Date.now() + cacheDays * 24 * 60 * 60 * 1000,
      userId: user.id,
    };
    await chrome.storage.local.set({
      entitlementCache,
      isPro: status === "lifetime",
    });
    return entitlementCache;
  }

  async function createCheckout(provider) {
    const session = await getSession();
    if (!session) throw new Error("Sign in before purchasing Lifetime.");
    const config = await getConfig();

    const response = await fetch(apiUrl(config, `/functions/v1/create-${provider}-checkout`), {
      method: "POST",
      headers: baseHeaders(config, session.accessToken),
      body: JSON.stringify({
        successUrl: globalThis.FENWICK_CONFIG?.marketingSiteUrl || "https://github.com/Mangesh347/Voice-Audio-Recorder",
      }),
    });
    const result = await parseResponse(response);
    if (!result.checkoutUrl) throw new Error("Checkout link was not returned.");
    await chrome.tabs.create({ url: result.checkoutUrl });
  }

  async function signOut() {
    const session = await getStoredSession();
    const config = await getConfig();
    if (session && config.supabaseUrl && config.supabaseAnonKey) {
      await fetch(apiUrl(config, "/auth/v1/logout"), {
        method: "POST",
        headers: baseHeaders(config, session.accessToken),
      }).catch(() => {});
    }
    await chrome.storage.local.remove([SESSION_KEY, "entitlementCache", "isPro"]);
  }

  async function saveSupabaseKey(anonKey) {
    const key = String(anonKey || "").trim();
    if (!key) throw new Error("Paste your Supabase publishable or anon key first.");
    await chrome.storage.local.set({
      supabaseAnonKey: key,
      supabaseUrl: (await getConfig()).supabaseUrl || globalThis.FENWICK_CONFIG.supabaseUrl,
    });
  }

  return {
    isConfigured,
    getConfig,
    getExtensionRedirectUrl,
    saveSupabaseKey,
    getSession,
    getUser,
    sendEmailCode,
    verifyEmailCode,
    signInWithGoogle,
    refreshEntitlement,
    createCheckout,
    signOut,
  };
})();
