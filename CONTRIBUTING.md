# Contribuir a Nido

> **English note.** Nido is a Spanish-first project: people in Venezuela use it to ask for free, remote, confidential psychological support, so the product, its copy, and most discussion happen in Spanish. You are very welcome to contribute in English — open issues and PRs in the language you are comfortable with, and a maintainer will help bridge anything user-facing into Spanish. The rest of this guide is in Spanish; the section headings double as a quick map. If anything is unclear, open an issue and ask.

Gracias por considerar una contribución. **Nido** conecta a personas en Venezuela que necesitan apoyo psicológico con **psicólogos voluntarios verificados**: gratis, a distancia, confidencial y **sin necesidad de crear una cuenta para pedir ayuda**. Es un proyecto sin fines de lucro.

Nido es **intencionalmente pequeño y conservador**. Las mejores contribuciones mantienen ese alcance claro, seguro y rápido. Antes de escribir código, conviene entender *por qué* el producto dice "no" a tantas funciones aparentemente útiles (ver [Límites duros de producto, privacidad y seguridad](#límites-duros-de-producto-privacidad-y-seguridad)).

---

## Tabla de contenido

- [Código de conducta](#código-de-conducta)
- [Antes de empezar](#antes-de-empezar)
- [Formas de contribuir](#formas-de-contribuir)
- [Configurar el entorno de desarrollo](#configurar-el-entorno-de-desarrollo)
- [Modelo de ramas y estilo de commits](#modelo-de-ramas-y-estilo-de-commits)
- [Cómo publicar un Pull Request](#cómo-publicar-un-pull-request)
- [La barrera de CI que debe pasar antes de hacer merge](#la-barrera-de-ci-que-debe-pasar-antes-de-hacer-merge)
- [Estilo de código (Biome)](#estilo-de-código-biome)
- [Pruebas (Vitest)](#pruebas-vitest)
- [Límites duros de producto, privacidad y seguridad](#límites-duros-de-producto-privacidad-y-seguridad)
- [Divulgación responsable de seguridad](#divulgación-responsable-de-seguridad)
- [Una nota de bienvenida](#una-nota-de-bienvenida)
- [Licencia](#licencia)

---

## Código de conducta

Este proyecto se rige por nuestro [Código de Conducta](CODE_OF_CONDUCT.md). Al participar, aceptas mantener un espacio respetuoso, directo y cuidadoso con los temas sensibles (tragedia, crisis y salud mental). Léelo antes de tu primera interacción.

---

## Antes de empezar

- Lee primero [README.md](README.md), [docs/SAFETY.md](docs/SAFETY.md) y [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Si tu cambio toca producto o UX, revisa también [docs/UX_BRAINSTORM.md](docs/UX_BRAINSTORM.md), que documenta los **límites duros** y los principios de diseño.
- **Abre un issue antes de un PR grande.** Para correcciones pequeñas (un typo, un bug acotado, una mejora de accesibilidad) puedes ir directo al PR. Para cambios de alcance, de modelo de datos, de copy sensible o de cualquier flujo de privacidad/seguridad, abre primero un issue para acordar el enfoque. Así evitamos que dediques esfuerzo a algo que choca con un límite del producto.
- **Mantén el copy de cara al usuario en español primero.** El público objetivo está en Venezuela. El texto en inglés es bienvenido en el código, los comentarios y la discusión, pero la interfaz se escribe en español, con un tono calmado e informado por trauma (ver [docs/UX_BRAINSTORM.md](docs/UX_BRAINSTORM.md) §4.5).
- **Respeta los límites duros.** No añadas pagos, chat in-app con desconocidos, videollamadas, ratings/reseñas, "terapeuta IA" ni matching complejo. No introduzcas teléfonos de emergencia que no estén verificados y con la fuente documentada. Estos límites no son negociables; protegen a personas vulnerables.

---

## Formas de contribuir

No hace falta escribir código para ayudar. Todas estas contribuciones son valiosas:

- **Código.** Corrige bugs, mejora la accesibilidad, refuerza la privacidad o implementa elementos del backlog priorizado de [docs/UX_BRAINSTORM.md](docs/UX_BRAINSTORM.md) §5. Prefiere cambios pequeños y enfocados.
- **Documentación.** Aclara estas guías, el README o los documentos de `docs/`. Una buena documentación es lo que permite que llegue más gente a colaborar.
- **Diseño / UX.** Propón mejoras de jerarquía visual, estados de carga, copy de crisis o flujos. El producto debe sentirse como *contención cálida*, no como un formulario administrativo. Cualquier propuesta debe vivir **dentro de los límites duros**.
- **Traducciones y revisión de copy.** Ayuda a que el español sea claro, humano y validante. La revisión por hablantes nativos —especialmente con el español de Venezuela— es muy bienvenida. El copy sensible se centraliza para que personas no técnicas puedan revisarlo (ver `src/lib/constants.ts`).
- **Verificación de recursos.** `/recursos` solo publica recursos **verificados** por el equipo. Si conoces líneas de apoyo, organizaciones o recursos reales, propónlos con su **fuente y forma de verificación** (ver [docs/RECURSOS_CRISIS.md](docs/RECURSOS_CRISIS.md)). Nunca inventes números de teléfono ni promesas.
- **Reporte de bugs.** Abre un issue con pasos claros para reproducir, qué esperabas y qué ocurrió. **Importante:** si el bug es una **fuga de privacidad o un problema de seguridad** (por ejemplo, datos de un solicitante visibles donde no deberían), **no lo publiques en un issue público** — sigue la [divulgación responsable](#divulgación-responsable-de-seguridad).

---

## Configurar el entorno de desarrollo

**Requisitos previos**

- **Node.js 22** o superior (el campo `engines` exige `>=22`).
- **pnpm 11.7.0** — gestionado vía Corepack para que todos usemos exactamente la misma versión.
- **Git**.

No necesitas una base de datos externa: en local usamos un archivo SQLite mediante libSQL.

**Pasos**

1. Habilita pnpm con Corepack (viene con Node):

   ```bash
   corepack enable
   corepack prepare pnpm@11.7.0 --activate
   ```

   Verifica la versión:

   ```bash
   pnpm --version   # debe imprimir 11.7.0
   ```

2. Clona el repositorio y entra en la carpeta:

   ```bash
   git clone https://github.com/ocque41/psicoayuda.git
   cd psicoayuda
   ```

3. Instala las dependencias con el lockfile exacto (igual que CI):

   ```bash
   pnpm install --frozen-lockfile
   ```

4. Crea la base de datos local y aplica el esquema. `db:push` (Drizzle Kit) lee `DATABASE_URL`; apúntalo a un archivo SQLite local:

   ```bash
   DATABASE_URL=file:./local.db pnpm db:push
   ```

   > En PowerShell (Windows): `$env:DATABASE_URL = "file:./local.db"; pnpm db:push`.

5. (Opcional) Carga datos de ejemplo para tener algo con qué trabajar:

   ```bash
   DATABASE_URL=file:./local.db pnpm db:seed
   ```

6. Arranca el servidor de desarrollo (Next.js con Turbopack):

   ```bash
   pnpm dev
   ```

   Abre <http://localhost:3000>.

**Notas sobre variables de entorno**

- El **flujo público de pedir ayuda no requiere cuenta** y funciona solo con la base de datos local.
- El **inicio de sesión de profesionales** usa better-auth con Google OAuth. Para probar ese flujo necesitarás definir como mínimo `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` (y las credenciales de Google OAuth). Consulta el README para la lista completa.
- **Nunca** comprometas tu `local.db`, archivos `.env`, logs ni datos reales de solicitudes (ver [SECURITY.md](SECURITY.md)). Estos ya están ignorados; mantenlos así.

---

## Modelo de ramas y estilo de commits

**Ramas**

- `main` es la línea de desarrollo soportada y debe permanecer siempre verde (CI en verde).
- Trabaja en una **rama de funcionalidad** a partir de `main`. Usa nombres cortos y descriptivos con un prefijo de área, en línea con el historial del repo:
  - `fix/` para correcciones — p. ej. `fix/sqlite-proxy-row-mapping`
  - `feat/` o `ux/` para funcionalidades o trabajo de UX — p. ej. `ux/app-redesign-brainstorm`
  - `docs/`, `chore/`, `test/` según corresponda.

```bash
git checkout main
git pull
git checkout -b fix/breve-descripcion
```

**Mensajes de commit**

Sigue el estilo del historial del proyecto: **una línea de asunto corta, en imperativo y con mayúscula inicial, sin prefijo de tipo ni punto final.** Ejemplos reales del repo:

```
Implement Q2 safety and privacy flow
Fix SQLite proxy row mapping
Add Cloudflare D1 deployment support
Harden next.config: drop X-Powered-By, enable React strict mode
```

Pautas:

- Mantén el asunto por debajo de ~72 caracteres y describe **qué** cambia el commit.
- Si necesitas más contexto (el *por qué*, alternativas descartadas, implicaciones de privacidad/seguridad), añade un cuerpo separado por una línea en blanco.
- Haz commits atómicos y enfocados; evita mezclar refactors grandes con cambios de comportamiento.
- **No** usamos el formato Conventional Commits con `:` en el asunto (`feat:`, `fix:`…). Mantén el estilo en prosa imperativa que ves arriba.

---

## Cómo publicar un Pull Request

1. **Sincroniza** tu rama con `main` antes de empezar y de nuevo antes de abrir el PR:

   ```bash
   git fetch origin
   git rebase origin/main   # o git merge origin/main si prefieres
   ```

2. **Haz tu cambio** lo más enfocado posible. Si tocas copy de cara al usuario, mantenlo en español y con tono calmado.

3. **Pasa la barrera de CI en local** antes de subir nada (ver la sección siguiente). En resumen:

   ```bash
   pnpm install --frozen-lockfile
   DATABASE_URL=file:./local.db pnpm db:push
   pnpm lint
   pnpm secret:scan
   pnpm test
   DATABASE_URL=file:./local.db pnpm build
   ```

4. **Sube tu rama y abre el PR** contra `main`:

   ```bash
   git push -u origin fix/breve-descripcion
   ```

   Luego abre el Pull Request en GitHub (o con `gh pr create`).

5. **Escribe una buena descripción de PR.** Una descripción útil incluye:
   - **Qué** cambia y **por qué** (enlaza el issue relacionado si existe).
   - **Cómo probarlo** (pasos manuales y/o pruebas añadidas).
   - **Impacto en privacidad/seguridad**: ¿este cambio toca datos del solicitante, datos del profesional, autenticación, copy de emergencia o algún flujo de `/admin`? Si la respuesta es sí, explícalo explícitamente.
   - Capturas o GIF si hay cambios visuales.

6. **Responde a la revisión.** Las personas mantenedoras pueden pedir cambios, especialmente cuando algo roza un límite duro o la seguridad del usuario. Es parte normal del proceso.

**Checklist de PR** (cópiala en la descripción y marca lo que aplique):

- [ ] El cambio se mantiene dentro del alcance del producto (CONNECT) y de los **límites duros**.
- [ ] El copy de cara al usuario está en español, es honesto y no promete respuesta inmediata ni de emergencia.
- [ ] El copy público de seguridad sigue siendo exacto.
- [ ] No se exponen datos del solicitante ni del profesional fuera de su contexto previsto.
- [ ] No se han commiteado secretos, bases de datos locales, `.env`, logs ni datos reales.
- [ ] `pnpm lint` pasa.
- [ ] `pnpm secret:scan` pasa.
- [ ] `pnpm test` pasa.
- [ ] `pnpm build` pasa.
- [ ] Hay pruebas para la lógica nueva o cambiada (validación, matching/sugerencias, reglas de asignación), cuando aplica.
- [ ] El comportamiento nuevo está documentado si otras personas desarrolladoras necesitan conocerlo.

**Qué hace bueno a un PR**

- Pequeño y enfocado en una sola cosa.
- Conserva o refuerza la privacidad y la seguridad por defecto.
- Mantiene el lado del cliente ligero (la conectividad puede ser cara y lenta).
- Incluye o actualiza pruebas para la lógica que toca.
- Tiene una descripción que cualquiera puede entender sin leer el código.

---

## La barrera de CI que debe pasar antes de hacer merge

Cada `push` y cada Pull Request ejecuta el workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml). **Ningún PR se fusiona si CI no está en verde.** Estos son los pasos, en orden, y cómo reproducirlos en local — exactamente lo mismo que corre el servidor:

| Paso de CI | Comando | Para qué sirve |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | Instala con el lockfile exacto; falla si `pnpm-lock.yaml` no concuerda con `package.json`. |
| Database schema | `DATABASE_URL=file:./local.db pnpm db:push` | Aplica el esquema Drizzle a una SQLite local; verifica que las migraciones de esquema son válidas. |
| Lint | `pnpm lint` | Corre `biome check` (lint + formato). |
| Secret scan | `pnpm secret:scan` | Ejecuta `scripts/secret-scan.mjs` para evitar que se cuelen secretos. |
| Test | `pnpm test` | Corre la suite de Vitest (`vitest run`). |
| Build | `pnpm build` | Compila la app de Next.js; CI le pasa `DATABASE_URL` y un par de variables de better-auth de prueba. |

**Reprodúcelo todo de una vez antes de subir:**

```bash
pnpm install --frozen-lockfile
DATABASE_URL=file:./local.db pnpm db:push
pnpm lint
pnpm secret:scan
pnpm test
DATABASE_URL=file:./local.db pnpm build
```

> Para el build, CI también define `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` con valores de prueba. Si tu build local falla por variables de entorno de auth, defínelas tú también (cualquier valor de marcador sirve para que compile):
>
> ```bash
> DATABASE_URL=file:./local.db \
> BETTER_AUTH_SECRET=ci-local-secret-change-me \
> BETTER_AUTH_URL=http://localhost:3000 \
> pnpm build
> ```

Si algún paso falla en CI pero no localmente, asegúrate de usar **Node 22** y **pnpm 11.7.0** (Corepack), y de haber corrido `pnpm install --frozen-lockfile`.

---

## Estilo de código (Biome)

Usamos [Biome](https://biomejs.dev) para lint y formato (un solo formateador y linter, sin ESLint ni Prettier). La configuración está en [`biome.json`](biome.json): indentación con **espacios** y el preset de reglas **recomendado**.

```bash
pnpm lint      # biome check  → comprueba lint + formato (lo que corre CI)
pnpm format    # biome format --write → aplica el formato automáticamente
```

Antes de subir, ejecuta `pnpm format` para autoformatear y luego `pnpm lint` para confirmar que no quedan avisos.

Convenciones del proyecto, alineadas con la arquitectura (Next.js 16 App Router, React 19, Server Components):

- **Prefiere páginas renderizadas en el servidor y Server Actions.** Mantén el JavaScript del cliente al mínimo; añade `'use client'` solo cuando de verdad necesites interactividad.
- **TypeScript en todo** y **validación con Zod** para cualquier entrada de usuario o de la red.
- **Mantén los cambios de base de datos compatibles con SQLite** (libSQL en local, Cloudflare D1 en producción).
- **Tailwind CSS v4 en modo CSS-first** (`@theme`). Reutiliza los tokens de diseño en vez de hardcodear colores; respeta los criterios de accesibilidad (foco visible, contraste AA, targets táctiles ≥ 44px).
- **Centraliza el copy sensible** (etiquetas de estado, mensajes de error, microcopy) para que sea revisable por personas no técnicas y fácil de traducir.

---

## Pruebas (Vitest)

Las pruebas corren con [Vitest](https://vitest.dev):

```bash
pnpm test            # vitest run (modo CI, una sola pasada)
pnpm exec vitest     # modo watch durante el desarrollo
```

Expectativas:

- **Añade pruebas enfocadas** para la lógica con más riesgo: validación de entradas, sugerencias/matching de profesionales, reglas de asignación, y cualquier comportamiento ligado a privacidad o límites de tasa (rate limiting).
- Cuando arregles un bug, añade una prueba que falle sin tu cambio y pase con él.
- Mantén las pruebas rápidas y deterministas; no dependas de servicios externos.
- `pnpm test` debe pasar en local antes de abrir el PR (CI lo exige).

---

## Límites duros de producto, privacidad y seguridad

Nido es un **producto de crisis para personas vulnerables**. Estos límites no son preferencias estéticas: protegen a quienes lo usan. Toda contribución debe respetarlos. Para el detalle y el razonamiento, ver [docs/UX_BRAINSTORM.md](docs/UX_BRAINSTORM.md) §8 y [docs/SAFETY.md](docs/SAFETY.md).

**Lo que NO se debe construir:**

- **Sin pagos.** El servicio es gratuito.
- **Sin chat in-app con desconocidos, sin videollamadas.** El contacto se coordina por correo, fuera del momento de la solicitud.
- **Sin ratings, reseñas ni ranking por popularidad.** Existe una heurística de coincidencia simple para uso interno del admin; **no se exhibe como un número/ranking** al usuario.
- **Sin "terapeuta IA"** ni respuestas automáticas que simulen acompañamiento clínico.
- **Sin matching complejo.** La asignación es trabajo humano del coordinador.
- **Sin teléfonos de emergencia ni promesas médicas no verificadas.** `/recursos` solo publica recursos **verificados y con fuente documentada**. Nunca inventes números ni datos.

**Privacidad y datos mínimos:**

- **Quien pide ayuda nunca crea una cuenta.** No añadas registro, login ni perfiles para solicitantes.
- **Recoge solo los datos mínimos** del solicitante (correo, idioma, categoría, urgencia, ubicación opcional, consentimiento). Nada de cédula, documentos, dirección completa ni relatos largos de trauma.
- **Datos mínimos también en pantalla.** El solicitante nunca ve datos de profesionales; el profesional no ve el correo del solicitante hasta el handoff coordinado. No expongas PII en rutas públicas adivinables, dashboards ni exportaciones.
- **Sin analítica ni rastreadores de terceros** sin una revisión de privacidad previa.

**Copy honesto y seguridad de crisis:**

- **Nunca prometas respuesta inmediata o de emergencia.** Ningún copy, badge ni flujo debe sugerir rapidez garantizada. La urgencia "alta" **no** promete velocidad; refuerza la derivación a ayuda presencial.
- Mantén un tono **calmado e informado por trauma**: valida antes de informar; nunca cierres en una negación.

Si tu idea **roza** un límite, abre un issue para discutirla antes de implementarla. A veces hay una forma acotada de lograr el objetivo sin cruzar la línea (en [docs/UX_BRAINSTORM.md](docs/UX_BRAINSTORM.md) §8 hay ejemplos de cómo acotamos estas decisiones).

---

## Divulgación responsable de seguridad

Nido maneja solicitudes de contacto sensibles. **Tratamos los problemas de privacidad como problemas de seguridad.**

- **No publiques vulnerabilidades ni fugas de privacidad en un issue público**, ni en un PR, ni en discusiones. Esto incluye, por ejemplo, datos de un solicitante o de un profesional accesibles donde no deberían.
- Sigue el proceso de [SECURITY.md](SECURITY.md): usa el reporte privado de vulnerabilidades de GitHub si está habilitado; si no, contacta a la persona propietaria del repositorio compartiendo solo lo mínimo para iniciar un reporte privado.
- Incluye: una descripción breve, pasos para reproducir, la ruta/API/flujo de datos afectado y si datos de contacto de personas podrían quedar expuestos o alterados.
- Ejecuta `pnpm secret:scan` antes de subir cambios que toquen configuración, despliegue, autenticación o documentación.

---

## Una nota de bienvenida

Si es tu **primera contribución a open source**, eres bienvenido/a aquí. Busca issues etiquetados como *good first issue* o empieza por documentación, traducción o una corrección pequeña — son contribuciones reales y valiosas. No hace falta que tu PR sea perfecto a la primera; la revisión es una conversación, no un examen.

Y un agradecimiento especial a quienes contribuyen **desde Venezuela o conocen el contexto de cerca**: tu criterio sobre el lenguaje, la realidad de la conectividad, los recursos locales y lo que de verdad ayuda a una persona en crisis es exactamente lo que este proyecto necesita. Gracias por estar aquí. Nadie debería pasar por esto solo/a, y eso vale también para quienes construimos Nido.

---

## Licencia

Al contribuir, aceptas que tu contribución se licencie bajo la [Licencia MIT](LICENSE).
