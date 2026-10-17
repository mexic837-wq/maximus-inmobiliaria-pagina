# Catálogo de Soluciones y Remedios Móviles (Remediation Catalog)

Este catálogo documenta las soluciones exactas de código (Tailwind CSS y HTML) para cada problema detectado durante la auditoría visual móvil.

---

## 1. Problema: Desbordamiento Horizontal (Horizontal Overflow / Scroll Lateral Indeseado)
* **Síntoma:** La página o sección se puede deslizar hacia los lados en el móvil, cortando botones a la derecha.
* **Causas Comunes:**
  * Elementos con `w-[500px]` o anchos fijos sin `max-w-full`.
  * Filtros de píldoras horizontales sin contenedor con `overflow-x-auto` o elementos hijos sin `shrink-0`.
* **Solución en Código:**
  * Para contenedores con desbordamiento: agregar `overflow-x-hidden` en el contenedor padre.
  * Para barras de píldoras / filtros horizontales:
    ```html
    <!-- Antes (se sale o se rompe) -->
    <div class="flex items-center gap-2">
        <button class="px-4 py-2">Filtro 1</button>
    </div>

    <!-- Corregido (scroll suave nativo) -->
    <div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none w-full">
        <button class="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold ...">Filtro 1</button>
    </div>
    ```

---

## 2. Problema: Tarjetas Gigantes Apiladas Verticalmente (Desperdicio de Pantalla)
* **Síntoma:** Tres o cuatro tarjetas de métricas o KPIs ocupan dos pantallas completas de scroll vertical.
* **Causas Comunes:** `grid-cols-1 md:grid-cols-3` donde cada tarjeta tiene `h-32` o padding excesivo.
* **Solución en Código:**
  * Convertir a cuadrícula ergonómica móvil de 2 columnas:
    ```html
    <div class="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4">
        <!-- Hero Card en Móvil (ocupa 2 cols) -->
        <div class="col-span-2 md:col-span-1 bg-white p-3.5 sm:p-5 rounded-2xl ...">
            ...
        </div>
        <!-- Métricas Secundarias (1 col cada una, lado a lado) -->
        <div class="col-span-1 bg-white p-3 sm:p-5 rounded-2xl ...">
            ...
        </div>
        <div class="col-span-1 bg-white p-3 sm:p-5 rounded-2xl ...">
            ...
        </div>
    </div>
    ```

---

## 3. Problema: Márgenes Laterales Excesivos (Pérdida de Espacio Útil)
* **Síntoma:** En pantallas de 390px, el contenido queda encogido en el centro con franjas vacías gigantes a los lados.
* **Causa Común:** `px-6` (24px por lado = 48px perdidos) o `px-8` (64px perdidos) sin prefijo responsivo `sm:` o `md:`.
* **Solución en Código:**
  * Cambiar a `px-3.5 sm:px-10` o `px-4 sm:px-8` en contenedores principales `<main>` y secciones de vistas.

---

## 4. Problema: Menú Inferior (Dock Flotante) Tapa Botones o Contenido
* **Síntoma:** El usuario no puede hacer clic en los últimos botones o ver las últimas tarjetas porque la barra de navegación fija inferior los cubre.
* **Causa Común:** Falta de padding inferior proporcional (`pb-4` o `pb-6`).
* **Solución en Código:**
  * En el contenedor `<main>` o al final de cada `<section class="view-section">`:
    ```html
    <main class="flex-1 overflow-y-auto px-3.5 sm:px-10 pt-3 sm:pt-6 pb-24 sm:pb-6 relative z-0">
    ```
  * En modales o drawers móviles: agregar `pb-20` o botón de cierre accesible en el header fijo.

---

## 5. Problema: Títulos y Textos con Salto de Línea Feo
* **Síntoma:** Títulos de 3 líneas donde una sola letra o palabra queda huérfana en la última línea.
* **Causa Común:** Clases de texto desktop aplicadas en móvil sin breakpoint: `text-3xl` o `text-4xl`.
* **Solución en Código:**
  * Escala responsiva: `text-xl sm:text-3xl` o `text-2xl sm:text-4xl`.
  * Reducir `tracking-tight` si las palabras son largas en español.

---

## 6. Problema: Modales Desbordados en Altura
* **Síntoma:** El modal se extiende más allá de los 844px de alto del teléfono y el botón de acción queda inaccesible.
* **Solución en Código:**
  * Usar `max-h-[85vh] sm:max-h-[90vh] overflow-y-auto` en el contenedor del modal.
  * Mantener el botón de cierre `absolute top-4 right-4` o un footer pegajoso con `sticky bottom-0`.
