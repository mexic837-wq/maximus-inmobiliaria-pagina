const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'dashboard-layout.html');
let html = fs.readFileSync(filePath, 'utf8');

// 1. Reemplazar la sección de Ubicación en el formulario de Cargar Inmueble
const ubicacionHtmlOld = `                        <!-- Ubicación -->
                        <div>
                            <h3 class="text-lg font-extrabold text-maximus-dark mb-4 border-b border-gray-100 pb-2">Ubicación</h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div class="md:col-span-2">
                                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Ubicación General</label>
                                    <input type="text" id="inm-ubicacion" placeholder="Ej: Urbanización Guaparo, San Cristóbal..." class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-maximus-dark outline-none focus:border-maximus-accent placeholder-gray-400">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nombre del Sector</label>
                                    <input type="text" id="inm-sectornombre" placeholder="Ej: Urbanización Guaparo" class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-maximus-dark outline-none focus:border-maximus-accent placeholder-gray-400">
                                </div>
                                <div class="md:col-span-2">
                                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Descripción del Sector</label>
                                    <textarea id="inm-sectordesc" rows="2" class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-maximus-dark outline-none focus:border-maximus-accent placeholder-gray-400"></textarea>
                                </div>
                            </div>
                        </div>`;

const ubicacionHtmlNew = `                        <!-- Ubicación Unificada y Estandarizada -->
                        <div>
                            <div class="flex items-center justify-between mb-4 border-b border-gray-100 pb-2">
                                <h3 class="text-lg font-extrabold text-maximus-dark flex items-center gap-2">
                                    <i class="ph-fill ph-map-pin text-emerald-600"></i> Ubicación del Inmueble
                                </h3>
                                <span class="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                                    Plantilla Oficial · Táchira
                                </span>
                            </div>
                            <div class="space-y-2">
                                <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Zona / Sector Oficial de Táchira *
                                </label>
                                <div class="relative">
                                    <select id="inm-sector-select" onchange="alCambiarSectorInmueble()" class="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-maximus-dark outline-none focus:border-maximus-accent appearance-none cursor-pointer pr-10">
                                        <option value="">-- Selecciona la zona o sector del inmueble --</option>
                                    </select>
                                    <i class="ph-bold ph-caret-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm"></i>
                                </div>
                                <p class="text-[11px] text-gray-400 flex items-center gap-1.5 pt-0.5">
                                    <i class="ph ph-info text-emerald-600"></i> Sincronizado automáticamente con los filtros del catálogo de inmuebles y el buscador general.
                                </p>
                                <!-- Campos ocultos para mantener compatibilidad 100% con DB Supabase y servicios existentes -->
                                <input type="hidden" id="inm-ubicacion" value="">
                                <input type="hidden" id="inm-sectornombre" value="">
                                <input type="hidden" id="inm-sectordesc" value="">
                            </div>
                        </div>`;

// Normalizar saltos de línea para búsqueda robusta
function replaceText(source, target, replacement) {
    const normSource = source.replace(/\r\n/g, '\n');
    const normTarget = target.replace(/\r\n/g, '\n');
    const normReplacement = replacement.replace(/\r\n/g, '\n');

    if (!normSource.includes(normTarget)) {
        throw new Error('Target not found in source text: ' + target.substring(0, 80));
    }

    const replaced = normSource.replace(normTarget, normReplacement);
    // Restaurar CRLF si el original lo usaba
    return source.includes('\r\n') ? replaced.replace(/\n/g, '\r\n') : replaced;
}

// 1. Aplicar reemplazo de ubicación en el formulario
html = replaceText(html, ubicacionHtmlOld, ubicacionHtmlNew);
console.log('✅ 1. Sección Ubicación en formulario Cargar Inmueble reemplazada con selector único.');

// 2. Agregar selector de Zona / Ubicación en Filtros Avanzados del catálogo
const filtrosPanelOld = `                                    <div class="space-y-3">
                                        <!-- Tipo de Inmueble -->
                                        <div>
                                            <label class="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Tipo de Inmueble</label>`;

const filtrosPanelNew = `                                    <div class="space-y-3">
                                        <!-- Zona / Ubicación Oficial -->
                                        <div>
                                            <label class="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Zona / Sector</label>
                                            <select id="filtro-avanzado-ubicacion" onchange="alCambiarFiltroAvanzadoUbicacion()" class="w-full bg-gray-50 border border-gray-200 text-gray-600 text-xs rounded-xl px-3 py-2 outline-none focus:border-maximus-accent font-medium cursor-pointer">
                                                <option value="">Todas las zonas</option>
                                            </select>
                                        </div>

                                        <!-- Tipo de Inmueble -->
                                        <div>
                                            <label class="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Tipo de Inmueble</label>`;

html = replaceText(html, filtrosPanelOld, filtrosPanelNew);
console.log('✅ 2. Selector de Zona / Sector agregado al panel de Filtros Avanzados.');

// 3. Enriquecer UBICACIONES_TACHIRA con sectores clave de Táchira
const tachiraObjOld = `            'la-popita':   { label: 'La Popita', municipio: 'San Cristóbal' },
            // --- MUNICIPIO CÁRDENAS (Táriba) ---`;

const tachiraObjNew = `            'la-popita':   { label: 'La Popita', municipio: 'San Cristóbal' },
            'las-pilas':   { label: 'Las Pilas', municipio: 'San Cristóbal' },
            'barrio-sucre': { label: 'Barrio Sucre', municipio: 'San Cristóbal' },
            'unidad-vecinal': { label: 'Unidad Vecinal', municipio: 'San Cristóbal' },
            'madre-juana': { label: 'Madre Juana', municipio: 'San Cristóbal' },
            'santa-ines':  { label: 'Santa Inés', municipio: 'San Cristóbal' },
            'quinimari':   { label: 'Quinimarí', municipio: 'San Cristóbal' },
            // --- MUNICIPIO CÁRDENAS (Táriba) ---
            '_sep_card': { separator: true, label: 'Municipio Cárdenas' },
            'tariba':      { label: 'Táriba', municipio: 'Cárdenas' },
            'palmira':     { label: 'Palmira', municipio: 'Cárdenas' },
            'palo-gordo':  { label: 'Palo Gordo', municipio: 'Cárdenas' },
            // --- MUNICIPIO TORBES ---
            '_sep_torbes': { separator: true, label: 'Municipio Torbes' },
            'san-josecito': { label: 'San Josecito', municipio: 'Torbes' },`;

// Ojo: Si Cárdenas ya estaba, chequear cómo estaba definido
const tachiraCheck = `            'la-popita':   { label: 'La Popita', municipio: 'San Cristóbal' },
            // --- MUNICIPIO CÁRDENAS (Táriba) ---
            '_sep_card': { separator: true, label: 'Municipio Cárdenas' },
            'tariba':      { label: 'Táriba', municipio: 'Cárdenas' },
            'palmira':     { label: 'Palmira', municipio: 'Cárdenas' },`;

const tachiraCheckReplacement = `            'la-popita':   { label: 'La Popita', municipio: 'San Cristóbal' },
            'las-pilas':   { label: 'Las Pilas', municipio: 'San Cristóbal' },
            'barrio-sucre': { label: 'Barrio Sucre', municipio: 'San Cristóbal' },
            'unidad-vecinal': { label: 'Unidad Vecinal', municipio: 'San Cristóbal' },
            'madre-juana': { label: 'Madre Juana', municipio: 'San Cristóbal' },
            'santa-ines':  { label: 'Santa Inés', municipio: 'San Cristóbal' },
            'quinimari':   { label: 'Quinimarí', municipio: 'San Cristóbal' },
            // --- MUNICIPIO CÁRDENAS (Táriba) ---
            '_sep_card': { separator: true, label: 'Municipio Cárdenas' },
            'tariba':      { label: 'Táriba', municipio: 'Cárdenas' },
            'palmira':     { label: 'Palmira', municipio: 'Cárdenas' },
            'palo-gordo':  { label: 'Palo Gordo', municipio: 'Cárdenas' },
            // --- MUNICIPIO TORBES ---
            '_sep_torbes': { separator: true, label: 'Municipio Torbes' },
            'san-josecito': { label: 'San Josecito', municipio: 'Torbes' },`;

html = replaceText(html, tachiraCheck, tachiraCheckReplacement);
console.log('✅ 3. Diccionario UBICACIONES_TACHIRA enriquecido con sectores oficiales adicionales.');

// 4. Agregar funciones popularSelectsUbicaciones, alCambiarSectorInmueble y alCambiarFiltroAvanzadoUbicacion
const funcUbicacionesAnchor = `        let selectedLocation = 'todas';
        let selectedPeriod = 'hoy';`;

const funcUbicacionesAddition = `        let selectedLocation = 'todas';
        let selectedPeriod = 'hoy';

        // Población y sincronización de selectors de ubicación
        function popularSelectsUbicaciones() {
            const selectCargar = document.getElementById('inm-sector-select');
            const selectFiltro = document.getElementById('filtro-avanzado-ubicacion');

            if (!selectCargar && !selectFiltro) return;

            let optGroupsHtml = '';
            let currentGroup = null;

            for (const [key, loc] of Object.entries(UBICACIONES_TACHIRA)) {
                if (key === 'todas') continue;

                if (loc.separator) {
                    if (currentGroup) {
                        optGroupsHtml += \`</optgroup>\`;
                    }
                    optGroupsHtml += \`<optgroup label="\${loc.label}">\`;
                    currentGroup = loc.label;
                } else {
                    const mun = loc.municipio ? \` (\${loc.municipio})\` : '';
                    optGroupsHtml += \`<option value="\${key}">\${loc.label}\${mun}</option>\`;
                }
            }
            if (currentGroup) {
                optGroupsHtml += \`</optgroup>\`;
            }

            if (selectCargar) {
                const currentVal = selectCargar.value;
                selectCargar.innerHTML = \`
                    <option value="">-- Selecciona la zona o sector del inmueble --</option>
                    \${optGroupsHtml}
                \`;
                if (currentVal) selectCargar.value = currentVal;
            }

            if (selectFiltro) {
                const currentFilterVal = selectFiltro.value;
                selectFiltro.innerHTML = \`
                    <option value="">Todas las zonas</option>
                    \${optGroupsHtml}
                \`;
                if (currentFilterVal) selectFiltro.value = currentFilterVal;
            }
        }
        window.popularSelectsUbicaciones = popularSelectsUbicaciones;

        function alCambiarSectorInmueble() {
            const select = document.getElementById('inm-sector-select');
            const val = select ? select.value : '';
            const loc = UBICACIONES_TACHIRA[val];
            
            const ubicacionInput = document.getElementById('inm-ubicacion');
            const sectorNombreInput = document.getElementById('inm-sectornombre');
            const sectorDescInput = document.getElementById('inm-sectordesc');
            
            if (loc && !loc.separator && val !== 'todas') {
                const sector = loc.label;
                const municipio = loc.municipio ? loc.municipio : 'San Cristóbal';
                const ubicacionTexto = \`\${sector}, \${municipio}, Táchira\`;
                
                if (sectorNombreInput) sectorNombreInput.value = sector;
                if (ubicacionInput) ubicacionInput.value = ubicacionTexto;
                if (sectorDescInput) sectorDescInput.value = \`Sector residencial \${sector}, Municipio \${municipio}, Estado Táchira.\`;
            } else {
                if (sectorNombreInput) sectorNombreInput.value = '';
                if (ubicacionInput) ubicacionInput.value = '';
                if (sectorDescInput) sectorDescInput.value = '';
            }
        }
        window.alCambiarSectorInmueble = alCambiarSectorInmueble;

        function alCambiarFiltroAvanzadoUbicacion() {
            const val = document.getElementById('filtro-avanzado-ubicacion')?.value || 'todas';
            selectedLocation = val;
            const loc = UBICACIONES_TACHIRA[val];
            const labelEl = document.getElementById('selectedLocationLabel');
            if (labelEl && loc) {
                labelEl.textContent = loc.label;
            }
            if (typeof filtrarCatalogoInmuebles === 'function') {
                filtrarCatalogoInmuebles();
            }
            if (typeof updateDashboard === 'function') {
                updateDashboard();
            }
        }
        window.alCambiarFiltroAvanzadoUbicacion = alCambiarFiltroAvanzadoUbicacion;`;

html = replaceText(html, funcUbicacionesAnchor, funcUbicacionesAddition);
console.log('✅ 4. Funciones de población y sincronización de ubicaciones añadidas.');

// 5. Actualizar selectLocation para sincronizar con el filtro avanzado y refrescar el catálogo
const selectLocationOld = `        function selectLocation(key) {
            selectedLocation = key;
            const loc = UBICACIONES_TACHIRA[key];
            document.getElementById('selectedLocationLabel').textContent = loc.label;
            closeLocationDropdown();
            setTimeout(() => {
                document.getElementById('locationSearch').value = '';
                renderLocationList();
            }, 250);
            updateDashboard();
        }`;

const selectLocationNew = `        function selectLocation(key) {
            selectedLocation = key;
            const loc = UBICACIONES_TACHIRA[key];
            const labelEl = document.getElementById('selectedLocationLabel');
            if (labelEl && loc) {
                labelEl.textContent = loc.label;
            }

            // Sincronizar select de filtro avanzado si existe en el DOM
            const filtroAdvUbi = document.getElementById('filtro-avanzado-ubicacion');
            if (filtroAdvUbi) {
                filtroAdvUbi.value = (key === 'todas') ? '' : key;
            }

            closeLocationDropdown();
            setTimeout(() => {
                const searchInput = document.getElementById('locationSearch');
                if (searchInput) searchInput.value = '';
                renderLocationList();
            }, 250);
            updateDashboard();
            if (typeof filtrarCatalogoInmuebles === 'function') {
                filtrarCatalogoInmuebles();
            }
        }`;

html = replaceText(html, selectLocationOld, selectLocationNew);
console.log('✅ 5. Función selectLocation actualizada para refrescar catálogo y sincronizar selector.');

// 6. Actualizar filtrarCatalogoInmuebles para filtrar exactamente por la zona/sector seleccionada
const filtrarCatalogoOld = `        function filtrarCatalogoInmuebles() {
            const searchInput = document.getElementById('buscador-inmuebles');
            const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
            const tarjetas = document.querySelectorAll('.tarjeta-inmueble');
            const emptyState = document.getElementById('inmuebles-empty-state');
            const contador = document.getElementById('contador-resultados');
            
            let visibles = 0;

            tarjetas.forEach(card => {
                const isMaximus = card.getAttribute('data-maximus') === 'true';
                const operacion = card.getAttribute('data-operacion');
                const searchData = (card.getAttribute('data-search') || '').toLowerCase();
                const cardText = card.textContent.toLowerCase();

                let coincideCategoria = true;
                if (filtroCategoriaActivo === 'maximus' || filtroSoloMaximusToggle) {
                    coincideCategoria = isMaximus;
                } else if (filtroCategoriaActivo === 'venta') {
                    coincideCategoria = operacion === 'venta';
                } else if (filtroCategoriaActivo === 'alquiler') {
                    coincideCategoria = operacion === 'alquiler';
                } else if (filtroCategoriaActivo === 'favoritos') {
                    const favs = getFavoritosDashboard();
                    const cardId = card.getAttribute('data-inm-id') || (card.getAttribute('onclick') || '').match(/inm-[a-zA-Z0-9_-]+/)?.[0];
                    coincideCategoria = esIdFavorito(cardId, favs);
                }

                let coincideBusqueda = true;
                if (query.length > 0) {
                    coincideBusqueda = searchData.includes(query) || cardText.includes(query);
                }

                if (coincideCategoria && coincideBusqueda) {
                    card.style.display = '';
                    visibles++;
                } else {
                    card.style.display = 'none';
                }
            });`;

const filtrarCatalogoNew = `        function filtrarCatalogoInmuebles() {
            const searchInput = document.getElementById('buscador-inmuebles');
            const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
            const tarjetas = document.querySelectorAll('.tarjeta-inmueble');
            const emptyState = document.getElementById('inmuebles-empty-state');
            const contador = document.getElementById('contador-resultados');
            
            // Filtro por ubicación activa (desde select avanzado o header dropdown)
            const filtroUbiSelect = document.getElementById('filtro-avanzado-ubicacion')?.value;
            const ubiActiva = filtroUbiSelect || (selectedLocation && selectedLocation !== 'todas' ? selectedLocation : '');
            let locFiltroLabel = '';
            let locFiltroKey = '';
            if (ubiActiva && ubiActiva !== 'todas') {
                const locObj = (typeof UBICACIONES_TACHIRA !== 'undefined') ? UBICACIONES_TACHIRA[ubiActiva] : null;
                locFiltroLabel = (locObj?.label || ubiActiva).toLowerCase().replace(/táchira|tachira/g, '').trim();
                locFiltroKey = ubiActiva.replace(/-/g, ' ').toLowerCase();
            }

            // Filtro por tipo avanzado
            const tipoFiltroSelect = document.getElementById('filtro-avanzado-tipo')?.value || '';

            let visibles = 0;

            tarjetas.forEach(card => {
                const isMaximus = card.getAttribute('data-maximus') === 'true';
                const operacion = card.getAttribute('data-operacion');
                const searchData = (card.getAttribute('data-search') || '').toLowerCase();
                const cardText = card.textContent.toLowerCase();

                let coincideCategoria = true;
                if (filtroCategoriaActivo === 'maximus' || filtroSoloMaximusToggle) {
                    coincideCategoria = isMaximus;
                } else if (filtroCategoriaActivo === 'venta') {
                    coincideCategoria = operacion === 'venta';
                } else if (filtroCategoriaActivo === 'alquiler') {
                    coincideCategoria = operacion === 'alquiler';
                } else if (filtroCategoriaActivo === 'favoritos') {
                    const favs = getFavoritosDashboard();
                    const cardId = card.getAttribute('data-inm-id') || (card.getAttribute('onclick') || '').match(/inm-[a-zA-Z0-9_-]+/)?.[0];
                    coincideCategoria = esIdFavorito(cardId, favs);
                }

                let coincideBusqueda = true;
                if (query.length > 0) {
                    coincideBusqueda = searchData.includes(query) || cardText.includes(query);
                }

                let coincideUbicacion = true;
                if (locFiltroLabel || locFiltroKey) {
                    coincideUbicacion = searchData.includes(locFiltroLabel) || searchData.includes(locFiltroKey) || cardText.includes(locFiltroLabel);
                }

                let coincideTipo = true;
                if (tipoFiltroSelect) {
                    coincideTipo = searchData.includes(tipoFiltroSelect.toLowerCase()) || cardText.includes(tipoFiltroSelect.toLowerCase());
                }

                if (coincideCategoria && coincideBusqueda && coincideUbicacion && coincideTipo) {
                    card.style.display = '';
                    visibles++;
                } else {
                    card.style.display = 'none';
                }
            });`;

html = replaceText(html, filtrarCatalogoOld, filtrarCatalogoNew);
console.log('✅ 6. Función filtrarCatalogoInmuebles actualizada con filtro de ubicación sincronizado.');

// 7. Actualizar guardarInmuebleAdmin para leer la zona del select único y generar ubicacion + sector_nombre
const guardarInmuebleOld = `        async function guardarInmuebleAdmin() {
            // Recolectar datos del formulario
            const titulo = document.getElementById('inm-titulo').value;
            const subtitulo = document.getElementById('inm-subtitulo').value;
            const tipo = document.getElementById('inm-tipo').value;
            const operacion = document.getElementById('inm-operacion').value;
            const precio = document.getElementById('inm-precio').value;
            const moneda = document.getElementById('inm-moneda').value;
            const precioM2 = document.getElementById('inm-preciom2').value;
            const comision = document.getElementById('inm-comision').value;
            const ubicacion = document.getElementById('inm-ubicacion').value;
            const sectorNombre = document.getElementById('inm-sectornombre').value;
            const sectorDesc = document.getElementById('inm-sectordesc').value;`;

const guardarInmuebleNew = `        async function guardarInmuebleAdmin() {
            // Recolectar datos del formulario
            const titulo = document.getElementById('inm-titulo').value;
            const subtitulo = document.getElementById('inm-subtitulo').value;
            const tipo = document.getElementById('inm-tipo').value;
            const operacion = document.getElementById('inm-operacion').value;
            const precio = document.getElementById('inm-precio').value;
            const moneda = document.getElementById('inm-moneda').value;
            const precioM2 = document.getElementById('inm-preciom2').value;
            const comision = document.getElementById('inm-comision').value;

            // Validación y resolución de Zona Oficial estandarizada
            const sectorSelect = document.getElementById('inm-sector-select');
            const sectorKey = sectorSelect ? sectorSelect.value : '';
            const locObj = (sectorKey && UBICACIONES_TACHIRA[sectorKey]) ? UBICACIONES_TACHIRA[sectorKey] : null;

            if (!sectorKey || !locObj || locObj.separator) {
                mostrarToastNotificacion('⚠️ Por favor selecciona la zona o sector oficial del inmueble');
                sectorSelect?.focus();
                return;
            }

            const sectorNombre = locObj.label;
            const ubicacion = \`\${locObj.label}, \${locObj.municipio || 'San Cristóbal'}, Táchira\`;
            const sectorDesc = document.getElementById('inm-sectordesc')?.value || \`Sector residencial \${locObj.label}, Municipio \${locObj.municipio || 'San Cristóbal'}, Estado Táchira.\`;`;

html = replaceText(html, guardarInmuebleOld, guardarInmuebleNew);
console.log('✅ 7. Función guardarInmuebleAdmin actualizada para resolver zona oficial 100% estandarizada.');

// 8. Llamar popularSelectsUbicaciones en DOMContentLoaded
const domLoadOld = `        document.addEventListener('DOMContentLoaded', () => {
            popularSelectAsesores();
        });`;

const domLoadNew = `        document.addEventListener('DOMContentLoaded', () => {
            popularSelectAsesores();
            popularSelectsUbicaciones();
        });`;

html = replaceText(html, domLoadOld, domLoadNew);
console.log('✅ 8. Inicialización popularSelectsUbicaciones conectada a DOMContentLoaded.');

// 9. Asegurar que renderCatalogoInmueblesDinamico incluya sector_nombre en searchString
const searchStringOld = `const searchString = \`\${inm.titulo || ''} \${inm.ubicacion || ''} \${inm.sectorNombre || ''} \${asesorNombre} \${inm.codigo || ''}\`.toLowerCase();`;
const searchStringNew = `const searchString = \`\${inm.titulo || ''} \${inm.ubicacion || ''} \${inm.sectorNombre || ''} \${inm.sector_nombre || ''} \${asesorNombre} \${inm.codigo || ''}\`.toLowerCase();`;

html = replaceText(html, searchStringOld, searchStringNew);
console.log('✅ 9. renderCatalogoInmueblesDinamico actualizado con sector_nombre en búsqueda.');

// Guardar archivo actualizado
fs.writeFileSync(filePath, html, 'utf8');
console.log('🎉 TODOS LOS CAMBIOS FUERON APLICADOS CON ÉXITO EN dashboard-layout.html');
