---
name: creador-habilidades
description: Crea y configura nuevas habilidades (skills) para el agente en idioma español, siguiendo el estándar de Antigravity.
---

# Habilidad: Creador de Habilidades

Esta habilidad permite al agente crear nuevas paquetes de conocimiento reutilizables (skills) que extienden sus capacidades. Todas las instrucciones y documentación deben generarse en **idioma español**.

## ¿Cuándo usar esta habilidad?

- Cuando el usuario solicita crear una nueva capacidad o "skill" personalizada.
- Cuando se necesita automatizar un flujo de trabajo recurrente mediante una habilidad.
- Cuando se desea organizar mejores prácticas o convenciones de código en una unidad reutilizable.

## Cómo usarla

1. **Identificar el Directorio**:
   - Para habilidades específicas del proyecto: `.agent/skills/<nombre-habilidad>/`
   - Para habilidades globales: `~/.gemini/antigravity/skills/<nombre-habilidad>/`

2. **Crear el Archivo SKILL.md**:
   - Es obligatorio incluir el frontmatter YAML al principio del archivo.
   - El `name` debe estar en minúsculas y usar guiones para espacios.
   - La `description` debe ser clara, en tercera persona, e incluir palabras clave.

3. **Estructura Requerida**:
   ```markdown
   ---
   name: nombre-de-la-habilidad
   description: Descripción clara de lo que hace la habilidad.
   ---

   # Nombre de la Habilidad

   Instrucciones detalladas en español.

   ## ¿Cuándo usar esta habilidad?
   - Lista de casos de uso...

   ## Cómo usarla
   - Guía paso a paso...
   ```

4. **Recursos Adicionales (Opcional)**:
   - `scripts/`: Guiones de ayuda.
   - `examples/`: Implementaciones de referencia.
   - `resources/`: Plantillas y otros activos.

## Mejores Prácticas

- **Enfoque Único**: Cada habilidad debe hacer una sola cosa bien.
- **Descripciones Claras**: La descripción es vital para que el agente sepa cuándo activar la habilidad.
- **Instrucciones en Español**: Mantener todo el contenido (títulos, descripciones, pasos) en español para coherencia con el workspace.
- **Documentación de Scripts**: Si incluyes scripts, indica que el agente debe ejecutarlos con `--help` primero.
