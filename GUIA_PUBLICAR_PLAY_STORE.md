# Publicar MAXIMUS en Google Play: lista de pasos

Complementa a `GUIA_DUNS_Y_TIENDAS.md` (cuentas de desarrollador y D-U-N-S). Marca cada paso al terminarlo.

## 0. Antes que nada: seguridad (bloquea el lanzamiento)
- [x] Las cuentas demo y las claves fijas (`admin123`, `1234567`, `Maximus2026!`…) **solo funcionan en `localhost`**. En el sitio publicado y en la app ya no existen (`AuthService.isDemoAllowed()` en `js/auth.js`).
- [ ] Ejecuta **`sql/auditoria-rls-resumen.sql`** en Supabase (solo lectura, una sola consulta) y revisa el resultado. (`sql/auditoria-rls.sql` es la versión detallada, en 5 consultas separadas.) Cierra toda regla que permita **escribir** sin iniciar sesión (sobre todo en `inmuebles`, `leads`, `usuarios`, `citas`, `notificaciones`). Quien tenga la clave pública, que viaja dentro de la app, podría editar o borrar esos datos.
- [ ] **Rota la `service_role` key** (sigue pendiente; estuvo expuesta) y actualiza n8n y el agente de WhatsApp.
- [ ] Si tu cuenta de asesor entraba solo con una clave fija local, créala como usuario real en Supabase antes de publicar.

## 1. Cuenta de desarrollador (el paso más lento: empiézalo hoy)
- [ ] Decide: **organización** (necesita D-U-N-S, 2-14 días, publicas directo) o **personal** (sin D-U-N-S, pero Google exige **12 testers durante 14 días seguidos** en prueba cerrada antes de publicar).
- [ ] Paga los 25 USD y verifica tu identidad en https://play.google.com/console/signup

## 2. Herramientas en tu PC
- [ ] Instala **Android Studio** (incluye Java y el SDK de Android). Ábrelo una vez y acepta las licencias.

## 3. Llave de firma (guárdala con respaldo en 2 lugares)
```powershell
# keytool viene con Android Studio (carpeta jbr\bin). Ajusta la ruta si es distinta:
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v -keystore C:\ruta\segura\maximus-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias maximus-upload
```
- [ ] Copia `android/keystore.properties.example` a `android/keystore.properties` y rellena las 4 líneas. Ese archivo está en `.gitignore`; no lo subas nunca.
- [ ] Respalda el `.jks` y sus claves fuera del PC (gestor de contraseñas + una copia en la nube privada).
- Activa **Play App Signing** al subir (Google custodia la llave final; esta es solo la llave de subida).

## 4. Notificaciones push (Firebase)
- [ ] Crea un proyecto en https://console.firebase.google.com y añade una app Android con el paquete **`com.maximus.inmobiliaria`**.
- [ ] Descarga **`google-services.json`** y colócalo en `android/app/`.
- [ ] Para enviar push desde n8n/Supabase necesitarás la cuenta de servicio de Firebase (FCM v1). Si aún no usarás push, no pasa nada: la app funciona sin el archivo.

## 5. Inicio de sesión con Google dentro de la app
- [ ] En Supabase → Authentication → URL Configuration, agrega como URL de redirección: **`com.maximus.inmobiliaria://auth-callback`**.
- [ ] Si usas credenciales propias de Google en Supabase, confirma que el proveedor Google está habilitado.

## 6. Usuario de prueba para los revisores de Google
- [ ] Crea un usuario **real** (Supabase Auth + fila en `usuarios` con rol `cliente`), por ejemplo `revision@maximusinmobiliaria.tech`, con contraseña propia.
- [ ] Ponlo en Play Console → Contenido de la app → **Acceso a la app**, con la nota: *"App informativa inmobiliaria con catálogo público en Táchira y portal privado. No incluye compras ni pagos dentro de la app."*

## 7. Generar el paquete
```powershell
cd C:\Users\LENOVO\Desktop\maximus-inmobiliaria-pagina-main
npm install
npm run build:aab
```
El archivo queda en `android\app\build\outputs\bundle\release\app-release.aab`. Si en la consola aparece "keystore.properties no encontrado", saldrá **sin firmar** y Google lo rechazará.

**Versiones:** cada subida a Play debe tener un `versionCode` mayor. Súbelo en `android/app/build.gradle` (`versionCode 1` → `2` → …) y cambia `versionName` si quieres.

## 8. Prueba en un teléfono real antes de subir
- [ ] Instala el `.aab` con `bundletool`, o compila `npm run build:apk` para un APK de prueba.
- [ ] Prueba: registro, login con correo, login con Google, catálogo, favoritos, crear alerta, perfil, cerrar sesión, **eliminar cuenta**, modo sin internet.
- [ ] Confirma que **no se ven planes ni pagos** (la app los oculta por las reglas de Play Billing).

## 9. Play Console
- [ ] Crea la app: nombre *MAXIMUS Inmobiliaria*, idioma español, tipo *App*, gratuita.
- [ ] **Ficha de Play Store:** descripción corta (80 car.) y completa; ícono 512×512 (`assets/icon-512.png`); **imagen destacada 1024×500** y **mínimo 2 capturas de teléfono** (aún no existen: hay que crearlas).
- [ ] **Política de privacidad:** `https://maximusinmobiliaria.tech/privacidad.html`
- [ ] **Eliminación de cuenta:** `https://maximusinmobiliaria.tech/eliminar-cuenta.html`
- [ ] **Seguridad de los datos:** declara que recolectas nombre, correo, teléfono, fotos de perfil y datos de uso, y que viajan cifrados.
- [ ] Clasificación de contenido, público objetivo (18+), declaración de anuncios (sin anuncios), categoría *Vivienda y casas* o *Estilo de vida*.
- [ ] Sube el `.aab` primero a **Prueba interna** (tú y tu equipo), luego a **Prueba cerrada**, y al final a **Producción**.

## 10. Después de publicar
- Las revisiones tardan de horas a unos días. Responde a los comentarios de los usuarios.
- Cada actualización: sube `versionCode`, `npm run build:aab`, súbelo a Play Console.
