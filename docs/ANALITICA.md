# Analítica — cuánta gente entra y qué clickea

Dos piezas, ambas **sin cookies y sin datos personales** (importa en una web de
salud mental):

1. **Cloudflare Web Analytics** → cuenta **visitas** (cuánta gente entra, de qué
   país, qué páginas ve, de qué campaña UTM llega). Panel visual en Cloudflare.
2. **Analítica de clics propia** (tabla `click_events` en D1) → cuenta **qué
   pulsa la gente**: los botones (CTAs) y los enlaces salientes a WhatsApp/webs,
   y de qué campaña UTM venía esa persona.

Los **UTM links** de más abajo son lo que pegas en tus canales para saber *por
dónde* entra la gente. Sin ellos, las visitas cuentan igual pero aparecen como
"directo / desconocido".

---

## Paso único para activar las visitas: pega el token de Cloudflare

1. Cloudflare → **Analytics & Logs → Web Analytics → Add a site**.
2. Sitio: `saludmental-venezuela.com`. Copia el **token** del snippet (solo el
   valor de `"token"`).
3. Ponlo en `wrangler.jsonc` → `vars.CF_BEACON_TOKEN` (y en `.env` para local si
   quieres) y vuelve a desplegar. Sin token no se carga nada: la web va igual.

> No hace falta el snippet `<script>`: lo inyecta el propio `layout.tsx` cuando
> `CF_BEACON_TOKEN` tiene valor.

---

## UTM links para compartir

Base: `https://saludmental-venezuela.com/`. Pega estos según el canal. Cambia
`utm_campaign` por el nombre de la campaña del momento (ej. `terremoto-2026`).

| Dónde lo pones | Link |
| --- | --- |
| Bio de Instagram | `https://saludmental-venezuela.com/?utm_source=instagram&utm_medium=bio&utm_campaign=general` |
| Historia/post de Instagram | `https://saludmental-venezuela.com/?utm_source=instagram&utm_medium=social&utm_campaign=terremoto-2026` |
| Estado de WhatsApp | `https://saludmental-venezuela.com/?utm_source=whatsapp&utm_medium=status&utm_campaign=general` |
| Mensaje/difusión WhatsApp | `https://saludmental-venezuela.com/?utm_source=whatsapp&utm_medium=mensaje&utm_campaign=general` |
| Facebook | `https://saludmental-venezuela.com/?utm_source=facebook&utm_medium=social&utm_campaign=general` |
| TikTok (bio) | `https://saludmental-venezuela.com/?utm_source=tiktok&utm_medium=bio&utm_campaign=general` |
| X / Twitter | `https://saludmental-venezuela.com/?utm_source=x&utm_medium=social&utm_campaign=general` |
| Telegram | `https://saludmental-venezuela.com/?utm_source=telegram&utm_medium=canal&utm_campaign=general` |
| Flyer / cartel (QR) | `https://saludmental-venezuela.com/?utm_source=flyer&utm_medium=qr&utm_campaign=terremoto-2026` |
| Alianza / organización | `https://saludmental-venezuela.com/?utm_source=aliado&utm_medium=referral&utm_campaign=general` |

Reglas simples:
- `utm_source` = **de dónde** viene (instagram, whatsapp, flyer…).
- `utm_medium` = **el formato** (bio, social, qr, mensaje…).
- `utm_campaign` = **el motivo/momento** (general, terremoto-2026…). Úsalo igual
  en todos los canales de una misma campaña para poder sumarlos.
- Todo en **minúsculas y sin espacios** (usa guiones). Para QR, genera el QR con
  el link ya completo.

Para enlazar a una página concreta, mete los UTM en esa ruta:
`https://saludmental-venezuela.com/emergencia?utm_source=whatsapp&utm_medium=status&utm_campaign=terremoto-2026`.

---

## Cómo leer "qué clickea la gente" (tabla `click_events`)

Cada clic en un CTA o enlace saliente guarda: `type` (`cta` | `outbound`),
`label` (texto del botón), `href` (destino), `page` (dónde ocurrió), los `utm_*`
de entrada de esa sesión, `country` y `created_at`. **Sin IP ni PII.**

Consultas útiles (D1 en producción — solo lectura):

```bash
# Lo más clickeado en los últimos 7 días
wrangler d1 execute nido-venezuela-db --remote --command \
"SELECT type, label, count(*) AS clics FROM click_events \
 WHERE created_at > (unixepoch()-7*86400)*1000 \
 GROUP BY type, label ORDER BY clics DESC LIMIT 20;"

# Qué campaña UTM trae más acción
wrangler d1 execute nido-venezuela-db --remote --command \
"SELECT utm_source, utm_campaign, count(*) AS clics FROM click_events \
 GROUP BY utm_source, utm_campaign ORDER BY clics DESC;"

# Contactos a profesionales/orgs por WhatsApp (conversiones reales)
wrangler d1 execute nido-venezuela-db --remote --command \
"SELECT count(*) FROM click_events WHERE href LIKE '%wa.me%';"
```

> El volumen es bajo (una fila por clic en botón/enlace saliente). Si algún día
> molesta, se purga con `DELETE FROM click_events WHERE created_at < …` sin
> afectar a nada más.

---

## Desplegar (migración aditiva, sin pérdida de datos)

La tabla se crea con la migración `0018_goofy_moondragon.sql` (solo `CREATE
TABLE`, no toca datos existentes):

```bash
pnpm db:migrate:remote   # wrangler d1 migrations apply nido-venezuela-db --remote
pnpm deploy              # publica el CF_BEACON_TOKEN y el resto
```
