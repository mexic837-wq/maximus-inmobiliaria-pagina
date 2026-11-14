// Recordatorios de renovación de la membresía Pro. La llama n8n una vez al día.
// Auth: cabecera x-webhook-secret = PAGOS_WEBHOOK_SECRET
//
//   { action: "pendientes" }
//       -> asesores externos cuya membresía vence en <= 5 días y a los que aún NO se les avisó:
//          - tipo "aviso_5d":  faltan más de 24 h
//          - tipo "vence_hoy": faltan 24 h o menos
//   { action: "confirmar", items: [{ auth_id, tipo, vence_at }] }
//       -> n8n lo llama SOLO para los correos que sí se enviaron; así uno que falle se reintenta mañana.
import { adminClient, corsHeaders, json, validarSecreto } from "../_shared/pagos.ts";

const DIAS_AVISO = 5;
const DIA_MS = 86_400_000;
const TIPOS = ["aviso_5d", "vence_hoy"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  if (!validarSecreto(req)) return json({ error: "No autorizado" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* cuerpo vacío = pendientes */ }

  const sb = adminClient();
  try {
    if (body.action === "confirmar") return await confirmar(sb, body);
    return await pendientes(sb);
  } catch (e) {
    console.error("renovaciones:", e);
    return json({ error: "Error interno" }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function pendientes(sb: any) {
  const ahora = Date.now();
  const { data: usuarios, error } = await sb.from("usuarios")
    .select("auth_id,nombre_completo,email,telefono,plan,plan_vence_at")
    .eq("rol", "asesor_externo")
    .not("plan_vence_at", "is", null)
    .not("email", "is", null)
    .gt("plan_vence_at", new Date(ahora).toISOString())
    .lte("plan_vence_at", new Date(ahora + DIAS_AVISO * DIA_MS).toISOString());
  if (error) throw error;
  if (!usuarios?.length) return json({ ok: true, total: 0, items: [] });

  // Avisos ya enviados para esos mismos vencimientos
  const ids = usuarios.map((u: { auth_id: string }) => u.auth_id);
  const { data: enviados, error: e2 } = await sb.from("recordatorios_membresia")
    .select("auth_id,tipo,vence_at").in("auth_id", ids);
  if (e2) throw e2;
  const yaEnviado = new Set(
    (enviados ?? []).map((r: { auth_id: string; tipo: string; vence_at: string }) =>
      `${r.auth_id}|${r.tipo}|${new Date(r.vence_at).getTime()}`
    ),
  );

  const items = [];
  for (const u of usuarios) {
    const venceMs = new Date(u.plan_vence_at).getTime();
    const tipo = venceMs - ahora <= DIA_MS ? "vence_hoy" : "aviso_5d";
    if (yaEnviado.has(`${u.auth_id}|${tipo}|${venceMs}`)) continue;
    items.push({
      auth_id: u.auth_id,
      tipo,
      vence_at: new Date(venceMs).toISOString(),
      nombre: u.nombre_completo,
      email: u.email,
      telefono: u.telefono,
      plan: u.plan === "platinum" ? "Asesor Inmobiliario Platinum" : "Asesor Inmobiliario Pro",
      dias_restantes: Math.ceil((venceMs - ahora) / DIA_MS),
    });
  }
  return json({ ok: true, total: items.length, items });
}

// deno-lint-ignore no-explicit-any
async function confirmar(sb: any, body: Record<string, unknown>) {
  const crudos = Array.isArray(body.items) ? body.items : [];
  const filas = [];
  for (const it of crudos.slice(0, 500)) {
    const venceMs = Date.parse(String(it?.vence_at ?? ""));
    if (!UUID.test(String(it?.auth_id)) || !TIPOS.includes(String(it?.tipo)) || !Number.isFinite(venceMs)) continue;
    filas.push({ auth_id: it.auth_id, tipo: it.tipo, vence_at: new Date(venceMs).toISOString() });
  }
  if (!filas.length) return json({ error: "Sin elementos válidos" }, 400);

  const { error } = await sb.from("recordatorios_membresia")
    .upsert(filas, { onConflict: "auth_id,tipo,vence_at", ignoreDuplicates: true });
  if (error) throw error;
  return json({ ok: true, registrados: filas.length });
}
