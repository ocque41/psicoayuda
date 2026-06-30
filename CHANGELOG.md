# Changelog

All notable changes to Nido will be documented here.

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
