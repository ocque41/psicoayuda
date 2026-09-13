# Changelog

All notable changes to Nido will be documented here.

## 0.10.1 - 2026-09-13

Endurecimiento y optimización del módulo de pagos y de la auditoría, sin
cambios de comportamiento para las personas.

- **Filtro de eventos ajenos en el webhook**: la cuenta de Stripe es compartida
  con otros proyectos; ahora los eventos que no son de Nido se detectan por
  metadatos `nido_*` (y, en reembolsos/disputas, cruzando el PaymentIntent
  contra `payments`) y se ignoran SIN registrarlos, para que `stripe_events` no
  crezca con ruido de otros proyectos.
- **Rate limit del checkout público**: máximo 15 intentos de pago por hora e IP
  (hash irreversible, respaldado en D1 vía `audit_logs`); los intentos fallidos
  también cuentan para frenar bucles y bots.
- **Pagos colgados**: la retención diaria marca `expired` los pagos que llevan
  más de 48 h en `pending` si el webhook de expiración no llegó (la sesión de
  Stripe caduca a las 24 h).
- **Índices nuevos** (migración 0024, aditiva): `payments(stripe_payment_intent_id)`
  para reembolsos/disputas y `audit_logs(actor_email, action, created_at)` para
  los rate limits de credenciales y pagos.

## 0.10.0 - 2026-09-13

Chats eternos con borrado definitivo, etiqueta de servicios pagos y módulo de
cobros con Stripe Connect. La ayuda por el terremoto sigue siendo gratuita.

- **Conversaciones permanentes**: la retención ya no cierra ni anonimiza chats
  (solo solicitudes 90/180 y el enlace mágico 7 días). El hilo vive hasta que el
  profesional o la persona lo borran; borrar purga el Durable Object, elimina el
  espejo en D1 y mata el link, con confirmación en la UI y auditoría
  (`deleteConversation`).
- **Cupo liberable sin perder hilos**: un chat directo sin actividad >30 días
  deja de ocupar cupo (`conversations.quota_released_at`, migración 0023) para
  que el profesional pueda acompañar a más personas.
- **Borrado de cuenta sin transcripciones huérfanas**: `purgeAccount` ahora vacía
  el DO de cada conversación antes de borrar las filas (`src/lib/account.ts`).
- **Etiqueta y filtro "servicios pagos"** (`professionals.offers_paid_services`):
  visible en la tarjeta del directorio y filtrable (`?pago=1`) en
  `/profesionales` y `/ayuda`, con su pregunta en el alta y un interruptor en el
  panel. La emergencia sigue siendo gratuita en todos los perfiles.
- **Pagos opcionales con Stripe** (`src/lib/payments/*`, tablas
  `session_packages`, `payments` y `stripe_events`): el profesional configura
  paquetes de sesiones (precio en EUR, nº de sesiones y vigencia), conecta su
  cuenta con Stripe Connect Express, y comparte links `/pagar/<paquete>`
  (también insertables en el chat). Nido cobra con Checkout hospedado (sin ver
  datos de tarjeta), retiene una comisión fija de 5 € por transacción
  (`NIDO_PLATFORM_FEE_CENTS`) y Stripe transfiere el resto al profesional.
- **Webhook robusto** (`/api/stripe/webhook`): firma verificada con
  `constructEventAsync` sobre el cuerpo crudo, idempotencia por `event.id`
  (`stripe_events`), eventos de fallo/reembolso/disputa, actualización de estado
  de cuentas Connect y correos (recibo al pagador, aviso al profesional, alerta
  interna por disputas). La cuenta de Stripe es compartida: todo evento sin
  metadatos `nido_*` se ignora.
- **Países soportados**: solo profesionales con cuenta Connect en países que
  Stripe soporta (Venezuela no está en la lista); el panel lo explica con
  claridad. Sin claves de Stripe, el módulo se oculta por completo.
- **Copy y políticas alineadas** con el modelo mixto: FAQ, portada, pacto del
  voluntario, términos, seguridad, privacidad (retención y pagos), README y
  límites de contribución.

### Requisitos de despliegue

1. `wrangler secret put STRIPE_SECRET_KEY` (clave restringida).
2. Crear el endpoint `https://saludmental-venezuela.com/api/stripe/webhook` con
   los eventos `checkout.session.completed`, `checkout.session.expired`,
   `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`
   y `account.updated`; guardar su secreto con
   `wrangler secret put STRIPE_WEBHOOK_SECRET`.
3. Activar Stripe Connect en la cuenta de plataforma (dashboard de Stripe) para
   poder crear cuentas de cobro de los profesionales.

## 0.9.0 - 2026-09-13

Credenciales del profesional desde su panel: cambiar correo, contraseña y
teléfonos de contacto sin salir de Nido, con confirmación por correo, auditoría
y defensas anti-abuso (incluido Cloudflare Turnstile).

- **Sección "Tu cuenta" en `/pro/dashboard`** (`src/components/credential-settings.tsx`):
  tres formularios plegables (correo, contraseña, teléfonos) con estados de
  éxito/error y el widget de Turnstile cuando la integración está activa.
- **Cambio de correo con doble confirmación** (`user.changeEmail` de Better
  Auth): si el correo actual está verificado, primero se aprueba desde la
  dirección actual y luego se verifica la nueva; con cuentas sin verificar, el
  enlace va directo al correo nuevo y se manda un aviso de seguridad al actual.
  El espejo `professionals.email` (y `contactEmail` cuando seguía al de la
  cuenta) se sincroniza al completarse la verificación (`databaseHooks`).
- **Cambio de contraseña** exigiendo la actual, cerrando las demás sesiones
  (revocación explícita: la rotación de cookie no se propaga desde una server
  action) y con aviso por correo. El restablecimiento por enlace también revoca
  todas las sesiones.
- **Teléfonos públicos (WhatsApp y fijo)** validados a formato internacional,
  con aviso de seguridad por correo; nunca se puede quedar el perfil sin
  ninguna vía de contacto.
- **Anti-abuso**: tope por cuenta/hora en D1 vía `audit_logs`, rate limits de
  Better Auth para `/change-email` y `/change-password`, y Turnstile opcional
  (`siteverify` desde el Worker) en los tres formularios.
- **Auditoría**: cada cambio deja rastro en `audit_logs`.

## 0.8.0 - 2026-09-13

Persistencia de chats: las conversaciones se pueden retomar, reabrir y
notificar a ambas partes dentro de la ventana de retención, sin cuentas.

- **Retención 90/180 con actividad rodante** (`src/lib/retention.ts`, migración
  0022): cierre a los 90 días sin actividad y anonimización a los 180 (purga real
  del SQLite del DO). El último mensaje renueva el reloj y los chats DIRECTOS
  (sin solicitud) ya entran en el ciclo; antes quedaban fuera para siempre.
- **Sesión deslizante + enlace mágico** (`/acceso`, `renewSeekerChatToken`): la
  persona sin cuenta renueva su acceso al entrar (hasta 90 días) y puede pedir
  enlaces frescos por correo desde cualquier dispositivo (3/h, respuesta neutra).
- **Aviso de respuesta a la persona**: si el profesional responde y la persona no
  está conectada, recibe un correo con enlace de acceso renovado, sin contenido
  (debounce de 5 min; `notify-seeker` en el DO).
- **Reapertura del mismo hilo**: las conversaciones cerradas se leen en solo
  lectura (`x-nido-can-send=0`) y pueden reabrirse durante la ventana: rearma el
  caso, re-reserva cupo atómicamente y reconecta los sockets con escritura.
- **Bandeja del profesional**: orden por última actividad y badge de "nuevo"
  (solo metadatos timestamp+rol; el contenido sigue solo en el DO), con enlace
  "Ver y reabrir" para cerradas.
- **Cupo del chat directo**: el alta directa reserva cupo atómicamente (antes se
  comprobaba pero no se reservaba) y acepta un correo opcional para la re-entrada.
- **Privacidad**: copy de `/privacidad` actualizado (90/180, actividad rodante,
  chats y reapertura). Docs: `docs/CHAT_ARCHITECTURE.md` y `docs/SECURITY.md`.

## 0.7.2 - 2026-07-02

Borrador automático del formulario de perfil (caso real: una voluntaria
completó todo el alta y un deploy simultáneo rotó los IDs de las server
actions — su POST devolvió 404 "Failed to find Server Action", vio "Algo
salió mal" y perdió los ~4 minutos de formulario).

- **Borrador local en `localStorage`** (`nido-borrador-perfil:<email>`): se
  guarda en cada tecleo/cambio (campos de texto, selects y checkboxes; los
  adjuntos no) y se restaura al volver a montar el formulario, con aviso
  "Recuperamos lo que habías escrito ✓". TTL de 7 días.
- Solo aplica al ALTA: en modo edición la fuente de verdad es el servidor y
  cualquier borrador viejo se descarta. Al completar el alta, la siguiente
  visita (ya en modo edición) limpia el borrador.
- Con esto, un deploy a mitad de formulario (o un cierre accidental) cuesta
  una recarga, no volver a escribirlo todo.

## 0.7.1 - 2026-07-02

Registro guiado paso a paso, basado en datos reales del embudo (14 cuentas
creadas → solo 6 perfiles completados) y prácticas contrastadas de formularios
multi-paso.

- **`RegistroPasos`** (`src/components/registro-pasos.tsx`): indicador
  "Paso 1 de 2 · Crea tu cuenta → Paso 2 de 2 · Completa tu perfil" con check
  al completar, en `/pro` y `/pro/onboarding`.
- **Secciones numeradas** en el formulario de perfil ("1 de 5 · Quién eres" …
  "5 de 5 · Nuestro acuerdo").
- **Copy corregida**: el onboarding decía "pendiente de verificación por un
  coordinador", pero `saveProfessionalOnboarding` publica el perfil al
  instante (la verificación FPV solo añade el sello). Ahora comunica el
  beneficio real: "al guardar, tu ficha aparece en el directorio".

## 0.7.0 - 2026-07-02

Panel del profesional renovado: nadie vuelve a quedarse atrapado.

- **Navegación por secciones** en `/pro/dashboard`: ← Inicio, ✎ Editar mi
  información, Disponibilidad, Solicitudes, Chats, Personas y Mi cuenta
  (anclas con `scroll-margin-top`). Antes no existía NINGÚN enlace para editar
  la información propia.
- **Edición precargada**: `/pro/onboarding` detecta el perfil existente y
  precarga TODOS los campos (`ExistingProfessional` en
  `professional-onboarding-form.tsx`). Antes el formulario cargaba vacío y
  guardar machacaba el perfil con blancos. El comprobante de registro no se
  precarga a propósito (ya revisado; evita re-subidas forzadas).
- **Saludo con estado**: "Hola, {nombre}" + chips (visible/oculto,
  recibiendo/en pausa, cupo X/Y).

## 0.6.1 - 2026-07-02

Login más amable (contra los "contraseña incorrecta" evitables):

- **Mostrar/Ocultar contraseña** dentro del campo (login, registro y
  restablecer), con `aria-pressed`.
- **Aviso de Bloq Mayús** en vivo (`getModifierState`).
- **Correo a prueba de teclado móvil**: `autocapitalize=none`,
  `autocorrect=off`, `inputmode=email` y `trim()` antes de cada llamada — el
  autocompletado móvil colaba espacios finales que rompían el login.

## 0.6.0 - 2026-07-02

Recuperación de contraseña y guardado de credenciales.

- **"¿Olvidaste tu contraseña?"**: `emailAndPassword.sendResetPassword`
  (Better Auth) + plantilla `buildPasswordResetEmail` (Resend) + página
  `/pro/restablecer`. Enlace de un solo uso, caduca en 1 h, respuesta neutra
  (sin revelar si el correo existe), manejo de token caducado/reutilizado.
- **Credential Management API**: tras login/registro correcto se pide al
  navegador guardar la credencial (en Chrome/Android el login por `fetch` no
  disparaba el guardado heurístico) + atributos `name`/`autocomplete`.
- **Rate limit por IP real**: `advanced.ipAddress.ipAddressHeaders =
  ["cf-connecting-ip"]`. Antes Better Auth no resolvía la IP en Workers y el
  rate limit degradaba a UN cupo global compartido entre todos los usuarios.
- `vitest` con `fileParallelism: false` (dos suites de BD sobre `local.db`
  daban `SQLITE_BUSY` intermitente).

## 0.5.1 - 2026-07-02

Hotfix del registro roto en producción (caso real: usuaria bloqueada).

- **Causa raíz**: el scrypt JS de Better Auth excedía el límite de CPU del
  plan Free de Workers y el alta moría ENTRE crear la fila `user` y guardar la
  credencial → cuenta huérfana ("ya existe una cuenta" al registrarse,
  "contraseña incorrecta" al entrar), sin salida posible.
- **PBKDF2-SHA256 vía WebCrypto** (`src/lib/password-hash.ts`): hashing en
  código nativo con CPU de worker mínima; formato
  `pbkdf2:<iter>:<salt>:<hash>` con verify compatible con los hashes scrypt
  previos.
- **Auto-reparación de huérfanos** (`reclamarUsuarioHuerfano` +
  `repararRegistroHuerfano`): si el alta devuelve `USER_ALREADY_EXISTS` y la
  cuenta es un huérfano puro (0 credenciales, 0 sesiones, sin perfil), se
  elimina con audit log y el registro se reintenta solo. Para cuentas reales
  es un no-op.

## 0.5.0 - 2026-07-02

Visibilidad de aprobados, botón de admin y auditoría de seguridad pre-merge.

- **Migración 0016** (backfill con guardas de consentimiento): publica SOLO a
  los perfiles de alta manual pre-4541b16 que quedaron ocultos sin elección
  propia (`remote_available=0`, `support_areas='[]'`, con log
  `professional_manual_approval_*` y sin `professional_hidden`). La versión
  inicial del backfill publicaba también a quien se auto-ocultó (opt-out del
  checkbox de onboarding); la auditoría de seguridad lo detectó como bypass de
  consentimiento/PII y se corrigió ANTES de desplegar.
- **`revalidateDirectoryViews()`**: las 6 acciones que cambian quién aparece
  en el directorio revalidan `/`, `/profesionales` y `/ayuda` (hoy defensivo —
  la caché de OpenNext es dummy y todo se renderiza por request — pero
  imprescindible si se configura caché real).
- **Botón "Panel admin"** en el nav (PR #24) con endpoint `/api/admin/status`
  que solo expone el booleano.
- **`color-scheme: light`** (neutraliza el auto-dark de Chrome Android que
  rompía el contraste del botón Eliminar) + estados hover/focus de los
  botones danger.
- UTM: auditoría de cobertura completa — todos los enlaces salientes pasan por
  `withUtm` desde 8848c71.

## 0.4.0 - 2026-06-30

Endurecimiento de integridad de datos, concurrencia, seguridad y privacidad.
Auditoría adversarial (multi-agente) sobre el chat/ofertas/asignación, con sus
arreglos verificados (build, tests, prueba de atomicidad y re-auditoría del
propio diff).

### Integridad de datos

- **`db.batch()` atómico**: se cablea el batch del driver sqlite-proxy (D1
  `batch()` en producción, libSQL `batch('write')` en local), que ejecutan todo
  en una sola transacción aunque D1 rechace `BEGIN/COMMIT`.
- **Aceptar oferta es atómico (BUG-A)**: conversación + sesión del seeker,
  cierre de ofertas hermanas y auditoría van en un único `db.batch`. Un fallo a
  medias ya no deja conversaciones huérfanas/duplicadas ni ofertas a medio
  cerrar.
- **Sin doble asignación (BUG-B)**: tanto la asignación del admin como la
  aceptación de oferta reclaman la solicitud de forma atómica
  (`SET assigned WHERE status IN ('new','offered') RETURNING`); el admin además
  cierra las ofertas hermanas. Nunca dos profesionales en una misma solicitud.
- **Fuga de cupo**: `releaseAssignmentsForRequest` cierra cada asignación con
  guarda de estado y solo libera cupo si de verdad la cerró (sin doble
  decremento ante liberaciones concurrentes).

### Seguridad

- **Kill-switch real del WebSocket (BUG-C)**: cerrar una solicitud o suspender a
  un profesional ahora corta el socket vivo en el Durable Object (nuevo endpoint
  interno `/disconnect`, conserva el transcript), y el profesional tiene
  kill-switch en D1 al conectar (conversación cerrada / cuenta suspendida). Antes
  un socket revocado seguía vivo y un profesional suspendido podía reconectar.

### Privacidad

- **Anonimización honesta (BUG-D)**: solo se marca `anonymizedAt` cuando se borró
  el transcript del DO de TODAS las conversaciones. Si el purgado falla, no se
  marca (ni se toca `updatedAt`) y se deja rastro, para que el cron de retención
  reintente en vez de abandonar PII real diciendo que se anonimizó.

## 0.3.2 - 2026-06-30

Paleta de marca: el verde es el único color de acento.

### Diseño

- **Solo verde para acentos**: se elimina la terracota (`--human`) y el azul de
  seguridad de la interfaz. El verde de marca (`#2f7a5b`) se usa para botones y
  acciones, con un verde suave (`#c5ddc5`, nuevo `--accent-tint`) para botones
  secundarios, bordes, badges y toques pequeños.
- Botones secundarios ("humanos"), recursos de crisis, banner del chat, botón de
  "salir rápido", CTA de los correos y las escalas de magnitud sísmica pasan a
  verde.
- Se conservan a propósito: el rojo de error (`--danger`, semántico) y los
  colores de logos de terceros (la "G" de Google y la bandera de Venezuela).

## 0.3.1 - 2026-06-30

Pulido de marca, dominio de producción y mensaje de "quiénes somos".

### Marca / iconos

- **Logo de la bandera de Venezuela corregido**: las estrellas estaban al revés
  (puntos en un arco hacia abajo). Ahora son 8 estrellas de 5 puntas en el arco
  hacia arriba correcto, verificadas contra la bandera oficial. El icono pasa a
  ser la bandera en todos los tamaños (favicon, apple-icon, OG/Twitter, manifest);
  la marca "Nido" se mantiene como texto junto a la bandera.

### Producción

- **Dominio de producción**: `ayudamental-venezuela.ocque41.workers.dev`
  (`SITE_URL`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL` y nombre del Worker). El
  despliegue requiere `wrangler deploy` y el secreto `BETTER_AUTH_SECRET` para
  ese host.

### Contenido

- **Quiénes somos**: "De dónde venimos" reescrito con la historia real de los
  fundadores —dos amigos, la salud mental como raíz del daño colectivo y la
  importancia de procesar el trauma para no agravarlo.

## 0.3.0 - 2026-06-30

Segunda pasada de auditoría sobre la base 0.2.0, añadiendo lo que faltaba para
que el chat funcione en producción y completando privacidad y CI.

### Chat en producción

- **Guard de Origin del WebSocket**: acepta el `Origin` que coincide con el `Host`
  de la request además de `BETTER_AUTH_URL`. Sin esto, el chat devolvía 403 en
  cuanto se servía desde el dominio real. Con tests de Origin.
- Notificación por correo a los profesionales cuando se les difunde una solicitud
  (antes solo se enteraban mirando el panel).
- `remoteAvailable` añadido a la reserva de cupo al aceptar una oferta.

### Privacidad

- Cron de retención de Cloudflare: cierra solicitudes inactivas a 30 días y las
  anonimiza a 90 (reutiliza la anonimización end-to-end, que borra el transcript
  del Durable Object). Anonimización extraída a `lib/retention` y compartida con
  la acción admin; añade limpieza del hash de IP de las sesiones del seeker.
- Política de privacidad: declara el almacenamiento del chat y el identificador
  derivado de IP. Copy corregido en varias páginas que negaban el chat in-app.

### Notificaciones

- Aviso de aprobación de profesional por correo.

### CI/CD y robustez

- CI ejecuta el typecheck del Worker (`typecheck:worker`) y la prueba del Durable
  Object (`test:workers`), migrada a Vitest 4 (`vitest.workers.config.mts`).
- Runbook de despliegue (migraciones D1, secretos, dominio) y cron documentados.

### UX / limpieza

- Manejo de error en Google Sign-In, estado "0 profesionales" en
  `/ayuda/gracias`, aviso de enlace caducado en `/ayuda`, botón "Salir rápido" en
  `/ayuda`, recibo "Leído" estable y desempate determinista del feed.

## 0.2.0 - 2026-06-30

Production-readiness pass: correctness, security, privacy, and flow fixes
across the seeker, professional, and admin journeys. Verified with the unit
suite (80 tests), a full production build, and the chat WebSocket end-to-end
suite (9/9) against real workerd.

### Fixed

- **Cloudflare D1 compatibility (production blocker).** Offer acceptance,
  admin assignment, and request release used interactive SQL transactions,
  which D1 rejects (`BEGIN`/`COMMIT` are not permitted) — so these flows threw
  on the production target. Rewritten as sequential statements with atomic
  single-statement guards and compensation. `acceptOffer` now claims the offer
  atomically so exactly one accept wins under races.
- **Capacity leak.** Release paths only matched `assigned` assignments, so
  offer-accepted (`accepted`) requests never freed the professional's slot — a
  permanent leak that eventually pushed pros out of the feed. Both states now
  release. Suspending/rejecting a pro also closes their open conversations and
  re-queues the seekers instead of stranding them.
- **Seeker dead-end.** Broadcasting a help request silently went nowhere
  without an email (the only delivery channel for a session-less seeker) while
  the page still promised "te escribiremos a tu correo". Broadcasting now
  requires an email or steers the person to the cookie-based direct chat;
  undelivered access links are recorded in the audit log for manual delivery.
- `NaN` render guard on `/ayuda/gracias`; durable email-notify debounce across
  Durable Object hibernation; the feed logs runtime DB failures instead of
  masking an outage as "no professionals available".

### Security & Privacy

- **WebSocket session kill-switch.** The chat gate only verified the HMAC
  token, so a leaked seeker link kept working for the full 72h with no way to
  revoke it. The gate now also validates the seeker session against D1
  (revoked / expired / closed conversation → 403); closing or anonymizing a
  conversation revokes the session. Defensive (fails open on a missing row /
  DB error) so it cannot take the live chat down.
- **Data deletion is now honored.** Chat transcripts live only in the Durable
  Object's co-located SQLite; anonymization scrubbed the D1 mirror but left the
  messages intact — contradicting the privacy policy. Anonymizing a request now
  purges every conversation's Durable Object (verified end-to-end in workerd).
- Constant-time, fixed-length (SHA-256) comparison for the internal
  chat-event secret — removes the previous length/timing oracle.

### Changed / Removed

- Wired the admin "new request" and professional "assigned" email
  notifications (previously no-op stubs); links are PII-free.
- Removed dead code: the empty `adminExportCsv` action and two unused
  components.

### Known follow-ups

- Direct-chat capacity reservation, a signed ownership token for broadcast,
  CAPTCHA on the intake form, response-time aggregation into the feed, and the
  Workers-pool integration test (incompatible with Vitest 4; the wrangler-dev
  E2E covers the same paths) remain open.

## 0.1.0 - 2026-06-28

- Initial MVP.
- Public help request intake without accounts.
- Better Auth Google sign-in for professionals.
- Professional onboarding and dashboard.
- Admin verification, request status updates, matching suggestions, manual
  assignment, and CSV export.
- Local SQLite schema with Drizzle.
- Seed data and smoke tests.
