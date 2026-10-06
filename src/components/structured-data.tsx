import {
  absoluteUrl,
  HOME_FAQ,
  SITE_CONTACT_EMAIL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE_DEFAULT,
  SITE_URL,
} from "@/lib/site";

type Json = Record<string, unknown>;

/**
 * Inserta un bloque JSON-LD. Next recomienda este patrón: un <script> con
 * type="application/ld+json" y el JSON serializado. `JSON.stringify` elimina
 * las claves `undefined`, así que los campos opcionales se omiten solos.
 */
function JsonLd({ data }: { data: Json }) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requiere serialización directa
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

const organizationNode: Json = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  alternateName: "PsicoAyuda",
  url: SITE_URL,
  logo: {
    "@type": "ImageObject",
    url: absoluteUrl("/brand/nido-icon-512.png"),
  },
  image: absoluteUrl("/opengraph-image"),
  description: SITE_DESCRIPTION,
  email: SITE_CONTACT_EMAIL || undefined,
  knowsLanguage: ["es"],
  areaServed: { "@type": "Country", name: "Venezuela" },
  contactPoint: SITE_CONTACT_EMAIL
    ? [
        {
          "@type": "ContactPoint",
          email: SITE_CONTACT_EMAIL,
          contactType: "soporte",
          areaServed: "VE",
          availableLanguage: ["Spanish"],
        },
      ]
    : undefined,
};

const websiteNode: Json = {
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: SITE_URL,
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  inLanguage: "es",
  publisher: { "@id": `${SITE_URL}/#organization` },
  // Describe el buscador real del directorio con la semántica de Schema.org.
  // Google retiró Sitelinks Searchbox el 21/11/2024: este marcado no lo habilita.
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/profesionales?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

// Fechas de contenido del clúster de guías. `datePublished` = cuándo se publicó;
// `dateModified` = última modificación de contenido. No cambies estas fechas
// por un despliegue o por una expectativa de ranking.
// No declaramos `lastReviewed`/`reviewedBy` sin una revisión documentada.
const GUIDES_PUBLISHED = "2026-06-29";
const GUIDES_MODIFIED = "2026-07-01";

/**
 * Datos estructurados de una guía de salud o de acceso al servicio.
 *
 * Schema.org define MedicalWebPage para páginas con información médica.
 * Describe el contenido educativo; no acredita revisión clínica ni promete
 * un resultado enriquecido. Publisher/isPartOf enlazan al grafo del sitio.
 */
export function GuideJsonLd({
  path,
  name,
  description,
  contentType = "MedicalWebPage",
  modifiedAt,
}: {
  path: string;
  name: string;
  description: string;
  contentType?: "MedicalWebPage" | "WebPage";
  modifiedAt?: string;
}) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": contentType,
        "@id": `${SITE_URL}${path}#webpage`,
        url: absoluteUrl(path),
        name,
        description,
        inLanguage: "es",
        // Las revisiones de acceso no tienen una primera publicación trazada.
        datePublished:
          contentType === "MedicalWebPage" ? GUIDES_PUBLISHED : undefined,
        dateModified:
          modifiedAt ||
          (contentType === "MedicalWebPage" ? GUIDES_MODIFIED : undefined),
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#organization` },
        publisher: { "@id": `${SITE_URL}/#organization` },
        audience:
          contentType === "MedicalWebPage"
            ? {
                "@type": "MedicalAudience",
                geographicArea: { "@type": "Country", name: "Venezuela" },
              }
            : undefined,
      }}
    />
  );
}

/**
 * Datos estructurados del directorio público (`CollectionPage`).
 *
 * Es el `@type` correcto para una página que lista/colecciona recursos (aquí,
 * profesionales). No enumera personas: la lista es pública pero los
 * perfiles solo exponen nombre y datos mínimos, así que evitamos `Person`
 * por privacidad. Se enlaza al grafo del sitio por `@id`.
 */
export function DirectoryJsonLd() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/profesionales#webpage`,
        url: absoluteUrl("/profesionales"),
        name: "Psicólogas y psicólogos en Venezuela",
        description:
          "Directorio de profesionales de psicología con perfiles revisados para encontrar apoyo en Venezuela.",
        inLanguage: "es",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#organization` },
      }}
    />
  );
}

/**
 * `ItemList` del listado del directorio (para que los buscadores entiendan que la
 * página es una lista ordenada de recursos). Enumera SOLO por posición + nombre
 * público, con `ListItem` (no `Person`, sin contacto ni ubicación), coherente con
 * el criterio de privacidad de `DirectoryJsonLd`. Recibe los nombres ya
 * renderizados en la página (mismo texto visible que exige Google).
 */
export function DirectoryItemListJsonLd({
  path,
  names,
}: {
  path: string;
  names: readonly string[];
}) {
  if (names.length === 0) return null;
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "ItemList",
        "@id": `${SITE_URL}${path}#itemlist`,
        url: absoluteUrl(path),
        inLanguage: "es",
        numberOfItems: names.length,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        itemListElement: names.map((name, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name,
        })),
      }}
    />
  );
}

/**
 * `FAQPage` independiente para la página dedicada de preguntas frecuentes.
 * El texto debe coincidir con el visible (requisito de Google), por eso recibe
 * las mismas preguntas/respuestas que se renderizan en la página.
 */
export function FaqJsonLd({
  items,
}: {
  items: ReadonlyArray<{ question: string; answer: string }>;
}) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      }}
    />
  );
}

/** Datos estructurados presentes en todas las páginas (en el layout raíz). */
export function SiteJsonLd() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@graph": [organizationNode, websiteNode],
      }}
    />
  );
}

/** Datos estructurados específicos de la portada: página, servicio y FAQ. */
export function HomeJsonLd() {
  const webPageNode: Json = {
    "@type": "WebPage",
    "@id": `${SITE_URL}/#webpage`,
    url: SITE_URL,
    name: SITE_TITLE_DEFAULT,
    description: SITE_DESCRIPTION,
    inLanguage: "es",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: { "@id": `${SITE_URL}/#organization` },
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: absoluteUrl("/opengraph-image"),
    },
  };

  const serviceNode: Json = {
    "@type": "Service",
    "@id": `${SITE_URL}/#service`,
    name: "Ayuda Terremoto · Acompañamiento voluntario gratuito",
    serviceType: "Apoyo psicológico y emocional a distancia",
    url: absoluteUrl("/ayuda"),
    provider: { "@id": `${SITE_URL}/#organization` },
    areaServed: { "@type": "Country", name: "Venezuela" },
    availableChannel: {
      "@type": "ServiceChannel",
      serviceUrl: absoluteUrl("/ayuda"),
      availableLanguage: ["es"],
    },
    offers: {
      "@type": "Offer",
      price: 0,
      priceCurrency: "USD",
    },
    audience: {
      "@type": "Audience",
      audienceType:
        "Personas afectadas por el terremoto que solicitan acompañamiento voluntario",
    },
  };

  const faqNode: Json = {
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: HOME_FAQ.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@graph": [webPageNode, serviceNode, faqNode],
      }}
    />
  );
}
