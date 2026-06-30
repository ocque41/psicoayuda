# Nido

[![CI](https://github.com/ocque41/psicoayuda/actions/workflows/ci.yml/badge.svg)](https://github.com/ocque41/psicoayuda/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/Licencia-MIT-1f6f64.svg)](LICENSE)
[![Hecho con Next.js](https://img.shields.io/badge/Next.js-16-000000.svg?logo=next.js)](https://nextjs.org)

> **English-speaking contributor?** Nido is a Spanish-first, non-profit project. The app, docs, and most issues are written in Spanish, but contributions and questions in English are very welcome. Jump straight to **[CONTRIBUTING.md](CONTRIBUTING.md)** for how to set up the project and open a pull request, and see the **["Contribuir desde Venezuela y el mundo"](#contribuir-desde-venezuela-y-el-mundo)** section below — you do not need to read Spanish fluently to help.

---

**Nido** conecta, de forma gratuita y a distancia, a personas en Venezuela que necesitan apoyo psicológico con profesionales de la psicología que se ofrecen como voluntarios y han sido **verificados** por el equipo.

Pedir ayuda por primera vez es un acto de coraje. Nido intenta estar a la altura de ese momento: el flujo es **calmado**, pide **solo los datos mínimos**, no exige crear una cuenta y es honesto sobre lo que puede y no puede hacer. No es un producto comercial, ni un marketplace de terapia, ni un chat, ni una videollamada, ni un sistema de reseñas, ni un "terapeuta de IA". Su único trabajo es **CONECTAR**: recibir la solicitud, dar de alta y verificar a profesionales voluntarios, sugerir una coincidencia sencilla al coordinador y entregar el contacto.

Está pensado para funcionar bien con conectividad cara y dispositivos modestos: cero imágenes pesadas, cero fuentes web, mayoría de Server Components y despliegue en el edge de Cloudflare.

---

## ⚠️ Aviso importante: Nido no es un servicio de emergencia

**Nido no reemplaza a los servicios de emergencia, ni a la atención médica, ni al diagnóstico o tratamiento profesional.** No garantiza disponibilidad ni respuesta en tiempo real.

**Si tú u otra persona están en peligro inmediato, busca ayuda presencial ahora mismo** o llama a los servicios de emergencia locales. Nido revisa las solicitudes periódicamente y un profesional voluntario puede tardar en responder; no es un canal para crisis que requieren atención inmediata.

La aplicación recoge deliberadamente la menor cantidad de datos posible. **No** pide cédula, documentos, dirección completa ni relatos largos de la situación a quien solicita ayuda.

---

## Tabla de contenidos

- [Características principales](#características-principales)
- [Stack técnico](#stack-técnico)
- [Arquitectura a alto nivel](#arquitectura-a-alto-nivel)
- [Empezar](#empezar)
- [Variables de entorno](#variables-de-entorno)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Contribuir desde Venezuela y el mundo](#contribuir-desde-venezuela-y-el-mundo)
- [Cómo contribuir y flujo de PR](#cómo-contribuir-y-flujo-de-pr)
- [Límites duros de producto: qué NO construir](#límites-duros-de-producto-qué-no-construir)
- [Documentación y enlaces](#documentación-y-enlaces)
- [Licencia](#licencia)

---

## Características principales

- **Solicitar ayuda sin cuenta.** Cualquier persona puede pedir apoyo desde `/ayuda` sin registrarse ni iniciar sesión. Se piden solo datos mínimos (correo de contacto, idioma, tipo de apoyo, urgencia y ubicación opcional).
- **Ubicación opcional.** Geolocalización del navegador opcional, con alternativa manual de ciudad/estado/país. Lo que no quieras compartir, lo dejas en blanco.
- **Inicio de sesión solo para profesionales.** Los profesionales voluntarios entran con Google (Better Auth). **Quien pide ayuda nunca crea cuenta ni usa el login de Google.**
- **Verificación de profesionales.** Onboarding con estado `pendiente de verificación`; un coordinador aprueba, rechaza o suspende. Los profesionales no ven solicitudes ni reciben asignaciones hasta ser aprobados.
- **Panel de coordinación (`/admin`).** Triaje de solicitudes, sugerencias de coincidencia, asignación manual y exportación CSV, todo restringido por `ADMIN_EMAILS`.
- **Coincidencia remota y sencilla.** Sugiere profesionales aprobados, que aceptan solicitudes, remotos y por debajo de su capacidad. No hay ranking por popularidad.
- **Asignación segura.** La asignación corre dentro de una transacción con guardas contra duplicados y contra exceder la capacidad del profesional.
- **Registro de auditoría.** Se registran aprobaciones, rechazos, suspensiones, asignaciones, cierres, anonimizaciones y exportaciones.
- **Anti-spam básico.** Límite simple en `/ayuda`: no más de 3 solicitudes recientes por correo o por IP del solicitante (hasheada con el secreto de la app, nunca se almacena la IP en claro).
- **Privacidad y retención.** Páginas públicas de privacidad y términos; los administradores pueden anonimizar una solicitud (elimina contacto y ubicación, la cierra y deja rastro de auditoría).
- **Copy honesto y trauma-informed.** Cabeceras de seguridad, recursos verificados y textos que nunca prometen disponibilidad inmediata.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | **Next.js 16** (App Router, React 19, Server Components) |
| Lenguaje | **TypeScript** |
| Estilos | **Tailwind CSS v4** (configuración CSS-first con `@theme`) |
| Autenticación | **better-auth** (Google OAuth, solo para profesionales) |
| Base de datos / ORM | **Drizzle ORM** sobre **libSQL** (SQLite local) y **Cloudflare D1** en producción |
| Validación | **Zod** |
| Despliegue | **Cloudflare Workers** vía **@opennextjs/cloudflare** + **Wrangler** |
| Lint / Formato | **Biome** |
| Tests | **Vitest** |
| Gestor de paquetes | **pnpm 11.7.0** |
| Runtime | **Node.js 22** |

---

## Arquitectura a alto nivel

Nido es intencionadamente pequeño. La mayor parte de la lógica vive en Server Components y Server Actions; el JavaScript de cliente se mantiene al mínimo.

```
Persona en crisis ──▶  /ayuda  ──▶  Server Action (valida con Zod)
   (sin cuenta)                          │
                                         ▼
                                   help_requests  ──▶  Registro de auditoría
                                         │
Profesional ──▶ /pro (Google) ──▶ onboarding ──▶ pendiente de verificación
   voluntario                                          │
                                                       ▼
Coordinador ──▶ /admin ──▶ aprueba/rechaza/suspende profesionales
 (ADMIN_EMAILS)     │
                    └──▶ asigna solicitud (transacción con guardas) ──▶ handoff por correo
```

**Flujo de datos**

1. Una persona envía `/ayuda` sin cuenta; la solicitud se valida con Zod y se guarda en `help_requests`.
2. Un profesional inicia sesión con Google y completa el onboarding (queda en `pendiente de verificación`).
3. Los administradores listados en `ADMIN_EMAILS` aprueban, rechazan o suspenden profesionales.
4. Los administradores asignan solicitudes a profesionales aprobados, que aceptan, remotos y por debajo de su capacidad.

**Seguridad de la asignación.** La asignación corre dentro de una transacción de base de datos: comprueba duplicados, incrementa la carga activa solo si el profesional es elegible y está por debajo de su capacidad, crea la asignación, marca la solicitud como asignada y escribe un registro de auditoría. Un índice único (`assignments_request_professional_unique`) impide asignaciones duplicadas solicitud/profesional.

**Aislamiento de datos.** Quien pide ayuda no tiene cuenta ni endpoints propios; sus datos solo los ven un administrador (`requireAdmin`) o el profesional **asignado** (panel acotado por `userId → professional.id → assignments`). Más detalle en [docs/SECURITY.md](docs/SECURITY.md).

**Base de datos.** En desarrollo se usa SQLite local a través de libSQL (`DATABASE_URL=file:./local.db`). En Cloudflare Workers se usa D1; `NIDO_DB_TARGET=cloudflare` hace que el cliente de Drizzle hable con D1 en vez del fichero SQLite local. Tablas principales: tablas de Better Auth (user/session/account/verification), `professionals`, `help_requests`, `assignments` y `audit_logs`.

Para más profundidad: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** y **[docs/SAFETY.md](docs/SAFETY.md)**.

### Rutas principales

| Ruta | Descripción |
|---|---|
| `/` | Página de inicio. |
| `/ayuda` | Formulario público de solicitud de ayuda (sin cuenta). |
| `/ayuda/gracias` | Confirmación de la solicitud y salidas seguras. |
| `/recursos` | Aviso de emergencia y recursos verificados. |
| `/emergencia` | Aviso de emergencia. |
| `/pro` | Inicio de sesión de profesionales con Google. |
| `/pro/onboarding` | Onboarding del profesional. |
| `/pro/dashboard` | Estado del profesional y solicitudes asignadas. |
| `/admin` | Panel del coordinador (restringido por `ADMIN_EMAILS`). |
| `/privacidad`, `/terminos` | Política de privacidad y términos (en español). |
| `/quienes-somos`, `/como-funciona`, `/transparencia`, `/seguridad` | Páginas informativas. |

---

## Empezar

### Requisitos previos

- **Node.js 22** o superior.
- **pnpm 11.7.0** (recomendado activarlo con Corepack para fijar la versión exacta):

```bash
corepack enable
corepack prepare pnpm@11.7.0 --activate
```

### Instalación y arranque

```bash
# 1. Instala dependencias (versión exacta del lockfile)
pnpm install

# 2. Crea tu archivo de entorno local
cp .env.example .env

# 3. Aplica el esquema a la base de datos SQLite local
pnpm db:push

# 4. (Opcional) Carga datos de ejemplo para desarrollo
pnpm db:seed

# 5. Arranca el servidor de desarrollo
pnpm dev
```

Abre **http://localhost:3000**.

> Para que el inicio de sesión real de profesionales funcione necesitas configurar `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (ver más abajo). El código incluye un valor de respaldo local solo para que los comandos de desarrollo funcionen antes de la primera configuración; en producción **debe** usarse un secreto largo y privado.

### Scripts disponibles

Todos los scripts del proyecto, tal cual existen en `package.json`:

| Script | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo (Next.js con Turbopack). |
| `pnpm build` | Build de producción. |
| `pnpm start` | Sirve el build de producción. |
| `pnpm lint` | Comprueba lint y formato con Biome (`biome check`). |
| `pnpm format` | Formatea el código con Biome (`biome format --write`). |
| `pnpm test` | Ejecuta la suite de tests unitarios con Vitest. |
| `pnpm test:workers` | Prueba de integración del chat (Durable Object) dentro de workerd/miniflare. |
| `pnpm typecheck:worker` | Typecheck del camino real de despliegue (`custom-worker.ts` + `src/server/*`). |
| `pnpm db:push` | Aplica el esquema de Drizzle a la base de datos local. |
| `pnpm db:migrate:remote` | Aplica las migraciones D1 a la base de datos de producción (`wrangler d1 migrations apply ... --remote`). |
| `pnpm db:seed` | Carga datos de ejemplo locales. |
| `pnpm secret:scan` | Escanea el repositorio en busca de secretos antes de hacer push. |

> El proyecto también incluye scripts de despliegue a Cloudflare (`build:cloudflare`, `preview`, `deploy`). Son para el mantenedor del despliegue; para contribuir no los necesitas.

---

## Despliegue a producción (Cloudflare)

El chat en tiempo real y la autenticación dependen de que estos pasos estén
hechos. Sin ellos la app puede renderizar pero el chat o el login fallan.

1. **Aplica el esquema a D1 (obligatorio):** `opennextjs-cloudflare deploy` **no**
   migra la base de datos. Ejecuta `pnpm db:migrate:remote` (o `wrangler d1
   migrations apply nido-venezuela-db --remote`) antes/junto al primer deploy y
   tras cada cambio de esquema. Sin tablas en D1, auth y conversaciones fallan.
2. **Configura los secretos del Worker** con `wrangler secret put`:
   - `BETTER_AUTH_SECRET` — obligatorio (firma de sesiones/tokens). La app falla
     en cerrado en producción si falta.
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — login de profesionales.
   - `ADMIN_EMAILS` — acceso a `/admin`.
   - `RESEND_API_KEY` + `CONTACT_FROM_EMAIL` — **necesarios para el chat**: el
     solicitante recibe el enlace de acceso por correo cuando un profesional
     acepta. Sin ellos, esa persona no puede entrar a la conversación.
   - `INTERNAL_NOTIFY_SECRET` — opcional pero recomendado (RPC interno del chat y
     cron de retención); si falta, cae a `BETTER_AUTH_SECRET`.
3. **Alinea `BETTER_AUTH_URL` / `NEXT_PUBLIC_SITE_URL`** (en `wrangler.jsonc`
   `vars`) con el **dominio real** que sirve la app. El guard de Origin del
   WebSocket acepta el `Origin` que coincide con ese host o con el `Host` de la
   request; si apuntan a un dominio distinto del que ven los usuarios, las
   conexiones del chat se rechazan.
4. **Cron de retención:** `wrangler.jsonc` define un cron diario que cierra
   solicitudes inactivas a 30 días y las anonimiza a 90 (borra el transcript del
   chat). Se ejecuta solo en el Worker desplegado.

---

## Variables de entorno

Copia `.env.example` a `.env` y rellena los valores. Resumen de cada variable:

| Variable | Obligatoria | Descripción |
|---|---|---|
| `BETTER_AUTH_SECRET` | Sí (en producción) | Secreto largo y aleatorio para firmar sesiones. En producción debe estar configurado; existe un respaldo local solo para desarrollo. |
| `BETTER_AUTH_URL` | Sí | URL base de la app para Better Auth (p. ej. `http://localhost:3000`). |
| `NEXT_PUBLIC_SITE_URL` | Sí | URL canónica pública (sin barra final). Se usa para metadatos SEO, `sitemap.xml`, `robots.txt`, canonical y datos estructurados. |
| `GOOGLE_SITE_VERIFICATION` | No | Token de Google Search Console (método "etiqueta HTML"). Vacío = no se emite la meta. |
| `GOOGLE_CLIENT_ID` | Sí (para login real) | Client ID de OAuth de Google (Web Client, termina en `.apps.googleusercontent.com`). |
| `GOOGLE_CLIENT_SECRET` | Sí (para login real) | Client Secret de OAuth de Google. |
| `ADMIN_EMAILS` | Sí (para `/admin`) | Lista de correos de administradores separados por comas. Solo estos usuarios ven datos de administración. |
| `DATABASE_URL` | Sí (local) | Cadena de conexión SQLite local, p. ej. `file:./local.db`. |
| `ABUSE_CONTACT_EMAIL` | Recomendada | Correo público de contacto para reportes de abuso. |
| `PRIVACY_CONTACT_EMAIL` | Recomendada | Correo público de contacto de privacidad (se muestra en `/privacidad`). |
| `NIDO_DB_TARGET` | No | `cloudflare` para que Drizzle use D1 en vez del fichero SQLite local. Vacío en desarrollo. |
| `CLOUDFLARE_ACCOUNT_ID` | No | Configuración de despliegue en Cloudflare D1. |
| `CLOUDFLARE_DATABASE_ID` | No | Configuración de despliegue en Cloudflare D1. |
| `CLOUDFLARE_D1_TOKEN` | No | Token de acceso a Cloudflare D1. |
| `RESEND_API_KEY` | Sí (para el chat) | Clave de Resend para enviar correos desde el Worker. Sin ella, el solicitante no recibe el enlace de acceso al chat cuando un profesional acepta. Si está vacía, el envío se omite en silencio. |
| `CONTACT_FROM_EMAIL` | Sí (para el chat) | Remitente verificado en Resend, p. ej. `"Nido <avisos@tudominio.com>"`. |
| `NOTIFICATION_EMAIL` | No | Correo del equipo que recibe el aviso de nuevas solicitudes. |
| `INTERNAL_NOTIFY_SECRET` | Recomendada | Secreto del RPC interno DO→Next y del cron de retención. Si está vacío, cae a `BETTER_AUTH_SECRET`. |

> **Nunca** subas tu `.env`, bases de datos SQLite locales, logs ni exportaciones al repositorio. Los secretos de producción se guardan como secretos de Cloudflare con `wrangler secret put`, no en Git.

---

## Estructura del proyecto

```
psicoayuda/
├── src/
│   ├── app/              # Rutas (App Router) y Server Actions
│   │   ├── ayuda/        # Flujo público de solicitud de ayuda (sin cuenta)
│   │   ├── pro/          # Login, onboarding y panel de profesionales
│   │   ├── admin/        # Panel del coordinador (restringido por ADMIN_EMAILS)
│   │   ├── recursos/     # Recursos verificados y avisos de crisis
│   │   └── api/auth/     # Handler de Better Auth
│   ├── components/       # Componentes de UI y formularios (mínimos)
│   ├── db/               # Esquema y cliente de Drizzle
│   └── lib/              # Auth, acceso admin, validación, matching, asignación, notificaciones
├── scripts/
│   ├── seed.ts           # Datos de ejemplo para desarrollo local
│   └── secret-scan.mjs   # Escáner de secretos usado por `pnpm secret:scan`
├── docs/                 # ARCHITECTURE, SAFETY, SECURITY, UX_BRAINSTORM y más
├── .github/workflows/    # ci.yml
├── .env.example
└── package.json
```

---

## Contribuir desde Venezuela y el mundo

Nido nace **para Venezuela**, y por eso queremos que también se construya, en buena medida, **desde Venezuela**. Si eres desarrolladora o desarrollador venezolano —dentro del país o en la diáspora— este proyecto es tuyo. Nadie entiende mejor el contexto real de quien va a usar Nido: la conectividad cara, los dispositivos modestos, el español de aquí, lo que de verdad significa pedir ayuda en este momento. Esa cercanía es exactamente lo que hace mejor al producto.

**Por qué importa tu aporte:**

- **Conoces al usuario.** Sabes cómo suena un copy que acompaña en lugar de uno que suena a trámite. Una sola frase mejor puede cambiar cómo se siente alguien que pide ayuda por primera vez.
- **Conoces la red.** Sabes lo que pesa cada KB y cada recarga cuando los datos son caros. Tus decisiones técnicas tienen un impacto humano directo.
- **Conoces los recursos.** Puedes ayudar a verificar y curar recursos reales y de confianza (líneas de apoyo, organizaciones) para `/recursos` y `/emergencia`.

No necesitas ser experto en todo el stack. Hay formas valiosas de ayudar para cualquier nivel:

- Mejorar el copy en español manteniendo claros los límites de seguridad.
- Añadir tests enfocados a validación, matching y asignación.
- Mejorar la accesibilidad y la usabilidad en móvil y con poca señal.
- Reportar y verificar recursos de crisis fiables (con fuente documentada).
- Documentar pasos de despliegue verificados.

Y si estás aprendiendo a programar: las issues marcadas como buenas primeras contribuciones son un excelente punto de partida. Pregunta sin miedo, en español o en inglés. **Aquí se construye con cuidado, no con prisa.**

---

## Cómo contribuir y flujo de PR

Antes de empezar, lee **[CONTRIBUTING.md](CONTRIBUTING.md)**, **[docs/SAFETY.md](docs/SAFETY.md)** y **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. Para cambios grandes, abre primero una issue.

Flujo de trabajo:

1. **Fork** del repositorio a tu cuenta.
2. Crea una **rama** descriptiva: `git checkout -b mejora/copy-confirmacion`.
3. Haz tus **commits** pequeños y claros; mantén el copy de cara al usuario en español.
4. Ejecuta las comprobaciones en local antes de subir:
   ```bash
   pnpm lint
   pnpm secret:scan
   pnpm test
   pnpm build
   ```
5. **Push** de tu rama a tu fork.
6. Abre un **Pull Request** contra `main` describiendo el cambio y por qué respeta los límites de producto.
7. Espera a que el **CI esté en verde**. El workflow [`ci.yml`](.github/workflows/ci.yml) corre en cada push y PR: `pnpm install --frozen-lockfile` → `db:push` → `lint` → `secret:scan` → `test` → `build`.
8. **Review** del mantenedor; aplica los cambios sugeridos.
9. **Merge** una vez aprobado.

Checklist rápido del PR (detalle completo en [CONTRIBUTING.md](CONTRIBUTING.md)):

- [ ] El cambio se mantiene dentro del alcance **CONNECT**.
- [ ] El copy público de seguridad sigue siendo preciso.
- [ ] No se suben secretos, bases de datos locales ni `.env`.
- [ ] `pnpm lint`, `pnpm secret:scan`, `pnpm test` y `pnpm build` pasan.

---

## Límites duros de producto: qué NO construir

Estos límites existen por **privacidad y seguridad** de personas vulnerables. Las contribuciones que los crucen no se aceptarán, por buena que sea la intención:

- ❌ **Sin pagos.** Nido es y será gratuito; los voluntarios no captan clientes de pago.
- ❌ **Sin chat in-app con desconocidos.** No es una plataforma de mensajería con extraños.
- ❌ **Sin videollamadas.**
- ❌ **Sin ratings ni reseñas.** Nada de ranking por popularidad. El "score" de coincidencia es una heurística interna para el coordinador, no un ranking público.
- ❌ **Sin "terapeuta de IA"** ni respuestas automáticas que simulen atención psicológica.
- ❌ **Sin matching complejo.** Coincidencia simple, remota y verificable.
- ❌ **Sin cuentas para quien pide ayuda.** El solicitante nunca se registra ni usa Google login.
- ❌ **Sin recoger más que los datos mínimos.** Nada de cédula, documentos, dirección completa ni relatos largos de la situación.
- ❌ **Sin prometer disponibilidad o respuesta inmediata / de emergencia.** El copy debe ser siempre honesto.
- ❌ **Sin teléfonos de emergencia no verificados** ni afirmaciones médicas. `/recursos` solo publica recursos **verificados y con fuente documentada**.

---

## Documentación y enlaces

- **[CONTRIBUTING.md](CONTRIBUTING.md)** — cómo contribuir (setup, estilo de código, checklist de PR).
- **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** — código de conducta de la comunidad.
- **[SECURITY.md](SECURITY.md)** — política de seguridad y reporte responsable de vulnerabilidades.
- **[docs/SAFETY.md](docs/SAFETY.md)** — principios de seguridad y límites del producto.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — arquitectura técnica en detalle.
- **[docs/SECURITY.md](docs/SECURITY.md)** — auditoría de seguridad y aislamiento de datos.
- **[docs/UX_BRAINSTORM.md](docs/UX_BRAINSTORM.md)** — misión, principios de diseño y backlog de UX.

---

## Licencia

Distribuido bajo la **Licencia MIT**. Consulta **[LICENSE](LICENSE)**.

Al contribuir, aceptas que tu contribución se licencia bajo la Licencia MIT.

---

> _"No tienes que pasar por esto solo/a."_ — Gracias por ayudar a que Nido exista. 🕊️
