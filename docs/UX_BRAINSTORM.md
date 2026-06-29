# Brainstorm UI/UX — PsicoAyuda

> Documento consolidado de diseño de producto a partir de 9 análisis (3 personas + 6 dimensiones transversales). Todo lo aquí propuesto vive **dentro de los límites duros de producto**: sin pagos, chat, videollamadas, ratings/reseñas, "terapeuta IA", matching complejo, teléfonos no verificados, ni más datos que los mínimos.

---

## 1. Resumen ejecutivo

PsicoAyuda hace lo correcto en lo esencial —datos mínimos, copy honesto sobre no-emergencias, base legal sólida y un stack ligero ideal para conectividad cara (cero imágenes, cero fuentes web, edge en Cloudflare)— pero hoy se **ve y se siente como un wireframe**: un solo `globals.css` a mano, Arial del sistema, una única `.card`, sin jerarquía, sin estados de foco, sin feedback de carga y con estados internos crudos (`pending_verification`, `new`) mostrados al usuario. La tensión central es brutal: es un **producto de crisis para personas vulnerables**, pero la interfaz transmite la frialdad de un formulario administrativo y abandona al usuario justo en los momentos de máxima carga emocional (tras enviar, en errores, esperando contacto).

Hay además **dos fugas de privacidad reales** que contradicen los propios límites del producto, y un **bug operativo** (la urgencia "alta" no dispara nada para nadie). Los cinco movimientos de mayor palanca, casi todos quick wins:

1. **Cerrar las fugas de privacidad**: quitar las sugerencias de profesionales de `/ayuda/gracias` (ruta pública adivinable) y dejar de mostrar el email del solicitante en el dashboard del profesional.
2. **Consolidar un sistema visual mínimo** con `@theme` de Tailwind v4 (ya instalado): un único botón con `:hover`/`:focus-visible`, tokens de color con contraste AA, jerarquía tipográfica, y estado de error contenido.
3. **Convertir `/ayuda/gracias` en un "recibo de confianza"**: confirmación cálida, expectativas honestas, salidas seguras (recursos, emergencia) — sin nombres de profesionales.
4. **Hacer la urgencia "alta" honesta**: nunca promete rapidez; deriva con más fuerza a ayuda presencial y prioriza visualmente la cola del admin.
5. **Reencuadrar el copy en clave trauma-informed** y traducir estados crudos a lenguaje humano, centralizando los textos sensibles.

---

## 2. Principios de diseño (propuestos)

1. **Calma sobre densidad.** En crisis, menos elementos por pantalla = menos carga cognitiva. *Por qué:* el usuario llega con poca concentración y batería emocional baja.
2. **Nunca prometas lo que no garantizamos.** Ningún copy, badge ni flujo debe sugerir respuesta inmediata o de emergencia. *Por qué:* es un límite duro y una cuestión de seguridad real.
3. **Datos mínimos, también en pantalla.** El solicitante nunca ve datos de profesionales; el profesional no ve el email del solicitante hasta el handoff. *Por qué:* materializa "datos mínimos" y la confidencialidad como UX, no solo como texto legal.
4. **Móvil y poca señal primero.** Cada KB y cada round-trip cuentan; el flujo crítico debe sobrevivir a una caída de red. *Por qué:* dispositivos modestos y datos caros en Venezuela.
5. **Valida antes de informar; nunca cierres en una negación.** Reconocer el paso que dio la persona antes de cualquier descargo. *Por qué:* pedir ayuda por primera vez es un acto de coraje.
6. **Honestidad operativa.** Si la app no avisa por correo (stub), el flujo no debe dar a entender que "ya viene ayuda". *Por qué:* el vacío post-envío genera ansiedad y abandono.
7. **Accesible por defecto.** Foco visible, contraste ≥ AA, targets táctiles ≥ 44px, errores asociados al campo. *Por qué:* teclado, lector de pantalla y sol directo son escenarios reales aquí.

---

## 3. Flujo por usuario

### 3.1 Solicitante de ayuda (sin cuenta)

**Flujo actual**
`Home (page.tsx)` → `/ayuda` (EmergencyNotice + HelpRequestForm) → server action `createHelpRequest` (`actions.ts`) → `redirect` a `/ayuda/gracias?solicitud=<id>` que muestra hasta 3 `ProfessionalCard` con **nombres reales** de profesionales.

**Momentos de fricción / emoción**
- El nav superior muestra "Admin" y "Profesionales" — ruido para alguien en angustia.
- El formulario antepone logística (correo, idioma, urgencia) a la necesidad real ("¿con qué necesitas ayuda?").
- El correo —único canal de contacto— se pide una vez, sin confirmación; un typo rompe todo el flujo en silencio.
- Tras enviar, la última frase es un descargo de responsabilidad ("no garantiza disponibilidad inmediata"), sin contención ni próximos pasos. Y la notificación al admin es un **no-op** salvo que exista `NOTIFICATION_EMAIL`.
- La urgencia "alta" no cambia nada visible → falsa sensación de "ya viene ayuda urgente".
- Errores como `<p role="alert">` plano, sin estilo ni foco; en móvil largo, el usuario no ve el error y reintenta → choca con el rate-limit (≥3/h).
- `/recursos` está vacío (TODO visible en producción): callejón sin salida para quien sigue el aviso de emergencia.

**Flujo propuesto (cómo debería sentirse)**
```
Home (1 acción primaria: "Quiero hablar con alguien" + EmergencyNotice destacado)
  → /ayuda  (intake calmado: necesidad → urgencia con descripción humana → idioma → correo → ubicación PLEGADA opcional)
  → confirmación /gracias = "recibo de confianza":
       "Recibimos tu mensaje · te escribiremos a: u***@correo.com (corregir)"
       + qué esperar (revisión diaria, mira spam) + salidas (Recursos, Emergencia) + reenviar
       SIN nombres de profesionales
```

**Ideas concretas**
- **Quitar las sugerencias de profesionales de `/ayuda/gracias`** (privacidad). El matching es trabajo del admin.
- Mostrar el email escrito en la confirmación con enlace "corregir"; añadir `inputMode`/`autocomplete="email"`.
- Reordenar el formulario: Tipo de apoyo → Urgencia (con descripción por nivel) → Idioma → Correo → Ubicación plegable "(opcional)". Microcopy de calma: "Puedes dejar en blanco lo que no quieras compartir."
- Expectativa honesta en `/gracias`: "Revisamos las solicitudes a diario; si nadie te contacta, puedes reenviar tu solicitud. Mira también tu carpeta de spam."
- Urgencia "alta" → bloque condicional que refuerza el aviso de emergencia presencial (no promete rapidez).
- Dar estilo visible al error (clase `.alert`), mover foco/scroll al mensaje, reescribir el rate-limit en tono empático.
- Poblar `/recursos` con recursos **verificados** antes de promocionarlo; mientras tanto, reescribir el placeholder con dignidad.

---

### 3.2 Profesional voluntario/a (login Google)

**Flujo actual**
`/pro` (GoogleSignInButton) → callback `/pro/onboarding` (formulario monolítico de ~14 campos + 3 fieldsets + 5 checks obligatorios) → `saveProfessionalOnboarding` (status forzado a `pending_verification`) → `redirect /pro/dashboard` (muestra el string crudo del estado; tabla con email del solicitante).

**Momentos de fricción / emoción**
- Onboarding de golpe, sin pasos ni explicación de "por qué pedimos la licencia" ni "esto no se muestra al solicitante".
- Errores: un solo `<p role="alert">` con el primer issue, sin señalar el campo, en un form de ~20 controles.
- Limbo de verificación: estado crudo en inglés (`pending_verification`), sin plazo, sin distinguir rechazo de pendiente, y **sin aviso de aprobación** (`notifications.ts` es un stub).
- **Bug de carga**: no hay confirmación de que "Aceptando solicitudes" se guardó — el único mecanismo de control de carga del voluntario es opaco.
- Reeditar el perfil reinicia un perfil aprobado a `pending_verification` (castigo silencioso).
- El dashboard expone el **email del solicitante** (PII) y no explica cómo ocurre el handoff.

**Flujo propuesto**
```
/pro (entrada con estado real: sin perfil → "Completar perfil"; pending → "En revisión"; approved → "Ir a mi panel")
  → "Completa tu perfil" (3 secciones con encabezados: Identidad y credencial / Cómo ayudas / Compromiso compartido)
  → "Perfil enviado para verificación" (banner de confirmación)
  → Panel de voluntariado: estado en lenguaje humano + 1 interruptor claro Disponible/En pausa (con confirmación)
       + casos descritos por NECESIDAD/idioma/fecha (nunca el email del solicitante)
       + microcopy fijo del handoff por correo coordinado
```

**Ideas concretas**
- Dividir el onboarding en 2-3 secciones visuales (misma Server Action), con `(opcional)` explícito y una línea de propósito por sección.
- Devolver errores por campo (`issue.path`) con `aria-describedby`/`aria-invalid`; traducir mensajes Zod a español.
- Mapear estados a copy humano: `pending_verification`→"En revisión", `approved`→"Verificado/a", `rejected`→"No aprobado — escríbenos a {correo}", `suspended`→"Pausado".
- Implementar el correo real de aprobación en `notifyProfessional*` y dispararlo desde `adminUpdateProfessionalStatus`.
- Confirmación visible tras guardar disponibilidad; permitir editar `maxActiveRequests` desde el dashboard **sin** reiniciar el status.
- No degradar a `pending_verification` salvo que cambien credencial/país de credencial.
- **Quitar el email del solicitante** de la tabla; mostrar necesidad + idioma + fecha; añadir microcopy de handoff.

---

### 3.3 Admin / coordinador (herramienta interna)

**Flujo actual**
Entra por el enlace "Admin" del nav público → `/admin` carga **todas** las solicitudes y profesionales sin filtros/orden/paginación, calcula sugerencias en bucle (N+1), muestra estados crudos, urgencia como texto plano, score como número, email del solicitante como `<h3>`. `auditLogs` se escribe pero **nunca se lee**. El CSV exporta PII de todas las filas sin filtro ni registro de auditoría.

**Momentos de fricción / emoción**
- Triaje por urgencia imposible: "alta" no resalta ni reordena; las crisis quedan enterradas entre "baja" y cerradas.
- Aprobación a ciegas: no se ven licencia, bio, áreas ni idiomas.
- Score "53" sin explicación → la asignación, núcleo del producto, es opaca.
- Anonimizar es un clic destructivo e irreversible sin confirmación.
- Sin vista de auditoría pese a que el rastro existe.

**Flujo propuesto**
```
/admin (FUERA del nav público) = cola de triaje accionable:
   secciones Alta / Media / Baja  ·  filtros (estado, urgencia, categoría)  ·  búsqueda por email  ·  paginación
   cada solicitud accionable: cabecera (categoría + badge urgencia + estado)
        → mejor sugerencia con CHIPS (idioma ✓ · área ✓ · crisis ✓ · capacidad 1/3) → botón Asignar (primario)
        → pie con acciones secundarias/destructivas separadas (cambiar estado, anonimizar con confirmación)
   solicitudes cerradas/anonimizadas colapsadas
Revisión de profesional: <details> con licencia, bio, áreas, idiomas, crisisExperience ANTES de aprobar
Vista de auditoría: lee auditLogs (aprobaciones, asignaciones, cierres, anonimizaciones, exports)
```

**Ideas concretas**
- Ordenar y/o agrupar la cola por urgencia; badge de color (`.urgency-alta` naranja, etc.).
- Excluir/colapsar `closed`/anonimizadas por defecto; filtros y búsqueda vía `searchParams`; paginar (25/pág).
- Resolver el N+1: cargar candidatos una vez y puntuar en memoria solo para solicitudes visibles.
- Expandir cada profesional para mostrar los datos de verificación que ya entrega.
- Sustituir "score N" por chips legibles de coincidencia (mantener el número como secundario/tooltip o renombrarlo a "coincidencia").
- Confirmación de dos pasos al anonimizar; badge "Anonimizada"; retención semi-automática vía Cron de Cloudflare.
- Registrar cada export en `auditLogs` (`data_export`, `actorEmail`); ofrecer variante CSV sin email y con filtros de fecha/estado.

---

## 4. Dimensiones transversales

### 4.1 Sistema visual y de diseño
**Hallazgo estructural:** dos botones en conflicto — el `.button` de `globals.css` (sin `:hover`/`:focus-visible`) es el que se ve en el 95% de la app; el `button.tsx` (shadcn, mejor) solo lo usa `google-sign-in.tsx`. Además los hex `#1f6f64`/`#15524a` están duplicados. Paleta y tipografía emocionalmente frías (Arial del sistema + grises Google), sin sombras, sin modo oscuro, sin escala de espaciado tokenizada, sin estados de carga.

**Recomendaciones**
- Consolidar en **un** botón (recomendado: `.button` de CSS por menor riesgo) y añadirle `:hover { background: var(--accent-strong) }`, `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }` y `transition`. Borrar o reconvertir `button.tsx`.
- Migrar tokens a un bloque `@theme` (Tailwind v4 ya está en modo CSS-first) para que las utilidades los conozcan y `button.tsx` deje de hardcodear hex.
- Definir jerarquía tipográfica (h1-h4) y escala de espaciado de 4px; eliminar `style` inline de `page.tsx`.
- Stack de fuentes de sistema moderno (`system-ui, -apple-system, "Segoe UI", Roboto`) — cero descarga, más cálido que Arial.

**Propuesta de tokens / paleta (en `@theme`)**
```css
@theme {
  --color-bg:            #fbfaf7;  /* crema cálido */
  --color-surface:       #ffffff;
  --color-foreground:    #2b2925;  /* tinta cálida, no gris Google, AA */
  --color-muted:         #6b655c;  /* AA sobre crema */
  --color-border:        #d8d3c8;  /* SOLO divisores decorativos */
  --color-field-border:  #8a8478;  /* inputs/checkbox: >= 3:1 (WCAG 1.4.11) */
  --color-accent:        #1f6f64;  /* teal: confianza/marca */
  --color-accent-strong: #15524a;  /* hover/active */
  --color-success:       #2e7d4f;  /* confirmación */
  --color-danger:        #b3261e;  /* error contenido */
  --color-danger-surface:#fdecea;
  --color-warning:       #fff4d6;  /* aviso de emergencia (existente) */
  --radius:              8px;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px; --space-8: 48px;
}
```
Uso intencionado del color: **teal = confianza/marca · verde suave = éxito · rojo contenido = error · amarillo = aviso de emergencia**. Con los tokens en `@theme`, añadir `@media (prefers-color-scheme: dark)` redefiniendo solo colores.

### 4.2 Accesibilidad e inclusión (WCAG 2.2 AA)
Base semántica buena (`lang="es"`, landmarks, `label htmlFor`, `fieldset/legend`, contraste de **texto** AA). Fallos verificables:
- **Sin foco visible** en `.button`/`a`/inputs (el único `:focus-visible` está en el `button.tsx` no usado). → CSS global de foco 3:1.
- **Errores** sin foco ni asociación al campo; solo el primer issue. → mover foco al resumen, `aria-invalid`/`aria-describedby`.
- **Borde de input 1.43:1** (falla 1.4.11). → token `--color-field-border` ≥ 3:1.
- **Falta `autocomplete`** (1.3.5): email→`email`, ciudad→`address-level2`, estado→`address-level1`, país→`country-name`, nombre→`name`.
- **Sin "saltar al contenido"** (2.4.1). → skip link en `layout.tsx` + `id="main"`.
- **Jerarquía de encabezados rota** y **PII como `<h3>`** en admin (`{request.email}`). → encabezado neutro "Solicitud · {necesidad} · {urgencia}".
- **Sin `loading.tsx`/`error.tsx` ni `aria-live`** (4.1.3); **sin `prefers-reduced-motion`** (defensivo).

### 4.3 Confianza, seguridad y UX de crisis
- **EmergencyNotice discreto y tardío**, ausente en el home. → elevar a banner de alto contraste, colocarlo ANTES de pedir datos, reusarlo en home/`/ayuda`/`/gracias`/`/recursos`.
- **Fuga 1:** `/ayuda/gracias?solicitud=<id>` muestra profesionales sin auth. → quitar el listado de la página pública.
- **Fuga 2:** email del solicitante en dashboard del profesional y en CSV. → ocultar/enmascarar; CSV solo para admin, con auditoría.
- **Urgencia "alta"** sin efecto. → copy condicional de seguridad + priorización visual en admin (sin prometer tiempos).
- **Sin puerta de edad** pese a excluir menores. → autodeclaración simple en el consentimiento (sin fecha ni documento).
- `/recursos` vacío: bloqueante para crisis "alta" — curar recursos **verificados**.

### 4.4 Móvil y baja conectividad (Venezuela)
Base excelente (cero imágenes/fuentes web, mayoría Server Components, edge). Riesgos bajo red mala:
- **Formulario se puede perder** en un POST fallido. → borrador en `localStorage` (limpiar tras éxito — móvil compartido), mensaje "tus datos siguen aquí, reintenta".
- **Sin `loading.tsx`/Suspense**: pantalla congelada. → `loading.tsx` en `/ayuda/gracias` y `/admin`; `<Suspense>` para pintar la confirmación inmediata y las sugerencias (admin) después.
- **PWA mínima** (manifest + SW que cachee solo shell estático). *Nota de límite:* el SW NO debe encolar y autoenviar solicitudes en background (falsa sensación de "ya pediste ayuda").
- Botón de geolocalización sin estado "Obteniendo ubicación..." (hasta 6s).
- Tablas con scroll horizontal en móvil; targets táctiles 42px → subir a 48px.

### 4.5 Contenido, tono y copy (trauma-informed)
Disciplina legal y de datos mínimos buena; tono administrativo y con jerga (`pending_verification`, "dashboard", "score"). Ejemplos **antes → después**:

| Lugar | Antes | Después |
|---|---|---|
| `/gracias` H1 | "Solicitud recibida" + "…Esto no garantiza disponibilidad inmediata." | "Recibimos tu mensaje" + "Diste un paso importante al escribirnos. Una persona del equipo revisará tu solicitud y te escribirá. No siempre podemos responder de inmediato; si sientes que estás en peligro, busca ayuda presencial cerca de ti." |
| Error genérico | "Error" | "No pudimos enviar tu mensaje. Revisa los datos e inténtalo otra vez; si sigue sin funcionar, escríbenos a {correo}." |
| Email inválido | "Escribe un correo válido." | "Revisa tu correo: parece que falta una parte (por ejemplo, el @)." |
| Rate-limit | "…Intenta más tarde." | "Ya recibimos tu mensaje hace poco. No hace falta enviarlo de nuevo: te contactaremos al correo que nos diste." |
| Home H1 | "Conectamos personas afectadas con profesionales voluntarios…" | "No tienes que pasar por esto solo/a." + sub "Te ayudamos a conectar, sin costo, con profesionales de psicología voluntarios que ofrecen apoyo a distancia." |
| Estado pro | "Estado: pending_verification" | "Tu perfil está en revisión. En cuanto un coordinador lo verifique, podrás recibir solicitudes." |
| ProfessionalCard | "Apoyo remoto: Duelo, Ansiedad o pánico" | "Puede acompañarte en: duelo, ansiedad o pánico." |

Centralizar todo el copy sensible en `src/lib/constants.ts` (añadir `statusLabels`, microcopy, objeto de errores) — revisable por una persona no técnica y traducible.

### 4.6 Arquitectura de información y navegación
- **"Admin" en el nav público** (`layout.tsx`) mezcla 3 audiencias y delata herramienta interna. → quitarlo; acceso por URL/sesión admin.
- **Sin "dónde estoy"**: añadir `aria-current` y resaltado de sección; indicador de pasos en el flujo del profesional.
- **`/pro` no refleja el estado** del profesional logueado. → mostrar estado y siguiente acción correcta.
- **`/ayuda/gracias` callejón sin salida**: añadir salidas a `/recursos`, home y recordatorio de emergencia.
- **`/recursos` poco descubrible** pese a ser salvavidas: enlazarlo desde el EmergencyNotice, home y confirmación.

---

## 5. Backlog priorizado

| Idea | Usuario / Dimensión | Impacto | Esfuerzo | Tipo |
|---|---|---|---|---|
| Quitar sugerencias de profesionales de `/ayuda/gracias` (fuga de privacidad) | Solicitante / Confianza · IA | Alto | S | Quick win |
| Quitar "Admin" del nav público (`layout.tsx`) | IA · Confianza | Medio-Alto | S | Quick win |
| Ocultar/enmascarar email del solicitante en el dashboard del profesional | Profesional / Privacidad | Alto | M | Quick win |
| Reescribir `/gracias` como "recibo de confianza" (expectativa + salidas, sin nombres) | Solicitante / Copy · Crisis | Alto | S | Quick win |
| Foco visible global (`:focus-visible`) en botones, enlaces e inputs | Accesibilidad | Alto | S | Quick win |
| Consolidar un único botón con hover/focus; eliminar duplicidad `button.tsx`/`.button` | Sistema visual | Alto | S | Quick win |
| Confirmación visible al guardar disponibilidad + editar `maxActiveRequests` sin reset | Profesional | Alto | S | Quick win |
| Estados crudos → etiquetas humanas (`statusLabels` en `constants.ts`) | Copy / Profesional · Admin | Alto | S | Quick win |
| Mostrar y confirmar el email escrito en `/gracias` + `autocomplete=email` | Solicitante / Confianza | Alto | S | Quick win |
| Errores con estilo `.alert` + foco/scroll al mensaje | Solicitante / A11y · Copy | Alto | S | Quick win |
| Urgencia "alta": copy condicional de seguridad (sin prometer rapidez) | Solicitante / Crisis | Medio | S | Quick win |
| EmergencyNotice elevado a banner y reusado en home/`/ayuda`/`/gracias` | Confianza / Crisis | Alto | S | Quick win |
| Borrador del formulario en `localStorage` (limpiar tras éxito) | Móvil / Solicitante | Alto | M | Apuesta |
| `loading.tsx` + `<Suspense>` en `/gracias` y `/admin` | Móvil / A11y | Alto | S | Quick win |
| Cola de admin ordenada por urgencia + badges + filtros + paginación + fix N+1 | Admin / IA | Alto | M | Apuesta |
| Revisión de profesional: mostrar licencia/bio/áreas antes de aprobar | Admin | Alto | S | Quick win |
| Correo real de aprobación al profesional (`notifications.ts`) | Profesional | Alto | M | Apuesta |
| Onboarding en 2-3 secciones + errores por campo + microcopy de propósito | Profesional / Copy | Alto | M | Apuesta |
| Score → chips de coincidencia (idioma/área/crisis/capacidad) | Admin | Medio | M | Apuesta |
| Migrar tokens a `@theme` + jerarquía tipográfica + escala de espaciado | Sistema visual | Medio | M | Apuesta |
| `autocomplete` en campos personales | Solicitante / A11y | Medio | S | Quick win |
| Skip link "Saltar al contenido" | Accesibilidad | Medio | S | Quick win |
| Borde de inputs ≥ 3:1 (`--color-field-border`) | Accesibilidad | Medio | S | Quick win |
| Reordenar formulario de intake (necesidad primero, ubicación plegable) | Solicitante / Copy | Medio | M | Apuesta |
| Confirmación al anonimizar + badge + registrar export en `auditLogs` | Admin / Privacidad | Medio | M | Apuesta |
| Puerta de edad (autodeclaración en consentimiento) | Solicitante / Crisis | Medio | S | Quick win |
| Curar y publicar recursos verificados en `/recursos` | Crisis / Contenido | Alto | M | Apuesta |
| Vista de auditoría que lea `auditLogs` | Admin | Medio | M | Apuesta |
| PWA mínima (manifest + SW de shell estático) | Móvil | Alto | M | Apuesta |
| `/pro` refleja estado real del profesional logueado | Profesional / IA | Medio | M | Apuesta |
| Tablas → tarjetas apiladas en móvil; targets táctiles 48px | Móvil / A11y | Medio | M | Apuesta |
| `prefers-reduced-motion` defensivo | Accesibilidad | Bajo | S | Quick win |
| Modo oscuro vía `@media prefers-color-scheme` | Sistema visual | Bajo | M | Apuesta |

---

## 6. Quick wins (primeros 1-2 días)

1. **`src/app/ayuda/gracias/page.tsx`** — eliminar la llamada a `suggestProfessionalsForRequest` y las `ProfessionalCard`; dejar solo confirmación + expectativa + salidas (Recursos, EmergencyNotice). Cierra la fuga de privacidad principal y arregla el callejón sin salida de golpe.
2. **`src/app/layout.tsx`** — quitar el enlace "Admin" del nav público; añadir skip link `<a href="#main">` e `id="main"` en `<main>`.
3. **`src/app/globals.css`** — añadir `:focus-visible` a `.button`/`a`/inputs; añadir `:hover`/`transition` al `.button`; subir el borde de inputs a `--color-field-border` (≥3:1); añadir clase `.alert` (rojo contenido) y `prefers-reduced-motion`.
4. **`src/components/help-request-form.tsx`** — `autocomplete`/`inputMode` en email y campos de ubicación; aplicar la clase `.alert` al error y mover foco/scroll al mensaje.
5. **`src/lib/constants.ts`** — añadir `statusLabels` (solicitud y profesional) y un objeto de mensajes de error humanos; usarlos en `pro/dashboard/page.tsx` y `admin/page.tsx`.
6. **`src/app/pro/dashboard/page.tsx`** — quitar la columna "Correo" (email del solicitante); mostrar necesidad + idioma + fecha + microcopy de handoff.
7. **`src/app/actions.ts`** (`updateProfessionalAvailability`) — devolver estado y pintar confirmación visible tras guardar.
8. **`src/components/professional-card.tsx`** — corregir etiqueta ("Puede acompañarte en:") y usar `languageLabels` en vez de códigos.

---

## 7. Apuestas mayores

1. **`/ayuda/gracias` como "recibo de confianza" a prueba de red mala.** Confirmación instantánea e independiente del matching (Suspense), email confirmado, expectativa honesta de revisión diaria, recordatorio de emergencia, opción de reenviar — todo sin nombres, sin cuenta, sin prometer tiempos. Combinado con borrador en `localStorage` y PWA mínima, la persona en crisis nunca pierde lo que escribió aunque caiga la señal.
2. **`/admin` como cola de triaje accionable.** Vista única ordenada por urgencia (secciones Alta/Media/Baja), filtros, búsqueda y paginación; cada solicitud con su mejor sugerencia explicada por chips de coincidencia y un botón Asignar; cerradas colapsadas; resuelve de golpe triaje invisible, densidad, N+1 y opacidad del score.
3. **Cerrar el bucle del voluntario.** Panel de voluntariado con estado en lenguaje humano, un interruptor Disponible/En pausa fiable y con feedback, casos descritos por necesidad/idioma/fecha (nunca email), y **un correo transaccional al aprobarse** aprovechando el stub `notifications.ts`. Es el mayor impacto en retención del donante con el menor coste.
4. **Sistema visual mínimo coherente sin dependencias.** Mover todos los tokens (color, radio, espaciado, tipografía, danger/success, modo oscuro) a `@theme`, consolidar el botón y reencuadrar la paleta de "formulario administrativo" a "contención cálida" — un design system real sin añadir ni un KB de runtime.

---

## 8. Riesgos y límites

**Lo que NO se debe construir (límites duros):**
- Pagos, chat in-app, videollamadas, ratings/reseñas, "terapeuta IA".
- Matching complejo o ranking por popularidad. El score existe como heurística simple para el admin; **no exhibirlo como número** (renombrar a "coincidencia" o usar chips) para no sugerir un ranking.
- Teléfonos de emergencia no verificados ni promesas médicas. `/recursos` solo publica recursos **verificados** por el equipo.
- Recoger más que los datos mínimos del solicitante (email, idioma, categoría, urgencia, ubicación opcional, consentimiento). Nada de cédula, documentos, dirección completa ni relatos largos de trauma.
- Prometer disponibilidad o respuesta en tiempo real / de emergencia.

**Ideas que rozan un límite y cómo las acotamos (`boundaryNote`):**
- **Urgencia "alta":** NO prioriza ni promete rapidez del sistema; solo refuerza el aviso de emergencia presencial y prioriza la *visualización* de la cola interna del admin.
- **Borrador en `localStorage`:** solo datos mínimos, en el propio dispositivo; **limpiar tras éxito** para no dejar el email en un móvil compartido.
- **PWA / service worker:** cachea solo shell estático; **nunca** encola ni autoenvía solicitudes en background (evita falsa sensación de "ya pediste ayuda"); nunca cachea datos de otra solicitud.
- **Puerta de edad:** una casilla de autodeclaración, sin pedir fecha de nacimiento ni documento — coherente con datos mínimos.
- **Correo al profesional:** solo sobre su propio estado de verificación; no promete tiempos ni emergencias.
- **Export CSV con email:** se mantiene solo para el admin (lo necesita para coordinar), pero con registro en `auditLogs` y una variante sin email para análisis operativo.
- **Recursos verificados:** la recomendación es de proceso/contenido (verificar antes de publicar), nunca inventar números.
