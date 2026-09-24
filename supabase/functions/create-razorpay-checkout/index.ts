import {
  authenticatedUser,
  corsHeaders,
  json,
  requireEnv,
} from "../_shared/common.ts";

const PRICE_CENTS = 2000;
const CURRENCY = "USD";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const user = await authenticatedUser(request);
    const keyId = requireEnv("RAZORPAY_KEY_ID");
    const keySecret = requireEnv("RAZORPAY_KEY_SECRET");
    const callbackUrl = requireEnv("PAYMENT_RETURN_URL");

    const response = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: PRICE_CENTS,
        currency: CURRENCY,
        accept_partial: false,
        description: "Fenwick Recorder Lifetime",
        customer: { email: user.email },
        notify: { email: true, sms: false },
        reminder_enable: true,
        callback_url: callbackUrl,
        callback_method: "get",
        notes: {
          user_id: user.id,
          product: "fenwick_recorder_lifetime",
        },
      }),
    });

    const paymentLink = await response.json();
    if (!response.ok) {
      throw new Error(paymentLink.error?.description || "Razorpay checkout creation failed.");
    }

    return json({
      checkoutUrl: paymentLink.short_url,
      paymentLinkId: paymentLink.id,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Checkout failed." }, 400);
  }
});
