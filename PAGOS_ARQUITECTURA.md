# Pagos de suscripción — arquitectura (US$ 4.99/mes)

Métodos: **Pago Móvil (Bs)**, **Binance Pay (USDT)**, **Stripe (tarjetas)**.

## Regla de oro
El navegador **nunca** activa un plan. Solo el servidor (Edge Functions con `service_role`) puede aprobar un pago.
Antes, `payments.js` marcaba el pago como `completado` y subía el rol al instante, sin verificar nada.

```
Navegador ──(JWT)──► Edge Function `pagos` ──► tabla pagos_suscripcion (pendiente)
                                      │
   Stripe ── webhook firmado ───────► `stripe-webhook` ─┐
   SMS banco ► n8n ► `confirmar-pago` ─► pagos_entrantes ├─► conciliar_pagos() ─► activar_pago_suscripcion()
   Binance ◄─ n8n (cada 1 min) ► `binance-sync` ────────┘        └► usuarios.rol='asesor_externo', plan_vence_at
                                                                  └► n8n /webhook/confirmacion-pago (factura/WhatsApp)
```

## Archivos
| Archivo | Qué hace |
|---|---|
| `sql/migration-pagos-suscripcion.sql` | Tablas `pagos_suscripcion` y `pagos_entrantes`, RLS, `activar_pago_suscripcion`, `conciliar_pagos`, `expirar_suscripciones`, y un trigger que impide que un usuario se cambie `rol`/`plan` |
| `supabase/functions/_shared/pagos.ts` | **Precio único (`PLANES`)**, tasa BCV, validación de secretos, aviso a n8n |
| `supabase/functions/pagos` | Crea el pago (monto fijado en servidor) y recibe la referencia del usuario |
| `supabase/functions/stripe-webhook` | Verifica firma de Stripe + monto y activa |
| `supabase/functions/confirmar-pago` | Recibe el SMS parseado (desde n8n) y concilia |
| `supabase/functions/binance-sync` | Consulta tus cobros en Binance (key de solo lectura) y concilia |
| `n8n/workflow-pago-movil-sms.json` | Webhook ← SMS del banco → `confirmar-pago` |
| `n8n/workflow-binance-sync.json` | Cada minuto llama a `binance-sync` |
| `js/payments.js`, `js/config.js` | Modal (cuenta → método → pagar → verificando) y datos a mostrar |

## Puesta en marcha (en orden)
1. **SQL:** ejecutar `sql/migration-pagos-suscripcion.sql` en el SQL Editor. Opcional: programar `expirar_suscripciones()` con pg_cron (comando al final del archivo).
2. **Secretos** de las funciones (ver `.env.example`): `SITE_URL`, `PAGOS_WEBHOOK_SECRET` (32+ caracteres), `TASA_BCV_FALLBACK`, `STRIPE_*`, `BINANCE_*`, `N8N_BASE_URL`, `N8N_WEBHOOK_SECRET`.
3. **Desplegar** `supabase functions deploy pagos stripe-webhook confirmar-pago binance-sync`.
   Como tu Supabase está en un VPS (self-hosted): copia `supabase/functions/*` a la carpeta de funciones del contenedor `edge-runtime` y ponle `VERIFY_JWT=false` (cada función valida su propia autenticación).
4. **Stripe:** webhook → `https://db.maximusinmobiliaria.tech/functions/v1/stripe-webhook`, eventos `checkout.session.completed` y `checkout.session.async_payment_succeeded`.
5. **n8n:** importar los 2 workflows; crear las credenciales *Header Auth* (`x-sms-secret` para el webhook de SMS, `x-webhook-secret` = `PAGOS_WEBHOOK_SECRET` para las llamadas a Supabase); activarlos.
6. **config.js:** reemplazar los datos marcados `TODO` (teléfono/cédula de Pago Móvil, Binance Pay ID). Los actuales parecen de ejemplo.
7. **Probar** con Stripe en modo test y un pago real de Bs mínimos antes de abrirlo al público.

## Cómo se concilia cada método
- **Stripe:** automático e inmediato. Se valida firma, `payment_status=paid`, moneda y monto (499 centavos).
- **Pago Móvil:** el usuario paga el monto en Bs fijado (tasa BCV, válido 60 min) y escribe su referencia. Llega el SMS del banco a un celular con reenviador → n8n lo parsea → `confirmar-pago`. Coincide si la referencia termina igual (mín. 8 dígitos) y el monto está dentro de ±2 %. Funciona si el SMS llega antes o después de que el usuario reporte.
- **Binance:** `binance-sync` lee tus cobros recibidos. Coincide por Binance ID del pagador (o ID de transacción) y monto ≥ 4.99 USDT.

## Pendiente de validar con datos reales
- Regex del SMS en `workflow-pago-movil-sms.json`: cada banco redacta distinto; ajustar con 3-4 SMS reales.
- Campos de `/sapi/v1/pay/transactions` en `binance-sync` (función `normalizar`): confirmar con un cobro de prueba.
- Las funciones TypeScript no se han ejecutado ni desplegado todavía.
