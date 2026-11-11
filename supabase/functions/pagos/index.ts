// Edge Function "pagos" — la llama el navegador con el JWT del usuario.
//   { action: "crear",    plan_id, metodo }          -> crea el pago con precio fijado en servidor
//   { action: "reportar", pago_id, referencia }      -> el usuario informa su ref. (pago móvil / Binance)
// La activación nunca ocurre aquí: solo webhooks (Stripe) y conciliación (n8n / binance-sync).
import { adminClient, corsHeaders, json, METODOS, PLANES, tasaBCV } from "../_shared/pagos.ts";

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I

function codigoPago(): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return "MAX-" + Array.from(b, (x) => ALFABETO[x % ALFABETO.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const sb = adminClient();
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !auth?.user) return json({ error: "Inicia sesión para continuar" }, 401);
  const user = auth.user;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  try {
    if (body.action === "crear") return await crear(sb, user, body);
    if (body.action === "reportar") return await reportar(sb, user, body);
    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    console.error("pagos:", e);
    return json({ error: "Error interno. Intenta de nuevo." }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function crear(sb: any, user: any, body: Record<string, unknown>) {
  const plan = PLANES[String(body.plan_id)];
  const metodo = String(body.metodo);
  if (!plan) return json({ error: "Plan inválido" }, 400);
  if (!(METODOS as readonly string[]).includes(metodo)) return json({ error: "Método inválido" }, 400);

  // Anti-abuso: máx. 5 intentos por hora
  const hace1h = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await sb.from("pagos_suscripcion").select("id", { count: "exact", head: true })
    .eq("auth_id", user.id).gte("created_at", hace1h);
  if ((count ?? 0) >= 5) return json({ error: "Demasiados intentos. Espera un momento." }, 429);

  // Reutiliza un intento reciente del mismo método (evita llenar la tabla)
  if (metodo !== "stripe") {
    const { data: previo } = await sb.from("pagos_suscripcion").select("*")
      .eq("auth_id", user.id).eq("metodo", metodo).eq("plan_id", body.plan_id)
      .in("estado", ["pendiente", "verificando"]).gt("expira_at", new Date().toISOString())
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (previo) return json({ pago: publico(previo) });
  }

  let tasa: number | null = null;
  let montoLocal: number | null = null;
  if (metodo === "pago_movil") {
    tasa = await tasaBCV();
    montoLocal = Math.round(plan.usd * tasa * 100) / 100;
  }

  const { data: pago, error } = await sb.from("pagos_suscripcion").insert({
    codigo: codigoPago(),
    auth_id: user.id,
    plan_id: body.plan_id,
    metodo,
    monto_usd: plan.usd,
    monto_local: montoLocal,
    tasa_bcv: tasa,
  }).select("*").single();
  if (error) throw error;

  if (metodo !== "stripe") return json({ pago: publico(pago) });

  // ---- Stripe Checkout (pago único de 1 mes) ----
  const sk = Deno.env.get("STRIPE_SECRET_KEY");
  if (!sk) return json({ error: "Tarjetas no disponibles por ahora" }, 503);
  const site = (Deno.env.get("SITE_URL") ?? "https://maximusinmobiliaria.tech").replace(/\/$/, "");

  const form = new URLSearchParams({
    mode: "payment",
    success_url: `${site}/dashboard?pago=stripe_ok&pid=${pago.id}`,
    cancel_url: `${site}/dashboard?pago=stripe_cancel`,
    client_reference_id: pago.id,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(Math.round(plan.usd * 100)),
    "line_items[0][price_data][product_data][name]": `MAXIMUS ${plan.nombre}`,
    "metadata[pago_id]": pago.id,
    "metadata[codigo]": pago.codigo,
    "payment_intent_data[metadata][pago_id]": pago.id,
  });
  if (user.email) form.set("customer_email", user.email);

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sk}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": pago.id,
    },
    body: form,
  });
  const sesion = await r.json();
  if (!r.ok || !sesion?.url) {
    console.error("Stripe:", sesion);
    return json({ error: "No se pudo iniciar el pago con tarjeta" }, 502);
  }
  await sb.from("pagos_suscripcion").update({ proveedor_ref: sesion.id }).eq("id", pago.id);
  return json({ pago: publico(pago), checkout_url: sesion.url });
}

// deno-lint-ignore no-explicit-any
async function reportar(sb: any, user: any, body: Record<string, unknown>) {
  const referencia = String(body.referencia ?? "").replace(/[\s-]/g, "");
  if (!/^[A-Za-z0-9]{6,40}$/.test(referencia)) {
    return json({ error: "Referencia inválida (mínimo 6 caracteres, sin símbolos)" }, 400);
  }

  const { data: pago } = await sb.from("pagos_suscripcion").select("*")
    .eq("id", body.pago_id).eq("auth_id", user.id).maybeSingle();
  if (!pago) return json({ error: "Pago no encontrado" }, 404);
  if (pago.metodo === "stripe") return json({ error: "Este método no requiere referencia" }, 400);
  if (pago.estado === "aprobado") return json({ pago: publico(pago) });
  if (!["pendiente", "verificando"].includes(pago.estado) || new Date(pago.expira_at) < new Date()) {
    return json({ error: "Este pago expiró. Genera uno nuevo." }, 410);
  }
  if (pago.metodo === "pago_movil" && referencia.length < 8) {
    return json({ error: "Ingresa los últimos 8 dígitos (o más) de la referencia" }, 400);
  }
  if (pago.intentos >= 3) {
    return json({ error: "Demasiados intentos. Escríbenos por WhatsApp con tu comprobante." }, 429);
  }

  const { error } = await sb.from("pagos_suscripcion").update({
    referencia, estado: "verificando", intentos: pago.intentos + 1,
  }).eq("id", pago.id);
  if (error) {
    if (error.code === "23505") return json({ error: "Esa referencia ya fue utilizada" }, 409);
    throw error;
  }

  // Si el SMS/movimiento ya había llegado, concilia al instante
  await sb.rpc("conciliar_pagos");

  const { data: actualizado } = await sb.from("pagos_suscripcion").select("*").eq("id", pago.id).single();
  return json({ pago: publico(actualizado) });
}

// Solo campos seguros hacia el navegador
// deno-lint-ignore no-explicit-any
function publico(p: any) {
  return {
    id: p.id, codigo: p.codigo, metodo: p.metodo, estado: p.estado,
    monto_usd: Number(p.monto_usd),
    monto_local: p.monto_local == null ? null : Number(p.monto_local),
    tasa_bcv: p.tasa_bcv == null ? null : Number(p.tasa_bcv),
    expira_at: p.expira_at,
  };
}
