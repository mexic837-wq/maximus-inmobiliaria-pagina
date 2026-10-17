# Reglas de Diseño y Proporciones Móviles (MAXIMUS Mobile First)

Esta guía define las proporciones, medidas y patrones obligatorios para que cualquier sección del dashboard o landing page se sienta como una aplicación nativa en dispositivos móviles.

---

## 1. Viewports Estándar de Referencia
* **Resolución Primaria:** `390px × 844px` (iPhone 12/13/14/15, Pixel, Galaxy modernos).
* **Resolución Mínima Soportada:** `360px × 740px` (Androids compactos).
* **Resolución Máxima Móvil:** `430px × 932px` (iPhone Pro Max / Plus).

---

## 2. Márgenes y Espaciado Horizontal
* **Contenedor Principal (`main`):**
  * Móvil: `px-3.5` a `px-4` (14px - 16px). **Nunca** usar `px-6` (24px) o mayor en móvil, ya que desperdicia casi 50px de ancho utilizable.
  * Desktop: `sm:px-10` o `lg:px-12`.
* **Margen Inferior (`padding-bottom`):**
  * En el Dashboard móvil existe un Dock de Navegación inferior flotante (`bottom-0`).
  * Por regla obligatoria, el `<main>` debe tener `pb-24` o `pb-28` en móvil (`pb-24 sm:pb-6`), garantizando que la última tarjeta o botón quede completamente visible por encima del menú.

---

## 3. Cuadrículas y Tarjetas de Métricas (KPIs)
* **Regla Antiapilamiento:**
  * En móvil, **NO** apilar 3 tarjetas grandes verticalmente una debajo de la otra ocupando todo el alto de pantalla.
  * Usar un grid de 2 columnas:
    * **Tarjeta Principal / Hero KPI:** `col-span-2` (altura máxima compacta: ~68px-74px).
    * **Tarjetas Secundarias:** `col-span-1` cada una, ubicadas lado a lado (`grid-cols-2`).
* **Padding interno de tarjetas:** `p-3.5` o `p-4` en móvil, `sm:p-5`.

---

## 4. Tipografía y Jerarquía
* **Títulos Principales (`h1`, `h2`):**
  * Móvil: `text-xl` a `text-2xl` (`font-extrabold`).
  * Evitar títulos de más de `28px` en móvil que generen saltos de línea antiestéticos.
* **Valores Numéricos Grandes:**
  * Móvil: `text-2xl` a `text-3xl font-black`.
* **Etiquetas y Subtítulos:**
  * `text-[10px]` o `text-[11px]` en mayúsculas (`uppercase tracking-wider font-bold`).
* **Textos Descriptivos:**
  * `text-xs` (12px) a `text-sm` (14px).

---

## 5. Botones y Áreas Táctiles (Touch Targets)
* **Tamaño mínimo táctil:** `44px × 44px` para botones de acción principal.
* **Botones secundarios / pastillas:** Altura mínima de `34px-36px` (`py-2 px-3`).
* **Iconos de acción rápida (WhatsApp, Filtro, Perfil):** Contenedores circulares o redondeados de `w-8 h-8` a `w-10 h-10`.

---

## 6. Gráficos y Tablas
* **Gráficos SVG / Canvas:**
  * Altura máxima en móvil: `130px` a `150px` (`h-[140px] sm:h-[210px]`).
  * Los selectores de período (`Hoy`, `Mes`, `Año`) deben ser compactos en forma de cápsula.
* **Tablas:**
  * En móvil, convertir filas de tablas en tarjetas compactas o habilitar scroll horizontal suave (`overflow-x-auto scrollbar-none`).

---

## 7. Desbordamiento Horizontal (Zero Horizontal Overflow)
* Ningún elemento (`input`, `button`, `pill`, `badge`, `modal`) debe salirse de la pantalla.
* En modales o galerías fotográficas:
  * Proporción de fotos: `grid-cols-2` con `h-32` a `h-40`, permitiendo ver 4 fotos a la vez y abrir en lightbox con swipe touch.
