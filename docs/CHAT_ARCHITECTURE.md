# Feed + Chat en tiempo real — Arquitectura (Nido)

> Destilado por un workflow multi-agente sobre `_references/durable-chat-template` y
> `_references/partykit` (partyserver/partysocket) + mejores prácticas de la industria.
> Documento vivo: guía el plan por fases. El chat se prueba SIEMPRE en preview de
> Workers (`opennextjs-cloudflare build && wrangler dev`), nunca solo en `next dev`.

## Decisión

Un **único Worker de Cloudflare**. El feed y todo request/response lo sirve el handler
de `@opennextjs/cloudflare` (Next 16). El chat vive en un **Durable Object por
conversación** (`Conversation extends Server<Env>` de `partyserver`, `hibernate:true`)
que persiste mensajes en su **SQLite co-localizado** (`ctx.storage.sql`), NO en D1.

Se unen con un **custom worker** (`custom-worker.ts`) que importa el handler de OpenNext,
**re-exporta** `Conversation` (obligatorio, issue opennextjs-cloudflare #502), y enruta:

```ts
const res = await routePartykitRequest(request, env, { prefix: "parties", onBeforeConnect });
return res ?? handler.fetch(request, env, ctx);
```

`/parties/conversation/<id>` → DO; todo lo demás → Next.

### División de datos
- **D1 (Drizzle, binding `DB`)**: verdad GLOBAL y consultable → feed, `conversations`,
  `seekerSessions`, `responseSamples`, `accessRequests`, caché de bucket en `professionals`,
  clave pública E2EE del profesional y keystores de recuperación cifrados.
- **SQLite del DO**: verdad LOCAL del contenido del chat (mensajes, `seq`, presencia,
  claves públicas de los participantes). El contenido NUNCA se vuelca a D1; sólo se replican
  METADATOS no sensibles (`firstSeekerMsgAt`, `firstProReplyAt`, `lastMessageAt`,
  `lastMessageRole`) para el algoritmo de tiempo de respuesta y la bandeja del profesional.
  Los mensajes se guardan como SOBRES E2EE opacos (ver abajo).

## Modelo de datos (D1)
- `conversations` (id, helpRequestId?, professionalId, seekerSid, seekerName?, seekerEmail?, status, firstSeekerMsgAt, firstProReplyAt, lastMessageAt, lastMessageRole, proLastReadAt, closedReason?, reopenedAt, createdAt…)
- `seekerSessions` (sid pk, conversationId, requesterHash, issuedAt, expiresAt, revokedAt, lastSeenAt…) — identidad efímera del seeker.
- `responseSamples` (id, professionalId, conversationId UNIQUE, responseDeltaMs?, answered, sampledAt) — 1 muestra/conversación.
- `accessRequests` (id, emailHash, requesterHash?, createdAt) — tabla desechable del enlace mágico `/acceso` (rate-limit 3/h por correo; el cron purga >7 días). Solo hashes, nunca correo ni IP.
- `professionals` (+ responseBucket, responseMedianMs, responseSampleSize, responseAnsweredRatio, responseComputedAt) — caché del feed.
- Mensajes → en el SQLite del DO (serverId, clientMsgId UNIQUE, seq monotónico, senderRole, content, serverTs…). SQL SIEMPRE parametrizado.

## Persistencia y ciclo de vida (v0.8.0 → v0.10.0)

- **Conversaciones ETERNAS (v0.10.0)**: la retención ya no cierra ni anonimiza
  chats. El hilo (y su link) vive hasta que una de las dos partes lo borra desde
  su lado; borrar sigue siendo definitivo, pero pasa por una **papelera con
  deshacer de 7 días** (v0.11.0): purga del SQLite del DO, borrado del espejo D1,
  sesiones revocadas y link muerto (el cron de retención purga al vencer
  `purgeAfter` en `src/lib/conversation-purge.ts`). Ambos eventos quedan auditados
  (`conversation_deleted`, `conversation_restored`, `conversation_purged`).
- **Cupo liberable sin perder el hilo**: un chat directo sin actividad >30 días
  deja de ocupar uno de los cupos del profesional (`quotaReleasedAt`), pero sigue
  abierto y accesible. La retención solo mantiene las **solicitudes** (cierre
  90/180) y el enlace mágico (7 días) (`src/lib/retention.ts`).
- **Sesión deslizante**: la cookie del seeker se renueva al entrar a la sala
  (`renewSeekerChatToken`) mientras la conversación exista.
- **Enlace mágico `/acceso`**: quien no tiene cuenta pide enlaces frescos a su correo
  (respuesta neutra, 3/h por correo). Cada enlace crea una sesión NUEVA revocable por
  separado (TTL 72h). Funciona cross-device.
- **Reapertura del mismo hilo**: una conversación cerrada (por caso, suspensión o
  borrado no) se lee en solo lectura y puede reabrirse por cualquiera de las dos
  partes desde la propia sala. Re-reserva cupo del profesional atómicamente,
  rearma el caso (solicitud/asignación) y corta los sockets para que reconecten
  con permiso de escritura.
- **Lectura/escritura separadas**: `onBeforeConnect` inyecta `x-nido-can-send=0` si la
  conversación está cerrada; el DO sirve historial pero rechaza `send`
  (`conversation_closed`). La conexión NO se bloquea por estar cerrada.
- **Notificaciones a la persona**: cuando el profesional responde y el seeker no está
  conectado, el DO dispara (debounce 5 min) un correo SIN contenido con enlace de acceso
  renovado (`notify-seeker` → `/api/internal/chat-event`).

## Seguridad
- Seeker SIN cuenta: token HMAC firmado (`BETTER_AUTH_SECRET`) `{sid, conversationId, helpRequestId, exp+72h}`, sin PII, en cookie httpOnly+Secure+SameSite=Lax scopeada a `/c/<id>`; sesión deslizante hasta 90 días.
- Autorización en el borde (`onBeforeConnect`) ANTES de instanciar el DO: seeker (HMAC+`seekerSessions`) XOR profesional (better-auth + `conversations.professionalId`). Inyecta headers de confianza; el DO ignora cualquier rol del payload del cliente.
- **Identidad determinista cuando hay DOS credenciales** (`src/lib/chat-identity.ts`, `chooseChatIdentity`): un mismo navegador puede tener la sesión/cookie del profesional y la cookie de la persona. Regla única compartida por página, server actions y WebSocket: gana el **profesional**; la persona solo si no hay credencial profesional o si el profesional pide su vista con `?como=persona` (el query viaja también a la URL del WebSocket). Antes la página priorizaba al seeker y el WS al profesional, así que un mensaje podía quedar firmado "como el otro". En la vista de persona el profesional escribe/borra/reabre como ella (el borrado cierra el caso en vez de reencolarlo) y la UI lo dice explícitamente.
- Kill-switch en D1: sesión revocada/expirada, conversación anonimizada o EN
  PAPELERA ⇒ 403; cierre por caso revoca; cierre por inactividad NO revoca
  (permite leer/reabrir).
- Transporte WSS/TLS + validación de `Origin`.
- **E2EE (v0.11.0)**: cifrado de extremo a extremo real (ver sección propia). El
  servidor no puede leer el contenido; los emails siguen sin incluirlo.
- Anti-abuso: rate-limit de apertura por `requesterHash` (3/h), rate-limit de mensajes por conexión, rate-limit del enlace mágico por correo (3/h), expiración/anonimización con purga verificada.
- La tarjeta "Origen del tráfico" del panel admin agrupa `click_events.utm_source` (NULL ⇒ `directo`): son ACCIONES sin UTM de entrada, no visitas.

## Algoritmo de tiempo de respuesta
- `responseDeltaMs = firstProReplyAt − firstSeekerMsgAt` (la PRIMERA respuesta, con `serverTs` del DO).
- Agregación (Cron ~15 min): ventana móvil (30 días o últimas 20 conversaciones). `ratio = respondidas/total`.
  Si `respondidas < 3` → **cold-start**. Si no → **mediana** (no media) → bucket.
- Buckets cálidos, NUNCA cifra exacta: minutos / menos de una hora / pocas horas / hoy / más de un día (degradado si `ratio<0.5`).
- **Cold-start (sin inventar)**: derivar de `acceptingRequests` + cupo (+ presencia del DO en fases con chat).
- Implementado en `src/lib/response-bucket.ts`.

## Cifrado de extremo a extremo (v0.11.0)

El chat es **E2EE real en el navegador** (`src/shared/e2ee.ts`,
`src/lib/e2ee-client.ts`): el servidor guarda y transporta sobres opacos
(`{"v":1,"p":<pub emisor>,"q":<pub receptor>,"n":<iv>,"c":<ct>}`) y nunca tiene
la clave para descifrarlos.

- **Claves**: pares ECDH P-256. El profesional tiene UNA clave de identidad y
  publica la pública en su ficha (`professionals.crypto_public_key`) al entrar a
  su panel (`E2eeProSetupBanner`). La persona tiene una clave por conversación,
  privada en su IndexedDB; su pública viaja en cada sobre y se publica al DO al
  conectar (frame `key` → snapshot `keys`).
- **Clave de conversación**: `HKDF(ECDH(mi_priv, pub_contraparte))` con sal del
  `conversationId`. El sobre lleva las DOS públicas para que emisor y receptor
  puedan releer el historial; el AAD (`conversationId|senderRole`) ata cada
  mensaje a su sala y su autor.
- **Respaldo**: código de recuperación de 128 bits (base32 Crockford, 26
  caracteres). El keystore se cifra con AES-256-GCM bajo una clave derivada del
  código y se guarda en `recovery_keystores` (id = derivado del código): el
  servidor no puede descifrarlo. Sin el código, un dispositivo nuevo no puede
  leer el historial (y nadie puede recuperarlo); hay un flujo explícito de
  restauración/rotación en la sala.
- **Migración del historial legado**: el cliente re-cifra los mensajes en claro
  por lotes (`frame reencrypt`, idempotente) en cuanto hay claves de ambos lados.
- **Límites honestos**: no hay forward secrecy (el historial es eterno), los
  metadatos (participantes, fechas, tamaños) siguen visibles para el servidor, y
  la garantía no cubre un navegador/dispositivo comprometido ni un despliegue
  malicioso del propio operador.
- **El servidor no descifra nunca** y ningún flujo (correos, panel, métricas,
  admin, retención) necesita el contenido.

## Plan por fases
- **Fase 0** — ✅ Spike de integración DO+WS sobre OpenNext (custom-worker echo).
- **Fase 1** — ✅ Feed público `/profesionales` (sin infra de chat): `src/lib/feed.ts`, `src/lib/response-bucket.ts`, `src/app/profesionales/*`. Cold-start.
- **Fase 2** — ✅ Tablas `conversations`/`seekerSessions`/`responseSamples` + columnas caché (migración Drizzle); Server Action `createConversation` + token efímero (`src/lib/seeker-token.ts`).
- **Fase 3** — ✅ DO `Conversation` (hibernate) con seq/ack/dedup/sync-delta/keyset + `onBeforeConnect` (`src/server/*`, `src/shared/chat-protocol.ts`).
- **Fase 4** — ✅ UI de chat (`src/app/c/[conversationId]/*`, UI optimista, reintentos, typing/presence).
- **Fase 5** — ✅ Tiempo de respuesta REAL: replicación de timestamps DO→`responseSamples`, Cron de recompute.
- **Fase 6 (v0.8.0)** — ✅ Persistencia: retención 90/180, sesión deslizante, `/acceso`, aviso de respuesta a la persona, reapertura del mismo hilo, bandeja del profesional con no leídos y cupo del chat directo.
- **Fase 7 (v0.10.0)** — ✅ Chats eternos + borrado definitivo por las partes (purga del DO), cupo liberable por inactividad y links de pago insertables en el chat (módulo `src/lib/payments`).
- **Fase 8 (v0.11.0)** — ✅ E2EE del chat (claves en el navegador, código de recuperación, migración del historial legado), paginación hacia atrás del historial, tope de mensajes ampliado a 20.000 y papelera con deshacer de 7 días antes del borrado definitivo.

## Notificaciones por email (PRIMERA PRIORIDAD)

Cuando alguien escribe a un profesional, le llega un correo a su **correo de
registro** (`professionals.email`) con copy directo y un botón **"Responder
ahora"** que abre `/(BETTER_AUTH_URL)/c/<conversationId>` (la conversación con
quien le escribió; la autorización la resuelve el `onBeforeConnect`).

- **Envío**: desde el Worker de Cloudflare vía la API HTTP de **Resend** (`fetch`).
  Env: `RESEND_API_KEY` + `CONTACT_FROM_EMAIL` (sender verificado). No-op elegante si faltan.
- **Prioridad alta**: cabeceras `X-Priority/Importance/Priority` (solo al profesional).
- **Confidencialidad**: los correos NO incluyen contenido; solo aviso + enlace.
- **Anti-spam (estilo WhatsApp/Telegram)**: el DO avisa SOLO cuando la contraparte
  no está conectada, con **debounce de 5 min por conversación**.
- **A la persona (v0.8.0)**: `notify-seeker` crea un enlace de acceso renovado
  (`/acceso/<token>`) y avisa "tienes una respuesta". Cierra el ciclo asíncrono.
- **Implementado**: `src/lib/email.ts`, `src/lib/email-templates.ts` (plantillas puras,
  testeadas en `src/tests/email.test.ts`), `src/lib/notifications.ts`,
  `src/lib/seeker-access.ts` (`createSeekerAccessLink`).

## Riesgos clave
1. DO + @opennextjs/cloudflare: re-export obligatorio de la clase; probar en preview de Workers (no `next dev`).
2. `partysocket` peerDeps vs React 19 (template usa React 18) — verificar antes de Fase 4.
3. NO copiar del template: `saveMessage` interpola strings (inyección SQL), `onConnect {type:'all'}` vuelca todo el historial, falta seq/ack/dedup.
4. `partysocket` no añade jitter al backoff — añadirlo (thundering herd).
5. Métrica vs privacidad: replicar SÓLO timestamps, nunca contenido.

## Preguntas abiertas
- ✅ Resuelto (v0.8.0): reanudación cross-device con enlace mágico (`/acceso`) + sesión deslizante.
- Pendientes del workflow original: ventana del algoritmo de respuesta (30d/20conv), umbral de muestras (3) y timeout (48h), frecuencia del Cron, presencia opt-in.
