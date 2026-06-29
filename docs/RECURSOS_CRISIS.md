# Mantenimiento de los recursos de crisis

Los recursos de crisis viven en [`src/lib/resources.ts`](../src/lib/resources.ts) y se
muestran en `/emergencia`, `/recursos` y, de forma compacta, en varias páginas a
través del componente `CrisisResources`.

> **Por qué importa:** estos datos pueden salvar una vida. Un teléfono incorrecto
> en una página de crisis es peor que no tener ninguno. Por eso **nunca se
> inventan** números: cada recurso cita su fuente y su fecha de verificación.

## Regla de oro

- **No inventar** teléfonos, horarios ni nombres. Si no está verificado, no se publica.
- Cada entrada lleva su campo `source` (atribución + año).
- `RESOURCES_LAST_VERIFIED` indica la última revisión global y se muestra a la persona usuaria.

## Cómo verificar / actualizar (antes de cada lanzamiento y, al menos, cada 3 meses)

1. Para cada recurso de `SUPPORT_LINES`, confirma el teléfono/horario contra la
   **fuente oficial** de la organización (su web o redes verificadas), no contra
   un blog. Triangula con una segunda fuente cuando sea posible.
2. Si un dato cambió, actualízalo y ajusta su `source` con la nueva fecha.
3. Si un recurso ya no opera o no se puede confirmar, **quítalo** (mejor menos y
   ciertos que más y dudosos).
4. Actualiza `RESOURCES_LAST_VERIFIED` a la fecha de esta revisión.
5. Revisa que los **directorios** (`RESOURCE_DIRECTORIES`: Psicomapa, Find a
   Helpline) siguen activos: son el respaldo cuando un número directo falla.
6. Corre `./node_modules/.bin/tsc --noEmit` y `./node_modules/.bin/vitest run`.

## Fuentes usadas en la verificación inicial (junio 2026)

- PsicoLínea UCAB — UCAB PsicoData / El Ucabista.
- Cecodap — El Diario / Cecodap.
- Colegio de Psicólogos del Distrito Capital — El Diario.
- Psicomapa (directorio) — UCAB PsicoData.
- Find a Helpline Venezuela — ThroughLine.

## Pendiente de revisión legal

La redacción sobre menores (LOPNNA), secreto profesional y actuación ante riesgo
inminente está marcada en el código/páginas como **pendiente de revisión por un
profesional del derecho en Venezuela**. No publicar como definitiva sin esa revisión.
