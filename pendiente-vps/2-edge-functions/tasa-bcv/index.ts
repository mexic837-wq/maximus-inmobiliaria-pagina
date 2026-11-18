// Edge Function "tasa-bcv"
//   { action: "consultar" }  -> público (sin sesión): tasa BCV vigente y lo que cuesta cada plan en Bs.
//                               Lo usa la ventana de pago para mostrar el monto antes de elegir Pago Móvil.
//   { action: "refrescar" }  -> solo n8n (cabecera x-webhook-secret = PAGOS_WEBHOOK_SECRET):
//                               fuerza una consulta a las fuentes y guarda la tasa nueva.
// El monto que se COBRA lo fija la función "pagos" al crear el pago; esto es solo informativo.
import { adminClient, corsHeaders, json, montoEnBs, obtenerTasaBCV, PLANES, validarSecreto } from "../_shared/pagos.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* cuerpo vacío = consultar */ }
  const accion = String(body.action ?? "consultar");

  if (accion === "refrescar" && !validarSecreto(req)) return json({ error: "No autorizado" }, 401);
  if (accion !== "consultar" && accion !== "refrescar") return json({ error: "Acción desconocida" }, 400);

  try {
    const info = await obtenerTasaBCV(adminClient(), { forzar: accion === "refrescar" });
    const precios_bs = Object.fromEntries(
      Object.entries(PLANES).map(([id, p]) => [id, montoEnBs(p.usd, info.tasa)]),
    );
    return json({
      ok: true,
      tasa: info.tasa,
      fecha_valor: info.fecha_valor,
      fuente: info.fuente,
      estado: info.estado,          // manual | cache | fresca | respaldo_db | respaldo_env
      obtenida_at: info.obtenida_at,
      // true = la tasa puede estar vieja: n8n avisa al admin
      requiere_revision: info.estado === "respaldo_db" || info.estado === "respaldo_env",
      precios_bs,
    });
  } catch (_) {
    return json({ ok: false, error: "SIN_TASA_BCV", requiere_revision: true }, 503);
  }
});
