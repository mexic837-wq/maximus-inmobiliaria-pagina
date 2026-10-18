---
name: github-sync
description: >-
  Sincroniza, empaqueta y sube la última versión del proyecto MAXIMUS Inmobiliaria a GitHub.
  Audita los cambios pendientes, verifica archivos sensibles, formula mensajes de commit semánticos
  y descriptivos (Conventional Commits), asegura la rama remota y realiza push seguro.
---

# Skill: Sincronización y Despliegue en GitHub (github-sync)

Esta skill permite al agente inspeccionar el estado del control de versiones en Git, preparar los archivos modificados y nuevos, generar un commit semántico de alta calidad y realizar un `push` seguro al repositorio remoto en GitHub.

---

## 1. Cuándo Utilizar Esta Skill
Usa esta skill cuando el usuario pida:
* "Actualiza la última versión del proyecto en GitHub"
* "Sube los cambios a GitHub / Git"
* "Haz commit y push"
* "Sincroniza el repositorio con origin"
* Tras terminar un hito importante de desarrollo (nuevas funciones, correcciones de diseño, integraciones de backend o n8n).

---

## 2. Flujo de Trabajo Estandarizado (Paso a Paso)

### Paso 1: Diagnóstico de Estado y Remotos
Antes de alterar el árbol de trabajo, comprueba la rama actual, el estado de los archivos y los remotos configurados:
```bash
git status -s
git branch --show-current
git remote -v
```

### Paso 2: Validación de Seguridad e Integridad
* Verifica que no se incluyan archivos temporales, logs o claves privadas sensibles de producción no deseadas.
* Revisa que el `.gitignore` proteja carpetas pesadas (`node_modules/`, cachés o volcados de base de datos).

### Paso 3: Indexación de Cambios (Staging)
Agrega los archivos modificados y nuevos al área de preparación:
```bash
git add .
```
Comprueba qué archivos quedaron en stage:
```bash
git status -s
```

### Paso 4: Creación del Commit Semántico (Conventional Commits)
Formula un mensaje de commit estructurado en español o inglés siguiendo las convenciones:
* `feat(...)`: Para nuevas características o flujos de trabajo (ej. n8n, nuevas vistas).
* `fix(...)`: Para corrección de errores visuales, rutas o lógica.
* `refactor(...)`: Para reorganización de código sin alterar funcionalidad.
* `style(...)`: Para ajustes de diseño, Tailwind CSS o espaciados responsivos.

Ejemplo:
```bash
git commit -m "feat(n8n): integrar webhooks de automatización y plantillas de correo HTML luxury"
```

### Paso 5: Sincronización Preventiva con el Remoto
Asegúrate de que no haya desalineación con la rama remota antes de empujar:
```bash
git pull --rebase origin main
```

### Paso 6: Envío Seguro al Repositorio Remoto (Push)
Empuja los cambios a la rama principal (o rama activa):
```bash
git push origin main
```

### Paso 7: Verificación Final y Resumen para el Usuario
Confirma que el árbol de trabajo quedó limpio y muestra el hash y resumen del commit:
```bash
git log -1 --stat
git status
```
Presenta al usuario:
1. Resumen de archivos modificados y creados.
2. Mensaje y hash del commit.
3. Enlace al repositorio en GitHub.
