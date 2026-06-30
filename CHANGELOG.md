# Changelog

All notable changes to Nido will be documented here.

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
