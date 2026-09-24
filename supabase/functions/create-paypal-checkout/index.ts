import {
  authenticatedUser,
  corsHeaders,
  json,
  requireEnv,
} from "../_shared/common.ts";

const PRICE = "20.00";
const CURRENCY = "USD";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const user = await authenticatedUser(request);
    const clientId = requireEnv("PAYPAL_CLIENT_ID");
    const secret = requireEnv("PAYPAL_CLIENT_SECRET");
    const baseUrl = Deno.env.get("PAYPAL_BASE_URL") || "https://api-m.paypal.com";
    const returnUrl = requireEnv("PAYMENT_RETURN_URL");
    const cancelUrl = Deno.env.get("PAYMENT_CANCEL_URL") || returnUrl;

    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(token.error_description || "PayPal authentication failed.");

    const orderResponse = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `fenwick-${user.id}-${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          custom_id: user.id,
          description: "Fenwick Recorder Lifetime",
          amount: { currency_code: CURRENCY, value: PRICE },
        }],
        application_context: {
          brand_name: "Fenwick Recorder",
          landing_page: "LOGIN",
          user_action: "PAY_NOW",
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      }),
    });
    const order = await orderResponse.json();
    if (!orderResponse.ok) throw new Error(order.message || "PayPal order creation failed.");

    const checkoutUrl = order.links?.find((link: { rel: string }) => link.rel === "approve")?.href;
    if (!checkoutUrl) throw new Error("PayPal approval link was not returned.");
    return json({ checkoutUrl, orderId: order.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Checkout failed." }, 400);
  }
});
