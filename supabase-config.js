// Public client configuration only. Never place Google client secret or service-role keys here.
// Google Client Secret belongs only in Supabase Dashboard → Authentication → Providers → Google.
globalThis.FENWICK_CONFIG = Object.freeze({
  supabaseUrl: "https://cejsodtkyhnlfxptktfg.supabase.co",
  // Publishable key is safe to ship in the client (not a secret).
  supabaseAnonKey: "sb_publishable_cennoz8vOtVtikZ2i9lNng_jWreqyZZ",
  googleClientId: "492069013012-pc3briped6bnbq3q4t7rf65j2rajv6rp.apps.googleusercontent.com",
  lifetimePrice: "$20 USD",
  entitlementCacheDays: 7,
  testLifetimeUpgrade: true,
});
