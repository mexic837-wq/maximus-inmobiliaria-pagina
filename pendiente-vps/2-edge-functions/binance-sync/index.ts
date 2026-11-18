// Lee los pagos recibidos en TU cuenta de Binance (Pay) con una API key de SOLO LECTURA
// y los registra como eventos entrantes para conciliarlos. n8n la invoca cada minuto.
// Auth: cabecera x-webhook-secret = PAGOS_WEBHOOK_SECRET
// Secretos: BINANCE_API_KEY, BINANCE_API_SECRET  (permiso "Enable Reading" únicamente,
//           restringida a la IP de tu VPS, SIN permiso de retiros ni trading)
//
// ⚠️ Los nombres de campos de /sapi/v1/pay/transactions deben validarse con un pago real de
//    prueba (ver mapeo en `normalizar`). Si Binance cambia el formato, solo se ajusta ahí.
import { adminClient, corsHeaders, json, validarSecreto } from "../_shared/pagos.ts";

async function firmar(secret: string, query: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(query));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

// deno-lint-ignore no-explicit-any
function normalizar(t: any) {
  const monto = Number(t.amount);
  const moneda = String(t.currency ?? "").toUpperCase();
  const pagador = t.payerInfo?.binanceId ?? t.payerInfo?.accountId ?? t.payerInfo?.name ?? null;
  return {
    ok: monto > 0 && ["USDT", "USDC", "FDUSD", "BUSD"].includes(moneda), // solo ingresos en stablecoins
    fila: {
      metodo: "binance",
      referencia: String(t.transactionId ?? t.orderId ?? ""),
      pagador: pagador ? String(pagador) : null,
      monto,
      moneda,
      ocurrido_at: new Date(Number(t.transactionTime ?? Date.now())).toISOString(),
      raw: { currency: moneda, orderType: t.orderType, walletType: t.walletType },
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!validarSecreto(req)) return json({ error: "No autorizado" }, 401);

  const apiKey = Deno.env.get("BINANCE_API_KEY");
  const apiSecret = Deno.env.get("BINANCE_API_SECRET");
  if (!apiKey || !apiSecret) return json({ error: "Binance no configurado" }, 503);

  const ahora = Date.now();
  const q = new URLSearchParams({
    startTimestamp: String(ahora - 3 * 3600_000), // ventana de 3 h (la tabla evita duplicados)
    endTimestamp: String(ahora),
    limit: "100",
    timestamp: String(ahora),
    recvWindow: "10000",
  }).toString();
  const sig = await firmar(apiSecret, q);

  const r = await fetch(`https://api.binance.com/sapi/v1/pay/transactions?${q}&signature=${sig}`, {
    headers: { "X-MBX-APIKEY": apiKey },
    signal: AbortSignal.timeout(10000),
  });
  const data = await r.json();
  if (!r.ok) {
    console.error("Binance:", data?.code, data?.msg);
    return json({ error: "Binance rechazó la consulta", code: data?.code }, 502);
  }

  const sb = adminClient();
  let nuevos = 0;
  for (const t of (data.data ?? [])) {
    const n = normalizar(t);
    if (!n.ok || !n.fila.referencia) continue;
    const { error } = await sb.from("pagos_entrantes").insert(n.fila);
    if (!error) nuevos++;
    else if (error.code !== "23505") console.error("binance-sync insert:", error);
  }

  const { data: conciliados } = await sb.rpc("conciliar_pagos");
  return json({ ok: true, leidos: (data.data ?? []).length, nuevos, conciliados: conciliados ?? 0 });
});
