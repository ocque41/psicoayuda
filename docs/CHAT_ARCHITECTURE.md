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
  `seekerSessions`, `responseSamples`, caché de bucket en `professionals`.
- **SQLite del DO**: verdad LOCAL del contenido del chat (mensajes, `seq`, presencia).
  El contenido NUNCA se vuelca a D1; sólo se replican METADATOS no sensibles
  (`firstSeekerMsgAt`, `firstProReplyAt`) para el algoritmo de tiempo de respuesta.

## Modelo de datos (D1)
- `conversations` (id, helpRequestId?, professionalId, seekerSid, status, firstSeekerMsgAt, firstProReplyAt, createdAt…)
- `seekerSessions` (sid pk, conversationId, requesterHash, issuedAt, expiresAt, revokedAt…) — identidad efímera del seeker.
- `responseSamples` (id, professionalId, conversationId UNIQUE, responseDeltaMs?, answered, sampledAt) — 1 muestra/conversación.
- `professionals` (+ responseBucket, responseMedianMs, responseSampleSize, responseAnsweredRatio, responseComputedAt) — caché del feed.
- Mensajes → en el SQLite del DO (serverId, clientMsgId UNIQUE, seq monotónico, senderRole, content, serverTs…). SQL SIEMPRE parametrizado.

## Algoritmo de tiempo de respuesta
- `responseDeltaMs = firstProReplyAt − firstSeekerMsgAt` (la PRIMERA respuesta, con `serverTs` del DO).
- Agregación (Cron ~15 min): ventana móvil (30 días o últimas 20 conversaciones). `ratio = respondidas/total`.
  Si `respondidas < 3` → **cold-start**. Si no → **mediana** (no media) → bucket.
- Buckets cálidos, NUNCA cifra exacta: minutos / menos de una hora / pocas horas / hoy / más de un día (degradado si `ratio<0.5`).
- **Cold-start (sin inventar)**: derivar de `acceptingRequests` + cupo (+ presencia del DO en fases con chat).
- Implementado en `src/lib/response-bucket.ts`.

## Seguridad
- Seeker SIN cuenta: token HMAC firmado (`BETTER_AUTH_SECRET`) `{sid, conversationId, helpRequestId, exp+72h}`, sin PII, en cookie httpOnly+Secure+SameSite=Lax scopeada a `/c/<id>`.
- Autorización en el borde (`onBeforeConnect`) ANTES de instanciar el DO: seeker (HMAC+`seekerSessions`) XOR profesional (better-auth + `conversations.professionalId`). Inyecta headers de confianza; el DO ignora cualquier rol del payload del cliente.
- Transporte WSS/TLS + validación de `Origin`. **NO** se promete E2E (inviable para seeker anónimo en navegador) — honestidad en la UI.
- Anti-abuso: rate-limit de apertura por `requesterHash` (reusa helper existente, 3/h), rate-limit de mensajes por conexión, expiración/anonimización (patrón existente en `actions.ts`).

## Plan por fases
- **Fase 0** — Spike de integración DO+WS sobre OpenNext (custom-worker echo). Mitiga el riesgo #1.
- **Fase 1** — ✅ Feed público `/profesionales` (sin infra de chat): `src/lib/feed.ts`, `src/lib/response-bucket.ts`, `src/app/profesionales/*`. Cold-start. CTA "muy pronto".
- **Fase 2** — Tablas `conversations`/`seekerSessions`/`responseSamples` + columnas caché (migración Drizzle); Server Action `createConversation` + token efímero (`src/lib/seeker-token.ts`).
- **Fase 3** — DO `Conversation` (hibernate) con seq/ack/dedup/sync-delta/keyset + `onBeforeConnect` (`src/server/*`, `src/shared/chat-protocol.ts`).
- **Fase 4** — UI de chat (`src/app/c/[conversationId]/*`, `usePartySocket`, UI optimista 5 estados, reintentos, typing/presence opt-in).
- **Fase 5** — Tiempo de respuesta REAL: replicación de timestamps DO→`responseSamples`, Cron de recompute, `revalidateTag('feed-professionals')`.

## Notificaciones por email (PRIMERA PRIORIDAD)

Cuando alguien escribe a un profesional, le llega un correo a su **correo de
registro** (`professionals.email`) con copy directo y un botón **"Responder
ahora"** que abre `/(BETTER_AUTH_URL)/c/<conversationId>` (la conversación con
quien le escribió; la autorización la resuelve el `onBeforeConnect`).

- **Envío**: desde el Worker de Cloudflare vía la API HTTP de **Resend** (`fetch`).
  Cloudflare no envía correo arbitrario nativamente (Email Routing solo a
  direcciones verificadas; MailChannels dejó de ser gratis). Env: `RESEND_API_KEY`
  + `CONTACT_FROM_EMAIL` (sender verificado). No-op elegante si faltan.
- **Prioridad alta**: cabeceras `X-Priority/Importance/Priority`.
- **Confidencialidad**: el correo NO incluye el contenido del mensaje, solo el aviso
  y el enlace a la conversación segura. Copy "Alguien…" (anónimo), nunca "Niño"
  (la plataforma no es para menores y el seeker es anónimo).
- **Anti-spam (estilo WhatsApp/Telegram)**: el Durable Object llama a
  `notifyProfessionalNewMessage` SOLO cuando el profesional **no está conectado** a
  la sala, con **debounce por conversación** (no en cada mensaje). Punto de disparo:
  `Conversation.onMessage` (Fase 3) tras persistir un mensaje `senderRole='seeker'`.
- **Implementado**: `src/lib/email.ts` (envío Resend), `src/lib/email-templates.ts`
  (plantilla pura, testeada en `src/tests/email.test.ts`), `src/lib/notifications.ts`
  (`notifyProfessionalNewMessage` + `conversationUrl`). Listo para que el chat lo
  dispare en Fase 3.

## Riesgos clave
1. DO + @opennextjs/cloudflare: re-export obligatorio de la clase; probar en preview de Workers (no `next dev`).
2. `partysocket` peerDeps vs React 19 (template usa React 18) — verificar antes de Fase 4.
3. NO copiar del template: `saveMessage` interpola strings (inyección SQL), `onConnect {type:'all'}` vuelca todo el historial, falta seq/ack/dedup.
4. `partysocket` no añade jitter al backoff — añadirlo (thundering herd).
5. Métrica vs privacidad: replicar SÓLO timestamps, nunca contenido.

## Preguntas abiertas
Ver `openQuestions` del workflow: flujo de origen de la conversación (desde feed vs help_request), mostrar/ocultar no-disponibles, ventana del algoritmo (30d/20conv), umbral de muestras (3) y timeout (48h), reanudación cross-device (magic link), frecuencia del Cron, presencia opt-in.
