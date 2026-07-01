# CLAUDE.md — Nido / psicoayuda

> **LÉEME PRIMERO.** Varias sesiones de Claude Code trabajan en este repo **a la
> vez**. Sin disciplina se pisan: se barren commits entre sí, compiten en
> `pnpm install` y chocan en el build. Sigue el protocolo de abajo siempre.

## ⛔ Base de datos de PRODUCCIÓN — máximo cuidado (obligatorio)

**La app YA tiene usuarios reales usando la D1 de producción.** Cada ejecución
debe tratar la BBDD de producción como intocable:

- **NUNCA** hagas reset, drop, truncate, ni borres filas/tablas de la BBDD de
  producción (D1 remoto). Nada de `wrangler d1 execute --remote` con DELETE /
  DROP / migraciones destructivas, ni `db:migrate:remote` que pierda datos.
- **NUNCA** ejecutes seeds, fixtures ni cargas de prueba contra producción.
- Cualquier prueba, seed o migración destructiva va contra una **BBDD local o de
  worktree**, jamás contra `--remote`.
- Antes de aplicar una migración a producción, verifica que es **aditiva y no
  destructiva** (las 0004/0005/0006 se aplicaron sin pérdida de datos: ese es el
  estándar). Si hay cualquier duda de pérdida de datos, **para y pregunta al
  humano** en vez de ejecutar.

## Idioma

Todo el trabajo del proyecto se hace en **español**: respuestas al usuario,
commits, PRs, comentarios de código, documentación y mensajes de UI.

## Coordinación entre sesiones (obligatorio)

Este clon (`main` en `C:\Users\Usuario\clones\psicoayuda`) es **compartido**. Para
no clobberar a otra sesión:

1. **Trabaja en tu propio git worktree + rama, NO en el checkout compartido de
   `main`.** Cada worktree tiene su working tree y su `.next` propios, así edits
   y builds nunca colisionan.
   ```bash
   git worktree add ../psicoayuda-<tema> -b claude/<tema>
   cd ../psicoayuda-<tema>
   pnpm install   # seguro: el store global de pnpm es concurrency-safe
   ```
   Al terminar, integra a `main` (ver punto 4) y limpia: `git worktree remove`.

2. **Nunca `git add -A` / `git add .` / `git commit -a`.** Haz stage SOLO de los
   archivos que tú tocaste: `git add <ruta> <ruta>`. Un add a ciegas arrastra el
   trabajo sin commitear de otra sesión a tu commit (ya pasó: el fix de admin
   acabó dentro de un commit de la feature de offers).

3. **No dejes cambios sin commitear en el checkout compartido de `main`**, y no
   corras `pnpm install` ni `pnpm build` ahí mientras otra sesión pueda estar
   activa. Esas carreras corrompen `node_modules` / `pnpm-lock.yaml` / el lock de
   build de Next (`Another next build process is already running`).

4. **Integra a `main` con cuidado:** `git pull --rebase origin main` antes de
   pushear; **nunca** `--force` sobre `main`. Para trabajo no trivial, abre PR
   (`gh pr create`).

5. **El CI corre `biome check`.** Mantén los archivos en **LF** y formateados:
   `pnpm format` o `npx biome check <archivos>` antes de commitear. No
   reformatees archivos que no cambiaste (hay deuda preexistente en
   `globals.css` y `profesionales/professional-card.tsx`).

6. **Anuncia tu alcance con el nombre de la rama** (`claude/<tema>`). Antes de
   empezar, mira `git worktree list` y `git branch` para ver qué hay en marcha.

### Diagnóstico rápido si algo choca
- `git worktree list` — quién tiene qué worktree.
- `git log --oneline -8` — commits recientes (¿alguien commiteó encima?).
- `git -c core.autocrlf=false status --short` — qué hay sin commitear aquí.

## Lo básico del proyecto
- **Stack:** Next.js 16 (App Router) + Drizzle (SQLite/libSQL; target Cloudflare
  D1) + Better Auth. Paquetes con `pnpm`.
- **Comandos:** `pnpm dev` · `pnpm build` (webpack) · `pnpm test` (vitest) ·
  `pnpm lint` (biome).
- **Admin:** `/admin` está gateado por la env `ADMIN_EMAILS`.
- **Recursos de crisis:** viven en `src/lib/resources.ts`, con fuentes
  verificadas. **Nunca inventes teléfonos** — usa esa fuente única.
