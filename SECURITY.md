# Security Policy

Nido handles sensitive contact requests. Treat privacy and safety issues
as security issues.

## Supported versions

The `main` branch is the supported development line until the first release.

## Reporting a vulnerability

Please do not publish sensitive vulnerabilities in a public issue.

If GitHub private vulnerability reporting is enabled, use it. Otherwise, contact
the repository owner through GitHub and share only the minimum details needed to
start a private report.

Include:

- A short description of the issue.
- Steps to reproduce.
- The affected route, API, or data flow.
- Whether user contact data could be exposed or changed.

## Sensitive data rules

- Do not commit `.env`, local SQLite databases, logs, exports, or real help
  request data.
- Do not add analytics or third-party trackers without a privacy review.
- Do not expose professional private contact details publicly.
- Do not add emergency phone numbers unless they are verified and sourced.
- Run `pnpm secret:scan` before pushing changes that touch config,
  deployment, auth, or docs.
