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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

const organizationNode: Json = {
  "@type": "NGO",
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
};

// Fechas de contenido del clúster de guías. `datePublished` = cuándo se publicó;
// `dateModified` = última revisión de contenido (señal de frescura que Google usa
// en contenido de salud/YMYL). Actualiza `dateModified` al reescribir una guía.
// No usamos `lastReviewed`: implicaría revisión médica y aquí no la hay.
const GUIDES_PUBLISHED = "2026-06-29";
const GUIDES_MODIFIED = "2026-07-01";

/**
 * Datos estructurados de una guía de salud (`MedicalWebPage`).
 *
 * Google recomienda marcar el contenido de salud (YMYL) como página médica.
 * Se enlaza al grafo del sitio (`#website` / `#organization`) por `@id` para
 * que Google una todo en una sola entidad. No declara revisor médico porque no
 * lo hay: solo afirmamos lo verificable.
 */
export function GuideJsonLd({
  path,
  name,
  description,
}: {
  path: string;
  name: string;
  description: string;
}) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "MedicalWebPage",
        "@id": `${SITE_URL}${path}#webpage`,
        url: absoluteUrl(path),
        name,
        description,
        inLanguage: "es",
        datePublished: GUIDES_PUBLISHED,
        dateModified: GUIDES_MODIFIED,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#organization` },
        publisher: { "@id": `${SITE_URL}/#organization` },
        audience: {
          "@type": "MedicalAudience",
          geographicArea: { "@type": "Country", name: "Venezuela" },
        },
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
    primaryImageOfPage: absoluteUrl("/opengraph-image"),
  };

  const serviceNode: Json = {
    "@type": "Service",
    "@id": `${SITE_URL}/#service`,
    name: "Apoyo psicológico voluntario gratuito",
    serviceType: "Apoyo psicológico y emocional a distancia",
    url: SITE_URL,
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
      availability: "https://schema.org/InStock",
    },
    audience: {
      "@type": "Audience",
      audienceType:
        "Personas que buscan apoyo emocional o psicológico en Venezuela",
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
