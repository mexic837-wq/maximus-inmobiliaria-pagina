// Utilidades compartidas por las Edge Functions de pagos.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

// FUENTE ÚNICA DE PRECIOS. El cliente solo envía el id del plan; el monto sale de aquí.
export const PLANES: Record<string, { nombre: string; usd: number; meses: number }> = {
  mensual: { nombre: "Plan Mensual Pro", usd: 4.99, meses: 1 },
};

export const METODOS = ["pago_movil", "binance", "stripe"] as const;
export type Metodo = typeof METODOS[number];

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// Comparación en tiempo constante (evita ataques de timing sobre secretos)
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

// Autentica llamadas máquina-a-máquina (n8n, cron) con el secreto compartido
export function validarSecreto(req: Request): boolean {
  const esperado = Deno.env.get("PAGOS_WEBHOOK_SECRET") ?? "";
  const recibido = req.headers.get("x-webhook-secret") ?? "";
  return esperado.length >= 24 && safeEqual(esperado, recibido);
}

// Tasa BCV: API pública con fallback a variable de entorno (TASA_BCV_FALLBACK)
export async function tasaBCV(): Promise<number> {
  try {
    const r = await fetch("https://ve.dolarapi.com/v1/dolares/oficial", {
      signal: AbortSignal.timeout(4000),
    });
    if (r.ok) {
      const d = await r.json();
      const t = Number(d?.promedio ?? d?.venta);
      if (Number.isFinite(t) && t > 1 && t < 100000) return t;
    }
  } catch (_) { /* usa fallback */ }
  const fb = Number(Deno.env.get("TASA_BCV_FALLBACK") ?? "0");
  if (!(fb > 1)) throw new Error("No hay tasa BCV disponible");
  return fb;
}

// Aprueba el pago (RPC idempotente) y avisa a n8n para factura/WhatsApp
export async function activarPago(sb: SupabaseClient, pagoId: string, por: string) {
  const { data, error } = await sb.rpc("activar_pago_suscripcion", { p_pago_id: pagoId, p_por: por });
  if (error) throw error;
  if (data?.ok && !data?.ya_aprobado) await notificarN8n(sb, pagoId);
  return data;
}

async function notificarN8n(sb: SupabaseClient, pagoId: string) {
  const base = Deno.env.get("N8N_BASE_URL");
  if (!base) return;
  try {
    const { data: p } = await sb.from("pagos_suscripcion").select("*").eq("id", pagoId).single();
    if (!p) return;
    const { data: u } = await sb.from("usuarios")
      .select("nombre_completo,email,telefono,plan_vence_at").eq("auth_id", p.auth_id).maybeSingle();
    await fetch(`${base}/webhook/confirmacion-pago`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": Deno.env.get("N8N_WEBHOOK_SECRET") ?? "",
      },
      body: JSON.stringify({
        evento: "NUEVA_SUSCRIPCION_ASESOR_PRO",
        codigo_transaccion: p.codigo,
        plan_nombre: PLANES[p.plan_id]?.nombre ?? p.plan_id,
        monto_usd: p.monto_usd,
        metodo_pago: p.metodo,
        user_email: u?.email,
        user_nombre: u?.nombre_completo,
        user_telefono: u?.telefono,
        plan_vence_at: u?.plan_vence_at,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.warn("n8n no notificado:", e); // nunca debe romper la activación
  }
}
