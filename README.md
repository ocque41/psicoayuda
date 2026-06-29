# PsicoAyuda

[![CI](https://github.com/ocque41/psicoayuda/actions/workflows/ci.yml/badge.svg)](https://github.com/ocque41/psicoayuda/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

PsicoAyuda is a small Spanish-first web app for connecting people affected by
tragedy in Venezuela with verified volunteer psychology professionals who can
offer free remote support.

It is intentionally low-feature. It is not a paid product, a therapy
marketplace, a chat app, a video platform, a ratings system, or an AI therapist.
The core job is CONNECT: intake, professional onboarding, verification, simple
assignment, and contact handoff.

## Safety notice

PsicoAyuda does not replace emergency services, medical care, diagnosis, or
treatment. It does not guarantee availability or real-time response. If someone
is in immediate danger, they should call local emergency services or seek
in-person help now.

The app avoids collecting more data than needed. It does not ask people
requesting help for national ID, documents, full address, or long trauma
stories.

## Current MVP

- Public help request flow without accounts.
- Optional browser location with manual city/state/country fallback.
- Google sign-in for professional volunteers through Better Auth.
- Professional onboarding with pending verification.
- Admin verification through `ADMIN_EMAILS`.
- Admin request status updates, match suggestions, manual assignment, and CSV
  export.
- Remote-first matching suggestions for approved, accepting, remote
  professionals under capacity.
- Transactional assignment with duplicate and capacity guards.
- Audit log entries for professional approval, rejection, suspension, request
  assignment, request closure, and request data anonymization.
- Basic public anti-spam guard on `/ayuda` using email and hashed requester IP
  throttling.

## Tech stack

- Next.js 16, React 19, TypeScript.
- Better Auth with Google provider.
- Drizzle ORM.
- Local SQLite through libSQL.
- Tailwind v4 with a minimal shadcn-style component pattern.
- Vitest and Biome.

## Routes

- `/`: landing page.
- `/ayuda`: public help request form.
- `/ayuda/gracias`: request confirmation and safe suggestions.
- `/recursos`: emergency notice and placeholder for verified resources.
- `/privacidad`: Spanish privacy policy.
- `/terminos`: Spanish terms of service.
- `/pro`: professional Google sign-in.
- `/pro/onboarding`: professional onboarding.
- `/pro/dashboard`: professional status and assigned requests.
- `/admin`: coordinator dashboard.
- `/admin/export`: protected CSV export.

## Local setup

Requirements:

- Node.js 22 or newer.
- pnpm 11.7 or newer.

```bash
pnpm install
cp .env.example .env
pnpm db:push
pnpm db:seed
pnpm dev
```

Open `http://localhost:3000`.

## Environment variables

Required for real auth:

```bash
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ADMIN_EMAILS=admin@example.com
DATABASE_URL=file:./local.db
ABUSE_CONTACT_EMAIL=reportes@example.com
PRIVACY_CONTACT_EMAIL=privacidad@example.com
```

Optional:

```bash
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_DATABASE_ID=
CLOUDFLARE_D1_TOKEN=
ABUSE_CONTACT_EMAIL=
PRIVACY_CONTACT_EMAIL=
CONTACT_FROM_EMAIL=
NOTIFICATION_EMAIL=
```

`BETTER_AUTH_SECRET` must be a long private value in production. The code has a
local fallback only so development commands work before first configuration.

## Admin access

Admins are signed-in Google users whose email appears in `ADMIN_EMAILS`:

```bash
ADMIN_EMAILS=one@example.com,two@example.com
```

Non-admin users cannot see admin data.

## Professional verification and conduct

Google sign-in is only for professional volunteers. People requesting help do
not create accounts and never use Google login.

Professional flow:

```text
Google signup
→ onboarding
→ pending_verification
→ admin approval, rejection, or suspension
```

New professionals are not active immediately. They cannot see help requests or
receive assignments until an admin approves them. Suspended or rejected
professionals are also blocked from seeing assigned request details.

During onboarding, professionals must accept that the service is free, they will
not capture paid clients, they will keep confidentiality, PsicoAyuda does not
guarantee emergency response, and they will work only inside their professional
competence.

## Privacy, retention, and deletion

Public privacy and terms pages live at `/privacidad` and `/terminos`. Both use
the Spanish Q2 policy text and display configured contact emails.

Retention defaults:

- Close inactive requests after 30 days.
- Delete or anonymize requests after 90 days unless minimal records are needed
  for safety, abuse prevention, or legal reasons.

Admins can anonymize a help request from `/admin`. The action removes contact
and location details, closes the request, clears the requester hash, and writes
an audit log entry.

## Anti-spam

The public `/ayuda` form applies a basic MVP rate limit: no more than 3 recent
requests per email or hashed requester IP per hour. The hash uses the app secret
so raw IP addresses are not stored.

Turnstile is not wired yet because the current Q2 scope can be served by the
simple rate limit. Add it later if public abuse exceeds the basic throttle.

## Remaining work

- Configure real public values for `ABUSE_CONTACT_EMAIL` and
  `PRIVACY_CONTACT_EMAIL` before broad public launch.
- Add Cloudflare Turnstile if the basic email/IP-hash throttle is not enough.

## Database

Local development uses SQLite:

```bash
pnpm db:push
pnpm db:seed
```

Main tables:

- Better Auth user/session/account/verification tables.
- `professionals`
- `help_requests`
- `assignments`
- `audit_logs`

Assignment uses a transaction. It only increments active load and creates an
assignment when the professional is approved, accepting requests, remote, and
under capacity. A unique index prevents duplicate request/professional
assignments.

## Cloudflare D1 notes

The app can run on Cloudflare Workers through OpenNext and D1. The live worker
is configured as:

- Worker: `ayudapsicologicavenezuela`
- URL: `https://ayudapsicologicavenezuela.ocque41.workers.dev`
- D1 binding: `DB`
- D1 database: `ayudapsicologicavenezuela-db`

Cloudflare uses `PSICOAYUDA_DB_TARGET=cloudflare`, which makes the Drizzle
client talk to D1 instead of the local SQLite file. Local development continues
to use `DATABASE_URL=file:./local.db`.

Apply migrations to D1 with Wrangler when schema changes:

```bash
pnpm wrangler d1 migrations apply ayudapsicologicavenezuela-db --remote
```

Production secrets are stored with Wrangler secrets, not in Git:

```bash
pnpm wrangler secret put BETTER_AUTH_SECRET
pnpm wrangler secret put GOOGLE_CLIENT_ID
pnpm wrangler secret put GOOGLE_CLIENT_SECRET
pnpm wrangler secret put ADMIN_EMAILS
pnpm wrangler secret put ABUSE_CONTACT_EMAIL
pnpm wrangler secret put PRIVACY_CONTACT_EMAIL
```

For Google sign-in, use a Google OAuth Web Client whose client ID ends in
`.apps.googleusercontent.com`. Add this authorized redirect URI:

```text
https://ayudapsicologicavenezuela.ocque41.workers.dev/api/auth/callback/google
```

Request only these Google OAuth scopes:

```text
openid
email
profile
```

Do not request Gmail, Drive, Calendar, Contacts, or Google location scopes.

## Commands

```bash
pnpm lint
pnpm test
pnpm build
pnpm build:cloudflare
pnpm deploy
pnpm db:push
pnpm db:seed
```

CI runs install, schema push, lint, tests, and build.

## Contributing

Pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md),
[docs/SAFETY.md](docs/SAFETY.md), and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
before opening a PR.

Good first contributions:

- Improve Spanish copy while keeping the safety boundaries clear.
- Add focused tests for validation, matching, and assignment behavior.
- Improve admin usability without adding heavy UI.
- Document verified deployment steps.

Please do not add payments, chat, video, ratings, reviews, AI therapist
features, complex matching, unverified emergency phone numbers, or medical
claims.

## Reference repos used during implementation

The implementation was informed by:

- `glenntws/nextjs-betterauth-boilerplate`: Next.js, Better Auth, and Drizzle
  pattern.
- `rizbud/express-sqlite-booking-system`: transaction/capacity idea for safe
  assignment.
- `peterhaupt/psychotherapy-matching-frontend`: admin workflow inspiration.

No large source code blocks were copied from these projects. If you want to
inspect them locally, clone them into `_references/`; that folder is ignored by
Git.

## License

MIT. See [LICENSE](LICENSE).
