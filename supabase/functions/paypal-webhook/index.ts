import { json, requireEnv, serviceClient } from "../_shared/common.ts";

const PRICE = "20.00";
const CURRENCY = "USD";

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const event = await request.json();
    const clientId = requireEnv("PAYPAL_CLIENT_ID");
    const secret = requireEnv("PAYPAL_CLIENT_SECRET");
    const webhookId = requireEnv("PAYPAL_WEBHOOK_ID");
    const baseUrl = Deno.env.get("PAYPAL_BASE_URL") || "https://api-m.paypal.com";

    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error("PayPal authentication failed.");

    const verificationResponse = await fetch(
      `${baseUrl}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_algo: request.headers.get("paypal-auth-algo"),
          cert_url: request.headers.get("paypal-cert-url"),
          transmission_id: request.headers.get("paypal-transmission-id"),
          transmission_sig: request.headers.get("paypal-transmission-sig"),
          transmission_time: request.headers.get("paypal-transmission-time"),
          webhook_id: webhookId,
          webhook_event: event,
        }),
      },
    );
    const verification = await verificationResponse.json();
    if (verification.verification_status !== "SUCCESS") {
      return json({ error: "Invalid PayPal signature." }, 401);
    }

    const capture = event.resource;
    const userId = capture?.custom_id;
    const amount = capture?.amount;
    const completed = event.event_type === "PAYMENT.CAPTURE.COMPLETED";
    const reversed = [
      "PAYMENT.CAPTURE.REFUNDED",
      "PAYMENT.CAPTURE.REVERSED",
      "CUSTOMER.DISPUTE.CREATED",
    ].includes(event.event_type);

    if (!userId || (!completed && !reversed)) return json({ received: true });
    if (completed && (amount?.value !== PRICE || amount?.currency_code !== CURRENCY)) {
      return json({ error: "Unexpected PayPal amount or currency." }, 400);
    }

    const supabase = serviceClient();
    const { error: eventError } = await supabase.from("payment_events").insert({
      provider: "paypal",
      external_event_id: event.id,
      event_type: event.event_type,
      user_id: userId,
      amount_cents: completed ? 2000 : null,
      currency: amount?.currency_code || null,
      payload: event,
    });
    if (eventError?.code === "23505") return json({ received: true, duplicate: true });
    if (eventError) throw eventError;

    const status = completed ? "lifetime" : "revoked";
    const { error: entitlementError } = await supabase.from("entitlements").upsert({
      user_id: userId,
      status,
      provider: "paypal",
      external_payment_id: capture.id,
      purchased_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    });
    if (entitlementError) throw entitlementError;

    return json({ received: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Webhook failed." }, 400);
  }
});
