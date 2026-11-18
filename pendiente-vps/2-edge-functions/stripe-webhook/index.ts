// Webhook de Stripe. Configurar en Stripe → Developers → Webhooks:
//   URL: https://<tu-supabase>/functions/v1/stripe-webhook
//   Eventos: checkout.session.completed, checkout.session.async_payment_succeeded
import { activarPago, adminClient, json, PLANES, safeEqual } from "../_shared/pagos.ts";

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Verifica la cabecera Stripe-Signature (esquema v1, tolerancia 5 min)
async function firmaValida(raw: string, header: string, secret: string): Promise<boolean> {
  const partes = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=") as [string, string]).filter((p) => p.length === 2),
  );
  const t = Number(partes["t"]);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const esperado = await hmacHex(secret, `${t}.${raw}`);
  return header.split(",").some((kv) => kv.startsWith("v1=") && safeEqual(kv.slice(3), esperado));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return json({ error: "Webhook no configurado" }, 503);

  const raw = await req.text(); // el cuerpo crudo es lo que firma Stripe
  const header = req.headers.get("stripe-signature") ?? "";
  if (!(await firmaValida(raw, header, secret))) return json({ error: "Firma inválida" }, 400);

  const evento = JSON.parse(raw);
  const tipos = ["checkout.session.completed", "checkout.session.async_payment_succeeded"];
  if (!tipos.includes(evento.type)) return json({ received: true, ignorado: evento.type });

  const s = evento.data.object;
  if (s.payment_status !== "paid") return json({ received: true, esperando: s.payment_status });

  const sb = adminClient();
  const { data: pago } = await sb.from("pagos_suscripcion").select("*")
    .eq("id", s.client_reference_id).eq("proveedor_ref", s.id).maybeSingle();
  if (!pago) {
    console.error("Stripe: pago no encontrado", s.id, s.client_reference_id);
    return json({ received: true, aviso: "pago_no_encontrado" });
  }

  // El monto y la moneda cobrados deben coincidir con el precio del plan
  const esperado = Math.round((PLANES[pago.plan_id]?.usd ?? -1) * 100);
  if (s.amount_total !== esperado || s.currency !== "usd") {
    console.error("Stripe: monto no coincide", s.amount_total, s.currency, esperado);
    await sb.from("pagos_suscripcion").update({
      estado: "rechazado", metadata: { motivo: "monto_no_coincide", stripe: s.id },
    }).eq("id", pago.id);
    return json({ received: true, aviso: "monto_no_coincide" });
  }

  await activarPago(sb, pago.id, "stripe");
  return json({ received: true });
});
