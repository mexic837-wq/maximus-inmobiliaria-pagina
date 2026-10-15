---
name: mobile-responsive-audit
description: >-
  Audita y optimiza el dashboard y la landing page de MAXIMUS Inmobiliaria para pantallas móviles.
  Permite ingresar mediante navegador headless a la web local, capturar pantallas en viewport móvil
  (390x844), inspeccionar visualmente proporciones, márgenes, alturas y desbordamientos, y corregir
  el código CSS/HTML para lograr una experiencia de app móvil nativa.
---

# Skill: Auditoría y Optimización Móvil (Mobile Responsive Audit)

Esta skill dota al asistente de la capacidad de auditar visualmente el sitio web y dashboard de MAXIMUS en tiempo real mediante un navegador real (Google Chrome Headless), evaluar las proporciones en dispositivos móviles y corregir problemas de diseño responsivo.

---

## 1. Cuándo Utilizar Esta Skill
Usa esta skill cuando el usuario pida:
* Revisar cómo se ve el dashboard o landing page en un teléfono móvil.
* Corregir problemas de proporciones, tarjetas desalineadas o elementos cortados.
* Optimizar vistas para que se sientan como una **aplicación móvil nativa**.
* Tomar capturas de pantalla automáticas para validar visualmente los cambios antes de responder.

---

## 2. Flujo de Trabajo Paso a Paso

### Paso 1: Verificar que el servidor local esté activo
Antes de capturar pantallas, asegúrate de que el servidor web local esté ejecutándose en el puerto 3000:
```bash
node -e "fetch('http://localhost:3000/').then(r => console.log('HTTP Status:', r.status))"
```
Si no está activo, inícialo con `node server.js` en segundo plano.

### Paso 2: Capturar pantalla móvil mediante Chrome Headless
Ejecuta el script de captura incluido en la skill para tomar una captura en resolución móvil estándar (390px × 844px):

* **Para una vista específica:**
```bash
node assest/skills/mobile-responsive-audit/scripts/capture-mobile.js http://localhost:3000/dashboard assest/previews/mobile-dashboard.png 390 844
```

* **Para auditar todas las vistas principales de una vez:**
```bash
node assest/skills/mobile-responsive-audit/scripts/audit-all-views.js
```

Las capturas quedarán almacenadas en `assest/previews/`.

### Paso 3: Inspeccionar visualmente la captura generada
Usa la herramienta `view_file` sobre el archivo de imagen generado (e.g., `assest/previews/mobile-dashboard.png`).
Revisa críticamente:
1. **Desbordamiento horizontal:** ¿Hay botones, tablas o textos cortados a la derecha?
2. **Proporciones de tarjetas (KPIs):** ¿Las tarjetas están bien distribuidas (2 columnas compactas) o hay bloques gigantes apilados ocupando toda la pantalla?
3. **Márgenes laterales:** ¿El contenedor tiene entre 14px y 16px (`px-3.5` / `px-4`), o se está desperdiciando espacio con `px-6`?
4. **Dock inferior:** ¿El contenido tiene `pb-24` para que el menú de navegación fijo no tape los botones o el footer?
5. **Legibilidad de fuentes:** ¿Los títulos son proporcionados (`text-xl` a `text-2xl`), y las etiquetas son claras?

### Paso 4: Aplicar Correcciones en el Código
Consulta las especificaciones de diseño en:
[Reglas de Diseño Móvil](./references/mobile-design-rules.md)

Edita los archivos HTML correspondientes (`dashboard-layout.html`, `index.html`) usando `replace_file_content`.

### Paso 5: Revalidar Visualmente
Vuelve a ejecutar la captura del Paso 2 y comprueba con `view_file` que el problema visual haya quedado 100% resuelto.

---

## 3. Recursos y Scripts Incluidos
* [capture-mobile.js](./scripts/capture-mobile.js): Utilidad de captura individual por URL y viewport.
* [audit-all-views.js](./scripts/audit-all-views.js): Auditor en lote para todas las vistas clave.
* [mobile-design-rules.md](./references/mobile-design-rules.md): Reglas de espaciado, jerarquía y patrones móviles.
