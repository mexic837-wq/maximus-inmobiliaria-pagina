---
name: mobile-responsive-fixer
description: >-
  Corrige y optimiza directamente en el código fuente (HTML, Tailwind CSS, JS) todos los problemas de proporciones,
  márgenes, desbordamientos y dimensiones detectados por la skill mobile-responsive-audit. Trabaja en sincronía
  con las capturas del navegador para aplicar parches quirúrgicos y verificar visualmente la resolución.
---

# Skill: Corrector y Optimizador Móvil de Código (Mobile Responsive Fixer)

Esta skill complementa y trabaja en sincronía directa con **`mobile-responsive-audit`**. Mientras la primera audita visualmente mediante navegador headless, esta skill se encarga de **intervenir el código fuente** (`dashboard-layout.html`, `index.html`, hojas de estilo), identificar las líneas exactas causantes del problema y aplicar las correcciones de arquitectura Tailwind CSS para dejar el diseño 100% nativo.

---

## 1. Conexión con `mobile-responsive-audit`
El ciclo continuo de trabajo entre ambas skills opera de la siguiente manera:

```text
[ mobile-responsive-audit ]
           │
           ▼ (Genera capturas PNG en assest/previews/)
[ Inspección de Fallas Visuales ]
           │
           ▼ (Detecta desbordamiento, paddings gigantes, tarjetas desproporcionadas)
[ mobile-responsive-fixer ]
           │
           ├─► Ejecuta check-mobile-antipatterns.js
           ├─► Consulta references/remediation-catalog.md
           └─► Aplica replace_file_content en el código fuente
           │
           ▼
[ Verificación en Navegador ] (Re-ejecuta capture-mobile.js para confirmar la solución)
```

---

## 2. Flujo de Trabajo para Corregir Errores de Código

### Paso 1: Ejecutar el escáner de antipatrones de código
```powershell
node assest/skills/mobile-responsive-fixer/scripts/check-mobile-antipatterns.js
```
Este comando analiza el DOM y genera el archivo [`diagnostico-movil.json`](./diagnostico-movil.json) con números de línea exactos, severidad del error y la sugerencia de reemplazo en Tailwind CSS.

### Paso 2: Consultar la Solución Estándar
Revisa el catálogo de soluciones documentadas:
[Catálogo de Soluciones y Remedios Móviles](./references/remediation-catalog.md)

Principales reglas de corrección:
1. **Márgenes de contenedor principal:** Cambiar `px-6` o `px-8` por `px-3.5 sm:px-10` o `px-4 sm:px-8`.
2. **Evitar apilamientos verticales innecesarios:** Reorganizar cuadrículas de 1 columna a 2 columnas ergonómicas (`grid grid-cols-2 md:grid-cols-3`).
3. **Despeje del dock inferior:** Garantizar `pb-24 sm:pb-6` en `<main>` para que la barra de navegación móvil no oculte ningún contenido.
4. **Scroll horizontal limpio en píldoras:** Agregar `overflow-x-auto pb-1 scrollbar-none` y `shrink-0` a los botones hijos.
5. **Alturas controladas en gráficos y modales:** Limitar gráficos a `h-[140px] sm:h-[210px]` y modales a `max-h-[85vh] overflow-y-auto`.

### Paso 3: Aplicar los Parches Quirúrgicos
Utiliza la herramienta `replace_file_content` para modificar las líneas identificadas sin alterar la lógica de negocio ni identificadores (`id="..."`).

### Paso 4: Validar Visualmente el Cambio
Ejecuta el ciclo de verificación completa:
```powershell
node assest/skills/mobile-responsive-fixer/scripts/run-fix-cycle.js
```
Abre las capturas en `assest/previews/` con `view_file` para comprobar que las proporciones ahora son exactas y elegantes.

---

## 3. Recursos y Scripts Incluidos
* [check-mobile-antipatterns.js](./scripts/check-mobile-antipatterns.js): Detector estático de clases conflictivas en el HTML.
* [run-fix-cycle.js](./scripts/run-fix-cycle.js): Orquestador del ciclo completo de escaneo, corrección y re-captura visual.
* [remediation-catalog.md](./references/remediation-catalog.md): Catálogo de soluciones y ejemplos de código.
