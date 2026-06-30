# CLAUDE.md — Nido / psicoayuda

> **LÉEME PRIMERO.** Varias sesiones de Claude Code trabajan en este repo **a la
> vez**. Sin disciplina se pisan: se barren commits entre sí, compiten en
> `pnpm install` y chocan en el build. Sigue el protocolo de abajo siempre.

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
