# SEO y búsqueda con IA de Nido

Revisado el 4 de octubre de 2026. Este documento describe el código y el trabajo pendiente de búsqueda pública. La publicación vigente y sus comprobaciones se registran en [el dossier de producto](producto/README.md); una modificación local no demuestra que esté publicada. No prometemos posiciones, plazos de indexación ni presencia en respuestas de IA.

## Audiencias y mensajes

| Recorrido | Páginas fuente | Mensaje verificable |
|---|---|---|
| Personas que buscan apoyo | `/`, `/profesionales`, `/orientacion` | Explorar perfiles y contactar; el orientador ayuda a elegir, no diagnostica. La atención se acuerda con cada profesional. |
| Psicólogos que organizan su consulta | `/para-psicologos` | Agenda, fichas, notas, mensajes, servicios y registro de cobros externos; prueba de 90 días sin tarjeta. No garantiza pacientes, ingresos ni resultados clínicos. |
| Ayuda Terremoto | `/ayuda`, `/psicologos` | Programa separado de acompañamiento voluntario gratuito, según disponibilidad y revisión. Mantener el banner rojo y la entrada para voluntariado. |

La gratuidad de Ayuda Terremoto no describe todos los servicios de Nido. No afirmar que Nido sea una ONG o entidad sin fines de lucro sin evidencia. No publicar datos societarios, direcciones privadas, reseñas inventadas ni países de ejercicio supuestos. Entrar con Google autentica una cuenta; la revisión profesional es un proceso distinto. El formulario sólo ofrece Google cuando están configuradas ambas variables del proveedor.

El chat usa cifrado de extremo a extremo. El CRM permite notas privadas cifradas en servidor; ese almacenamiento tiene límites distintos. No decir que la plataforma no guarda información clínica ni que todo el CRM tiene E2EE. Los pagos con tarjeta, llamadas integradas y conexión Google Calendar requieren configuración y comprobaciones externas: véanse [los pendientes contrastados](producto/24-pendientes-y-cierre.md).

## Superficies implementadas y semántica

| Fuente | Función y límite |
|---|---|
| `src/lib/site.ts`, metadatos públicos | Nombre, títulos, descripciones, URL canónica e imágenes sociales. Los valores efectivos deben coincidir tras la compilación. |
| `src/app/sitemap.ts` | Lista de rutas públicas; excluye paneles, chats y confirmaciones. No exporta pacientes ni documentos. |
| `src/app/robots.ts`, metadatos privados | Directivas de rastreo y `noindex`. No sustituyen autenticación ni controles de acceso. |
| `src/components/structured-data.tsx` | `Organization` y `WebSite` describen el sitio; no acreditan personalidad jurídica ni credenciales profesionales. |
| `SearchAction` | Describe la búsqueda real `/profesionales?q=…`. No habilita un cuadro de búsqueda de Google. |
| `WebPage`, `Service`, `FAQPage` | La página de portada conserva su URL; el servicio gratuito enlaza a `/ayuda`. Las preguntas y respuestas comparten la fuente del texto visible. Precio cero no implica cupo inmediato. |
| `CollectionPage`, `ItemList` | Describen el directorio y nombres públicos; no añaden documentos, contactos privados, puntuaciones ni reseñas. |
| `MedicalWebPage`, `BreadcrumbList` | Identifican guías con información de salud y su navegación. No acreditan revisión clínica ni un resultado enriquecido. |
| `public/llms.txt` | Guía opcional de páginas públicas y límites; no contiene datos privados ni es una barrera de acceso. |

[Schema.org define Organization](https://schema.org/Organization), [SearchAction](https://schema.org/SearchAction) y [MedicalWebPage](https://schema.org/MedicalWebPage). Su semántica es distinta de la compatibilidad de un buscador con resultados especiales. `lastReviewed` y `reviewedBy` describen revisiones de exactitud/completitud; sólo deben emitirse con evidencia de esa revisión, sin inventar autores o supervisión clínica.

Google retiró Sitelinks Searchbox desde el **21 de noviembre de 2024**. Puede conservarse `SearchAction` para describir el buscador real, sin prometer esa presentación. [Anuncio oficial](https://developers.google.com/search/blog/2024/10/sitelinks-search-box).

Los resultados enriquecidos de FAQ dejaron de mostrarse desde el **7 de mayo de 2026** y se retiró su documentación en junio. `FAQPage` puede seguir describiendo las preguntas visibles, pero no debe venderse como una mejora de presentación disponible en Google. [Registro oficial de cambios](https://developers.google.com/search/updates).

## Dominio, canonicals y publicación

La fuente central es `SITE_URL`, basada en `NEXT_PUBLIC_SITE_URL` o su fallback de dominio. Revisar la salida efectiva de canonical, Open Graph, JSON-LD, robots y sitemap al publicar. `llms.txt` es estático y requiere revisión si cambia el dominio. No modificar configuración de infraestructura desde un lote de marketing.

Se elimina la afirmación anterior de que `workers.dev` recibe una penalización automática: no tenía evidencia primaria. La consistencia de URLs evita señales contradictorias de canonicalización; un dominio propio no garantiza indexación ni ranking. [Guía de canonicalización de Google](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).

El coordinador integra, compila y publica. No inferir que un workflow, secreto o proveedor está operativo porque exista su nombre en el repositorio. No repetir instrucciones de despliegue ni guardar tokens en esta documentación.

## Search Console y seguimiento

1. El responsable con acceso añade o confirma la propiedad. Una propiedad **Dominio** exige verificación DNS; una propiedad de **prefijo de URL** admite otros métodos como la etiqueta HTML. El código puede emitir la meta desde `GOOGLE_SITE_VERIFICATION`, pero su presencia no demuestra verificación. [Métodos oficiales](https://support.google.com/webmasters/answer/9008080).
2. Enviar el sitemap público e inspeccionar portada, catálogo, venta profesional y programa gratuito. Comprobar canonical seleccionado, acceso del rastreador y exclusión de destinos privados.
3. Solicitar rastreo de cambios relevantes sin repetir solicitudes. Puede tardar días o semanas y no garantiza inclusión. [Solicitud de rastreo de Google](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl).
4. Medir impresiones, clics, CTR y consultas por recorrido. Comparar periodos equivalentes y anotar publicaciones; no atribuir causalidad a un cambio aislado ni convertir una posición media en promesa comercial.

Pendiente externo: acceso autorizado a Search Console y evidencia de cobertura/rendimiento del dominio real. Este lote no abre propiedades, cambia DNS ni solicita indexación. Otros buscadores requieren sus propias comprobaciones; no prometer inclusión en ChatGPT o Copilot por tener un sitemap.

## Consultas y respuestas de IA

Google mantiene los fundamentos de SEO para sus funciones de IA: contenido textual accesible, enlaces internos útiles y marcado coherente con lo visible. No exige archivos nuevos ni un schema especial, y la aparición no está garantizada. [Documentación oficial](https://developers.google.com/search/docs/appearance/ai-features).

`llms.txt` no beneficia ni perjudica por sí mismo la visibilidad o el ranking en Google; puede mantenerse para otros sistemas que lo utilicen. No afirmar que todos los asistentes lo leen. [Aclaración de junio de 2026](https://developers.google.com/search/updates).

Para responder a consultas sobre Nido, dirigir a fuentes públicas concretas:

| Pregunta | Fuente | Límite que debe acompañar la respuesta |
|---|---|---|
| ¿Cómo encuentro apoyo? | `/profesionales`, `/orientacion` | Elección del profesional, disponibilidad y ámbito revisado; no diagnóstico automático. |
| ¿Qué ofrece Nido a psicólogos? | `/para-psicologos` | Organización de consulta y prueba sin tarjeta; integraciones pendientes diferenciadas. |
| ¿Es gratuito? | `/ayuda`, `/psicologos` | Ayuda Terremoto es gratuito y separado del software y de la atención acordada fuera del programa. |
| ¿Qué se guarda? | `/privacidad` | Diferencia entre chat E2EE, notas cifradas en servidor y otros datos privados. |
| ¿Atiende emergencias? | `/emergencia` | Nido no ofrece respuesta de emergencias; recursos según ubicación y fuentes vigentes. |

Nunca incorporar fichas, chats, notas, agendas, pagos o documentos a un resumen público o herramienta externa de IA. Una directiva para robots o un texto en `llms.txt` no protege datos accesibles sin autorización.

## Mejoras siguientes y validación

- Revisar guías individualmente con un responsable editorial autorizado; registrar cambios y revisiones reales, sin actualizar fechas sólo para aparentar frescura.
- Mantener preguntas claras que separen programa gratuito, catálogo y software. Crear páginas adicionales sólo cuando aporten información distinta y comprobada.
- Preparar menciones útiles con [los borradores de contacto](OUTREACH.md); confirmar destinatarios y disponibilidad operativa antes de pedir difusión. No intercambiar enlaces por posicionamiento ni atribuir alianzas sin confirmación.
- Comprobar HTML y JSON-LD, escape de nombres públicos, URLs, rutas privadas y estados de Google ausente/presente con fixtures ficticias y pruebas focales aisladas. Biome revisa los archivos de código modificados.
- Después de integrar, el coordinador comprueba `/robots.txt`, `/sitemap.xml`, `/llms.txt`, canonical, `noindex` privado y banner gratuito en producción. La validación local no acredita rankings, proveedor real, despliegue ni revisión clínica.
