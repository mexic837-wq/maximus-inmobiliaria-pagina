# Guía Detallada: Módulo de Captura en Vivo desde WhatsApp Web

## Flujo Operativo y de Seguridad

1. **Almacenamiento Local de la Sesión:**
   - La sesión de Google Chrome se almacena en la carpeta local `agente_whatsapp/.wweb_session/`.
   - Dicha carpeta se encuentra excluida explícitamente en el archivo `.gitignore` para garantizar que ninguna cookie, token o dato privado sea subido a repositorios remotos.

2. **Detección de Grupos y Extracción:**
   - WhatsApp Web carga dinámicamente los elementos en pantalla.
   - El script busca los chats tanto en la lista visible como a través del buscador interno de WhatsApp Web.
   - Para extraer fotografías sin problemas de desencriptación o URLs expiradas, el módulo accede a los `blob:` montados en la memoria del navegador y los serializa en binario JPEG directamente al disco duro en la carpeta del lote.

3. **Compatibilidad Estricta:**
   - Los datos extraídos conservan los números de teléfono, nombres de remitentes y fechas reales de publicación.
   - Pasan por la Skill 2 para evitar que inmuebles ya publicados en Supabase sean duplicados si vuelven a enviarse en los grupos.
   - Pasan por la Skill 3 asegurando que los collages sean recortados y que la portada elegida sea la de mayor calidad y formato horizontal/cuadrado.
