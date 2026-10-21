# Criterios Editoriales y Tono de Marca: MAXIMUS Inmobiliaria

> **Guía de Estilo Comercial para el Agente Captador de WhatsApp**
> Basado en el catálogo corporativo (`catalog.html`, `dashboard-layout.html`, `js/mock-data.js` y `sql/update-captaciones-maximus.sql`).

---

## 1. Identidad de Voz y Tono de Marca

**MAXIMUS Inmobiliaria** proyecta exclusividad, respaldo legal, sobriedad arquitectónica y liderazgo en el mercado inmobiliario del Estado Táchira (San Cristóbal, Cárdenas, Guásimos, Junín, etc.).

Cuando los asesores externos envían mensajes por los grupos de WhatsApp, suelen escribir con:
- Exceso de emojis estridentes (`🔥🔥😱😱 OFERTAZO REGALADO 🏃‍♂️🏃‍♂️`).
- Mayúsculas sostenidas (`SE VENDE CASA EN BARRIO OBRERO`).
- Abreviaturas informales (`3hab, 2b, 1p/e, coc emp, tq sub`).
- Errores ortográficos o desorden estructural.

**El Agente Captador JAMÁS copia y pega el texto crudo de WhatsApp en la descripción pública.** Siempre transforma los datos reales verificados al **Estándar Editorial MAXIMUS**, manteniendo 100% fidelidad a los datos objetivos (sin inventar acabados ni servicios que no estén en el anuncio o en las fotos).

---

## 2. Reglas de Redacción por Campo

### 2.1. Título del Inmueble (`titulo`)
- **Longitud ideal:** 4 a 8 palabras (máximo 65 caracteres).
- **Formato:** Tipo de Propiedad + Atributo Principal + Ubicación o Concepto.
- **Capitalización:** Tipo oración o Title Case elegante (nunca TODO EN MAYÚSCULAS).
- **Ejemplos Reales MAXIMUS:**
  - ✅ *"Quinta moderna con piscina y jardín"*
  - ✅ *"Apartamento amoblado piso medio"*
  - ✅ *"Local Comercial en Avenida Principal"*
  - ✅ *"Townhouse a estrenar en conjunto cerrado"*
  - ✅ *"Galpón Industrial con Oficinas Administrativas"*
  - ❌ *"VENDO BELLO APTO EN PUEBLO NUEVO OPORTUNIDAD"*

### 2.2. Subtítulo (`subtitulo`)
- **Longitud ideal:** 10 a 18 palabras (1 línea ejecutiva).
- **Función:** Complementar el título resaltando la propuesta de valor (privacidad, vista, alto tráfico peatonal, equipamiento, ubicación estratégica).
- **Ejemplos Reales MAXIMUS:**
  - ✅ *"Exclusiva residencia en urbanismo cerrado con acabados de primera y máxima privacidad"*
  - ✅ *"Punto comercial estratégico de alto tráfico vehicular y peatonal con estacionamiento"*
  - ✅ *"Piso alto con vista panorámica a la ciudad y acabados en mármol"*

### 2.3. Descripción del Sector (`sector_desc`)
- **Longitud ideal:** 1 a 2 oraciones concisas.
- **Tono:** Consultor de inversión inmobiliaria en Táchira.
- **Plantillas por Zona de San Cristóbal y Táchira:**
  - **Barrio Obrero / Pasaje Acueducto:** *"Zona comercial y residencial consolidada en el corazón de San Cristóbal, con acceso inmediato a servicios, gastronomía y transporte."*
  - **Pueblo Nuevo / Av. España / Los Kioscos:** *"Sector residencial de altísima demanda y plusvalía continua en San Cristóbal, rodeado de centros empresariales, clínicas y comercios exclusivos."*
  - **Urbanización Guaparo / Las Lomas / El Country:** *"Ubicada en una de las zonas residenciales más consolidadas, seguras y cotizadas de San Cristóbal, caracterizada por su tranquilidad y alto perfil urbano."*
  - **Pirineos (I y II) / Quinimarí / Sabana Larga:** *"Zona alta residencial caracterizada por su clima fresco de montaña, urbanismos organizados y excelente conectividad vial."*
  - **Paramillo / Altos de Paramillo / Zona Industrial:** *"Sector de alto crecimiento urbanístico y corporativo al norte de San Cristóbal, con excelente proyección de revalorización."*
  - **Av. 19 de Abril / Av. Carabobo / Av. Ferrero Tamayo / Centro:** *"Arteria comercial y empresarial neurálgica de la ciudad con máxima visibilidad e intenso flujo vehicular y peatonal."*
  - **Táriba / Colinas de Táriba / El Diamante / Tucapé:** *"Zona residencial de clima agradable y tradición familiar en el Municipio Cárdenas, a pocos minutos de San Cristóbal por vía expresa."*
  - **Palmira / Cordero / El Abejal:** *"Sector de clima frío de montaña y ambiente campestre tranquilo, ideal para descanso familiar o proyectos turísticos y agro-residenciales."*

### 2.4. Descripción Larga (`descripcion`)
Debe estructurarse en **2 a 3 párrafos fluidos**:
1. **Párrafo 1 (Apertura y Distribución):** Presentación del inmueble, metraje (`metros_cuadrados` m²), ubicación y distribución interior (habitaciones, baños, cocina, sala-comedor, oficinas o áreas operativas).
2. **Párrafo 2 (Equipamiento y Bondades):** Detalles de acabados, estacionamiento (especificando si es techado, a pie de calle, etc.), autonomía hídrica (tanque subterráneo/aéreo, hidroneumático), respaldo eléctrico (planta) o seguridad del conjunto.
3. **Párrafo 3 (Condiciones Comerciales):**
   - **Si es ALQUILER:** Incluir obligatoriamente el canon mensual, perfil requerido (ej. perfil jurídico, sin mascotas si lo indica) y las condiciones de negociación detalladas en el anuncio (meses de depósito, meses de adelanto, mes de comisión administrativa, si incluye o no condominio/servicios).
   - **Si es VENTA:** Incluir si acepta financiamiento, vehículo como parte de pago, efectivo/Zelle, y que cuenta con documentación lista para firma.

### 2.5. Selección de los 4 Aspectos Destacados (`aspectos_destacados`)
Cada inmueble debe llevar **4 aspectos destacados** usando exclusivamente los 23 iconos oficiales de `dashboard-layout.html`:
- Si menciona **Planta Eléctrica** → `ph-lightning` (*"Autonomía Eléctrica"*)
- Si menciona **Tanque / Pozo de Agua** → `ph-drop` (*"Reserva Hídrica"*)
- Si menciona **Vigilancia / Conjunto Cerrado** → `ph-shield-check` (*"Seguridad 24/7"*)
- Si menciona **Amoblado** → `ph-armchair` (*"Equipamiento Integral"*)
- Si menciona **Cocina Empotrada** → `ph-cooking-pot` (*"Cocina Equipada"*)
- Si es **Local Comercial** → `ph-storefront` (*"Alto Tráfico Comercial"*)
- Si es **Galpón** → `ph-warehouse` (*"Infraestructura Industrial"*)
- Si es **Finca / Terreno** → `ph-plant` (*"Potencial de Desarrollo"*)
- Si menciona **Estacionamiento** → `ph-car` (*"Estacionamiento Cómodo"*)
- Comodines de cierre (si el anuncio tiene pocos detalles):
  - `ph-trend-up` (*"Ubicación Estratégica"*, *"Zona de alta demanda y plusvalía en Táchira"*)
  - `ph-check` (*"Gestión MAXIMUS"*, *"Atención personalizada y respaldo en la negociación"*)
