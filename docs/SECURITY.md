# Auditoría de seguridad y aislamiento de datos

Auditoría exhaustiva (9 dimensiones, verificación adversarial de cada hallazgo):
24 hallazgos, **21 confirmados / 3 refutados**.

## Conclusión principal

**El modelo de aislamiento de datos es sólido.** No existe ninguna ruta
actualmente explotable por la que un usuario vea los datos de otro:

- Quien pide ayuda no tiene cuenta ni endpoints propios; sus datos solo los ven
  un admin (vía `requireAdmin`) o el profesional **asignado** (panel acotado
  `userId → professional.id → assignments`).
- Onboarding y disponibilidad de un profesional están acotados por `userId`.
- `/ayuda/gracias?solicitud=<id>` usa IDs UUIDv4 (122 bits) como URL-capacidad y
  no expone PII del solicitante; solo nombre de pila + bio del profesional.

Los dos hallazgos **genuinamente explotables** se han **corregido**: inyección de
fórmulas CSV y el fallback de secreto ante mala configuración. El resto eran
defensa en profundidad o lógica de negocio. La verificación adversarial **degradó**
el "forjado de sesión crítico" porque better-auth usa tokens opacos en BD (no JWT):
conocer el secreto no permite forjar una sesión existente.

## Corregido en el código (con prueba: 50 tests verdes, build OK)

| # | Sev | Arreglo | Archivos |
|---|-----|---------|----------|
| 1/3/14/16 | crit→med | Secreto de auth **falla en cerrado** en producción (build excluido); `trustedOrigins`; `requesterHash` ya no usa sal adivinable | `src/lib/auth-secret.ts`, `auth.ts`, `actions.ts` |
| 6 | med (explotable) | **Inyección de fórmulas CSV** neutralizada (`=,+,-,@,\t,\r` → prefijo `'`) | `src/lib/csv.ts`, `admin/export/route.ts` |
| 5 | med | `suggestProfessionalsForRequest` **proyecta columnas** (sin email/licencia/notas) | `src/lib/matching.ts` |
| 7 | med | **Cabeceras de seguridad** (CSP con `frame-ancestors 'none'`, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy) | `next.config.ts` |
| 4 | high | `currentActiveRequests` **se decrementa** al cerrar/anonimizar (antes monótono) | `assignment.ts`, `actions.ts` |
| 12 | med | Suspender/rechazar **libera asignaciones** y devuelve solicitudes a la cola | `assignment.ts`, `actions.ts` |
| 8 | med | Rate limit de login de better-auth **activado** | `auth.ts` |
| 17/19/15 | low | Export CSV: **LIMIT** (5000), **audit log** del egreso, `nosniff` + `no-store` | `admin/export/route.ts` |
| 20 | low | Anonimización usa **token aleatorio** (sin enlace al id original) | `actions.ts` |
| 21 | low | Panel pro filtra por `assignments.status = 'assigned'` (frontera de autorización) | `pro/dashboard/page.tsx` |

## Acción operativa requerida (no es código)

1. **CRÍTICO**: configurar `BETTER_AUTH_SECRET` como secreto de Cloudflare:
   `wrangler secret put BETTER_AUTH_SECRET` (valor largo y aleatorio). Con el
   nuevo guard, si falta en producción el Worker falla en cerrado (mejor que
   firmar con un literal público). **Rotar** el valor si alguna vez se desplegó
   sin él.
2. Reforzar el rate limit de auth con un backend **durable** (KV/Durable Object)
   y/o una regla de **Cloudflare WAF** sobre `/api/auth/*` (en Workers el límite
   en memoria es por isolate).
3. Verificar que las cabeceras de seguridad aparecen en la respuesta del Worker
   desplegado (OpenNext aplica `next.config` `headers()`); si algún asset no las
   recibe, añadir `public/_headers`.

## Pendiente (follow-ups, fuera de este alcance — ver tareas creadas)

- **Retención automática (#10)**: ✅ implementada (v0.8.0). En v0.10.0 evolucionó:
  las **conversaciones son permanentes** y solo la retención de **solicitudes**
  (90/180) y del enlace mágico (7 días) sigue automática; el cupo de los chats
  directos inactivos (>30 días) se libera sin borrar el hilo. El borrado de chats
  es explícito (cualquiera de las dos partes) y purga de verdad el Durable Object
  antes de eliminar las filas D1.
- **Rendimiento admin (#9/#17)**: el panel admin hace un scan por solicitud (N+1)
  y carga la tabla completa sin paginar. *(tarea spawn creada)*
- **Anti-abuso (#2)**: añadir Turnstile/CAPTCHA en `/ayuda` y un techo global por
  ventana (el límite por IP ya frena la rotación de email en producción).
- Bajo riesgo, solo nota: `/ayuda/gracias` es un oráculo de existencia de IDs
  (mitigado por UUID); huecos del `secret-scan.mjs`.

## Actualización 0.2.0 (2026-06-30) — segunda pasada

Segunda auditoría (bugs / incompletos / seguridad / privacidad / flujos / CI /
chat en producción). Corregido en esta versión:

- **Transacciones en D1 (bloqueante de producción).** `acceptOffer`, la
  asignación de admin y las rutinas de liberación usaban `db.transaction()` del
  sqlite-proxy, que emite `BEGIN/COMMIT` por sentencia; **D1 los rechaza**, así
  que esos flujos lanzaban en producción. Reescritos como secuencias con guardas
  atómicas de una sola sentencia + compensación.
- **Kill-switch del WebSocket (C1).** `onBeforeConnect` solo validaba el token
  HMAC; un enlace de seeker filtrado servía 72h sin forma de revocarlo. Ahora,
  con binding D1, valida la sesión del seeker (revocada/expirada/cerrada → 403).
  Cerrar o anonimizar una conversación revoca la sesión. Defensivo (falla en
  abierto si no hay fila / error de DB) para no tumbar el chat vivo.
- **Retención (#10), ahora cumplida en parte.** El contenido del chat solo vive
  en el SQLite del Durable Object; anonimizar el espejo en D1 lo dejaba intacto.
  La anonimización ahora **vacía el DO** (purga verificada e2e). *(Falta el cron
  de ciclo de vida 30/90 días.)*
- **Secreto interno (H2).** La comparación de `x-nido-internal` ahora hashea
  ambos lados a 32 bytes y usa `timingSafeEqual` incondicional (sin oráculo de
  longitud).
- **Fuga de cupo (#4, más profunda).** Las liberaciones solo contemplaban
  `assigned`; las solicitudes aceptadas vía oferta (`accepted`) nunca liberaban
  cupo. Ahora ambas; suspender a un pro cierra sus conversaciones y reencola.

Siguen pendientes: Turnstile/CAPTCHA en `/ayuda`, token
de propiedad para la difusión, reserva de cupo en el chat directo, y el test del
pool de Workers (incompatible con Vitest 4; el e2e con wrangler dev lo cubre).
*(El cron de retención 30/90 quedó resuelto y ampliado a 90/180 en v0.8.0.)*

## Actualización 0.9.0 (2026-09-13) — credenciales del profesional

Los profesionales pueden cambiar correo, contraseña y teléfonos desde su panel
(`/pro/dashboard`, sección "Tu cuenta"), con estas defensas:

- **Correo con doble confirmación.** `user.changeEmail` de Better Auth: con el
  correo actual verificado se aprueba primero el cambio desde la dirección
  actual y luego se verifica la nueva; `user.email` no cambia hasta completar
  ambos pasos. En cuentas sin verificar, la verificación va directa a la
  dirección nueva y se manda un aviso de seguridad a la actual.
- **Re-autenticación.** Correo y contraseña exigen la contraseña actual cuando
  la cuenta tiene credencial propia (las cuentas de Google se apoyan en la
  sesión + la doble confirmación del correo). Los teléfonos son datos públicos
  de contacto, no un factor de acceso: se protegen con sesión, aviso y
  auditoría.
- **Contraseña.** `/change-password` exige la actual y, después, se revocan las
  demás sesiones manteniendo viva la actual (la rotación de cookie de
  `revokeOtherSessions: true` no se propaga de forma fiable desde una server
  action). Aviso por correo. El restablecimiento por enlace también revoca
  todas las sesiones (`revokeSessionsOnPasswordReset`).
- **Teléfonos.** Normalizados a internacional (`toIntlNumber`) y sin poder
  quedarse sin ninguna vía de contacto (correo público, WhatsApp o fijo).
- **Anti-abuso.** Tope por cuenta/hora respaldado en D1 (`audit_logs`), no solo
  en memoria del isolate; rate limit de Better Auth por endpoint; y Turnstile
  opcional en los tres formularios (se activa cuando están `TURNSTILE_SITE_KEY`
  y `TURNSTILE_SECRET_KEY`; el Worker valida con `siteverify`).
- **Trazabilidad.** Cada cambio deja fila en `audit_logs` y el espejo
  `professionals.email` (y el correo de coordinación cuando seguía al de la
  cuenta) se sincroniza al completarse la verificación.

## Actualización 0.10.0 (2026-09-13) — chats eternos, borrado definitivo y pagos

- **Chats permanentes.** La retención ya no cierra ni anonimiza conversaciones:
  solo las solicitudes (90/180) y el enlace mágico (7 días). Un hilo sin
  actividad >30 días libera cupo (`quota_released_at`, descuento idempotente) sin
  cerrarse ni borrarse.
- **Borrado definitivo por las partes.** Cualquiera de las dos identidades
  autorizadas (cookie HMAC de sala o profesional dueño) puede borrar el hilo:
  primero se purga el SQLite del DO (`purgeConversationMessagesDetailed`); si en
  producción la purga falla, **no** se borran las filas D1 (evita transcripciones
  huérfanas) y se audita `conversation_delete_failed`. Después se borran sesiones,
  muestras y la conversación, se libera cupo y se audita `conversation_deleted`.
  Si el hilo venía de una solicitud, el caso se reencola (borrado por el
  profesional) o se cierra (borrado por la persona).
- **Borrado de cuenta sin huérfanos.** `purgeAccount` ahora purga el DO de todas
  las conversaciones del profesional antes de eliminar las filas; si alguna purga
  falla, deja rastro `account_purge_conversation_failed` para reintentar.
- **Pagos con Stripe (aislados en `src/lib/payments`).** Checkout **hospedado**
  (Nido nunca ve datos de tarjeta; PCI SAQ A), comisión fija de Nido vía
  `application_fee_amount` y transferencia al profesional con Connect Express. El
  webhook (`/api/stripe/webhook`) verifica la firma con `constructEventAsync` +
  SubtleCrypto sobre el cuerpo crudo, es idempotente (`stripe_events`) y revierte
  la marca si el proceso falla para que Stripe reintente. La cuenta de Stripe es
  **compartida con otros proyectos**: todo evento sin metadatos `nido_*` se
  ignora. Country-gating: solo profesionales en países soportados por Connect
  (Venezuela no lo está) pueden conectar cobros. Sin claves configuradas, el
  módulo entero se oculta.
- **Privacidad.** La política pública se actualizó: los chats son permanentes
  hasta el borrado explícito; los pagos guardan solo el registro contable
  (importes, concepto, correo de quien paga), nunca datos de tarjeta.

### Endurecimiento 0.10.1 (2026-09-13)

- **Webhook con filtro de eventos ajenos.** La cuenta de Stripe es compartida:
  los eventos sin metadatos `nido_*` (o sin PaymentIntent propio en
  reembolsos/disputas) se ignoran sin reclamarlos; `stripe_events` solo registra
  eventos de Nido.
- **Rate limit del checkout público.** 15 intentos/hora por IP (hash
  irreversible) respaldado en D1; incluye intentos fallidos. Sin la IP no se
  bloquea (redes que no la envían).
- **Pagos colgados.** La retención marca `expired` los `pending` de más de 48 h.
- **Índices** (migración 0024, aditiva): `payments(stripe_payment_intent_id)` y
  `audit_logs(actor_email, action, created_at)`.
