# Plan UI/UX de Nido

> Documento derivado de una investigación multiagente (UX de crisis, confianza profesional, sistema de diseño, SEO, legal/confianza, arquitectura de información). Fuente de verdad para la implementación. Fecha base: 2026-06-29.

## 1. Sistema de diseño

### Paleta (tokens AA 2.2)

| Token | Hex | Uso |
|---|---|---|
| `--background` | `#faf6f0` | Fondo crema cálido de toda la app; evita el blanco puro clínico y reduce fatiga visual. |
| `--surface` | `#ffffff` | Tarjetas, formularios y bloques elevados sobre el fondo crema. |
| `--surface-soft` | `#f4ede3` | Rellenos suaves, secciones alternas y estados hover de superficie. |
| `--foreground` | `#2b2723` | Texto principal (tinta verdosa-marrón, 13.76:1); nunca negro puro. |
| `--muted` | `#6e655b` | Texto secundario, hints y captions (5.31:1, cumple AA). |
| `--border` | `#e7decf` | Bordes de tarjetas, inputs y divisores. |
| `--accent` | `#2f7a5b` | Salvia de marca (calma/profesional). SOLO sobre fondos claros: enlaces, checks, iconos. NUNCA texto pequeño sobre -soft. |
| `--accent-strong` | `#245f47` | Variante salvia para texto sobre fondos -soft (6.96:1). Regla: sobre cualquier *-soft usar *-strong. |
| `--accent-soft` | `#e6f1ea` | Relleno suave de chips, pasos y badge verificado. |
| `--human` | `#b65334` | CORREGIDO de #c2603d a #b65334 (4.91:1 con blanco). Color base del CTA principal 'Pedir ayuda' / 'Quiero que me acompañen'. |
| `--human-strong` | `#8a3d28` | CORREGIDO de #a64e30 a #8a3d28 (7.56:1). Hover/active del CTA humano y texto terracota sobre crema. |
| `--safety` | `#1b3a63` | NUEVO. Azul tinta de seguridad/confianza (10.07:1 sobre safety-soft). Encabezado y borde del bloque de crisis/emergencia; lo distingue del verde de acción sin alarma roja. |
| `--safety-soft` | `#eaf1f9` | NUEVO. Fondo del bloque de crisis/emergencia. Sereno, distinto de la UI verde. |
| `--success` | `#2f7a5b` | Estados de éxito y confirmaciones (alias de salvia). |
| `--danger` | `#9a3b2e` | SOLO errores de validación de formulario (6.42:1). Nunca para el aviso de emergencia. |

### Tipografía

- **Titulares:** Hanken Grotesk (variable, ejes 400/600/700)
- **Cuerpo:** Hanken Grotesk (mismo archivo variable; cuerpo 400, énfasis 600)
- **Justificación:** Hanken Grotesk es de apertura abierta y muy legible en pantallas pequeñas y gama baja (mayoría móvil es-VE), más cálida que Inter para texto emocional largo. Una sola familia variable evita una segunda web font. Escala modular ratio 1.20 con tokens semánticos: --text-caption .833rem/1.5, --text-body 1rem/1.6, --text-lead 1.125rem/1.6, --text-title clamp(1.25-1.5rem)/1.25, --text-h1 clamp(1.9-3rem)/1.1. Cuerpo mínimo 16px; en /ayuda subir a 18px para bajar carga cognitiva de personas en crisis y niños. Exponer todo vía @theme de Tailwind v4 como única fuente de verdad. Atkinson Hyperlegible queda documentada como alternativa de accesibilidad extrema, no se adopta.
- **Carga:** next/font autohospeda Hanken Grotesk (ya configurado), subset solo 'latin', display:swap y pila fallback system-ui que garantiza texto instantáneo en 2G/3G. Usar el ÚNICO archivo woff2 VARIABLE (no estáticos), acotar ejes a 400/600/700, opcional preload del peso de cuerpo (400). No añadir segunda web font.

### Principios

- Acogida sin clínica: crema+salvia+terracota en vez del azul hospitalario; radios generosos (14-20px) y sombras difusas, nunca bordes duros ni rojos de alarma.
- Dualidad cromática como sistema: salvia (--accent) = calma/profesional para el lado pro; terracota (--human) = calidez humana para quien pide ayuda.
- El rojo (--danger) se reserva EXCLUSIVAMENTE a errores de validación; la información de seguridad usa azul tinta (--safety), sereno y diferenciado.
- AA verificado como invariante: todo CTA y texto cumple WCAG 2.2 AA (4.5:1 normal); sobre fondos *-soft usar siempre la variante *-strong.
- Targets táctiles >=48px, foco visible 2px, prefers-reduced-motion respetado y skip-link: mobile-first para gama baja venezolana.
- Lenguaje vivencial no clínico y divulgación progresiva (<details>) como patrón protegido: futuras iteraciones NO deben 'profesionalizar' el copy ni reintroducir estigma.
- Datos mínimos por diseño: nunca pedir más de lo imprescindible; quien pide ayuda no crea cuenta.

## 2. Arquitectura de información

| Ruta | Título | Audiencia | Prioridad | Propósito | Secciones clave |
|---|---|---|---|---|---|
| `/` | Portada | both | P0 | Acoger en segundos, comunicar gratis/confidencial/sin cuenta/verificados y bifurcar a las dos rutas. Franja de crisis persistente en header. | Hero acogedor con CTA humano 'Quiero que me acompañen'; Trust-strip (gratis, confidencial, sin cuenta, verificados); Bifurcación solicitante vs profesional; FAQ destacada (HOME_FAQ + JSON-LD); Franja de crisis hacia /recursos |
| `/ayuda` | Pedir apoyo | seeker | P0 | Formulario trauma-informed de solicitud sin cuenta, con triage por copy de urgencia y bloque de crisis visible para urgencia alta. | Mensaje de bienvenida sin vergüenza; Formulario con etiquetas vivenciales y <details>; Bloque de crisis prominente si urgencia='alta'; Consentimiento informado en el punto de envío; Botón 'Salir rápido' persistente |
| `/ayuda/gracias` | Gracias / Qué sigue ahora | seeker | P0 | Confirmar recepción, fijar expectativa realista (horas, no inmediato), mensaje condicional para urgencia alta y enlazar a la página de estado. | Confirmación cálida con FocusHeading; Mensaje condicional urgencia alta + vía inmediata; Enlace a /solicitud/[token]; Recursos mientras espera; Salir rápido |
| `/solicitud/[token]` | Estado de tu solicitud | seeker | P0 | Página de estado de solo lectura por enlace mágico (sin login): timeline de 3 estados humanos, nombre del voluntario al asignar, cancelar. | Timeline En cola -> En revisión -> Te escribió [nombre]; Botón 'Ya no necesito ayuda'; Aviso de crisis siempre visible; Recursos mientras espera; Salir rápido |
| `/recursos` | Recursos y líneas de ayuda | both | P0 | Sustituir el placeholder por bloque de crisis venezolano verificado con fuente y fecha; derivación segura; reforzar 'esto NO es emergencia'. | Bloque de crisis (LAPSI-FPV, PsicoLínea UCAB, Psicólogos sin Fronteras, Cecodap) con fuente+fecha; Derivación a findahelpline.com/ve y Psicomapa; Sección menores; Sección 'esto no es emergencia'; Salir rápido |
| `/emergencia` | Si estás en peligro ahora | seeker | P0 | Página dedicada de derivación inmediata con números verificados; refuerza el deber de cuidado y limita responsabilidad sin prometer respuesta. | Emergencias verificadas (911/171 según estado); Líneas de apoyo psicológico verificadas; Declaración 'Nido NO es emergencia ni inmediato'; Derivación específica para menores |
| `/pro` | Soy profesional | professional | P0 | Pitch de confianza ANTES del login Google: pacto del voluntario, su protección, cómo se verifica, testimonios, alta en 2 pasos. | Propuesta de valor voluntario; Enlaces a /seguridad, /pacto-voluntario, testimonios; Cómo verificamos (resumen); Google Sign-In + alta 2 pasos; Control de carga como autonomía |
| `/pro/onboarding` | Alta del profesional | professional | P0 | Alta en 2 pasos con estado de verificación visible y SLA; reduce fricción y ansiedad del limbo. | Paso 1 mínimo: nombre + tipo de credencial + email; Paso 2: áreas, idiomas, bio, disponibilidad; Barra Recibido -> En verificación -> Aprobado; SLA explícito en días hábiles; 5 atestaciones como pacto mutuo |
| `/pro/dashboard` | Panel del profesional | professional | P1 | Estados humanizados, CTA contextual, auto-marcar contactado/cerrado, impacto y control de carga como autonomía. | CTA 'Tienes 1 persona esperando tu primer mensaje'; Casos con urgencia vivencial destacada; Acciones 'Ya contacté' / 'Cerrar' (acotadas por professionalId); Panel de impacto e insignias; Control de maxActiveRequests |
| `/pacto-voluntario` | Pacto del voluntario y tu protección | professional | P0 | Página pública con las 5 atestaciones como compromisos mutuos, encuadre legal y protección del voluntario. | 5 atestaciones explicadas; 'Nido solo conecta, la terapia ocurre fuera'; Recomendación de póliza de responsabilidad pro bono; Plantilla de consentimiento descargable; No-emergencia como protección PARA él |
| `/seguridad` | Cómo verificamos / Seguridad | both | P1 | Hacer visible la verificación manual (FPV/colegiado/licencia) y el código de conducta público; trust para ambas audiencias. | Pasos concretos de verificación (sin exponer documentos); Código de conducta leíble; Secreto profesional bajo ley/FPV; Qué hacer ante riesgo; Límites duros |
| `/quienes-somos` | Quiénes somos | both | P1 | Misión, equipo coordinador, modelo voluntario y por qué gratis y sin fines de lucro: E-E-A-T y confianza. | Misión y origen; Equipo/gobernanza; Modelo voluntario y por qué gratis; Límites duros como elección ética; sameAs a redes verificadas |
| `/como-funciona` | Cómo funciona | both | P1 | Dos rutas paralelas (solicitante / profesional) que visualizan qué pasará; reduce ansiedad y mejora SEO. | Columna ruta del solicitante; Columna ruta del profesional; Expectativa de tiempo realista; Qué NO es (no emergencia, no terapia in-app) |
| `/preguntas-frecuentes` | Preguntas frecuentes | both | P1 | FAQ segmentada por audiencia reutilizando HOME_FAQ como fuente única (texto visible == JSON-LD); SEO de cola larga. | Bloque 'Si buscas apoyo'; Bloque 'Si eres profesional'; '¿cuánto tarda en responderme?'; Es gratis / sin cuenta / confidencial / para niños |
| `/transparencia` | Transparencia e impacto | both | P2 | Convertir 'sin fines de lucro' en confianza verificable con métricas SIEMPRE agregadas y anonimizadas. | Modelo y sostenibilidad (cómo se cubre el coste técnico); Gobernanza/coordinación; Métricas agregadas anonimizadas; Enlace a /privacidad |
| `/privacidad` | Política de privacidad | both | P0 | Política sobre base constitucional (art. 28 habeas data, art. 60) y estándares tipo GDPR voluntarios; canal real de borrado. | Qué se recoge (mínimo) y único propósito; Consentimiento libre e informado (estándar TSJ); Retención 30/90 días; Canal habeas data funcional; Sección menores (LOPNNA) revisada por abogado |
| `/terminos` | Términos y descargo | both | P0 | Encuadre CONECTOR (no presta terapia, no es parte de la relación clínica), no emergencia, limitación de responsabilidad, ley Venezuela. | 'Nido NO presta terapia, solo conecta'; No es servicio de emergencia ni garantiza tiempos; La relación terapéutica se forma fuera de la app; Limitación de responsabilidad; Ley aplicable Venezuela |
| `/contacto` | Contacto | both | P2 | Canal de abuso/privacidad y consultas, usando el correo ya existente. | Correo de privacidad/abuso; Qué esperar de respuesta; Recordatorio: no es canal de emergencia |
| `/admin` | Panel de administración | admin | P1 | Verificación manual de profesionales (registrar fuente/fecha) y gestión de solicitudes; fuera del índice. | Cola de verificación con consulta FPV/SACS; Registro de verifiedSource + verifiedAt; Gestión de estados de solicitud; Noindex (robots) |

## 3. Flujo del solicitante (sin cuenta)

- 1. Llega a / o directo a /ayuda; en el header ve siempre una franja serena de crisis y el botón 'Salir rápido' persistente, sin pedir nada a cambio.
- 2. Lee un mensaje de bienvenida sin vergüenza ('Diste un paso importante al llegar aquí, no estás solo/a') con tipografía grande (18px) y tono cálido.
- 3. Rellena el formulario trauma-informed: solo email obligatorio, etiquetas vivenciales ('No sé / solo necesito hablar', 'Prefiero no decirlo ahora'), ubicación e idioma ocultos en <details> de divulgación progresiva.
- 4. Indica cómo lo siente ('Puedo esperar unos días' ... 'Lo estoy pasando muy mal ahora'); si marca urgencia alta, aparece de forma prominente el bloque de crisis verificado ANTES de enviar, sin diagnóstico ni IA.
- 5. Marca un consentimiento informado breve y cálido en es-VE: entiende que Nido solo conecta (no es terapia ni emergencia) y que su contacto mínimo se compartirá con un profesional voluntario verificado.
- 6. Envía con microcopy de carga ('Enviando tu mensaje...', aria-busy); si hay error, ve un mensaje sin culpa y con siguiente paso, nunca el literal 'Error'.
- 7. Si reintenta y choca con rate-limit, lee 'Tu mensaje anterior ya está con nuestro equipo, no necesitas reenviarlo; si estás en peligro ahora, [vía inmediata]', no un bloqueo.
- 8. Aterriza en /ayuda/gracias: confirmación con FocusHeading para lectores de pantalla, expectativa realista ('suele tomar unas horas, no es inmediato') y, si fue urgencia alta, mensaje que reconoce la gravedad y repite la vía inmediata.
- 9. Recibe por correo un enlace mágico a /solicitud/[token] (sin crear cuenta) para consultar su estado cuando quiera.
- 10. En la página de estado ve un timeline humano: 'Recibida y en cola' -> 'Una persona voluntaria la está revisando' -> 'Te escribió Ana, psicóloga voluntaria', con aviso de crisis y 'Salir rápido' siempre presentes.
- 11. Puede pulsar 'Ya no necesito ayuda' para cancelar con dignidad, y siempre tiene a mano /recursos y /emergencia si la espera se hace difícil.
- 12. El primer contacto real ocurre fuera de la app, por el medio que el profesional usa; Nido nunca aloja chat, video ni historia clínica.

## 4. Flujo del profesional

- 1. Llega a /pro y, ANTES de cualquier login, encuentra prueba de seriedad: el pacto del voluntario, enlaces a /seguridad y /pacto-voluntario, 1-2 testimonios de otros voluntarios y un resumen de 'cómo verificamos'.
- 2. Entiende su protección de entrada: 'Nido solo conecta, la terapia ocurre fuera y no guardamos historias clínicas'; el no-emergencia se presenta como protección PARA él, no como descargo de Nido.
- 3. Entra con Google (única identidad), sin formularios de contraseña ni fricción de cuenta.
- 4. Paso 1 del alta (mínimo): nombre + tipo de credencial (número FPV / colegiado / SACS / licencia extranjera) + email; esto basta para disparar la verificación de inmediato.
- 5. Ve una barra de estado clara 'Recibido -> En verificación -> Aprobado' con SLA explícito ('verificamos en X días hábiles'), eliminando la ansiedad del limbo.
- 6. Mientras espera, completa el Paso 2 (áreas, idiomas, bio, disponibilidad) sin bloquear la verificación.
- 7. Acepta las 5 atestaciones presentadas como pacto mutuo (servicio gratis, no captura de cliente, confidencialidad, no garantía de emergencia, competencia), con sello conductAcceptedAt visible.
- 8. Recibe email al ser aprobado (notifications.ts); su tarjeta pública muestra el badge 'Identidad y credencial verificadas por Nido' con tooltip de una frase, sin exponer el número.
- 9. En /pro/dashboard ve un CTA contextual único ('Tienes 1 persona esperando tu primer mensaje') y la urgencia vivencial destacada para priorizar 'Lo estoy pasando muy mal ahora'.
- 10. Puede auto-marcar 'Ya contacté' y 'Cerrar caso' desde su panel (server action acotada por professionalId), sin pasar por un admin: acorta el tiempo-hasta-ayuda real.
- 11. Controla su carga con maxActiveRequests/currentActiveRequests presentado como autonomía ('tú decides cuántos casos llevas'), reduciendo el miedo a la sobrecarga.
- 12. Ve una capa de reconocimiento derivada de assignments: 'has acompañado a N personas', insignias por hitos (primer caso, 3/6/12 meses) y certificado descargable 'Psicólogo Voluntario Nido' totalmente anonimizado.

## 5. Legal y confianza

- **Encuadre CONECTOR en Términos y portada: 'Nido NO presta terapia ni atención psicológica; conecta a personas con profesionales voluntarios verificados, quienes son los únicos responsables de la atención que brinden.'**
  - *Por qué:* Es la columna vertebral de la limitación de responsabilidad; replica la postura de Psychology Today/GoodTherapy/ADAA y evita que Nido sea tratado como proveedor clínico (YMYL).
  - *Dónde:* /terminos, portada y repetido en cada página legal; visible, no en letra pequeña.
- **Capa de crisis/derivación: página /emergencia y banner persistente 'Si estás en peligro ahora' con números venezolanos VERIFICADOS (911/171 + líneas de apoyo verificadas), declarando 'gratuito y remoto pero NO inmediato ni de emergencia'.**
  - *Por qué:* El público incluye casos graves y menores: crea deber de cuidado real; el patrón sectorial (7 Cups, Spring Health) es no-emergencia + derivación inmediata. Protege la vida y evita la falsa promesa de respuesta.
  - *Dónde:* /emergencia, banner en /ayuda y /recursos, mensaje condicional en /ayuda/gracias para urgencia alta.
- **Política de privacidad sobre base constitucional venezolana (art. 28 habeas data, art. 60; base legal = consentimiento libre e informado, estándar TSJ) con principios tipo GDPR voluntarios.**
  - *Por qué:* Venezuela no tiene ley integral de datos; un canal real de borrado alineado con art. 28 es a la vez la expectativa legal y una señal de confianza para un público vulnerable. No reclamar 'GDPR compliant'.
  - *Dónde:* /privacidad: qué se recoge (mínimo), único propósito, retención 30/90 días, canal habeas data funcional, sin venta ni cruce de datos.
- **Consentimiento informado en el punto de envío del formulario: checkbox/declaración breve en es-VE confirmando que Nido solo conecta y que el contacto mínimo se comparte con un profesional verificado.**
  - *Por qué:* Compartir contexto de salud + contacto con un tercero es tratamiento sensible; el estándar TSJ y GDPR Art. 9 exigen consentimiento explícito. Es además el mejor registro probatorio y refuerza autonomía/dignidad.
  - *Dónde:* Formulario de /ayuda, justo antes de enviar; tono cálido, no un muro legal.
- **Página '¿Cómo verificamos a los profesionales?' describiendo los pasos manuales (título, colegiatura/FPV o SACS, identidad) sin exponer documentos, y citando el secreto profesional bajo Ley del Ejercicio de la Psicología y Código de Ética FPV.**
  - *Por qué:* La transparencia es el principal motor de confianza en ONG y la razón de los sellos 'Verificado'; citar el deber legal de confidencialidad del profesional es una señal creíble y veraz.
  - *Dónde:* /seguridad, con enlace desde /pro antes del login y desde la tarjeta pública del profesional.
- **Política de menores (LOPNNA) y compromiso de confidencialidad, ambos revisados por abogado venezolano: acogida sin vergüenza, manejo de representación legal e 'interés superior', y derivación a Consejo de Protección/IDENNA ante revelación de abuso.**
  - *Por qué:* Menores y reporte de abuso son el área de mayor riesgo legal; la redacción exacta requiere abogado. Resuelve la contradicción actual (el sitio rechaza a menores con 'busca un adulto responsable' mientras el brief pide acogerlos).
  - *Dónde:* /privacidad sección menores, /recursos derivación de menores, /terminos; reemplazar el copy de rechazo actual.
- **Clúster 'Quiénes somos / Sin fines de lucro' + 'Transparencia/Impacto' con estatus no lucrativo, sostenibilidad, gobernanza y métricas honestas SIEMPRE anonimizadas; límites duros (no pagos, chat, video, reseñas, IA-terapeuta) como elección ética.**
  - *Por qué:* Logros, reputación y honestidad son los principales motores de confianza en ONG; convierte las restricciones de Nido en credibilidad ante profesionales y futuros aliados.
  - *Dónde:* /quienes-somos y /transparencia, enlazadas desde el footer y /pro.
- **Revisión legal completa pre-lanzamiento por abogado venezolano (con psicólogo colaborador): flujo LOPNNA, excepción de secreto profesional por peligro inminente, compromiso de borrado habeas data, y verificación de que los números de emergencia y las afirmaciones de colegiatura son exactos.**
  - *Por qué:* Todo está estructurado para NO inventar derecho, pero la redacción precisa sobre menores, excepciones de confidencialidad y reporte obligatorio debe validarla un profesional en jurisdicción venezolana. Marcar cada frase legalmente sensible como 'pendiente de revisión legal' hasta firmar.
  - *Dónde:* Gate transversal antes de lanzar; aplica a /privacidad, /terminos, /emergencia, /seguridad y /recursos.

## 6. SEO

**Dominio (recomendación):** Registrar dominio propio venezolano/ONG (preferencia nido.org.ve; alternativas nido.ve o nido.org) y apuntar NEXT_PUBLIC_SITE_URL a él en wrangler.jsonc y en el fallback de site.ts (hoy https://nido-venezuela.workers.dev), configurar Custom Domain en Cloudflare Workers y poner workers_dev=false en producción. Arquitectura de DOS HOSTS recomendada: TODO el contenido público indexable (/, /ayuda, /recursos, /pro, /privacidad, /terminos, nuevas páginas) servido SOLO desde el dominio propio con canonical absoluto; si /api o el flujo de auth de Better Auth permanecen en workers.dev, separar BETTER_AUTH_URL de NEXT_PUBLIC_SITE_URL y emitir X-Robots-Tag: noindex + canonical cross-host hacia el dominio propio en ese host. Nunca permitir que el mismo contenido público sea rastreable en ambos hosts (duplicados). Es el desbloqueo P0 de todo lo demás: workers.dev está en la Public Suffix List y Google no comparte autoridad entre subdominios.

**Técnico:**
- Dar de alta el dominio propio en Google Search Console (GOOGLE_SITE_VERIFICATION ya cableado), enviar sitemap.xml y solicitar indexación de páginas clave; repetir en Bing Webmaster Tools.
- Mantener @type NGO en JSON-LD (NO migrar a MedicalOrganization, que sometería a Nido a obligaciones YMYL clínicas que no le corresponden como conector); enriquecer organizationNode con sameAs (redes verificadas), foundingDate y nonprofitStatus.
- Conservar FAQPage (texto visible == JSON-LD) aunque Google retiró los rich results de FAQ el 7-may-2026: sigue ayudando a comprensión y a AI Overviews.
- Añadir x-default al mapa hreflang (hoy es y es-VE apuntan a la misma URL sin x-default) en sitemap.ts y metadata.
- Antes de incorporar imágenes en OpenNext/Cloudflare: configurar image-loader.ts custom con /cdn-cgi/image/ (Cloudflare Images) o images.unoptimized; nunca servir PNG/JPG sin optimizar para no degradar LCP.
- Activar en el dashboard de Cloudflare: Polish/WebP, Brotli, HTTP/3 y Speed Brain (Speculation Rules); objetivo p75 LCP<2.5s, INP<200ms, CLS<0.1 (sitio ligero, debería pasar holgado).

**Contenido:**
- Completar /recursos con recursos verificados de Venezuela (citando fuente y fecha) y convertirla en la página más enlazable y citable de la ONG; enlazarla desde portada y /ayuda.
- Campaña de menciones/backlinks en medios y directorios es-VE de salud mental: Efecto Cocuyo, El Diario, El Ucabista/Psicomapa (UCAB), FPV (fpv.org.ve) y Psicodiáspora, para figurar en sus listados de 'líneas de atención psicológica en Venezuela'.
- Crear 3-5 páginas long-tail no clínicas bajo /recursos/ orientadas a intención venezolana concreta ('cómo acompañar a un familiar en crisis', 'apoyo emocional anónimo sin teléfono', 'ayuda psicológica gratis para niños'), cada una con metadata, canonical y entrada en sitemap.
- Reforzar el contenido visible alrededor de las keywords ya definidas en site.ts ('ayuda psicológica gratis Venezuela', 'psicólogos voluntarios Venezuela') sin competir por head terms genéricos, apoyándose en el diferencial gratis/anónimo/sin cuenta.
- Posicionar la verificación manual real como diferenciador frente a Psicodiáspora (que abiertamente no verifica) y buscar respaldo/alianza con el Programa de Psicólogos Voluntarios de la FPV como prueba social.

## 7. Backlog priorizado

### Fase 1

| Item | Audiencia | Impacto | Esfuerzo |
|---|---|---|---|
| Corregir token --human a #b65334 y --human-strong a #8a3d28 en globals.css (CTA principal a AA 2.2). | seeker | Alto | S |
| Crear tokens --safety #1b3a63 / --safety-soft #eaf1f9 y aplicarlos al EmergencyNotice/.notice con encabezado 'Si es una emergencia ahora mismo' en peso 700; diferenciarlo del verde de marca. | seeker | Alto | S |
| Sustituir el TODO de /recursos por bloque de crisis venezolano verificado (LAPSI-FPV, PsicoLínea UCAB, Psicólogos sin Fronteras, Cecodap) con fuente y fecha; añadir derivación a findahelpline.com/ve y Psicomapa y sección 'esto no es emergencia'. | seeker | Alto | M |
| Crear /emergencia y renderizar el bloque de crisis DENTRO del EmergencyNotice y en /ayuda y /gracias (no solo enlazado). No lanzar captación de solicitudes urgentes hasta verificar los números. | seeker | Alto | M |
| Resolver la política de menores y reescribir copy: acogida sin vergüenza + derivación cálida a recurso específico para menores; eliminar el 'busca un adulto responsable' a secas en /recursos y /privacidad sec.8. | seeker | Alto | S |
| Añadir botón persistente 'Salir rápido' (redirige a sitio neutro, abre destino en nueva pestaña) + microcopy de navegación privada en /ayuda, /recursos y /solicitud/[token]. | seeker | Alto | M |
| Publicar Términos con encuadre CONECTOR + no-emergencia + limitación de responsabilidad + ley Venezuela. | both | Alto | M |
| Reescribir Política de privacidad sobre art. 28/art. 60 + consentimiento libre e informado, retención 30/90 y canal habeas data funcional. | both | Alto | M |
| Añadir consentimiento informado breve en el punto de envío del formulario de /ayuda. | seeker | Alto | S |
| Registrar dominio propio (nido.org.ve), apuntar NEXT_PUBLIC_SITE_URL, configurar Custom Domain y workers_dev=false; separar BETTER_AUTH_URL. | both | Alto | S |
| Revisión legal pre-lanzamiento por abogado venezolano (LOPNNA, excepción secreto profesional, habeas data, exactitud de números de emergencia y colegiatura). | admin | Alto | S |
| Tratar urgencia 'alta' diferenciada: bloque de crisis prominente en el form y mensaje condicional en /gracias que reconozca la gravedad y repita la vía inmediata. | seeker | Alto | M |
| Reescribir mensaje de rate-limit ('tu mensaje anterior ya llegó, no reenvíes; si estás en peligro [vía]') y eliminar el fallback literal 'Error' por mensajes orientativos sin culpa. | seeker | Medio | S |

### Fase 2

| Item | Audiencia | Impacto | Esfuerzo |
|---|---|---|---|
| Implementar página de estado sin cuenta /solicitud/[token] con enlace mágico, timeline de 3 estados humanos, 'Ya no necesito ayuda', aviso de crisis y Salir rápido; añadir notifyRequester. | seeker | Alto | M |
| Rediseñar alta del profesional en 2 pasos con barra 'Recibido -> En verificación -> Aprobado', SLA explícito y notificación por email al aprobar. | professional | Alto | M |
| Añadir credentialType (fpv|colegiado|sacs|licencia_extranjera) + verifiedSource + verifiedAt al schema y al flujo de admin (consulta FPV/SACS); pedir número FPV/colegiado explícito. | professional | Alto | M |
| Crear /pacto-voluntario y /seguridad (5 atestaciones como pacto, encuadre legal, póliza pro bono, plantilla de consentimiento, verificación visible, código de conducta) y enlazarlas desde /pro antes del login. | professional | Alto | M |
| Añadir badge 'Verificado por Nido' en ProfessionalCard cuando status='approved', con tooltip de una frase sin exponer el número. | both | Alto | S |
| Habilitar auto-marcar 'Ya contacté' / 'Cerrar caso' en /pro/dashboard (server action acotada por professionalId), CTA contextual y urgencia vivencial destacada. | professional | Alto | M |
| Crear /quienes-somos, /como-funciona (dos rutas paralelas) y /preguntas-frecuentes segmentada reutilizando HOME_FAQ; añadir '¿cuánto tardan en responderme?'. | both | Medio | M |
| Formalizar paleta como tokens semánticos AA y escala tipográfica modular (ratio 1.20) vía @theme de Tailwind v4; documentar regla *-soft -> *-strong. | both | Medio | M |
| Optimizar Hanken Grotesk (variable, subset latin, pesos 400/600/700, preload de cuerpo) y enriquecer JSON-LD (sameAs, nonprofitStatus, foundingDate); añadir x-default a hreflang. | both | Medio | S |
| Pequeñas mejoras de formulario: inputMode='email', autocapitalize='none', autoFocus controlado; documentar <details> y copy vivencial como invariante de diseño. | seeker | Medio | S |

### Fase 3

| Item | Audiencia | Impacto | Esfuerzo |
|---|---|---|---|
| Capa de reconocimiento e impacto del profesional derivada de assignments: panel 'has acompañado a N personas', insignias por hitos y certificado anonimizado descargable. | professional | Medio | M |
| Crear /transparencia (modelo, sostenibilidad, gobernanza, métricas agregadas anonimizadas) y /contacto con el correo de abuso/privacidad existente. | both | Medio | M |
| Campaña de backlinks en medios/directorios es-VE (Efecto Cocuyo, El Diario, El Ucabista/Psicomapa, FPV, Psicodiáspora) y buscar alianza con el Programa de Psicólogos Voluntarios de la FPV. | both | Alto | M |
| Crear 3-5 páginas long-tail no clínicas bajo /recursos/ con metadata, canonical y entrada en sitemap. | seeker | Medio | L |
| Preparar optimización de imágenes Cloudflare (image-loader.ts /cdn-cgi/image/ o unoptimized) y activar Polish/WebP, Brotli, HTTP/3 y Speed Brain. | both | Medio | S |
| Documentar recetas de componentes (botón, card, formulario, banner de seguridad, trust-strip) como sistema reutilizable para que el lado pro y páginas nuevas no diverjan. | both | Medio | M |
| Reformular conductNoEmergencyGuarantee hacia el profesional ('no se te pedirá responder emergencias') y exponer maxActiveRequests/currentActiveRequests como 'tú decides cuántos casos llevas'. | professional | Medio | S |
| Añadir franja de crisis persistente en el header (no solo footer) en todas las páginas y enlaces estables a /recursos y /seguridad en la navegación principal. | both | Medio | S |
