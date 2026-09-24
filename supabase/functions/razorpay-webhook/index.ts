import { json, requireEnv, serviceClient } from "../_shared/common.ts";

const PRICE_CENTS = 2000;
const CURRENCY = "USD";

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const rawBody = await request.text();
    const receivedSignature = request.headers.get("x-razorpay-signature") || "";
    const expectedSignature = await hmacHex(
      requireEnv("RAZORPAY_WEBHOOK_SECRET"),
      rawBody,
    );
    if (!timingSafeEqual(receivedSignature, expectedSignature)) {
      return json({ error: "Invalid Razorpay signature." }, 401);
    }

    const event = JSON.parse(rawBody);
    const payment = event.payload?.payment?.entity;
    const userId = payment?.notes?.user_id;
    const completed = event.event === "payment_link.paid" || event.event === "payment.captured";
    const reversed = event.event === "refund.processed";

    if (!userId || (!completed && !reversed)) return json({ received: true });
    if (completed && (payment.amount !== PRICE_CENTS || payment.currency !== CURRENCY)) {
      return json({ error: "Unexpected Razorpay amount or currency." }, 400);
    }

    const eventId = event.id || `${event.event}:${payment.id}:${event.created_at}`;
    const supabase = serviceClient();
    const { error: eventError } = await supabase.from("payment_events").insert({
      provider: "razorpay",
      external_event_id: eventId,
      event_type: event.event,
      user_id: userId,
      amount_cents: payment.amount || null,
      currency: payment.currency || null,
      payload: event,
    });
    if (eventError?.code === "23505") return json({ received: true, duplicate: true });
    if (eventError) throw eventError;

    const { error: entitlementError } = await supabase.from("entitlements").upsert({
      user_id: userId,
      status: completed ? "lifetime" : "revoked",
      provider: "razorpay",
      external_payment_id: payment.id,
      purchased_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    });
    if (entitlementError) throw entitlementError;

    return json({ received: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Webhook failed." }, 400);
  }
});
