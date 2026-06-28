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
- `/privacidad`: privacy summary.
- `/terminos`: terms.
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
```

Optional:

```bash
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_DATABASE_ID=
CLOUDFLARE_D1_TOKEN=
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
```

For Google sign-in, use a Google OAuth Web Client whose client ID ends in
`.apps.googleusercontent.com`. Add this authorized redirect URI:

```text
https://ayudapsicologicavenezuela.ocque41.workers.dev/api/auth/callback/google
```

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
