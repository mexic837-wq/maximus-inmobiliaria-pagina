# 🏛️ Guía Oficial: Obtención del Número D-U-N-S y Publicación en App Store & Play Store

Esta guía detalla todo lo necesario tras haber completado la configuración del código de **MAXIMUS Inmobiliaria**.

---

## 1. Decisión Clave: Cuenta Personal vs Cuenta de Empresa

Como mencionaste que prefieres **cuenta de persona**, aquí tienes la comparativa real de las tiendas para que tomes la mejor decisión:

| Criterio | Cuenta Personal (Individual) | Cuenta de Empresa (Organización) |
|---|---|---|
| **¿Necesita número D-U-N-S?** | ❌ **No se necesita** | ✅ **Obligatorio (gratuito)** |
| **Nombre que sale en la App Store** | Tu nombre legal (ej: *Miguel Gómez*) | Nombre de la empresa (*MAXIMUS Inmobiliaria*) |
| **Nombre que sale en Google Play** | Tu nombre o nombre de desarrollador | Nombre legal de la empresa |
| **Requisito especial de Google Play** | ⚠️ **Obligatorio: 12 testers durante 14 días continuos** en prueba cerrada antes de poder publicar en público | ✅ Puedes publicar directamente sin la espera obligatoria de los 14 días |
| **Costo Apple Developer** | 99 USD / año | 99 USD / año |
| **Costo Google Play Console** | 25 USD (pago único) | 25 USD (pago único) |
| **Varios miembros en el equipo** | Solo 1 acceso (el dueño) | Permite invitar asesores y desarrolladores |

---

## 2. ¿Qué es el D-U-N-S y por qué lo piden?

El **Data Universal Numbering System (D-U-N-S)** es un código numérico único de **9 dígitos** emitido por la agencia global de información comercial **Dun & Bradstreet (D&B)**.
Apple y Google lo utilizan exclusivamente para verificar que la empresa existe legalmente y que quien registra la cuenta tiene autorización para representarla.

* **Costo:** **100% Gratuito** a través de los canales de Apple o D&B.
* **Tiempo de emisión:** Entre **2 a 5 días hábiles** (hasta 14 días máximo en Latinoamérica).

---

## 3. Paso a Paso: Cómo Solicitar el D-U-N-S Gratis

### Método recomendado: A través del portal de Apple

1. **Ingresa a la herramienta oficial de consulta de Apple:**
   👉 [developer.apple.com/enroll/duns-lookup](https://developer.apple.com/enroll/duns-lookup/)
   *(Inicia sesión con tu Apple ID)*.

2. **Verifica si ya existe un registro para MAXIMUS:**
   - **Legal Entity Name:** Escribe el nombre exacto de la empresa según el Registro Mercantil o Acta Constitutiva (ej: *MAXIMUS INMOBILIARIA C.A.*).
   - **Country / Region:** *Venezuela* (o el país donde esté registrada la personería jurídica).
   - **Street Address:** Dirección fiscal exacta.
   - **City / State / Postal Code:** *San Cristóbal, Estado Táchira, 5001*.

3. **Si no aparece registrado:**
   El mismo sistema de Apple te mostrará el botón **"Submit your information to Dun & Bradstreet"** (Enviar información a Dun & Bradstreet).

4. **Completa los datos del formulario:**
   - Nombre legal de la empresa.
   - Número de identificación fiscal (RIF o equivalente).
   - Dirección física comercial (no apartados postales).
   - Número telefónico de la empresa (con código de país `+58`).
   - Nombre, correo y cargo de la persona de contacto autorizada (ej: Director / Presidente).

5. **Recepción del correo y verificación:**
   - En las siguientes **24 a 48 horas**, recibirás un correo de Dun & Bradstreet (`@dnb.com` o `@dnb.latam`) solicitando confirmación o copia digital del documento de registro mercantil (PDF).
   - Responde adjuntando el documento solicitado.
   - En **1 a 3 días hábiles adicionales**, recibirás un correo con tu **código D-U-N-S de 9 dígitos** (ej: `12-345-6789`).

> Una vez recibido el código D-U-N-S, espera **24 a 48 horas** antes de ingresarlo en Apple Developer o Google Play, ya que toma ese tiempo propagarse en las bases de datos globales de validación.

---

## 4. Cómo Crear las Cuentas de Desarrollador

### A. Google Play Console (Android)
1. Ve a [play.google.com/console/signup](https://play.google.com/console/signup).
2. Selecciona **"Cuenta personal"** o **"Cuenta de organización"** (si tienes D-U-N-S).
3. Paga los **25 USD** con tarjeta internacional.
4. Completa la verificación de identidad (foto de cédula/pasaporte y comprobante de domicilio).

### B. Apple Developer Program (iOS)
1. Descarga la app **Apple Developer** en tu iPhone, iPad o Mac.
2. Inicia sesión con tu Apple ID (debe tener autenticación en dos factores 2FA activada).
3. Toca en la pestaña **"Account"** y luego en **"Enroll Now"**.
4. Selecciona **Individual** (cuenta personal) o **Organization** (cuenta de empresa con D-U-N-S).
5. Paga los **99 USD/año**.

---

## 5. Pasos de Compilación con tu Código Listo

Tu proyecto ya tiene instalados los paquetes de Capacitor y generados los proyectos nativos en `android/` y `ios/`.

### En tu Windows (Para Android):
1. Instala **Android Studio** (gratis desde developer.android.com/studio).
2. Abre la consola en el proyecto y corre:
   ```powershell
   npm run build:app
   npx cap sync
   npm run cap:android
   ```
3. Se abrirá Android Studio.
4. En el menú superior: **Build > Generate Signed Bundle / APK > Android App Bundle (.aab)**.
5. Crea una clave de firma (**Keystore**) y guárdala con una copia de respaldo segura.
6. Android Studio generará el archivo `.aab` listo para subir a Google Play Console.

### En tu Mac (Para iPhone / iOS):
1. Sube tus cambios al repositorio con `git push` o copia la carpeta del proyecto a tu Mac.
2. Abre la terminal en tu Mac dentro del proyecto y corre:
   ```bash
   npm install
   npm run build:app
   npx cap sync
   npx cap open ios
   ```
3. Se abrirá **Xcode** automáticamente con el proyecto `App.xcworkspace`.
4. En Xcode:
   - Haz clic en **App** en el panel izquierdo.
   - Ve a la pestaña **Signing & Capabilities**.
   - En **Team**, selecciona tu cuenta de Apple Developer conectada.
   - En **Bundle Identifier**, confirma: `com.maximus.inmobiliaria`.
5. Conecta un iPhone o selecciona el simulador para probar.
6. Para subir a App Store:
   - Selecciona como destino **Any iOS Device (arm64)**.
   - Menú superior: **Product > Archive**.
   - En la ventana de archivos: haz clic en **Distribute App > App Store Connect > Upload**.

---

## 6. Checklist de Documentos y Enlaces que te Pedirán las Tiendas

Ambas tiendas te pedirán estos datos al llenar la ficha pública:

- [x] **URL de Política de Privacidad:** `https://maximusinmobiliaria.tech/privacidad.html`
- [x] **URL de Eliminación de Cuenta:** `https://maximusinmobiliaria.tech/eliminar-cuenta.html`
- [x] **Ícono de la App:** Listo en `assets/icon-1024.png` (1024x1024) y `assets/icon-512.png`.
- [x] **Pantalla de Carga (Splash):** Lista en `assets/splash.png` (2732x2732).
- [x] **Categoría sugerida:** *Bienes Raíces* o *Estilo de Vida* (Secundaria: *Productividad / Negocios*).
- [x] **Datos de Acceso para los Revisores (Demo):**
  - **Correo:** `cliente@maximus.com` (o crea un usuario de prueba en Supabase).
  - **Contraseña:** la que asignes en Supabase para revisión.
  - **Nota para Apple/Google:** *"App informativa inmobiliaria con catálogo público de propiedades en Táchira y portal privado para asesores. No incluye pasarelas ni compras digitales dentro de la app."*
