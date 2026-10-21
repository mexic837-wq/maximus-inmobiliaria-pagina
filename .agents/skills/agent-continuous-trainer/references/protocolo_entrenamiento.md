# Protocolo de Auto-Entrenamiento y Consolidación

## Formato de Reglas Capturadas en `agente_whatsapp/memoria/aprendizajes.md`

Cada vez que `trainer_engine.py hot-fix` registra un aprendizaje nuevo en `memoria/aprendizajes.md`, añade una línea estructurada:
- Para **Nueva Zona Táchira**:
  `- [PENDIENTE_CONSOLIDAR] [ZONA] regex="las\s+vegas" | sector="Las Vegas de Táriba" | ubicacion="Las Vegas de Táriba, Cárdenas" | desc="Sector residencial de clima fresco en el Municipio Cárdenas."`
- Para **Nuevo Perfil de Recorte de Imagen**:
  `- [PENDIENTE_CONSOLIDAR] [CROP] perfil="remax" | top_crop=0.03 | bottom_crop=0.14`
- Para **Regla General de Negocio / Jerga**:
  `- [PENDIENTE_CONSOLIDAR] [REGLA] Descripción clara de la regla aprendida.`
