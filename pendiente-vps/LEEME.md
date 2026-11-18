# Pendiente del VPS (cambios del chat del 16 y 17 nov 2026)

> Última actualización: 17 nov 2026 · Parte 7 (oficinas aliadas) ajustada: se administran desde el panel
> (Sitio web → Oficinas aliadas) y la landing solo muestra sus logos.

Todo lo que hay que subir a Supabase y n8n cuando el VPS vuelva a estar disponible.
El código de la web (landing, panel, ficha del inmueble) **no** está aquí: ese se publica con GitHub como siempre.

```
pendiente-vps/
├── LEEME.md                      ← esta guía
├── 1-sql/                        ← Supabase (SQL Editor)
│   └── PENDIENTE-SUPABASE-TODO-EN-UNO.sql
├── 2-edge-functions/             ← Supabase (funciones del servidor)
│   ├── _shared/  pagos/  tasa-bcv/  renovaciones/
│   └── stripe-webhook/  confirmar-pago/  binance-sync/
└── 3-n8n/                        ← n8n (Import from file)
    ├── workflow-captacion-inmueble.json      (NUEVO)
    ├── workflow-tasa-bcv.json                (NUEVO)
    ├── workflow-oficina-aliada.json          (NUEVO)
    ├── workflow-confirmacion-pago.json       (CAMBIÓ)
    └── workflow-recordatorio-renovacion.json (CAMBIÓ)
```

> Esta carpeta es una copia. La versión de trabajo del SQL es `sql/PENDIENTE-SUPABASE-TODO-EN-UNO.sql`:
> si se agrega algo nuevo, se vuelve a copiar aquí.

---

## Qué trae cada parte del SQL

| Parte | Qué hace |
|---|---|
| 1 | Planes Bronce / Gold / Platinum. Formulario "Publica tu inmueble" con cola rotativa de asesores Platinum. Los que tenían el Platinum de antes pasan a Gold. |
| 2 | Límite de inmuebles por plan: Bronce 3, Gold 7, Platinum ilimitado. |
| 3 | El plan "Pro" pasa a llamarse Bronce (solo el nombre visible; por dentro sigue siendo `pro`). |
| 4 | El primer pago de cada usuario dura 2 meses. |
| 5 | Tabla de la tasa BCV para Pago Móvil (caché, respaldo e historial). |
| 6 | Inmuebles captados de WhatsApp: contacto público José Guerrero, asesor original en privado, lista de avisos y traspaso al pagar. |
| 7 | Oficinas aliadas: el admin las agrega, sube su logo, las publica u oculta desde el panel. También recibe las solicitudes de "¿Inmobiliaria? Regístrate aquí" del panel. La landing muestra los logos publicados. |

**Antes de nada, confirma que ya están ejecutados** `sql/migration-pagos-suscripcion.sql` y `sql/migration-plan-platinum.sql`.
Si alguno nunca se ejecutó, ejecútalo primero.

---

## Orden de los pasos

### Paso 1 · SQL en Supabase

1. Abre el **SQL Editor** de tu Supabase.
2. Pega **todo** el contenido de `1-sql/PENDIENTE-SUPABASE-TODO-EN-UNO.sql` y ejecútalo **una sola vez**.
3. Es seguro repetirlo si algo falla a la mitad. No duplica nada.

Comprobación rápida, también en el SQL Editor:

```sql
-- Debe devolver 8 filas de funciones nuevas
SELECT proname FROM pg_proc
 WHERE proname IN ('registrar_captacion_web','limite_inmuebles_plan','es_primer_pago',
                   'asesor_publico_inmueble','asesores_originales_por_avisar','reclamar_inmuebles_capturados',
                   'registrar_oficina_aliada','listar_oficinas_aliadas');

-- Debe devolver las 6 tablas nuevas
SELECT tablename FROM pg_tables
 WHERE tablename IN ('captaciones_web','cola_captaciones','config_captaciones','tasas_bcv',
                     'inmuebles_asesor_original','oficinas_aliadas');
```

### Paso 2 · Funciones del servidor (Edge Functions)

Tu Supabase está en el VPS, así que se copian a mano (igual que en `PAGOS_ARQUITECTURA.md`, paso 3):

1. Copia **toda** la carpeta `2-edge-functions/` dentro de la carpeta de funciones del contenedor `edge-runtime`, reemplazando lo que haya.
   Hay que copiar también las que no cambiaron (`stripe-webhook`, `confirmar-pago`, `binance-sync`), porque todas usan los archivos de `_shared/`.
2. La función **nueva** es `tasa-bcv`: ponle `VERIFY_JWT=false`, igual que a las otras.
3. Reinicia el servicio de funciones:

```bash
docker compose up -d functions
```

No hace falta ninguna variable nueva en el `.env`. Opcional: `TASA_BCV_FALLBACK` (tasa de emergencia, solo si falla la consulta en línea).

### Paso 3 · Flujos en n8n

Importa cada archivo con **Workflows → Import from file**.

| Archivo | Tipo | Credenciales que pide |
|---|---|---|
| `workflow-captacion-inmueble.json` | Nuevo | Supabase API · Evolution API (Header Auth: nombre `apikey`, valor tu clave) · Gmail MAXIMUS |
| `workflow-tasa-bcv.json` | Nuevo | `MAXIMUS Pagos → Supabase (x-webhook-secret)` · Gmail MAXIMUS |
| `workflow-oficina-aliada.json` | Nuevo | Supabase API · Gmail MAXIMUS |
| `workflow-confirmacion-pago.json` | Reemplaza al actual | Las mismas que ya tiene |
| `workflow-recordatorio-renovacion.json` | Reemplaza al actual | Las mismas que ya tiene |

Para los dos que **reemplazan**: importa el nuevo, comprueba que las credenciales queden asignadas, **desactiva el viejo** y activa el nuevo.

Dentro de `workflow-captacion-inmueble.json`, en el nodo **Armar mensajes**, cambia estas dos líneas por los datos reales de tu WhatsApp:

```js
const WA_API_URL = 'https://evolution.maximusinmobiliaria.tech';
const WA_INSTANCIA = 'maximus';
```

El flujo de captación asume **Evolution API**. Si usas otro proveedor de WhatsApp (por ejemplo la API oficial de Meta), hay que cambiar los dos nodos de envío.

Activa los tres flujos nuevos al terminar.

### Paso 4 · Pruebas (en orden)

| Prueba | Resultado esperado |
|---|---|
| En n8n, ejecuta a mano `tasa-bcv` | Responde `ok: true` con una tasa cercana a Bs. 914 |
| Abre una ficha de inmueble captado de WhatsApp | Muestra "José Guerrero · Equipo MAXIMUS" |
| En la landing, llena "Publica tu inmueble" | Aparece el asesor asignado y le llega el WhatsApp |
| En el panel con un asesor Bronce, sube el inmueble 4 | Aviso de límite con botón para mejorar a Gold |
| Paga un plan de prueba con un usuario nuevo | La membresía dura 2 meses y el correo lo menciona |
| En el panel (admin): Sitio web → Oficinas aliadas → Agregar oficina, con logo | Aparece en la lista como "Publicada" |
| Recarga la landing | La sección "Oficinas aliadas" aparece con ese logo |
| Con una cuenta normal, usa "¿Inmobiliaria? Regístrate aquí" del banner | Te llega un correo y la solicitud sale "Por revisar" en el panel |

### Paso 5 · Avisos a los asesores originales (opcional, cuando quieras)

Se hace desde tu computadora, con tu WhatsApp Web, **después** del paso 1. Máximo 15 por día, con pausas.

```bash
node .agents/skills/whatsapp-web-sync/scripts/avisar_asesores_originales.js preparar
```

Revisa `agente_whatsapp/contactos/avisos_borrador.json`, marca `"aprobado": true` en los que quieras y envía:

```bash
node .agents/skills/whatsapp-web-sync/scripts/avisar_asesores_originales.js enviar --confirmo
```

---

### Paso 6 · Configurar las oficinas aliadas

Todo se hace en el panel, con tu usuario administrador: **Sitio web → Oficinas aliadas**.

- **Agregar oficina:** nombre, zona, logo (PNG, JPG o WebP, máximo 4 MB) y, si quieres, web, Instagram o WhatsApp. El logo lleva a esa web o a su WhatsApp.
- **Publicar u ocultar:** solo las publicadas salen en la landing. Ocultar no borra nada.
- **Destacar y orden:** las destacadas salen primero, y luego se ordena por el número de orden (más bajo, antes).
- **Solicitudes:** las que llegan desde el botón del banner salen arriba como "Por revisar", con botones para aprobar o rechazar. También te llega un correo.

Mientras no haya ninguna oficina publicada, la sección no aparece en la landing.

---

## Si algo sale mal

- **El SQL da error en un paso:** pega el mensaje completo; es seguro volver a ejecutarlo.
- **Pago Móvil dice que no está disponible:** la consulta de la tasa BCV falló y no hay tasa guardada. Fija una a mano con el `INSERT` de la Parte 5 del SQL (manda durante 36 horas).
- **La ficha del inmueble no muestra el plan del asesor:** falta ejecutar la Parte 6. Mientras tanto la web usa una regla local y sigue mostrando a José Guerrero en los captados.
