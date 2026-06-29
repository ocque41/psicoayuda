# Architecture

Nido is a small Next.js app. It is designed to stay simple and easy to
run locally.

## Main parts

- `src/app`: routes and server actions.
- `src/components`: small UI components and forms.
- `src/db`: Drizzle schema and database client.
- `src/lib`: auth, admin access, validation, matching, assignment, and
  notifications.
- `scripts/seed.ts`: local seed data.

## Data flow

1. A person submits `/ayuda` without an account.
2. The request is validated with Zod and stored in `help_requests`.
3. `/ayuda/gracias` can show up to 3 safe public professional suggestions.
4. A professional signs in with Google and submits onboarding.
5. Admins listed in `ADMIN_EMAILS` approve, reject, or suspend professionals.
6. Admins assign requests to approved, accepting, remote professionals under
   capacity.

## Assignment safety

Assignment uses a database transaction:

- Check for duplicate assignment.
- Increment professional active load only if the professional is eligible and
  under capacity.
- Create the assignment.
- Mark the help request assigned.
- Write an audit log.

The `assignments_request_professional_unique` index prevents duplicate
request/professional assignments.

## Cloudflare D1

Local development uses file SQLite through libSQL. Cloudflare Workers should use
D1 because local SQLite files are not persistent there. Keep the D1 adapter work
separate from the MVP until Better Auth and Drizzle adapter behavior is verified
for the target deployment.
