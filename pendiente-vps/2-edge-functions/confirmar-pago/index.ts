// Recibe confirmaciones de dinero ENTRANTE (las envía n8n al leer el SMS/correo del banco).
// Auth: cabecera x-webhook-secret = PAGOS_WEBHOOK_SECRET
// Body: { metodo: "pago_movil", referencia: "00123456789", monto: 374.25, pagador?: "0414…", raw?: "texto del SMS" }
import { adminClient, corsHeaders, json, validarSecreto } from "../_shared/pagos.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  if (!validarSecreto(req)) return json({ error: "No autorizado" }, 401);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const metodo = String(b.metodo ?? "pago_movil");
  const referencia = String(b.referencia ?? "").replace(/[\s-]/g, "");
  const monto = Number(b.monto);
  if (!["pago_movil", "binance"].includes(metodo)) return json({ error: "metodo inválido" }, 400);
  if (!/^[A-Za-z0-9]{6,40}$/.test(referencia) || !(monto > 0)) {
    return json({ error: "referencia/monto inválidos" }, 400);
  }

  // Fecha del movimiento: acepta ISO o milisegundos; si es inválida o futura, usa la hora actual
  const ahora = Date.now();
  const crudo = b.ocurrido_at;
  const ms = typeof crudo === "number" || /^\d{10,13}$/.test(String(crudo ?? ""))
    ? Number(crudo) * (String(crudo).length === 10 ? 1000 : 1)
    : Date.parse(String(crudo ?? ""));
  const ocurrido = Number.isFinite(ms) && ms <= ahora + 60_000 ? new Date(ms) : new Date(ahora);

  const sb = adminClient();
  const { error } = await sb.from("pagos_entrantes").insert({
    metodo,
    referencia,
    pagador: b.pagador ? String(b.pagador).slice(0, 80) : null,
    monto,
    moneda: metodo === "binance" ? "USDT" : "VES",
    ocurrido_at: ocurrido.toISOString(),
    raw: b.raw ? { texto: String(b.raw).slice(0, 2000) } : null,
  });
  // 23505 = el SMS ya se había registrado (n8n reintentó): se ignora
  if (error && error.code !== "23505") {
    console.error("confirmar-pago:", error);
    return json({ error: "No se pudo registrar" }, 500);
  }

  const { data: conciliados } = await sb.rpc("conciliar_pagos");
  return json({ ok: true, conciliados: conciliados ?? 0 });
});
