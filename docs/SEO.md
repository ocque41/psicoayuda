# SEO de Nido — estado y plan para rankear

Objetivo: que quien busca **"ayuda psicológica venezuela"**, **"ayuda psicológica gratis"**
o equivalentes nos encuentre lo más fácil posible.

Este documento separa lo que **ya está hecho en el código** de lo que **solo tú puedes
hacer** (dominio, verificación, enlaces). El ranking #1 depende sobre todo de lo segundo
+ tiempo de indexación; ninguna línea de código puede forzarlo.

---

## 🚀 Acción inmediata: 3 pasos para empezar a rankear

El SEO en código está **completo y verificado**. Para que Google lo vea y empieces a
posicionar, haz esto **en orden** (sin el paso 1, los demás no sirven):

1. **Desplegar.** Fusiona el PR de SEO y publica:
   ```
   git checkout main && git pull
   pnpm deploy        # desde WSL/Linux/CI; en Windows nativo activa "Modo Desarrollador"
   ```
   Comprueba: `https://saludmental-venezuela.com/sitemap.xml` debe abrir y mostrar el
   dominio propio.
2. **Google Search Console** (~15 min, gratis) → ver sección 3. Es lo que hace que Google
   te descubra en días, no semanas.
3. **Conseguir 3–5 enlaces** → usa los correos listos en [`OUTREACH.md`](./OUTREACH.md).
   En salud, esto pesa más que cualquier ajuste técnico.

> Tras esto: paciencia. Indexar y posicionar toma de días a semanas. Revisa Search Console
> cada pocos días.

---

## 1. Ya implementado en el código (verificado en build)

- **`metadataBase`, títulos, descripciones y canonical** en cada página (`layout.tsx` + cada `page.tsx`).
- **`sitemap.xml`** dinámico con las 6 rutas públicas + hreflang `es-VE`/`es` (`src/app/sitemap.ts`).
- **`robots.txt`** que permite el contenido público y bloquea `/admin`, `/api/`, panel y onboarding profesional y `/ayuda/gracias` (`src/app/robots.ts`).
- **`manifest.webmanifest`** (PWA, colores de marca, categorías health/medical).
- **Iconos**: `icon.svg` (favicon), `apple-icon` (180×180).
- **Imágenes sociales**: `opengraph-image` y `twitter-image` (1200×630) generadas con `next/og`.
- **Datos estructurados JSON-LD**: `NGO` + `WebSite` en todo el sitio; `WebPage` + `Service` + `FAQPage` (6 preguntas) en la portada (`src/components/structured-data.tsx`).
- **Contenido on-page** optimizado: el H1 de la portada y `/recursos` ahora contienen la consulta objetivo; FAQ y enlaces internos.
- **Páginas privadas** marcadas `noindex`; **404** (`not-found.tsx`) amable y `noindex`.
- **Verificación de Search Console lista**: define `GOOGLE_SITE_VERIFICATION` y se emite la meta sola.

Comprobar tras desplegar:
```
curl https://saludmental-venezuela.com/robots.txt
curl https://saludmental-venezuela.com/sitemap.xml
```
Ambos deben mostrar **`https://saludmental-venezuela.com`** (no un `*.workers.dev`).

---

## 2. Dominio propio — ✅ HECHO

`saludmental-venezuela.com` ya está conectado (Custom Domain en Cloudflare) y es la
URL canónica del sitio. Esto era la palanca #1: `*.workers.dev` está **fuertemente
penalizado** por Google y muchas veces ni se indexa; el dominio propio lo desbloquea.
Bonus: el dominio contiene la consulta objetivo ("salud mental venezuela").

> **Cómo se configura la URL canónica (importante).** `NEXT_PUBLIC_*` se inyecta en
> *build time*, y nuestro build de Cloudflare **no** recibe esa variable; por eso la
> URL real de producción es el **fallback de `src/lib/site.ts`**. Si algún día cambia
> el dominio, actualiza ESE fallback (y, por coherencia, `wrangler.jsonc` y `.env`).

---

## 3. Google Search Console (acción tuya, ~15 min)

1. Entra en https://search.google.com/search-console y añade tu propiedad (dominio).
2. **Verificación** (elige una):
   - **Etiqueta HTML** (la más fácil con este repo): copia el valor `content` del token que te da Google, ponlo en `GOOGLE_SITE_VERIFICATION` (`.env` y `wrangler.jsonc`), y redespliega. La meta se emite sola.
   - **DNS**: añade el registro TXT que indica Google en tu proveedor de dominio.
3. **Sitemaps** → envía `sitemap.xml`.
4. **Inspección de URLs** → pega la home y pulsa **Solicitar indexación** (repite con `/ayuda` y `/recursos`).
5. Revisa **Resultados de la Búsqueda** y **Mejoras** a los pocos días: posición, clics y validez del FAQPage/Organization.

---

## 4. Bing + IndexNow (opcional, 10 min)

- Da de alta el sitio en **Bing Webmaster Tools** (puedes importar desde Search Console) y envía el sitemap. Bing alimenta también a ChatGPT/Copilot.
- IndexNow notifica cambios al instante a Bing/Yandex.

---

## 5. Enlaces y menciones — E-E-A-T (acción tuya, continuo)

En salud mental Google exige **confianza** demostrable. Unos pocos enlaces de sitios
relevantes mueven más que cualquier ajuste técnico. Objetivos realistas en Venezuela:

- Federación de Psicólogos de Venezuela (FPV) y colegios regionales.
- Programas universitarios de psicología (UCAB/PsicoLínea, UCV, ULA…).
- ONG y redes de apoyo (p. ej. Psicólogos Sin Fronteras Venezuela).
- Directorios de salud mental y de ONG.
- Prensa y medios que cubren salud mental (Efecto Cocuyo, El Diario, etc.).

Plantilla de correo (adáptala):

```
Asunto: Nido — apoyo psicológico gratuito y a distancia para Venezuela

Hola [nombre]:

Somos Nido, un proyecto sin fines de lucro que conecta gratis y a distancia a
personas en Venezuela con psicólogas y psicólogos voluntarios verificados, sin
que la persona tenga que crear cuenta. No atendemos emergencias.

Si lo consideran útil para quienes los contactan buscando apoyo, ¿podrían
incluirnos como recurso/enlace? Encantados de coordinar y de sumar a su red de
profesionales voluntarios.

Gracias por su labor,
[tu nombre] — [tu correo] — https://saludmental-venezuela.com
```

> Cumple las reglas internas: no inventes cifras ni datos; menciona solo lo verificable.

---

## 6. Google Business Profile

Nido es **solo en línea, sin dirección física**, por lo que un perfil de Google Business
(que exige ubicación o área de servicio presencial) **probablemente no aplica**. No lo
fuerces con una dirección falsa: sería contraproducente. Si en el futuro hubiera una sede
o alianza local con dirección, se podría reconsiderar.

---

## 7. Contenido continuo (mejora sostenida)

- Publica los **recursos verificados** de `/recursos` en cuanto coordinación los apruebe (más contenido útil y enlazable, sin inventar teléfonos).
- Considera un pequeño blog con artículos **precisos** de salud mental (p. ej. "cómo apoyar a alguien en duelo", "señales para pedir ayuda"): cubre cola larga y refuerza E-E-A-T.

### Por qué NO creamos páginas por ciudad

Tentación habitual: una página casi idéntica para "ayuda psicológica en Caracas",
"...en Maracaibo", etc. Google penaliza estas **páginas puerta** (thin/doorway) y haría
**bajar** el ranking. La cobertura nacional ya se comunica en la portada y el FAQ con
contenido único. Solo crear páginas locales si cada una aporta información realmente
distinta y verificada.

---

## Resumen de prioridad

1. ~~**Dominio propio**~~ ✅ hecho (`saludmental-venezuela.com`).
2. **Search Console** (lo más urgente ahora): verificar + enviar sitemap + solicitar
   indexación de `/`, `/ayuda` y `/recursos`. Pega el token en `GOOGLE_SITE_VERIFICATION`.
3. **3–5 enlaces** de sitios relevantes (FPV, universidades, ONG, prensa) para E-E-A-T.
4. **Tiempo** (días-semanas) + contenido continuo.
