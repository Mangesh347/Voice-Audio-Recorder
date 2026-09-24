const FenwickAuth = (() => {
  const config = globalThis.FENWICK_CONFIG;
  const SESSION_KEY = "supabaseSession";

  function isConfigured() {
    return Boolean(config?.supabaseUrl && config?.supabaseAnonKey);
  }

  function apiUrl(path) {
    return `${config.supabaseUrl.replace(/\/$/, "")}${path}`;
  }

  function baseHeaders(accessToken) {
    const headers = {
      apikey: config.supabaseAnonKey,
      "Content-Type": "application/json",
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
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
    const response = await fetch(apiUrl("/auth/v1/token?grant_type=refresh_token"), {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    return saveSession(await parseResponse(response));
  }

  async function getSession() {
    if (!isConfigured()) return null;
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
    if (!isConfigured()) throw new Error("Supabase is not configured.");
    const response = await fetch(apiUrl("/auth/v1/otp"), {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({
        email,
        create_user: true,
      }),
    });
    await parseResponse(response);
  }

  async function verifyEmailCode(email, token) {
    const response = await fetch(apiUrl("/auth/v1/verify"), {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ email, token, type: "email" }),
    });
    return saveSession(await parseResponse(response));
  }

  async function signInWithGoogle() {
    if (!isConfigured()) throw new Error("Supabase is not configured.");
    const redirectUrl = chrome.identity.getRedirectURL("supabase");
    const authUrl = new URL(apiUrl("/auth/v1/authorize"));
    authUrl.searchParams.set("provider", "google");
    authUrl.searchParams.set("redirect_to", redirectUrl);

    const callbackUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });
    if (!callbackUrl) throw new Error("Google sign-in was cancelled.");

    const callback = new URL(callbackUrl);
    const params = new URLSearchParams(callback.hash.slice(1));
    if (params.get("error_description")) {
      throw new Error(params.get("error_description"));
    }

    return saveSession({
      access_token: params.get("access_token"),
      refresh_token: params.get("refresh_token"),
      expires_in: params.get("expires_in"),
    });
  }

  async function getUser(session) {
    if (!session) return null;
    if (session.user) return session.user;
    const response = await fetch(apiUrl("/auth/v1/user"), {
      headers: baseHeaders(session.accessToken),
    });
    const user = await parseResponse(response);
    session.user = user;
    await chrome.storage.local.set({ [SESSION_KEY]: session });
    return user;
  }

  async function refreshEntitlement() {
    const session = await getSession();
    if (!session) {
      await chrome.storage.local.remove(["entitlementCache", "isPro"]);
      return { status: "free" };
    }

    const user = await getUser(session);
    const query = new URL(apiUrl("/rest/v1/entitlements"));
    query.searchParams.set("select", "status,updated_at");
    query.searchParams.set("user_id", `eq.${user.id}`);
    query.searchParams.set("limit", "1");

    const response = await fetch(query, {
      headers: {
        ...baseHeaders(session.accessToken),
        Prefer: "return=representation",
      },
    });
    const rows = await parseResponse(response);
    const status = rows[0]?.status === "lifetime" ? "lifetime" : "free";
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

    const response = await fetch(apiUrl(`/functions/v1/create-${provider}-checkout`), {
      method: "POST",
      headers: baseHeaders(session.accessToken),
      body: JSON.stringify({
        successUrl: chrome.runtime.getURL("options.html?checkout=success"),
      }),
    });
    const result = await parseResponse(response);
    if (!result.checkoutUrl) throw new Error("Checkout link was not returned.");
    await chrome.tabs.create({ url: result.checkoutUrl });
  }

  async function signOut() {
    const session = await getStoredSession();
    if (session && isConfigured()) {
      await fetch(apiUrl("/auth/v1/logout"), {
        method: "POST",
        headers: baseHeaders(session.accessToken),
      }).catch(() => {});
    }
    await chrome.storage.local.remove([SESSION_KEY, "entitlementCache", "isPro"]);
  }

  return {
    isConfigured,
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
