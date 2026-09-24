// Public client configuration only. Never place service-role or payment secrets here.
globalThis.FENWICK_CONFIG = Object.freeze({
  supabaseUrl: "",
  supabaseAnonKey: "",
  lifetimePrice: "$20 USD",
  entitlementCacheDays: 7,
  testLifetimeUpgrade: true,
});
