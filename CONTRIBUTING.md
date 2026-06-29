# Contributing to Nido

Thank you for considering a contribution. Nido is intentionally small:
it connects people requesting help with verified volunteer professionals. The
best contributions keep that scope clear, safe, and fast.

## Before you start

- Read [README.md](README.md), [docs/SAFETY.md](docs/SAFETY.md), and
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Open an issue for larger changes before writing a big PR.
- Keep user-facing copy Spanish-first.
- Do not add payments, chat, video, ratings, reviews, AI therapist features, or
  complex matching.
- Do not add hardcoded emergency phone numbers unless they are verified and the
  source is documented.

## Local development

```bash
pnpm install
pnpm db:push
pnpm db:seed
pnpm dev
```

## Pull request checklist

- [ ] The change stays inside the CONNECT scope.
- [ ] Public safety copy is still accurate.
- [ ] No secrets, local databases, or `.env` files are committed.
- [ ] `pnpm lint` passes.
- [ ] `pnpm secret:scan` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm build` passes.
- [ ] New behavior is documented if developers need to know it.

## Code style

- Prefer simple server-rendered pages and server actions.
- Keep client-side JavaScript minimal.
- Use TypeScript and Zod validation for inputs.
- Keep database changes SQLite-compatible.
- Add focused tests for matching, validation, and assignment rules.

## License

By contributing, you agree that your contribution is licensed under the MIT
License.
