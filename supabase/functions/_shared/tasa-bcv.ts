// ====================================================================
// Tasa oficial BCV (Bs por US$) para cobrar en Pago Móvil
// ====================================================================
// El BCV publica la tasa cada día hábil (los fines de semana sigue la del
// viernes). Como cambia a diario, NO se escribe a mano: se consulta sola.
//
// Algoritmo (de lo más confiable a lo menos):
//   1. Tasa MANUAL del admin (si fijó una en las últimas 36 h) → tiene prioridad.
//   2. Última tasa guardada si tiene menos de 3 h → no se consulta la API en cada pago.
//   3. Fuentes en línea, en paralelo y con tiempo límite:
//        · ve.dolarapi.com/v1/dolares/oficial   (tasa oficial BCV)
//        · ve.dolarapi.com/v1/dolares           (misma tasa, otra ruta)
//      Se valida cada lectura (número real, rango lógico) y que no salte más de
//      un 25 % contra la última tasa conocida (protege de datos corruptos).
//      La tasa válida se guarda en la tabla tasas_bcv.
//   4. Si las fuentes fallan: última tasa guardada de hasta 72 h (cubre fines de semana).
//   5. Si no hay nada: variable de entorno TASA_BCV_FALLBACK.
//   6. Si tampoco existe: error → Pago Móvil se desactiva y el cliente usa Binance o tarjeta.
//
// Si la tabla tasas_bcv aún no existe (SQL sin ejecutar), funciona igual con las
// fuentes en línea y el respaldo de entorno.
// ====================================================================
import { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type EstadoTasa = "manual" | "cache" | "fresca" | "respaldo_db" | "respaldo_env";

export interface TasaInfo {
  tasa: number;            // Bs por 1 US$
  fuente: string;
  fecha_valor: string | null; // fecha oficial de la tasa (AAAA-MM-DD) si la fuente la da
  obtenida_at: string;     // cuándo la consultamos
  estado: EstadoTasa;
}

interface Lectura { tasa: number; fuente: string; fecha_valor: string | null }
interface Fila { tasa: number | string; fuente: string; fecha_valor: string | null; obtenida_at: string; es_manual: boolean; id?: number }

const HORA = 3600_000;
const FRESCA_MS = 3 * HORA;        // reutiliza la tasa guardada durante 3 h
const MANUAL_MS = 36 * HORA;       // una tasa manual manda durante 36 h
const RESPALDO_MS = 72 * HORA;     // si todo falla, acepta una tasa de hasta 3 días
const SALTO_MAXIMO = 0.25;         // más de 25 % de cambio contra la última = sospechoso

const valida = (t: number) => Number.isFinite(t) && t > 1 && t < 1_000_000;
const edadMs = (iso: string) => Date.now() - new Date(iso).getTime();
const soloFecha = (v: unknown) => (typeof v === "string" && v.length >= 10 ? v.slice(0, 10) : null);

async function leerJson(url: string): Promise<unknown> {
  const r = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return await r.json();
}

// ---------- Fuentes en línea ----------
const FUENTES: Array<{ nombre: string; leer: () => Promise<Lectura> }> = [
  {
    nombre: "dolarapi/oficial",
    leer: async () => {
      // deno-lint-ignore no-explicit-any
      const d: any = await leerJson("https://ve.dolarapi.com/v1/dolares/oficial");
      return { tasa: Number(d?.promedio ?? d?.venta), fuente: "dolarapi/oficial", fecha_valor: soloFecha(d?.fechaActualizacion) };
    },
  },
  {
    nombre: "dolarapi/lista",
    leer: async () => {
      // deno-lint-ignore no-explicit-any
      const lista: any = await leerJson("https://ve.dolarapi.com/v1/dolares");
      // deno-lint-ignore no-explicit-any
      const o = Array.isArray(lista) ? lista.find((x: any) => String(x?.fuente).toLowerCase() === "oficial") : null;
      return { tasa: Number(o?.promedio ?? o?.venta), fuente: "dolarapi/lista", fecha_valor: soloFecha(o?.fechaActualizacion) };
    },
  },
];

async function consultarFuentes(): Promise<Lectura[]> {
  const res = await Promise.allSettled(FUENTES.map((f) => f.leer()));
  const ok: Lectura[] = [];
  res.forEach((r, i) => {
    if (r.status === "fulfilled" && valida(r.value.tasa)) ok.push(r.value);
    else console.warn(`tasa BCV: fuente ${FUENTES[i].nombre} sin dato válido`, r.status === "rejected" ? String(r.reason) : r.value);
  });
  return ok;
}

// Elige la lectura más confiable. Devuelve null si no hay ninguna aceptable.
export function elegirLectura(lecturas: Lectura[], ultima: number | null, ultimaReciente: boolean): Lectura | null {
  if (!lecturas.length) return null;
  // Si hay referencia reciente, descarta lecturas con saltos absurdos
  const sensatas = (ultima && ultimaReciente)
    ? lecturas.filter((l) => Math.abs(l.tasa / ultima - 1) <= SALTO_MAXIMO)
    : lecturas;
  if (!sensatas.length) {
    console.warn("tasa BCV: todas las lecturas saltan más de 25 % contra la última conocida; se ignoran", lecturas, ultima);
    return null;
  }
  // Fecha valor más reciente primero; a igual fecha, el orden de prioridad de FUENTES
  const orden = [...sensatas].sort((a, b) => String(b.fecha_valor ?? "").localeCompare(String(a.fecha_valor ?? "")));
  return orden[0];
}

// ---------- Base de datos (tolerante a que la tabla no exista todavía) ----------
async function ultimaFila(sb: SupabaseClient, manual: boolean): Promise<Fila | null> {
  try {
    let q = sb.from("tasas_bcv").select("id,tasa,fuente,fecha_valor,obtenida_at,es_manual").order("obtenida_at", { ascending: false }).limit(1);
    if (manual) q = q.eq("es_manual", true);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return (data as Fila) ?? null;
  } catch (e) {
    console.warn("tasa BCV: no se pudo leer tasas_bcv (¿falta ejecutar el SQL?)", String(e));
    return null;
  }
}

async function guardar(sb: SupabaseClient, l: Lectura, ultima: Fila | null) {
  try {
    // Misma tasa y misma fecha valor que la última: solo renueva la hora de consulta
    if (ultima && !ultima.es_manual && Number(ultima.tasa) === l.tasa && ultima.fecha_valor === l.fecha_valor && ultima.id) {
      await sb.from("tasas_bcv").update({ obtenida_at: new Date().toISOString() }).eq("id", ultima.id);
    } else {
      await sb.from("tasas_bcv").insert({ tasa: l.tasa, fuente: l.fuente, fecha_valor: l.fecha_valor });
    }
  } catch (e) {
    console.warn("tasa BCV: no se pudo guardar la tasa", String(e));
  }
}

const desdeFila = (f: Fila, estado: EstadoTasa): TasaInfo => ({
  tasa: Number(f.tasa), fuente: f.fuente, fecha_valor: f.fecha_valor, obtenida_at: f.obtenida_at, estado,
});

// ---------- API principal ----------
export async function obtenerTasaBCV(sb: SupabaseClient, opciones: { forzar?: boolean } = {}): Promise<TasaInfo> {
  // 1. Tasa manual vigente
  const manual = await ultimaFila(sb, true);
  if (manual && valida(Number(manual.tasa)) && edadMs(manual.obtenida_at) < MANUAL_MS) {
    return desdeFila(manual, "manual");
  }

  // 2. Última guardada, si es reciente
  const ultima = await ultimaFila(sb, false);
  const ultimaValida = ultima && valida(Number(ultima.tasa)) ? ultima : null;
  if (!opciones.forzar && ultimaValida && edadMs(ultimaValida.obtenida_at) < FRESCA_MS) {
    return desdeFila(ultimaValida, "cache");
  }

  // 3. Fuentes en línea
  const lecturas = await consultarFuentes();
  const ref = ultimaValida ? Number(ultimaValida.tasa) : null;
  const elegida = elegirLectura(lecturas, ref, !!ultimaValida && edadMs(ultimaValida.obtenida_at) < RESPALDO_MS);
  if (elegida) {
    await guardar(sb, elegida, ultimaValida);
    return { ...elegida, obtenida_at: new Date().toISOString(), estado: "fresca" };
  }

  // 4. Respaldo: última guardada de hasta 72 h
  if (ultimaValida && edadMs(ultimaValida.obtenida_at) < RESPALDO_MS) {
    console.warn("tasa BCV: fuentes caídas, se usa la última guardada", ultimaValida);
    return desdeFila(ultimaValida, "respaldo_db");
  }

  // 5. Respaldo de entorno
  const env = Number(Deno.env.get("TASA_BCV_FALLBACK") ?? "0");
  if (valida(env)) {
    console.warn("tasa BCV: se usa TASA_BCV_FALLBACK (revisar: puede estar desactualizada)");
    return { tasa: env, fuente: "TASA_BCV_FALLBACK", fecha_valor: null, obtenida_at: new Date().toISOString(), estado: "respaldo_env" };
  }

  throw new Error("SIN_TASA_BCV");
}

// Monto en Bs redondeado a céntimos
export const montoEnBs = (usd: number, tasa: number) => Math.round(usd * tasa * 100) / 100;
